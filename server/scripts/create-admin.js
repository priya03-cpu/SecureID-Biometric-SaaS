// Creates an organization (if new) and an ADMIN user.
// Run from the server folder:
//   node scripts/create-admin.js "Demo Training Centre" "Your Name" you@example.com "a-long-password"
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const bcrypt = require("bcryptjs");
const pool = require("../db");

const [orgName, fullName, email, password] = process.argv.slice(2);

if (!orgName || !fullName || !email || !password) {
  console.log(
    'Usage: node scripts/create-admin.js "Organization" "Full name" email password'
  );
  process.exit(1);
}
if (password.length < 8) {
  console.log("Password must be at least 8 characters.");
  process.exit(1);
}

(async () => {
  const hash = await bcrypt.hash(password, 12);

  const found = await pool.query(
    `SELECT organization_id FROM organizations WHERE organization_name = $1`,
    [orgName]
  );
  let orgId = found.rows[0]?.organization_id;
  if (!orgId) {
    const created = await pool.query(
      `INSERT INTO organizations (organization_name) VALUES ($1)
       RETURNING organization_id`,
      [orgName]
    );
    orgId = created.rows[0].organization_id;
  }

  await pool.query(
    `INSERT INTO users (organization_id, full_name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, 'ADMIN')`,
    [orgId, fullName, email, hash]
  );
  console.log(`Admin ${email} created in "${orgName}". Log in, then add staff from the Staff tab.`);
  await pool.end();
})().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
