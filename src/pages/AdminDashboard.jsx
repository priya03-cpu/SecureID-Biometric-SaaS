import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import Header from "../components/Header.jsx";
import "../Dashboard.css";
import "../Face.css";

const time = (value) =>
  value
    ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—";

const todayString = () => {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${dayOfMonth}`;
};

const statusClass = (s) =>
  s === "PRESENT" ? "badge-green" : s === "LATE" ? "badge-amber" : "badge-grey";

export default function AdminDashboard() {
  const [me, setMe] = useState(null);
  const [summary, setSummary] = useState(null);
  const [tab, setTab] = useState("attendance");
  const [date, setDate] = useState(todayString());
  const [rows, setRows] = useState([]);
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState({ fullName: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadSummary = useCallback(async () => {
    const [meRes, sumRes] = await Promise.all([
      api("/api/auth/me"),
      api("/api/admin/summary"),
    ]);
    setMe(meRes.user);
    setSummary(sumRes.summary);
  }, []);

  const loadAttendance = useCallback(async () => {
    const res = await api(`/api/admin/attendance?date=${date}`);
    setRows(res.rows);
  }, [date]);

  const loadStaff = useCallback(async () => {
    const res = await api("/api/admin/staff");
    setStaff(res.staff);
  }, []);

  const run = async (fn) => {
    try {
      setError("");
      await fn();
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    run(loadSummary);
  }, [loadSummary]);

  useEffect(() => {
    run(loadAttendance);
  }, [loadAttendance]);

  useEffect(() => {
    run(loadStaff);
  }, [loadStaff]);

  const addStaff = (e) => {
    e.preventDefault();
    setNotice("");
    run(async () => {
      await api("/api/admin/staff", { method: "POST", body: form });
      setForm({ fullName: "", email: "", password: "" });
      setNotice("Staff member added.");
      await Promise.all([loadStaff(), loadSummary(), loadAttendance()]);
    });
  };

  const toggleStatus = (member) => {
    setNotice("");
    run(async () => {
      await api(`/api/admin/staff/${member.userId}/status`, {
        method: "PATCH",
        body: { status: member.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" },
      });
      await Promise.all([loadStaff(), loadSummary(), loadAttendance()]);
    });
  };

  const resetFace = (member) => {
    if (
      !window.confirm(
        `Remove ${member.name}'s face data? They will need to enroll again.`
      )
    )
      return;
    setNotice("");
    run(async () => {
      await api(`/api/admin/staff/${member.userId}/face-reset`, { method: "POST" });
      setNotice("Face data removed.");
      await Promise.all([loadStaff(), loadSummary()]);
    });
  };

  const unlockFace = (member) => {
    setNotice("");
    run(async () => {
      await api(`/api/admin/staff/${member.userId}/unlock`, { method: "POST" });
      setNotice(`${member.name} can try face verification again.`);
      await loadStaff();
    });
  };

  const resetPassword = (member) => {
    const password = window.prompt(
      `New temporary password for ${member.name} (min 8 characters):`
    );
    if (!password) return;
    setNotice("");
    run(async () => {
      await api(`/api/admin/staff/${member.userId}/password`, {
        method: "POST",
        body: { password },
      });
      setNotice(`Password changed for ${member.name}.`);
    });
  };

  const seatPercent = summary
    ? Math.min(100, Math.round((summary.seatsUsed / summary.maxSeats) * 100))
    : 0;

  return (
    <div className="dash-page">
      <Header
        organization={me?.organizationName}
        name={me?.name}
        role={me?.role}
      />

      <main className="dash-main">
        <h1 className="dash-title">Admin dashboard</h1>

        {error && <div className="alert alert-error">{error}</div>}
        {notice && <div className="alert alert-ok">{notice}</div>}

        {summary && (
          <section className="stat-grid">
            <div className="card stat">
              <p className="muted">Seats used</p>
              <h2>
                {summary.seatsUsed}/{summary.maxSeats}
              </h2>
              <div className="bar">
                <div className="bar-fill" style={{ width: `${seatPercent}%` }} />
              </div>
              <p className="muted small">{summary.plan} plan</p>
            </div>

            <div className="card stat">
              <p className="muted">Checked in today</p>
              <h2>{summary.checkedInToday}</h2>
            </div>

            <div className="card stat">
              <p className="muted">Faces enrolled</p>
              <h2>{summary.faceEnrolled}</h2>
            </div>

            <div className="card stat">
              <p className="muted">Inactive accounts</p>
              <h2>{summary.inactiveUsers}</h2>
            </div>
          </section>
        )}

        <div className="tabs">
          <button
            className={tab === "attendance" ? "tab active" : "tab"}
            onClick={() => setTab("attendance")}
          >
            Attendance
          </button>
          <button
            className={tab === "staff" ? "tab active" : "tab"}
            onClick={() => setTab("staff")}
          >
            Staff
          </button>
          <button
            className={tab === "premium" ? "tab active" : "tab"}
            onClick={() => setTab("premium")}
          >
            Premium
          </button>
        </div>

        {tab === "attendance" && (
          <section className="card">
            <div className="card-row">
              <h2>Attendance</h2>
              <input
                type="date"
                className="field"
                value={date}
                max={todayString()}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Check in</th>
                    <th>Check out</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.userId}>
                      <td>
                        {r.name}
                        <div className="muted small">{r.email}</div>
                      </td>
                      <td>{time(r.checkInTime)}</td>
                      <td>{time(r.checkOutTime)}</td>
                      <td>
                        <span className={`badge ${statusClass(r.status)}`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "staff" && (
          <>
            <section className="card">
              <h2>Add staff member</h2>
              <form className="add-form" onSubmit={addStaff}>
                <input
                  className="field"
                  placeholder="Full name"
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  required
                />
                <input
                  className="field"
                  type="email"
                  placeholder="Email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
                <input
                  className="field"
                  type="text"
                  placeholder="Temporary password (min 8)"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                />
                <button className="btn btn-primary" type="submit">
                  Add
                </button>
              </form>
            </section>

            <section className="card">
              <h2>Staff</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Face</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map((s) => (
                      <tr key={s.userId}>
                        <td>
                          {s.name}
                          <div className="muted small">{s.email}</div>
                        </td>
                        <td>{s.role}</td>
                        <td>
                          {s.faceStatus || "Unverified"}
                          {s.locked && (
                            <span className="badge badge-amber" style={{ marginLeft: 8 }}>
                              Locked
                            </span>
                          )}
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              s.status === "ACTIVE" ? "badge-green" : "badge-grey"
                            }`}
                          >
                            {s.status}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions">
                            {s.locked && (
                              <button className="btn btn-light" onClick={() => unlockFace(s)}>
                                Unlock
                              </button>
                            )}
                            {s.faceStatus === "Enrolled" && (
                              <button className="btn btn-light" onClick={() => resetFace(s)}>
                                Reset face
                              </button>
                            )}
                            {s.userId !== me?.userId && (
                              <>
                                <button className="btn btn-light" onClick={() => resetPassword(s)}>
                                  Reset password
                                </button>
                                <button className="btn btn-light" onClick={() => toggleStatus(s)}>
                                  {s.status === "ACTIVE" ? "Deactivate" : "Activate"}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {tab === "premium" && (
          <section className="card">
            <h2>Premium features</h2>
            <p className="muted">
              Your organization is on the {summary?.plan || "FREE"} plan. These
              methods unlock on Premium.
            </p>
            <div className="locked-grid">
              <div className="locked">🔒 Fingerprint authentication</div>
              <div className="locked">🔒 Voice authentication</div>
              <div className="locked">🔒 More than {summary?.maxSeats ?? 10} staff seats</div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
