import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import FaceVerifyModal from "../components/FaceVerifyModal.jsx";
import Header from "../components/Header.jsx";
import "../Dashboard.css";

const time = (value) =>
  value
    ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—";

const day = (value) =>
  new Date(value).toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

export default function StaffDashboard() {
  const [me, setMe] = useState(null);
  const [today, setToday] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const [pendingPath, setPendingPath] = useState(null);

  const load = useCallback(async () => {
    try {
      const [meRes, todayRes, historyRes] = await Promise.all([
        api("/api/auth/me"),
        api("/api/attendance/today"),
        api("/api/attendance/history"),
      ]);
      setMe(meRes.user);
      setToday(todayRes.record);
      setHistory(historyRes.records);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (path) => {
    setBusy(true);
    setError("");
    try {
      await api(path, { method: "POST" });
      await load();
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const enrolled = me?.faceVerificationStatus === "Enrolled";

  // Check-in / check-out first needs a live face check.
  const requestAction = (path) => {
    if (!enrolled) {
      setError("Set up face verification first (see the card below).");
      return;
    }
    setError("");
    setPendingPath(path);
  };

  const removeFace = async () => {
    if (
      !window.confirm(
        "Remove your face data? You will need to enroll again to check in."
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api("/api/face/me", { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const checkedIn = Boolean(today?.checkInTime);
  const checkedOut = Boolean(today?.checkOutTime);

  let statusText = "Not checked in";
  if (checkedOut) statusText = "Day complete";
  else if (checkedIn) statusText = `Checked in (${today.status})`;

  return (
    <div className="dash-page">
      <Header
        organization={me?.organizationName}
        name={me?.name}
        role={me?.role}
      />

      <main className="dash-main">
        <h1 className="dash-title">My attendance</h1>

        {error && <div className="alert alert-error">{error}</div>}

        <section className="card today-card">
          <div>
            <p className="muted">Today</p>
            <h2>{statusText}</h2>
            <p className="muted">
              In: <strong>{time(today?.checkInTime)}</strong> &nbsp;·&nbsp; Out:{" "}
              <strong>{time(today?.checkOutTime)}</strong>
            </p>
          </div>

          <div className="today-actions">
            <button
              className="btn btn-primary"
              disabled={busy || checkedIn}
              onClick={() => requestAction("/api/attendance/check-in")}
            >
              Check in
            </button>
            <button
              className="btn btn-primary"
              disabled={busy || !checkedIn || checkedOut}
              onClick={() => requestAction("/api/attendance/check-out")}
            >
              Check out
            </button>
          </div>
        </section>

        <section className="card">
          <div className="card-row">
            <h2>Face verification</h2>
            <span className={`badge ${enrolled ? "badge-green" : "badge-grey"}`}>
              {me?.faceVerificationStatus || "Unverified"}
            </span>
          </div>
          {enrolled ? (
            <>
              <p className="muted">
                Your face is enrolled. You will be asked to verify each time you
                check in or out.
              </p>
              <button className="btn btn-light" disabled={busy} onClick={removeFace}>
                Remove my face data
              </button>
            </>
          ) : (
            <>
              <p className="muted">Enroll your face once to start checking in.</p>
              <button
                className="btn btn-primary"
                onClick={() => navigate("/staff/face-setup")}
              >
                Set up face verification
              </button>
            </>
          )}
        </section>

        {pendingPath && (
          <FaceVerifyModal
            onClose={() => setPendingPath(null)}
            onVerified={() => {
              const path = pendingPath;
              setPendingPath(null);
              act(path);
            }}
          />
        )}

        <section className="card">
          <h2>Recent attendance</h2>
          {history.length === 0 ? (
            <p className="muted">No records yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Check in</th>
                    <th>Check out</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((r) => (
                    <tr key={r.attendanceId}>
                      <td>{day(r.date)}</td>
                      <td>{time(r.checkInTime)}</td>
                      <td>{time(r.checkOutTime)}</td>
                      <td>
                        <span
                          className={`badge ${
                            r.status === "LATE" ? "badge-amber" : "badge-green"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
