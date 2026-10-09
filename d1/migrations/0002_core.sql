-- Sub-project 3a: D1 data move, foundation and checklists.
-- See docs/superpowers/specs/2026-10-09-d1-core-checklists-design.md
--
-- Conventions: ids are TEXT (crypto.randomUUID()), timestamps ISO-8601 UTC
-- TEXT, booleans INTEGER 0/1, JSON stored as TEXT. All SQL that touches these
-- tables lives in worker/data/store.js.

-- ── Users and profiles ──────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN location_id TEXT;
ALTER TABLE users ADD COLUMN has_ever_signed INTEGER NOT NULL DEFAULT 0 CHECK (has_ever_signed IN (0,1));

CREATE TABLE profile_signatures (
  user_id                      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stored_signature_data_uri    TEXT CHECK (stored_signature_data_uri IS NULL OR length(stored_signature_data_uri) <= 200000),
  stored_signature_updated_at  TEXT,
  hide_signature_prompt        INTEGER NOT NULL DEFAULT 0 CHECK (hide_signature_prompt IN (0,1))
);

-- ── Schedule ────────────────────────────────────────────────────────────────
-- template_id is the registry key (e.g. 'annex-d-drainage'). Column names
-- role/department match lib/instanceGeneration.js and the Supabase table the
-- config import reads from.
CREATE TABLE assignment_rules (
  id                TEXT PRIMARY KEY,
  template_id       TEXT NOT NULL,
  template_version  TEXT NOT NULL DEFAULT 'ed01',
  frequency         TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly','quarterly','semi_annual','annual','on_demand','ad_hoc')),
  role              TEXT,
  department        TEXT,
  assigned_user     TEXT REFERENCES users(id) ON DELETE SET NULL,
  location_id       TEXT,
  inspection_type   TEXT,
  active            INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE checklist_instances (
  id                   TEXT PRIMARY KEY,
  template_id          TEXT NOT NULL,
  template_version     TEXT NOT NULL DEFAULT 'ed01',
  assignment_rule_id   TEXT NOT NULL REFERENCES assignment_rules(id) ON DELETE CASCADE,
  assigned_role        TEXT,
  assigned_department  TEXT,
  assigned_user        TEXT,
  location_id          TEXT,
  period_start         TEXT NOT NULL,
  period_end           TEXT NOT NULL,
  due_at               TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','in_progress','submitted','overdue','missed')),
  submission_id        TEXT,
  completed_at         TEXT,
  created_at           TEXT NOT NULL,
  UNIQUE (assignment_rule_id, period_start)
);
CREATE INDEX checklist_instances_open ON checklist_instances(template_id, submission_id);

-- ── Checklists ──────────────────────────────────────────────────────────────
CREATE TABLE checklist_submissions (
  id                    TEXT PRIMARY KEY,
  template_id           TEXT NOT NULL,
  template_version      TEXT NOT NULL,
  inspector_id          TEXT NOT NULL REFERENCES users(id),
  location_id           TEXT,
  status                TEXT NOT NULL CHECK (status IN ('draft','submitted','acknowledged')),
  locked                INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0,1)),
  inspection_type       TEXT,
  inspection_date       TEXT,
  header_json           TEXT NOT NULL DEFAULT '{}',
  items_json            TEXT NOT NULL DEFAULT '{}',
  form_json             TEXT NOT NULL DEFAULT '{}',
  deficiencies_summary  TEXT,
  supersedes_id         TEXT REFERENCES checklist_submissions(id),
  reopened_at           TEXT,
  reopened_by           TEXT,
  content_hash          TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  submitted_at          TEXT
);
CREATE INDEX checklist_submissions_inspector ON checklist_submissions(inspector_id);
CREATE INDEX checklist_submissions_status ON checklist_submissions(status);
CREATE INDEX checklist_submissions_date ON checklist_submissions(inspection_date);

CREATE TABLE checklist_signoffs (
  submission_id       TEXT NOT NULL REFERENCES checklist_submissions(id) ON DELETE CASCADE,
  role                TEXT NOT NULL,
  name                TEXT NOT NULL,
  position            TEXT,
  signature_data_uri  TEXT CHECK (signature_data_uri IS NULL OR length(signature_data_uri) <= 200000),
  signed_at           TEXT NOT NULL,
  signed_by           TEXT NOT NULL REFERENCES users(id),
  PRIMARY KEY (submission_id, role)
);

-- id is the browser's drawing id, unique within its checklist (a correction
-- copies the original's drawings, ids and all).
CREATE TABLE checklist_drawings (
  id             TEXT NOT NULL,
  submission_id  TEXT NOT NULL REFERENCES checklist_submissions(id) ON DELETE CASCADE,
  section_key    TEXT,
  position       INTEGER NOT NULL DEFAULT 0,
  label          TEXT,
  content_type   TEXT,
  data_uri       TEXT NOT NULL CHECK (length(data_uri) <= 820000),
  added_by       TEXT REFERENCES users(id),
  added_at       TEXT NOT NULL,
  PRIMARY KEY (submission_id, id)
);

-- ── Approvals, notifications, settings, audit ───────────────────────────────
CREATE TABLE approvals (
  id             TEXT PRIMARY KEY,
  entity_type    TEXT NOT NULL CHECK (entity_type IN ('checklist_submission','work_order')),
  entity_id      TEXT NOT NULL,
  approval_role  TEXT NOT NULL,
  assigned_to    TEXT REFERENCES users(id) ON DELETE SET NULL,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  notes          TEXT,
  decided_by     TEXT REFERENCES users(id),
  decided_at     TEXT,
  signed         INTEGER NOT NULL DEFAULT 0 CHECK (signed IN (0,1)),
  created_at     TEXT NOT NULL
);
CREATE UNIQUE INDEX approvals_one_pending
  ON approvals(entity_type, entity_id, approval_role) WHERE status = 'pending';
CREATE INDEX approvals_status ON approvals(status);

-- event_type/href match the NotificationRow shape the UI renders.
CREATE TABLE notifications (
  id            TEXT PRIMARY KEY,
  recipient_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT,
  href          TEXT,
  entity_type   TEXT,
  entity_id     TEXT,
  created_at    TEXT NOT NULL,
  read_at       TEXT
);
CREATE INDEX notifications_recipient ON notifications(recipient_id, read_at);

CREATE TABLE app_settings (
  section     TEXT PRIMARY KEY,
  value_json  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT
);

CREATE TABLE settings_audit (
  id         TEXT PRIMARY KEY,
  section    TEXT NOT NULL,
  action     TEXT NOT NULL CHECK (action IN ('save','reset','import')),
  from_json  TEXT,
  to_json    TEXT,
  by         TEXT,
  by_name    TEXT,
  at         TEXT NOT NULL
);
CREATE INDEX settings_audit_at ON settings_audit(at);

CREATE TABLE audit_log (
  id           TEXT PRIMARY KEY,
  entity_type  TEXT NOT NULL,
  entity_id    TEXT NOT NULL,
  action       TEXT NOT NULL,
  actor_id     TEXT,
  detail_json  TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX audit_log_entity ON audit_log(entity_type, entity_id);

-- ── Triggers: the database-level safety net (BACC §11) ──────────────────────

-- A locked checklist can't be deleted.
CREATE TRIGGER submissions_no_delete_locked BEFORE DELETE ON checklist_submissions
WHEN OLD.locked = 1
BEGIN SELECT RAISE(ABORT, 'Locked checklist submissions cannot be deleted'); END;

-- A locked checklist's content is frozen. Only these may change:
-- items_json together with a new reopened_at (approver correction), status
-- submitted -> acknowledged, reopened_by, and updated_at.
CREATE TRIGGER submissions_frozen_when_locked BEFORE UPDATE ON checklist_submissions
WHEN OLD.locked = 1 AND (
  NEW.template_id IS NOT OLD.template_id OR NEW.template_version IS NOT OLD.template_version OR
  NEW.inspector_id IS NOT OLD.inspector_id OR NEW.location_id IS NOT OLD.location_id OR
  NEW.header_json IS NOT OLD.header_json OR NEW.form_json IS NOT OLD.form_json OR
  NEW.deficiencies_summary IS NOT OLD.deficiencies_summary OR
  NEW.inspection_type IS NOT OLD.inspection_type OR NEW.inspection_date IS NOT OLD.inspection_date OR
  NEW.supersedes_id IS NOT OLD.supersedes_id OR NEW.submitted_at IS NOT OLD.submitted_at OR
  NEW.content_hash IS NOT OLD.content_hash OR NEW.created_at IS NOT OLD.created_at OR
  NEW.locked IS NOT OLD.locked OR
  (NEW.status IS NOT OLD.status AND NOT (OLD.status = 'submitted' AND NEW.status = 'acknowledged')) OR
  (NEW.items_json IS NOT OLD.items_json AND NEW.reopened_at IS OLD.reopened_at)
)
BEGIN SELECT RAISE(ABORT, 'Locked checklist submissions cannot be overwritten; create a correction instead'); END;

-- Sign-offs on a locked checklist are frozen, except the OM acknowledgment block.
CREATE TRIGGER signoffs_frozen_when_locked_ins BEFORE INSERT ON checklist_signoffs
WHEN NEW.role <> 'om_acknowledgment'
 AND (SELECT locked FROM checklist_submissions WHERE id = NEW.submission_id) = 1
BEGIN SELECT RAISE(ABORT, 'Sign-offs on a locked checklist cannot change'); END;

CREATE TRIGGER signoffs_frozen_when_locked_upd BEFORE UPDATE ON checklist_signoffs
WHEN (OLD.role <> 'om_acknowledgment' OR NEW.role <> 'om_acknowledgment')
 AND (SELECT locked FROM checklist_submissions WHERE id = OLD.submission_id) = 1
BEGIN SELECT RAISE(ABORT, 'Sign-offs on a locked checklist cannot change'); END;

CREATE TRIGGER signoffs_frozen_when_locked_del BEFORE DELETE ON checklist_signoffs
WHEN OLD.role <> 'om_acknowledgment'
 AND (SELECT locked FROM checklist_submissions WHERE id = OLD.submission_id) = 1
BEGIN SELECT RAISE(ABORT, 'Sign-offs on a locked checklist cannot change'); END;

-- Drawings on a locked checklist are frozen.
CREATE TRIGGER drawings_frozen_when_locked_ins BEFORE INSERT ON checklist_drawings
WHEN (SELECT locked FROM checklist_submissions WHERE id = NEW.submission_id) = 1
BEGIN SELECT RAISE(ABORT, 'Drawings on a locked checklist cannot change'); END;

CREATE TRIGGER drawings_frozen_when_locked_upd BEFORE UPDATE ON checklist_drawings
WHEN (SELECT locked FROM checklist_submissions WHERE id = OLD.submission_id) = 1
BEGIN SELECT RAISE(ABORT, 'Drawings on a locked checklist cannot change'); END;

CREATE TRIGGER drawings_frozen_when_locked_del BEFORE DELETE ON checklist_drawings
WHEN (SELECT locked FROM checklist_submissions WHERE id = OLD.submission_id) = 1
BEGIN SELECT RAISE(ABORT, 'Drawings on a locked checklist cannot change'); END;
