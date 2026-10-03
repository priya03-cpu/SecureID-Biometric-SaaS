"""
Face service for the Biometric SaaS prototype.

Only the Express backend should call this. It binds to 127.0.0.1 and every
request must carry the shared secret in the X-Service-Key header.

It never stores anything: it turns photos into embeddings (lists of numbers)
and compares embeddings. Express keeps the embedding in PostgreSQL.
"""
import base64
import logging
import os
import secrets
import threading
from contextlib import asynccontextmanager

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
os.environ.setdefault("TF_USE_LEGACY_KERAS", "1")  # DeepFace uses tf-keras

import cv2
import numpy as np
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

load_dotenv()

from deepface import DeepFace  # noqa: E402  (after env vars are set)

log = logging.getLogger("face-service")
logging.basicConfig(level=logging.INFO)

MODEL = os.getenv("FACE_MODEL", "Facenet512")
DETECTOR = os.getenv("FACE_DETECTOR", "mtcnn")
THRESHOLD = float(os.getenv("FACE_THRESHOLD", "0.30"))
ANTI_SPOOF = os.getenv("FACE_ANTI_SPOOF", "false").lower() == "true"
SERVICE_KEY = os.getenv("FACE_SERVICE_KEY", "")

MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_SIDE_PX = 1280          # bigger photos are shrunk before processing
MIN_FACE_PX = 80            # face must be at least this wide/tall
MIN_CONFIDENCE = 0.90       # detector confidence

if len(SERVICE_KEY) < 16:
    raise RuntimeError(
        "FACE_SERVICE_KEY is missing or too short. Copy .env.example to .env "
        "and set a long random value (16+ characters)."
    )

# TensorFlow models are not safely shared across threads, so one at a time.
_model_lock = threading.Lock()


class FaceError(Exception):
    def __init__(self, code: str, message: str, status: int = 422):
        self.code, self.message, self.status = code, message, status


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load the models now so the first real request is not slow.
    log.info("Loading models (%s + %s)...", MODEL, DETECTOR)
    blank = np.zeros((224, 224, 3), dtype=np.uint8)
    with _model_lock:
        try:
            DeepFace.represent(
                img_path=blank,
                model_name=MODEL,
                detector_backend=DETECTOR,
                enforce_detection=False,
                anti_spoofing=ANTI_SPOOF,  # also loads the anti-spoof model
            )
        except ValueError:
            pass  # a blank image "looks fake" - expected; models are loaded now
    log.info("Ready. threshold=%.2f anti_spoof=%s", THRESHOLD, ANTI_SPOOF)
    yield


app = FastAPI(title="Biometric face service", lifespan=lifespan)


@app.exception_handler(FaceError)
async def face_error_handler(request: Request, exc: FaceError):
    return JSONResponse(
        status_code=exc.status,
        content={"success": False, "code": exc.code, "message": exc.message},
    )


def require_key(x_service_key: str = Header(default="")):
    if not secrets.compare_digest(x_service_key, SERVICE_KEY):
        raise FaceError("unauthorized", "Invalid service key.", 401)


# ---------- helpers ----------

def decode_image(data: str) -> np.ndarray:
    """Accepts a base64 string, with or without the 'data:image/...;base64,' prefix."""
    if "," in data[:100]:
        data = data.split(",", 1)[1]
    try:
        raw = base64.b64decode(data, validate=True)
    except Exception:
        raise FaceError("bad_image", "Image is not valid base64.", 400)

    if len(raw) > MAX_IMAGE_BYTES:
        raise FaceError("image_too_large", "Image is larger than 5 MB.", 413)

    img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise FaceError("bad_image", "Could not read the image.", 400)

    h, w = img.shape[:2]
    scale = MAX_SIDE_PX / max(h, w)
    if scale < 1:
        img = cv2.resize(img, (int(w * scale), int(h * scale)))
    return img


def unit(vec) -> np.ndarray:
    v = np.asarray(vec, dtype=np.float64)
    n = np.linalg.norm(v)
    if n == 0:
        raise FaceError("bad_embedding", "Embedding is empty.", 400)
    return v / n


def embed(img: np.ndarray) -> np.ndarray:
    """Photo -> unit-length embedding. Raises FaceError with a friendly message."""
    try:
        with _model_lock:
            results = DeepFace.represent(
                img_path=img,
                model_name=MODEL,
                detector_backend=DETECTOR,
                enforce_detection=True,
                align=True,
                anti_spoofing=ANTI_SPOOF,
            )
    except ValueError as exc:
        name = type(exc).__name__
        if name == "SpoofDetected":
            raise FaceError(
                "spoof_detected",
                "This looks like a photo or a screen, not a live face.",
            )
        raise FaceError(
            "no_face",
            "No face found. Face the camera in good light and try again.",
        )

    if len(results) > 1:
        raise FaceError(
            "multiple_faces", "More than one face is visible. Only you should be in frame."
        )

    face = results[0]
    area = face["facial_area"]
    if min(area["w"], area["h"]) < MIN_FACE_PX:
        raise FaceError("face_too_small", "Move closer to the camera.")
    if (face.get("face_confidence") or 1.0) < MIN_CONFIDENCE:
        raise FaceError("low_quality", "Face not clear enough. Improve the lighting.")

    return unit(face["embedding"])


# ---------- API ----------

class EnrollRequest(BaseModel):
    images: list[str] = Field(min_length=1, max_length=5)


class VerifyRequest(BaseModel):
    image: str
    embedding: list[float] = Field(min_length=64)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": MODEL,
        "detector": DETECTOR,
        "threshold": THRESHOLD,
        "antiSpoof": ANTI_SPOOF,
    }


@app.post("/enroll", dependencies=[Depends(require_key)])
def enroll(body: EnrollRequest):
    """1-5 photos of the same person -> one averaged embedding to store."""
    embeddings = []
    for i, image in enumerate(body.images, start=1):
        try:
            embeddings.append(embed(decode_image(image)))
        except FaceError as exc:
            exc.message = f"Photo {i}: {exc.message}"
            raise

    # Sanity check: all photos must be the same person.
    for a in range(len(embeddings)):
        for b in range(a + 1, len(embeddings)):
            if 1 - float(embeddings[a] @ embeddings[b]) > THRESHOLD:
                raise FaceError(
                    "inconsistent_photos",
                    "The enrollment photos do not look like the same person.",
                )

    mean = unit(np.mean(embeddings, axis=0))
    return {
        "success": True,
        "embedding": mean.tolist(),
        "model": MODEL,
        "imagesUsed": len(embeddings),
    }


@app.post("/verify", dependencies=[Depends(require_key)])
def verify(body: VerifyRequest):
    """New photo + stored embedding -> match yes/no and the distance."""
    new = embed(decode_image(body.image))
    stored = unit(body.embedding)

    if stored.shape != new.shape:
        raise FaceError(
            "model_mismatch",
            "Stored face data was made with a different model. Re-enroll.",
            409,
        )

    distance = 1 - float(stored @ new)   # cosine distance
    return {
        "success": True,
        "match": distance <= THRESHOLD,
        "distance": round(distance, 4),
        "threshold": THRESHOLD,
        "model": MODEL,
    }
