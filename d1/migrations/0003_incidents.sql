-- Sub-project 3b: incidents (NOC), incident updates, work orders (Annex H).
-- See docs/superpowers/specs/2026-10-12-d1-incidents-design.md
-- All SQL for these tables lives in worker/data/store.js.

CREATE TABLE incidents (
  id                          TEXT PRIMARY KEY,
  year                        INTEGER NOT NULL,
  seq                         INTEGER NOT NULL,
  incident_ref                TEXT NOT NULL UNIQUE,
  noc_no                      TEXT NOT NULL,

  submission_id               TEXT REFERENCES checklist_submissions(id),
  source_template_code        TEXT,
  source_section              TEXT,
  source_item_code            TEXT,
  source_item_description     TEXT,
  source_inspection_type      TEXT,
  source_inspection_date      TEXT,
  inspector_name              TEXT,

  title                       TEXT NOT NULL,
  description                 TEXT NOT NULL,
  deficiency_level            INTEGER NOT NULL CHECK (deficiency_level BETWEEN 1 AND 4),
  category                    TEXT,
  incident_type               TEXT,
  potential_impact            TEXT,
  immediate_action_taken      TEXT,

  location_label              TEXT NOT NULL,
  location_id                 TEXT,
  latitude                    REAL,
  longitude                   REAL,
  location_accuracy_m         REAL,
  location_captured_at        TEXT,
  location_capture_method     TEXT CHECK (location_capture_method IS NULL OR location_capture_method IN ('gps','map_pin','manual')),
  location_user_adjusted      INTEGER NOT NULL DEFAULT 0 CHECK (location_user_adjusted IN (0,1)),

  status                      TEXT NOT NULL DEFAULT 'open'
                              CHECK (status IN ('open','assigned','in_progress','resolved','closed')),
  reported_by                 TEXT NOT NULL REFERENCES users(id),
  reported_by_name            TEXT,
  reported_at                 TEXT NOT NULL,
  department                  TEXT,
  assigned_to                 TEXT REFERENCES users(id),
  assigned_team               TEXT,
  assigned_at                 TEXT,
  target_date                 TEXT,
  resolved_at                 TEXT,
  closed_at                   TEXT,
  closure_notes               TEXT,
  reinspection_submission_id  TEXT REFERENCES checklist_submissions(id),
  verification_json           TEXT,
  created_at                  TEXT NOT NULL,
  updated_at                  TEXT NOT NULL,
  UNIQUE (year, seq)
);
CREATE INDEX incidents_status ON incidents(status, reported_at);
CREATE INDEX incidents_source ON incidents(submission_id, source_item_code);
CREATE INDEX incidents_reporter ON incidents(reported_by);

CREATE TABLE incident_updates (
  id           TEXT PRIMARY KEY,
  incident_id  TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  author_id    TEXT NOT NULL REFERENCES users(id),
  author_name  TEXT,
  body         TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  status_from  TEXT,
  status_to    TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX incident_updates_incident ON incident_updates(incident_id, created_at);

CREATE TABLE work_orders (
  id                              TEXT PRIMARY KEY,
  incident_id                     TEXT NOT NULL REFERENCES incidents(id),
  year                            INTEGER NOT NULL,
  seq                             INTEGER NOT NULL,
  work_order_number               TEXT NOT NULL UNIQUE,
  date_issued                     TEXT NOT NULL,
  issued_by                       TEXT REFERENCES users(id),
  issued_by_name                  TEXT NOT NULL,
  assigned_to_name                TEXT NOT NULL,
  assigned_to_user                TEXT REFERENCES users(id),
  noc_reference_no                TEXT NOT NULL,
  deficiency_level                INTEGER NOT NULL CHECK (deficiency_level BETWEEN 1 AND 4),
  description_of_work             TEXT NOT NULL,
  location_text                   TEXT,
  target_completion_date          TEXT,
  notam_required                  INTEGER CHECK (notam_required IS NULL OR notam_required IN (0,1)),
  notam_ref                       TEXT,
  cec_clearance_required          INTEGER NOT NULL DEFAULT 0 CHECK (cec_clearance_required IN (0,1)),
  date_works_completed            TEXT,
  completed_by                    TEXT,
  description_of_work_performed   TEXT,
  materials_used                  TEXT,
  test_verification_results       TEXT,
  area_cleared_for_operations     INTEGER CHECK (area_cleared_for_operations IS NULL OR area_cleared_for_operations IN (0,1)),
  area_not_cleared_explanation    TEXT,
  cec_clearance_issued            INTEGER CHECK (cec_clearance_issued IS NULL OR cec_clearance_issued IN (0,1)),
  cec_clearance_date              TEXT,
  status                          TEXT NOT NULL DEFAULT 'issued'
                                  CHECK (status IN ('issued','in_progress','completed','verified')),
  locked                          INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0,1)),
  created_at                      TEXT NOT NULL,
  updated_at                      TEXT NOT NULL,
  UNIQUE (year, seq)
);
CREATE INDEX work_orders_incident ON work_orders(incident_id, date_issued);

CREATE TABLE work_order_signoffs (
  work_order_id       TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  role                TEXT NOT NULL CHECK (role IN ('om_coo_verification','cec_clearance')),
  name                TEXT NOT NULL,
  signature_data_uri  TEXT CHECK (signature_data_uri IS NULL OR length(signature_data_uri) <= 200000),
  signed_at           TEXT NOT NULL,
  signed_by           TEXT NOT NULL REFERENCES users(id),
  PRIMARY KEY (work_order_id, role)
);

-- Number counters: a number is never handed out twice, even after the
-- incident or work order holding it is deleted with its draft checklist.
CREATE TABLE number_counters (
  kind  TEXT NOT NULL CHECK (kind IN ('incident','work_order')),
  year  INTEGER NOT NULL,
  last  INTEGER NOT NULL,
  PRIMARY KEY (kind, year)
);

-- ── Triggers ────────────────────────────────────────────────────────────────

-- A closed incident is final (Supabase allowed updates only while not closed).
CREATE TRIGGER incidents_frozen_when_closed BEFORE UPDATE ON incidents
WHEN OLD.status = 'closed'
BEGIN SELECT RAISE(ABORT, 'A closed incident cannot be changed'); END;

CREATE TRIGGER incidents_no_delete_closed BEFORE DELETE ON incidents
WHEN OLD.status = 'closed'
BEGIN SELECT RAISE(ABORT, 'A closed incident cannot be deleted'); END;

-- Numbers never change once allocated.
CREATE TRIGGER incidents_numbers_fixed BEFORE UPDATE ON incidents
WHEN NEW.year IS NOT OLD.year OR NEW.seq IS NOT OLD.seq OR NEW.incident_ref IS NOT OLD.incident_ref
  OR NEW.noc_no IS NOT OLD.noc_no OR NEW.reported_by IS NOT OLD.reported_by
BEGIN SELECT RAISE(ABORT, 'Incident numbers and reporter cannot change'); END;

-- The updates trail is append-only. Rows go only when their incident does
-- (cascade runs after the parent row is gone).
CREATE TRIGGER incident_updates_no_update BEFORE UPDATE ON incident_updates
BEGIN SELECT RAISE(ABORT, 'Incident updates cannot be edited'); END;

CREATE TRIGGER incident_updates_no_delete BEFORE DELETE ON incident_updates
WHEN (SELECT 1 FROM incidents WHERE id = OLD.incident_id) IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'Incident updates cannot be deleted'); END;

-- A verified (locked) work order is final, sign-offs included.
CREATE TRIGGER work_orders_frozen_when_locked BEFORE UPDATE ON work_orders
WHEN OLD.locked = 1
BEGIN SELECT RAISE(ABORT, 'Locked work orders cannot be overwritten'); END;

CREATE TRIGGER work_orders_no_delete_locked BEFORE DELETE ON work_orders
WHEN OLD.locked = 1
BEGIN SELECT RAISE(ABORT, 'Locked work orders cannot be deleted'); END;

CREATE TRIGGER work_orders_number_fixed BEFORE UPDATE ON work_orders
WHEN NEW.work_order_number IS NOT OLD.work_order_number OR NEW.year IS NOT OLD.year OR NEW.seq IS NOT OLD.seq
  OR NEW.incident_id IS NOT OLD.incident_id
BEGIN SELECT RAISE(ABORT, 'Work order numbers cannot change'); END;

CREATE TRIGGER wo_signoffs_frozen_ins BEFORE INSERT ON work_order_signoffs
WHEN (SELECT locked FROM work_orders WHERE id = NEW.work_order_id) = 1
BEGIN SELECT RAISE(ABORT, 'Sign-offs on a locked work order cannot change'); END;

CREATE TRIGGER wo_signoffs_frozen_upd BEFORE UPDATE ON work_order_signoffs
WHEN (SELECT locked FROM work_orders WHERE id = OLD.work_order_id) = 1
BEGIN SELECT RAISE(ABORT, 'Sign-offs on a locked work order cannot change'); END;

CREATE TRIGGER wo_signoffs_frozen_del BEFORE DELETE ON work_order_signoffs
WHEN (SELECT locked FROM work_orders WHERE id = OLD.work_order_id) = 1
BEGIN SELECT RAISE(ABORT, 'Sign-offs on a locked work order cannot change'); END;
