import { useNavigate } from "react-router-dom";
import { api, clearSession } from "../api.js";

export default function Header({ title, organization, name, role }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // Even if the server call fails, still sign out locally.
    }
    clearSession();
    navigate("/login", { replace: true });
  };

  return (
    <header className="dash-header">
      <div>
        <div className="dash-brand">🔐 SecureID</div>
        <div className="dash-org">{organization || title}</div>
      </div>

      <div className="dash-user">
        <div>
          <strong>{name}</strong>
          <span className="role-pill">{role}</span>
        </div>
        <button className="btn btn-light" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </header>
  );
}
