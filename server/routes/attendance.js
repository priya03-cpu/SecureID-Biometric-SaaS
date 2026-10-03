const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");
const { logAudit } = require("../audit");
const { requireRecentFace } = require("../middleware/faceGate");

const router = express.Router();
router.use(requireAuth);

// Check-ins after 09:15 server time count as LATE. Change to suit your demo.
const LATE_AFTER_MINUTES = 9 * 60 + 15;

function format(row) {
  if (!row) return null;
  return {
    attendanceId: row.attendance_id,
    date: row.attendance_date,
    checkInTime: row.check_in_time,
    checkOutTime: row.check_out_time,
    status: row.status,
  };
}

router.get("/today", async (req, res) => {
  const { userId, organizationId } = req.user;
  const result = await pool.query(
    `SELECT * FROM attendance_records
     WHERE user_id = $1 AND organization_id = $2 AND attendance_date = CURRENT_DATE`,
    [userId, organizationId]
  );
  res.json({ success: true, record: format(result.rows[0]) });
});

router.post("/check-in", requireRecentFace, async (req, res) => {
  const { userId, organizationId } = req.user;
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const status = minutes > LATE_AFTER_MINUTES ? "LATE" : "PRESENT";

  const result = await pool.query(
    `INSERT INTO attendance_records (organization_id, user_id, check_in_time, status)
     VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (user_id, attendance_date) DO NOTHING
     RETURNING *`,
    [organizationId, userId, status]
  );

  if (result.rowCount === 0) {
    return res
      .status(409)
      .json({ success: false, message: "You have already checked in today." });
  }

  await logAudit(organizationId, userId, "CHECK_IN", { status });
  res.status(201).json({ success: true, record: format(result.rows[0]) });
});

router.post("/check-out", requireRecentFace, async (req, res) => {
  const { userId, organizationId } = req.user;

  const result = await pool.query(
    `UPDATE attendance_records
     SET check_out_time = NOW()
     WHERE user_id = $1 AND organization_id = $2
       AND attendance_date = CURRENT_DATE
       AND check_in_time IS NOT NULL
       AND check_out_time IS NULL
     RETURNING *`,
    [userId, organizationId]
  );

  if (result.rowCount === 0) {
    return res.status(409).json({
      success: false,
      message: "You have not checked in today, or have already checked out.",
    });
  }

  await logAudit(organizationId, userId, "CHECK_OUT");
  res.json({ success: true, record: format(result.rows[0]) });
});

router.get("/history", async (req, res) => {
  const { userId, organizationId } = req.user;
  const result = await pool.query(
    `SELECT * FROM attendance_records
     WHERE user_id = $1 AND organization_id = $2
     ORDER BY attendance_date DESC
     LIMIT 30`,
    [userId, organizationId]
  );
  res.json({ success: true, records: result.rows.map(format) });
});

module.exports = router;
