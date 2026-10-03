import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import Header from "../components/Header.jsx";
import WebcamCapture from "../components/WebcamCapture.jsx";
import FaceVerifyModal from "../components/FaceVerifyModal.jsx";
import "../Dashboard.css";
import "../Face.css";

const PROMPTS = [
  "Look straight at the camera.",
  "Look straight again, relaxed face.",
  "Look straight, tilt your head very slightly.",
];

export default function FaceSetup() {
  const navigate = useNavigate();
  const cam = useRef(null);

  const [status, setStatus] = useState(null); // { consented, enrolled }
  const [agreed, setAgreed] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [replaceOk, setReplaceOk] = useState(false); // passed a face check to re-enroll
  const [askVerify, setAskVerify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/face/status")
      .then(setStatus)
      .catch((e) => setError(e.message));
  }, []);

  const consent = async () => {
    setBusy(true);
    setError("");
    try {
      await api("/api/face/consent", { method: "POST" });
      setStatus((s) => ({ ...s, consented: true }));
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const capture = () => {
    const image = cam.current?.capture();
    if (!image) {
      setError("Camera is not ready yet.");
      return;
    }
    setError("");
    setPhotos((p) => [...p, image]);
  };

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await api("/api/face/enroll", { method: "POST", body: { images: photos } });
      navigate("/staff", { replace: true });
    } catch (e) {
      setError(e.message);
      setPhotos([]); // start over so a bad photo is not reused
      setBusy(false);
    }
  };

  const user = JSON.parse(sessionStorage.getItem("user") || "{}");
  const needsVerifyFirst = status?.enrolled && !replaceOk;

  let body;
  if (!status) {
    body = <p className="muted">Loading…</p>;
  } else if (!status.consented) {
    body = (
      <section className="card">
        <h2>Biometric data notice</h2>
        <p className="muted">
          To verify your attendance we create a numeric face template from a few
          photos taken now. The photos themselves are not saved, only the
          template. It is used only to confirm it is you when you check in or
          out, and it is visible only to your organization. Your administrator
          can remove it at any time. This follows the Personal Data Protection
          Act 2010 (Malaysia).
        </p>
        <label className="consent-row">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          I have read this notice and agree to the use of my face template.
        </label>
        <button className="btn btn-primary" disabled={!agreed || busy} onClick={consent}>
          Continue
        </button>
      </section>
    );
  } else if (needsVerifyFirst) {
    body = (
      <section className="card">
        <h2>You're already enrolled</h2>
        <p className="muted">
          To replace your face data, first confirm it's you with your current
          enrollment.
        </p>
        <div className="modal-actions">
          <button className="btn btn-light" onClick={() => navigate("/staff")}>
            Back
          </button>
          <button className="btn btn-primary" onClick={() => setAskVerify(true)}>
            Verify to re-enroll
          </button>
        </div>
      </section>
    );
  } else {
    const done = photos.length >= PROMPTS.length;
    body = (
      <section className="card">
        <h2>Enroll your face</h2>
        <p className="muted">
          {done
            ? "All photos taken. Save to finish, or retake."
            : `Photo ${photos.length + 1} of ${PROMPTS.length}: ${PROMPTS[photos.length]}`}
        </p>

        {!done && <WebcamCapture ref={cam} />}

        <div className="thumb-row">
          {photos.map((p, i) => (
            <img key={i} src={p} alt={`Photo ${i + 1}`} className="thumb" />
          ))}
        </div>

        <div className="modal-actions">
          {photos.length > 0 && (
            <button className="btn btn-light" onClick={() => setPhotos([])} disabled={busy}>
              Retake
            </button>
          )}
          {done ? (
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save face"}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={capture}>
              Take photo
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="dash-page">
      <Header name={user.name} role={user.role} organization={user.organizationName} />
      <main className="dash-main" style={{ maxWidth: 640 }}>
        <h1 className="dash-title">Face verification setup</h1>
        {error && <div className="alert alert-error">{error}</div>}
        {body}
        {askVerify && (
          <FaceVerifyModal
            onClose={() => setAskVerify(false)}
            onVerified={() => {
              setAskVerify(false);
              setReplaceOk(true);
            }}
          />
        )}
      </main>
    </div>
  );
}
