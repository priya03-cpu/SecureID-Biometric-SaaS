const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { logAudit } = require("../audit");

const router = express.Router();
router.use(requireAuth, requireRole("ADMIN"));

// Every query below filters by req.user.organizationId (from the token).

async function seatInfo(organizationId) {
  const result = await pool.query(
    `SELECT o.plan, o.max_seats,
            (SELECT COUNT(*)::int FROM users
             WHERE organization_id = o.organization_id
               AND account_status = 'ACTIVE') AS used
     FROM organizations o
     WHERE o.organization_id = $1`,
    [organizationId]
  );
  return result.rows[0];
}

router.get("/summary", async (req, res) => {
  const orgId = req.user.organizationId;
  const seats = await seatInfo(orgId);

  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM biometric_profiles WHERE organization_id = $1) AS enrolled,
       (SELECT COUNT(*)::int FROM attendance_records
          WHERE organization_id = $1 AND attendance_date = CURRENT_DATE) AS checked_in_today,
       (SELECT COUNT(*)::int FROM users
          WHERE organization_id = $1 AND account_status = 'INACTIVE') AS inactive`,
    [orgId]
  );
  const s = result.rows[0];

  res.json({
    success: true,
    summary: {
      plan: seats.plan,
      seatsUsed: seats.used,
      maxSeats: seats.max_seats,
      faceEnrolled: s.enrolled,
      checkedInToday: s.checked_in_today,
      inactiveUsers: s.inactive,
    },
  });
});

router.get("/attendance", async (req, res) => {
  const date = req.query.date;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res
      .status(400)
      .json({ success: false, message: "Date must be YYYY-MM-DD." });
  }

  const result = await pool.query(
    `SELECT u.user_id, u.full_name, u.email, u.role,
            a.check_in_time, a.check_out_time, a.status
     FROM users u
     LEFT JOIN attendance_records a
       ON a.user_id = u.user_id
      AND a.attendance_date = COALESCE($2::date, CURRENT_DATE)
     WHERE u.organization_id = $1 AND u.account_status = 'ACTIVE'
     ORDER BY u.full_name`,
    [req.user.organizationId, date || null]
  );

  res.json({
    success: true,
    rows: result.rows.map((r) => ({
      userId: r.user_id,
      name: r.full_name,
      email: r.email,
      role: r.role,
      checkInTime: r.check_in_time,
      checkOutTime: r.check_out_time,
      status: r.status || "ABSENT",
    })),
  });
});

router.get("/staff", async (req, res) => {
  const result = await pool.query(
    `SELECT u.user_id, u.full_name, u.email, u.role, u.account_status,
            u.face_verification_status, u.created_at,
            -- wrong-face attempts in the last 15 min since the last success
            (SELECT COUNT(*)::int FROM verification_attempts v
             WHERE v.user_id = u.user_id AND v.success = FALSE
               AND v.attempted_at > NOW() - INTERVAL '15 minutes'
               AND v.attempted_at > COALESCE(
                 (SELECT MAX(s.attempted_at) FROM verification_attempts s
                  WHERE s.user_id = u.user_id AND s.success = TRUE),
                 'epoch'::timestamptz)) AS recent_fails
     FROM users u
     WHERE u.organization_id = $1
     ORDER BY u.full_name`,
    [req.user.organizationId]
  );

  res.json({
    success: true,
    staff: result.rows.map((u) => ({
      userId: u.user_id,
      name: u.full_name,
      email: u.email,
      role: u.role,
      status: u.account_status,
      faceStatus: u.face_verification_status,
      locked: u.recent_fails >= 3,
      createdAt: u.created_at,
    })),
  });
});

router.post("/staff", async (req, res) => {
  const { fullName, email, password } = req.body || {};
  const orgId = req.user.organizationId;

  if (!fullName || !email || !password) {
    return res.status(400).json({
      success: false,
      message: "Name, email and a temporary password are required.",
    });
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return res
      .status(400)
      .json({ success: false, message: "Enter a valid email address." });
  }
  if (password.length < 8) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 8 characters.",
    });
  }

  const seats = await seatInfo(orgId);
  if (seats.used >= seats.max_seats) {
    return res.status(403).json({
      success: false,
      message: `Seat limit reached (${seats.used}/${seats.max_seats}). Upgrade to Premium to add more staff.`,
    });
  }

  const hash = await bcrypt.hash(password, 12);

  try {
    const result = await pool.query(
      `INSERT INTO users (organization_id, full_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'STAFF')
       RETURNING user_id`,
      [orgId, fullName.trim(), email.trim(), hash]
    );
    await logAudit(orgId, req.user.userId, "STAFF_CREATED", {
      staffId: result.rows[0].user_id,
    });
    res.status(201).json({ success: true, userId: result.rows[0].user_id });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "A user with that email already exists.",
      });
    }
    throw error;
  }
});

router.patch("/staff/:id/status", async (req, res) => {
  const targetId = Number(req.params.id);
  const { status } = req.body || {};
  const orgId = req.user.organizationId;

  if (!Number.isInteger(targetId)) {
    return res.status(400).json({ success: false, message: "Invalid user." });
  }
  if (!["ACTIVE", "INACTIVE"].includes(status)) {
    return res
      .status(400)
      .json({ success: false, message: "Status must be ACTIVE or INACTIVE." });
  }
  if (targetId === req.user.userId) {
    return res.status(400).json({
      success: false,
      message: "You cannot change your own account status.",
    });
  }

  if (status === "ACTIVE") {
    const seats = await seatInfo(orgId);
    if (seats.used >= seats.max_seats) {
      return res.status(403).json({
        success: false,
        message: `Seat limit reached (${seats.used}/${seats.max_seats}).`,
      });
    }
  }

  const result = await pool.query(
    `UPDATE users SET account_status = $1
     WHERE user_id = $2 AND organization_id = $3
     RETURNING user_id`,
    [status, targetId, orgId]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ success: false, message: "User not found." });
  }

  await logAudit(orgId, req.user.userId, "STAFF_STATUS_CHANGED", {
    staffId: targetId,
    status,
  });
  res.json({ success: true });
});

// ---- Support actions. All limited to the admin's own organization. ----

async function staffInOrg(targetId, orgId) {
  const result = await pool.query(
    `SELECT 1 FROM users WHERE user_id = $1 AND organization_id = $2`,
    [targetId, orgId]
  );
  return result.rowCount > 0;
}

// Returns the target id, or sends the error response and returns null.
async function targetFromRequest(req, res) {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId)) {
    res.status(400).json({ success: false, message: "Invalid user." });
    return null;
  }
  if (!(await staffInOrg(targetId, req.user.organizationId))) {
    res.status(404).json({ success: false, message: "User not found." });
    return null;
  }
  return targetId;
}

// Remove someone's face data so they can enroll again.
router.post("/staff/:id/face-reset", async (req, res) => {
  const targetId = await targetFromRequest(req, res);
  if (targetId === null) return;
  const orgId = req.user.organizationId;

  await pool.query(
    `DELETE FROM biometric_profiles WHERE user_id = $1 AND organization_id = $2`,
    [targetId, orgId]
  );
  await pool.query(
    `UPDATE users SET face_verification_status = 'Unverified'
     WHERE user_id = $1 AND organization_id = $2`,
    [targetId, orgId]
  );
  await pool.query(
    `DELETE FROM verification_attempts WHERE user_id = $1 AND success = FALSE`,
    [targetId]
  );
  await logAudit(orgId, req.user.userId, "FACE_RESET", { staffId: targetId });
  res.json({ success: true });
});

// Clear the 3-wrong-attempts lock.
router.post("/staff/:id/unlock", async (req, res) => {
  const targetId = await targetFromRequest(req, res);
  if (targetId === null) return;

  await pool.query(
    `DELETE FROM verification_attempts WHERE user_id = $1 AND success = FALSE`,
    [targetId]
  );
  await logAudit(req.user.organizationId, req.user.userId, "FACE_UNLOCKED", {
    staffId: targetId,
  });
  res.json({ success: true });
});

// Set a new temporary password (there is no email reset in this prototype).
router.post("/staff/:id/password", async (req, res) => {
  const targetId = await targetFromRequest(req, res);
  if (targetId === null) return;
  const { password } = req.body || {};

  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 8 characters.",
    });
  }

  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    `UPDATE users SET password_hash = $1
     WHERE user_id = $2 AND organization_id = $3`,
    [hash, targetId, req.user.organizationId]
  );
  await logAudit(req.user.organizationId, req.user.userId, "PASSWORD_RESET", {
    staffId: targetId,
  });
  res.json({ success: true });
});

module.exports = router;
