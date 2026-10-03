import os, sys
os.environ.setdefault("TF_USE_LEGACY_KERAS", "1")
import cv2
from deepface import DeepFace

for p in sys.argv[1:]:
    img = cv2.imread(p)
    try:
        faces = DeepFace.extract_faces(img_path=img, detector_backend="mtcnn",
                                       enforce_detection=True, align=True)
    except Exception as e:
        print(p, "-> NO FACE FOUND")
        continue
    for i, f in enumerate(faces):
        a = f["facial_area"]
        print(p, "face", i, "size", a["w"], "x", a["h"], "confidence", round(f.get("confidence", 0), 3))
        crop = (f["face"] * 255).astype("uint8")[:, :, ::-1]
        cv2.imwrite(f"crop_{i}_{p}", crop)