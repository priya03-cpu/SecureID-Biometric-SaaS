# SecureID – Biometric Identity SaaS

A cloud-based, multi-tenant identity management platform for small education and training centres. Each organization keeps one trusted staff identity (password + face verification) that can be reused across internal services. The FYP1 module is **Staff Attendance**.

> FYP1 prototype – Quest International University (QIU), Bachelor of Computer Science (Software Engineering).

## Features

| Feature | Status |
|---|---|
| Email + password login (bcrypt, JWT, 2 h expiry) | Done |
| Multi-tenant lookup (user joined to organization) | Done |
| Account status check (only `ACTIVE` users can log in) | Done |
| Role-based routing and API guards (Admin / Staff) | Done |
| PDPA biometric consent page (versioned, stored) | Done |
| Face enrollment (3 webcam photos → one embedding) | Done |
| Face verification before every check-in / check-out | Done |
| 3-attempt limit with 15-minute lock | Done |
| Passive anti-spoof (photo / screen check) | Optional (`FACE_ANTI_SPOOF=true`) |
| Attendance check-in / check-out with late status | Done |
| Admin: staff list, seats, add / deactivate staff | Done |
| Admin: reset face data, unlock account, reset password | Done |
| Staff: delete own face data (withdraw consent) | Done |
| Audit log of logins, face checks and admin actions | Done |
| E-voting, fingerprint/voice, billing | Future scope |

## How face verification works

```
Browser (webcam) ──base64 photo──► Express API ──► Python face service (DeepFace)
                                      │                  │
                                      │◄── embedding ────┘   (numbers only; photos are never stored)
                                      ▼
                                 PostgreSQL
```

- **Enroll:** 3 photos are turned into embeddings, checked to be the same person, averaged, and stored in `biometric_profiles`.
- **Verify:** a new photo is compared with the stored embedding (cosine distance, threshold 0.30). Each result is logged in `verification_attempts`.
- **Gate:** `POST /api/attendance/check-in` and `/check-out` return `403` unless the same user passed a face check in the last 2 minutes. The server checks the database, so the browser cannot skip it.
- The Python service listens on `127.0.0.1` only and needs a shared secret (`X-Service-Key`). Only the Express backend calls it.

## Tech stack

- **Frontend:** React 19, Vite
- **Backend:** Node.js, Express 5
- **Database:** PostgreSQL (`pg`)
- **Auth:** `bcryptjs`, `jsonwebtoken`
- **Face service:** Python 3.10/3.11, FastAPI, DeepFace (Facenet512 + MTCNN), TensorFlow

## Project structure

```
.
├── src/                React frontend
│   ├── components/     Header, ProtectedRoute, WebcamCapture, FaceVerifyModal
│   └── pages/          Login, StaffDashboard, AdminDashboard, FaceSetup
├── server/             Express API (own package.json)
│   ├── routes/         auth, attendance, admin, face
│   ├── middleware/     auth, faceGate
│   ├── scripts/        create-admin.js
│   └── schema.sql      All tables (run this one)
├── face-service/       Python face service (own README)
├── start.ps1           Starts all three parts on Windows
└── package.json        Frontend scripts and dependencies
```

## Prerequisites

- [Node.js](https://nodejs.org) LTS
- [PostgreSQL](https://www.postgresql.org/download/) (pgAdmin optional)
- Python 3.10 or 3.11 (for the face service)
- Git
- A webcam. Browsers only allow the camera on `localhost` or HTTPS.

## Setup

### 1. Install dependencies

```bash
npm install
cd server
npm install
```

### 2. Create the database

Create an empty database (for example `secureid_db`), then run the whole of `server/schema.sql` in pgAdmin's Query Tool (or `psql -f server/schema.sql`). It is safe to run more than once.

Create the first admin and organization:

```bash
cd server
node scripts/create-admin.js "Demo Training Centre" "Your Name" you@example.com "a-long-password"
```

Log in as that admin and add staff from the **Staff** tab.

### 3. Configure environment variables

Copy `server/.env.example` to `server/.env` and fill it in:

```env
PORT=5000
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/secureid_db
JWT_SECRET=use-a-long-random-string
CLIENT_ORIGIN=http://localhost:5173
FACE_SERVICE_URL=http://127.0.0.1:8001
FACE_SERVICE_KEY=same-key-as-face-service
FACE_REQUIRED=true
```

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

`.env` files are git-ignored. Never commit them.

### 4. Set up the face service

Follow `face-service/README.md`. On Windows, install with `--only-binary=:all:` to avoid building packages from source:

```powershell
cd face-service
py -3.11 -m venv venv
venv\Scripts\python.exe -m pip install --upgrade pip
venv\Scripts\python.exe -m pip install --only-binary=:all: -r requirements.txt
copy .env.example .env
```

Put the same `FACE_SERVICE_KEY` in `face-service/.env` and `server/.env`. To turn on the photo/screen spoof check, set `FACE_ANTI_SPOOF=true` in `face-service/.env`.

### 5. Run

Easiest on Windows, from the project root:

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

Or in three terminals:

```bash
# 1. face service (wait for "Ready.")
cd face-service
venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8001

# 2. backend
cd server
node server.js

# 3. frontend
npm run dev
```

Open http://localhost:5173. For development without the face service, set `FACE_REQUIRED=false` in `server/.env`.

## API

All routes except login need `Authorization: Bearer <token>`. Organization and role always come from the signed token, never from the request body.

| Method | Route | Who | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | public | Email + password, returns JWT |
| GET | `/api/auth/me` | any | Current user and organization |
| POST | `/api/auth/logout` | any | Audit-logs the logout |
| GET | `/api/face/status` | any | Consent, enrollment and attempts left |
| POST | `/api/face/consent` | any | Record biometric consent |
| POST | `/api/face/enroll` | any | Body `{ images: [base64 x1-5] }` |
| POST | `/api/face/verify` | any | Body `{ image: base64 }` → `{ match, attemptsLeft }` |
| DELETE | `/api/face/me` | any | Delete own face data and consent |
| GET | `/api/attendance/today` | any | Today's record |
| POST | `/api/attendance/check-in` | any | Needs a face check in the last 2 min |
| POST | `/api/attendance/check-out` | any | Needs a face check in the last 2 min |
| GET | `/api/attendance/history` | any | Last 30 records |
| GET | `/api/admin/summary` | admin | Seats, enrolled, checked in today |
| GET | `/api/admin/attendance?date=` | admin | Attendance for a day |
| GET / POST | `/api/admin/staff` | admin | List / add staff |
| PATCH | `/api/admin/staff/:id/status` | admin | Activate / deactivate |
| POST | `/api/admin/staff/:id/face-reset` | admin | Delete a user's face data |
| POST | `/api/admin/staff/:id/unlock` | admin | Clear the face lock |
| POST | `/api/admin/staff/:id/password` | admin | Set a new temporary password |

## Scripts (frontend)

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npm run lint` | Run Oxlint |

## Privacy and security notes

- Biometric data is collected only for identity verification, with explicit, versioned consent (PDPA 2010, Malaysia).
- Only face embeddings (lists of numbers) are stored. Photos are processed in memory and discarded.
- Staff can delete their own face data; admins can reset anyone's in their organization.
- Passwords are stored as bcrypt hashes only.
- The face service is bound to `127.0.0.1` and protected by a shared secret.
- Replacing an existing enrollment requires passing a face check first.
- Secrets live in `.env` files and are never committed. Test selfies and debug crops are git-ignored.
- Known limits: the anti-spoof check is passive only (no blink/head-turn challenge), and existing JWTs stay valid for up to 2 h after a password reset or deactivation.

## Roadmap

1. Active liveness challenge (blink / head turn)
2. Show face-check history in the admin console
3. Email-based password reset
4. Future: e-voting, additional biometrics, subscription plans
