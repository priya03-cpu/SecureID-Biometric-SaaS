"""
Try the face service on your own photos, before wiring it into the app.

  python test_faces.py --enroll me1.jpg me2.jpg --verify me3.jpg friend.jpg

Photos used with --enroll become the stored face. Each --verify photo is then
compared against it. Use real selfies: ideally 2 of you to enroll, 1 more of
you to verify, and 1 of someone else (the "should NOT match" test).
"""
import argparse
import base64
import json
import os
import urllib.error
import urllib.request

from dotenv import load_dotenv

load_dotenv()
URL = os.getenv("FACE_SERVICE_URL", "http://127.0.0.1:8001")
KEY = os.getenv("FACE_SERVICE_KEY", "")


def b64(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()


def post(path, payload):
    req = urllib.request.Request(
        URL + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "X-Service-Key": KEY},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.load(e)
    except urllib.error.URLError as e:
        raise SystemExit(f"Cannot reach the face service at {URL}: {e.reason}")


parser = argparse.ArgumentParser()
parser.add_argument("--enroll", nargs="+", required=True)
parser.add_argument("--verify", nargs="+", required=True)
args = parser.parse_args()

status, res = post("/enroll", {"images": [b64(p) for p in args.enroll]})
if status != 200:
    raise SystemExit(f"Enroll failed ({status}): {res.get('message')}")

embedding = res["embedding"]
print(f"Enrolled from {res['imagesUsed']} photo(s) using {res['model']}.\n")

for path in args.verify:
    status, res = post("/verify", {"image": b64(path), "embedding": embedding})
    if status != 200:
        print(f"{path}: ERROR - {res.get('message')}")
        continue
    verdict = "MATCH" if res["match"] else "NO MATCH"
    print(f"{path}: {verdict}  (distance {res['distance']}, limit {res['threshold']})")
