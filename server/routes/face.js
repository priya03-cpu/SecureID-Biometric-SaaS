const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");
const { logAudit } = require("../audit");

const router = express.Router();
router.use(requireAuth);

const FACE_URL = process.env.FACE_SERVICE_URL || "http://127.0.0.1:8001";
const FACE_KEY = process.env.FACE_SERVICE_KEY || "";
const NOTICE_VERSION = "v1";
const MAX_FAILS = 3;       // wrong-face attempts allowed...
const LOCK_MINUTES = 15;   // ...within this window, then locked

// Talk to the Python service. Never throws; returns { status, data }.
async function callFace(path, body) {
  let response;
  try {
    response = await fetch(FACE_URL + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Service-Key": FACE_KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    return {
      status: 503,
      data: { code: "service_down", message: "Face service is not running." },
    };
  }
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

// Face-service problems the user can fix (bad photo, no face...) are passed
// on as-is. Anything else (bad key, crash) becomes a generic 503.
function faceFailure(res, { status, data }) {
  if ([400, 409, 413, 422].includes(status)) {
    return res
      .status(status)
      .json({ success: false, code: data.code, message: data.message });
  }
  console.error("Face service error:", status, data);
  return res.status(503).json({
    success: false,
    message: "Face service unavailable. Try again shortly.",
  });
}

// Wrong-face attempts since the last success, inside the lock window.
async function failedAttempts(userId) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS fails FROM verification_attempts
     WHERE user_id = $1 AND success = FALSE
       AND attempted_at > NOW() - ($2 * INTERVAL '1 minute')
       AND attempted_at > COALESCE(
         (SELECT MAX(attempted_at) FROM verification_attempts
          WHERE user_id = $1 AND success = TRUE),
         'epoch'::timestamptz)`,
    [userId, LOCK_MINUTES]
  );
  return result.rows[0].fails;
}

async function recentlyVerified(userId) {
  const result = await pool.query(
    `SELECT 1 FROM verification_attempts
     WHERE user_id = $1 AND success = TRUE
       AND attempted_at > NOW() - INTERVAL '2 minutes' LIMIT 1`,
    [userId]
  );
  return result.rowCount > 0;
}

router.get("/status", async (req, res) => {
  const { userId } = req.user;
  const result = await pool.query(
    `SELECT
       EXISTS (SELECT 1 FROM consent_records
               WHERE user_id = $1 AND notice_version = $2) AS consented,
       EXISTS (SELECT 1 FROM biometric_profiles WHERE user_id = $1) AS enrolled`,
    [userId, NOTICE_VERSION]
  );
  const fails = await failedAttempts(userId);
  res.json({
    success: true,
    consented: result.rows[0].consented,
    enrolled: result.rows[0].enrolled,
    attemptsLeft: Math.max(0, MAX_FAILS - fails),
  });
});

router.post("/consent", async (req, res) => {
  const { userId, organizationId } = req.user;
  await pool.query(
    `INSERT INTO consent_records (user_id, notice_version)
     SELECT $1::int, $2::varchar
     WHERE NOT EXISTS (SELECT 1 FROM consent_records
                       WHERE user_id = $1::int AND notice_version = $2::varchar)`,
    [userId, NOTICE_VERSION]
  );
  await logAudit(organizationId, userId, "BIOMETRIC_CONSENT", {
    version: NOTICE_VERSION,
  });
  res.json({ success: true });
});

router.post("/enroll", async (req, res) => {
  const { userId, organizationId } = req.user;
  const { images } = req.body || {};

  if (!Array.isArray(images) || images.length < 1 || images.length > 5) {
    return res
      .status(400)
      .json({ success: false, message: "Send between 1 and 5 photos." });
  }

  const consent = await pool.query(
    `SELECT 1 FROM consent_records WHERE user_id = $1 AND notice_version = $2`,
    [userId, NOTICE_VERSION]
  );
  if (consent.rowCount === 0) {
    return res.status(403).json({
      success: false,
      message: "You must accept the biometric notice first.",
    });
  }

  // Replacing an existing face needs a fresh face check, so a stolen session
  // cannot overwrite someone's enrollment.
  const existing = await pool.query(
    `SELECT 1 FROM biometric_profiles WHERE user_id = $1`,
    [userId]
  );
  if (existing.rowCount > 0 && !(await recentlyVerified(userId))) {
    return res.status(403).json({
      success: false,
      message: "Verify your current face before re-enrolling.",
    });
  }

  const out = await callFace("/enroll", { images });
  if (out.status !== 200) return faceFailure(res, out);

  await pool.query(
    `INSERT INTO biometric_profiles
       (organization_id, user_id, face_embedding, model_name)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (user_id) DO UPDATE
       SET face_embedding = EXCLUDED.face_embedding,
           model_name = EXCLUDED.model_name,
           enrolled_at = NOW()`,
    [organizationId, userId, JSON.stringify(out.data.embedding), out.data.model]
  );
  await pool.query(
    `UPDATE users SET face_verification_status = 'Enrolled' WHERE user_id = $1`,
    [userId]
  );
  await logAudit(organizationId, userId, "FACE_ENROLLED", {
    photos: out.data.imagesUsed,
  });

  res.json({ success: true });
});

router.post("/verify", async (req, res) => {
  const { userId, organizationId } = req.user;
  const { image } = req.body || {};

  if (typeof image !== "string" || image.length < 100) {
    return res
      .status(400)
      .json({ success: false, message: "A photo is required." });
  }

  const profile = await pool.query(
    `SELECT face_embedding FROM biometric_profiles WHERE user_id = $1`,
    [userId]
  );
  if (profile.rowCount === 0) {
    return res.status(409).json({
      success: false,
      message: "Face not enrolled yet. Set up face verification first.",
    });
  }

  const fails = await failedAttempts(userId);
  if (fails >= MAX_FAILS) {
    await logAudit(organizationId, userId, "FACE_LOCKED");
    return res.status(429).json({
      success: false,
      message: `Too many failed attempts. Try again in ${LOCK_MINUTES} minutes or ask your admin.`,
    });
  }

  const out = await callFace("/verify", {
    image,
    embedding: profile.rows[0].face_embedding,
  });

  // A photo/screen spoof counts as a failed attempt.
  if (out.status === 422 && out.data.code === "spoof_detected") {
    await pool.query(
      `INSERT INTO verification_attempts (user_id, success) VALUES ($1, FALSE)`,
      [userId]
    );
    await logAudit(organizationId, userId, "FACE_SPOOF_DETECTED");
    return res.status(422).json({
      success: false,
      message: out.data.message,
      attemptsLeft: Math.max(0, MAX_FAILS - fails - 1),
    });
  }

  // Bad photo (no face, too small...) does NOT use up an attempt.
  if (out.status !== 200) return faceFailure(res, out);

  const match = out.data.match === true;
  await pool.query(
    `INSERT INTO verification_attempts (user_id, success, match_score)
     VALUES ($1, $2, $3)`,
    [userId, match, out.data.distance]
  );
  await logAudit(
    organizationId,
    userId,
    match ? "FACE_VERIFIED" : "FACE_MISMATCH"
  );

  res.json({
    success: true,
    match,
    attemptsLeft: match ? MAX_FAILS : Math.max(0, MAX_FAILS - fails - 1),
  });
});

// Withdraw consent: deletes the face template and the consent record.
// Attendance history stays; the person must re-consent to enroll again.
router.delete("/me", async (req, res) => {
  const { userId, organizationId } = req.user;

  await pool.query(`DELETE FROM biometric_profiles WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM consent_records WHERE user_id = $1`, [userId]);
  await pool.query(
    `UPDATE users SET face_verification_status = 'Unverified' WHERE user_id = $1`,
    [userId]
  );
  await logAudit(organizationId, userId, "BIOMETRIC_DATA_DELETED");

  res.json({ success: true });
});

module.exports = router;
