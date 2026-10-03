const pool = require("./db");

// Best-effort audit trail: a logging failure must never break the request.
async function logAudit(organizationId, userId, action, details = null) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, action, details)
       VALUES ($1, $2, $3, $4)`,
      [organizationId, userId, action, details ? JSON.stringify(details) : null]
    );
  } catch (error) {
    console.error("Audit log failed:", error.message);
  }
}

module.exports = { logAudit };
