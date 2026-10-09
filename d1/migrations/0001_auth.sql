-- Sub-project 2: Cloudflare login. See docs/superpowers/specs/2026-10-08-cloudflare-auth-design.md
CREATE TABLE users (
  id                    TEXT PRIMARY KEY,
  email                 TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash         TEXT NOT NULL,
  full_name             TEXT NOT NULL,
  position              TEXT NOT NULL DEFAULT '',
  role                  TEXT NOT NULL DEFAULT 'inspector'
                        CHECK (role IN ('inspector','om','coo','duty_manager','apron_supervisor','electrical_tech','sms','admin')),
  department            TEXT CHECK (department IS NULL OR department IN ('Operations','Engineering','Maintenance')),
  is_active             INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  can_login             INTEGER NOT NULL DEFAULT 1 CHECK (can_login IN (0,1)),
  is_approver           INTEGER NOT NULL DEFAULT 0 CHECK (is_approver IN (0,1)),
  must_change_password  INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0,1)),
  failed_login_count    INTEGER NOT NULL DEFAULT 0,
  locked_until          TEXT,
  last_login_at         TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL,
  ip            TEXT,
  user_agent    TEXT
);
CREATE INDEX sessions_user_id ON sessions(user_id);
CREATE INDEX sessions_expires_at ON sessions(expires_at);
