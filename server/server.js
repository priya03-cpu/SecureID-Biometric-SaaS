require("dotenv").config();
const express = require("express");
const cors = require("cors");
const pool = require("./db");

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is missing in server/.env. Add it and restart.");
  process.exit(1);
}

const app = express();

const allowedOrigins = (
  process.env.CLIENT_ORIGIN || "http://localhost:5173,http://127.0.0.1:5173"
).split(",");

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "10mb" })); // face photos are big

pool
  .query("SELECT NOW()")
  .then(() => console.log("PostgreSQL connected successfully!"))
  .catch((error) => {
    console.error("PostgreSQL connection failed:");
    console.error(error.message);
  });

app.use("/api/auth", require("./routes/auth"));
app.use("/api/attendance", require("./routes/attendance"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/face", require("./routes/face"));

// Anything thrown inside a route ends up here and returns JSON, not HTML.
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ success: false, message: "Internal server error." });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
