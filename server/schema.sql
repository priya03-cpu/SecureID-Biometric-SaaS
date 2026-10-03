-- Biometric SaaS: database schema (PostgreSQL)
-- Safe to run more than once: uses IF NOT EXISTS everywhere.

CREATE TABLE IF NOT EXISTS organizations (
  organization_id   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_name VARCHAR(150) NOT NULL,
  plan              VARCHAR(20)  NOT NULL DEFAULT 'FREE',   -- FREE / PREMIUM
  max_seats         INT          NOT NULL DEFAULT 10,       -- freemium seat limit
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  user_id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
  full_name       VARCHAR(150) NOT NULL,
  email           VARCHAR(255) NOT NULL,
  password_hash   TEXT         NOT NULL,
  role            VARCHAR(20)  NOT NULL DEFAULT 'STAFF',    -- ADMIN / STAFF
  account_status  VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',   -- ACTIVE / INACTIVE
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Added in the revised design pack
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS face_verification_status VARCHAR(50) DEFAULT 'Unverified';

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS users_org_idx ON users (organization_id);

-- One row per user per day
CREATE TABLE IF NOT EXISTS attendance_records (
  attendance_id   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
  user_id         INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  check_in_time   TIMESTAMPTZ,
  check_out_time  TIMESTAMPTZ,
  status          VARCHAR(20) NOT NULL DEFAULT 'PRESENT',   -- PRESENT / LATE
  UNIQUE (user_id, attendance_date)
);
CREATE INDEX IF NOT EXISTS attendance_org_date_idx ON attendance_records (organization_id, attendance_date);

-- Stores the face embedding (numbers), never the photo
CREATE TABLE IF NOT EXISTS biometric_profiles (
  profile_id      INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
  user_id         INT NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
  face_embedding  JSONB NOT NULL,
  model_name      VARCHAR(50),
  enrolled_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PDPA / biometric notice acknowledgement
CREATE TABLE IF NOT EXISTS consent_records (
  consent_id     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  notice_version VARCHAR(20) NOT NULL,
  consented_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Failed/successful face checks (used for the 3-attempt limit)
CREATE TABLE IF NOT EXISTS verification_attempts (
  attempt_id    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  success       BOOLEAN NOT NULL,
  match_score   NUMERIC(6,4),
  attempted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  log_id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id INT REFERENCES organizations(organization_id) ON DELETE SET NULL,
  user_id         INT REFERENCES users(user_id) ON DELETE SET NULL,
  action          VARCHAR(80) NOT NULL,
  details         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_org_time_idx ON audit_logs (organization_id, created_at DESC);
