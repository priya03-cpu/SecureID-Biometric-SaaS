const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");
const { logAudit } = require("../audit");

const router = express.Router();

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required.",
    });
  }

  const result = await pool.query(
    `SELECT u.user_id, u.organization_id, u.full_name, u.email, u.password_hash,
            u.role, u.account_status, o.organization_name
     FROM users u
     JOIN organizations o ON u.organization_id = o.organization_id
     WHERE LOWER(u.email) = LOWER($1)`,
    [email]
  );

  const user = result.rows[0];
  const passwordOk = user
    ? await bcrypt.compare(password, user.password_hash)
    : false;

  if (!user || !passwordOk) {
    if (user) {
      await logAudit(user.organization_id, user.user_id, "LOGIN_FAILED");
    }
    return res.status(401).json({
      success: false,
      message: "Invalid email or password.",
    });
  }

  if (user.account_status !== "ACTIVE") {
    return res.status(403).json({
      success: false,
      message: "Your account is not active.",
    });
  }

  const token = jwt.sign(
    {
      userId: user.user_id,
      organizationId: user.organization_id,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: "2h" }
  );

  await logAudit(user.organization_id, user.user_id, "LOGIN_SUCCESS");

  res.json({
    success: true,
    message: "Login successful!",
    token,
    user: {
      userId: user.user_id,
      name: user.full_name,
      email: user.email,
      organizationId: user.organization_id,
      organizationName: user.organization_name,
      role: user.role,
    },
  });
});

router.get("/me", requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT u.user_id, u.full_name, u.email, u.role, u.account_status,
            u.face_verification_status,
            o.organization_name, o.plan, o.max_seats
     FROM users u
     JOIN organizations o ON u.organization_id = o.organization_id
     WHERE u.user_id = $1 AND u.organization_id = $2`,
    [req.user.userId, req.user.organizationId]
  );

  const u = result.rows[0];
  if (!u || u.account_status !== "ACTIVE") {
    return res
      .status(401)
      .json({ success: false, message: "Account not available." });
  }

  res.json({
    success: true,
    user: {
      userId: u.user_id,
      name: u.full_name,
      email: u.email,
      role: u.role,
      faceVerificationStatus: u.face_verification_status,
      organizationName: u.organization_name,
      plan: u.plan,
      maxSeats: u.max_seats,
    },
  });
});

router.post("/logout", requireAuth, async (req, res) => {
  await logAudit(req.user.organizationId, req.user.userId, "LOGOUT");
  res.json({ success: true });
});

module.exports = router;
