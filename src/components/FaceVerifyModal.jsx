import { useRef, useState } from "react";
import { api } from "../api.js";
import WebcamCapture from "./WebcamCapture.jsx";
import "../Face.css";

// Takes one photo, sends it to the server, and calls onVerified() on a match.
export default function FaceVerifyModal({ onVerified, onClose }) {
  const cam = useRef(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [locked, setLocked] = useState(false);

  const verify = async () => {
    const image = cam.current?.capture();
    if (!image) {
      setMessage("Camera is not ready yet.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const data = await api("/api/face/verify", { method: "POST", body: { image } });
      if (data.match) {
        onVerified();
        return;
      }
      if (data.attemptsLeft === 0) {
        setLocked(true);
        setMessage("Face did not match. No attempts left. Ask your admin for help.");
      } else {
        setMessage(`Face did not match. ${data.attemptsLeft} attempt(s) left.`);
      }
    } catch (e) {
      setMessage(e.message);
      if (/too many/i.test(e.message)) setLocked(true);
    }
    setBusy(false);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <h2>Verify it's you</h2>
        <p className="muted">
          Look straight at the camera in good light, then press Verify.
        </p>

        <WebcamCapture ref={cam} />

        {message && <div className="alert alert-error">{message}</div>}

        <div className="modal-actions">
          <button className="btn btn-light" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={verify} disabled={busy || locked}>
            {busy ? "Checking…" : "Verify"}
          </button>
        </div>
      </div>
    </div>
  );
}
