import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import "../Face.css";

// Shows the webcam. The parent calls ref.current.capture() to get a JPEG
// data URL (or null if the camera is not ready yet).
const WebcamCapture = forwardRef(function WebcamCapture(_props, ref) {
  const videoRef = useRef(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stream;
    let cancelled = false;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setReady(true);
      } catch (e) {
        setError(
          e?.name === "NotAllowedError"
            ? "Camera access is blocked. Allow the camera in your browser's address bar, then reload."
            : "Could not open the camera. Is another app using it?"
        );
      }
    }
    start();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useImperativeHandle(ref, () => ({
    capture() {
      const video = videoRef.current;
      if (!video || !video.videoWidth) return null;
      const scale = Math.min(1, 800 / video.videoWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.9);
    },
    ready,
  }));

  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div className="cam-frame">
      <video ref={videoRef} className="cam-video" playsInline muted />
      {!ready && <div className="cam-loading">Starting camera…</div>}
      <div className="cam-oval" />
    </div>
  );
});

export default WebcamCapture;
