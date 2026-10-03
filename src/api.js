const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// sessionStorage clears when the tab closes, which suits a login-sensitive app.
export const getToken = () => sessionStorage.getItem("token");

export const getUser = () => {
  try {
    return JSON.parse(sessionStorage.getItem("user"));
  } catch {
    return null;
  }
};

export function saveSession(token, user) {
  sessionStorage.setItem("token", token);
  sessionStorage.setItem("user", JSON.stringify(user));
}

export function clearSession() {
  sessionStorage.removeItem("token");
  sessionStorage.removeItem("user");
}

export const homeFor = (role) => (role === "ADMIN" ? "/admin" : "/staff");

export async function api(path, { method = "GET", body } = {}) {
  const token = getToken();
  let response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Cannot connect to backend.");
  }

  const data = await response.json().catch(() => ({}));

  // Expired or invalid session: send the person back to the login page.
  if (response.status === 401 && token) {
    clearSession();
    window.location.href = "/login";
    throw new Error(data.message || "Session expired.");
  }

  if (!response.ok) {
    throw new Error(data.message || "Request failed.");
  }

  return data;
}
