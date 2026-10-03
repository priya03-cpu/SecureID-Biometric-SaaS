import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api, getToken, getUser, homeFor, saveSession } from "../api.js";
import "../App.css";

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  // Already signed in? Skip the login page.
  const existing = getUser();
  if (getToken() && existing) {
    return <Navigate to={homeFor(existing.role)} replace />;
  }

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: { email, password },
      });

      saveSession(data.token, data.user);
      navigate(homeFor(data.user.role), { replace: true });
    } catch (error) {
      setMessage(error.message);
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Left Side */}
      <div className="login-brand">
        <div className="brand-content">
          <div className="brand-logo">
            <span>🔐</span>
            SecureID
          </div>

          <div className="brand-main">
            <p className="eyebrow">IDENTITY MANAGEMENT SAAS</p>

            <h1>
              Secure access.
              <br />
              Smarter identity.
            </h1>

            <p className="brand-description">
              A cloud-based multi-tenant identity management platform with
              biometric authentication for modern organizations.
            </p>
          </div>

          <div className="feature-list">
            <div className="feature-item">
              <span className="feature-icon">✓</span>
              <div>
                <strong>Multi-Tenant Security</strong>
                <p>Separate and secure organizational data.</p>
              </div>
            </div>

            <div className="feature-item">
              <span className="feature-icon">✓</span>
              <div>
                <strong>Biometric Authentication</strong>
                <p>Face-based identity verification.</p>
              </div>
            </div>

            <div className="feature-item">
              <span className="feature-icon">✓</span>
              <div>
                <strong>Centralized Management</strong>
                <p>Attendance and internal e-voting in one platform.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="brand-footer">© 2026 SecureID · FYP Prototype</div>
      </div>

      {/* Right Side */}
      <div className="login-section">
        <div className="login-card">
          <div className="mobile-brand">
            <div className="brand-logo">
              <span>🔐</span>
              SecureID
            </div>
          </div>

          <div className="login-header">
            <p className="login-label">WELCOME BACK</p>
            <h2>Sign in to your account</h2>
            <p>Enter your organization credentials to continue.</p>
          </div>

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="email">Email address</label>

              <div className="input-wrapper">
                <span className="input-icon">✉</span>

                <input
                  id="email"
                  type="email"
                  placeholder="you@organization.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <div className="password-label-row">
                <label htmlFor="password">Password</label>
                <span
                  className="forgot-text"
                  role="button"
                  tabIndex={0}
                  style={{ cursor: "pointer" }}
                  onClick={() => setShowForgot(!showForgot)}
                  onKeyDown={(e) => e.key === "Enter" && setShowForgot(!showForgot)}
                >
                  Forgot password?
                </span>
              </div>

              <div className="input-wrapper">
                <span className="input-icon">🔒</span>

                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />

                <button
                  type="button"
                  className="show-password"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button type="submit" className="login-button" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
              {!loading && <span>→</span>}
            </button>
          </form>

          {message && <div className="login-message error">{message}</div>}

          {showForgot && (
            <div className="login-message">
              Ask your organization administrator to set a new temporary
              password for you.
            </div>
          )}

          <div className="security-note">
            <span>🛡</span>
            <div>
              <strong>Secure authentication</strong>
              <p>
                Your credentials are verified securely through the
                organization's identity service.
              </p>
            </div>
          </div>

          <div className="login-footer">
            <span>Cloud-based</span>
            <span>•</span>
            <span>Multi-tenant</span>
            <span>•</span>
            <span>Biometric-ready</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
