# SecureID – Biometric Identity SaaS

A cloud-based, multi-tenant identity management platform for small education and training centres. Each organization keeps one trusted staff identity (password + face verification) that can be reused across internal services. The FYP1 module is **Staff Attendance**.

> FYP1 prototype – Quest International University (QIU), Bachelor of Computer Science (Software Engineering).

## Features

| Feature | Status |
|---|---|
| Email + password login (bcrypt, JWT, 2 h expiry) | Done |
| Multi-tenant lookup (user joined to organization) | Done |
| Account status check (only `ACTIVE` users can log in) | Done |
| PDPA biometric consent page | UI |
| Face verification (liveness, max 3 attempts) | UI mock – matching service planned |
| Role-based routing (Admin / Staff) | In progress |
| Attendance check-in / check-out saved to database | Planned |
| E-voting, fingerprint/voice, billing | Future scope |

## Tech stack

- **Frontend:** React 19, Vite
- **Backend:** Node.js, Express 5
- **Database:** PostgreSQL (`pg`)
- **Auth:** `bcryptjs`, `jsonwebtoken`
- **Planned:** Python service for face matching

## Project structure

```
.
├── src/            React frontend
├── public/         Static assets
├── server/         Express API (own package.json)
├── index.html
├── vite.config.js
└── package.json    Frontend scripts and dependencies
```

## Prerequisites

- [Node.js](https://nodejs.org) LTS
- [PostgreSQL](https://www.postgresql.org/download/) (pgAdmin optional)
- Git

## Setup

### 1. Install dependencies

```bash
npm install
cd server
npm install
```

### 2. Create the database

Create an empty database (for example `secureid_db`) in pgAdmin or `psql`, then run:

```sql
CREATE TABLE organizations (
  organization_id   SERIAL PRIMARY KEY,
  organization_name TEXT NOT NULL
);

CREATE TABLE users (
  user_id         SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(organization_id),
  full_name       TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL,
  account_status  TEXT NOT NULL DEFAULT 'ACTIVE'
);
```

This is the minimum the login endpoint needs. Add your own seed users with a bcrypt hash in `password_hash` (never a plain-text password).

### 3. Configure environment variables

Create `server/.env`:

```env
PORT=5000
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/secureid_db
JWT_SECRET=use-a-long-random-string
```

`.env` is git-ignored. Never commit it.

### 4. Run

Terminal 1 – backend:

```bash
cd server
node server.js
```

You should see `PostgreSQL connected successfully!` and `Backend running at http://localhost:5000`.

Terminal 2 – frontend:

```bash
npm run dev
```

Open http://localhost:5173.

## API

### `POST /api/auth/login`

Request:

```json
{ "email": "user@example.com", "password": "your-password" }
```

Success (`200`) returns `{ success, message, token, user }`. The token carries `userId`, `organizationId` and `role`.

| Status | Meaning |
|---|---|
| 400 | Email or password missing |
| 401 | Invalid email or password |
| 403 | Account is not active |
| 500 | Server error |

## Scripts (frontend)

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npm run lint` | Run Oxlint |

## Privacy and security notes

- Biometric data is collected only for identity verification, with explicit consent (PDPA 2010, Malaysia).
- Passwords are stored as bcrypt hashes only.
- The organization and role used for authorization come from the signed JWT, never from the request body.
- Secrets live in `server/.env` and are never committed.

## Roadmap

1. Auth middleware and role-guarded routes
2. Attendance table and check-in / check-out endpoints
3. Face verification service (enrollment, matching, 3-attempt limit)
4. Admin console: staff management and enrollment status
5. Future: e-voting, additional biometrics, subscription plans
