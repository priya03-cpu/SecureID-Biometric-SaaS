# Face service

Turns photos into face embeddings and compares them. Only the Express backend calls it.

## Setup (Windows, PowerShell, from the `face-service` folder)

    py -3.11 -m venv venv
    venv\Scripts\python.exe -m pip install --upgrade pip
    venv\Scripts\python.exe -m pip install -r requirements.txt
    copy .env.example .env

Make a key and paste it into `.env` as FACE_SERVICE_KEY:

    venv\Scripts\python.exe -c "import secrets; print(secrets.token_hex(24))"

## Run

    venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8001

First start downloads ~95 MB of model weights. Wait for "Ready." in the log.
Health check: http://127.0.0.1:8001/health

## Try it on real photos

    venv\Scripts\python.exe test_faces.py --enroll me1.jpg me2.jpg --verify me3.jpg friend.jpg

Expect MATCH for you and NO MATCH for the friend.
