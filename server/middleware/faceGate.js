const pool = require("../db");

// A check-in / check-out is only allowed if THIS user passed a face check in
// the last 2 minutes. The server checks the database, so the browser cannot
// fake it. Set FACE_REQUIRED=false in server/.env to skip this while developing.
async function requireRecentFace(req, res, next) {
  if (process.env.FACE_REQUIRED === "false") return next();

  const result = await pool.query(
    `SELECT 1 FROM verification_attempts
     WHERE user_id = $1 AND success = TRUE
       AND attempted_at > NOW() - INTERVAL '2 minutes'
     LIMIT 1`,
    [req.user.userId]
  );

  if (result.rowCount === 0) {
    return res.status(403).json({
      success: false,
      code: "face_required",
      message: "Face verification required.",
    });
  }
  next();
}

module.exports = { requireRecentFace };
