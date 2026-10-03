import { Navigate } from "react-router-dom";
import { getToken, getUser, homeFor } from "../api.js";

// Blocks pages for signed-out people, and sends people with the wrong role
// back to their own dashboard. The server enforces this too.
export default function ProtectedRoute({ role, children }) {
  const user = getUser();

  if (!getToken() || !user) {
    return <Navigate to="/login" replace />;
  }

  if (role && user.role !== role) {
    return <Navigate to={homeFor(user.role)} replace />;
  }

  return children;
}
