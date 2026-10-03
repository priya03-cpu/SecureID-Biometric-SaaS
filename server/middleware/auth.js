const jwt = require("jsonwebtoken");

// Reads "Authorization: Bearer <token>" and attaches req.user.
// organizationId ALWAYS comes from the signed token, never from the request body.
function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || "").split(" ");

  if (scheme !== "Bearer" || !token) {
    return res
      .status(401)
      .json({ success: false, message: "Not authenticated." });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      userId: payload.userId,
      organizationId: payload.organizationId,
      role: payload.role,
    };
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Session expired. Please sign in again.",
    });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ success: false, message: "You do not have access to this." });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
