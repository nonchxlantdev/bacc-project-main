-- 0005 — OM "Return for changes" (2026-10-14).
--
-- A submitted checklist the OM has not signed off may go back to its inspector
-- as a draft: status submitted -> draft, locked 1 -> 0, submitted_at -> NULL,
-- with every content column unchanged. Everything else 0002 froze stays frozen,
-- and a signed-off (acknowledged) record can never be unlocked. §11 holds for
-- every finished record.

DROP TRIGGER IF EXISTS submissions_frozen_when_locked;

CREATE TRIGGER submissions_frozen_when_locked BEFORE UPDATE ON checklist_submissions
WHEN OLD.locked = 1 AND (
  NEW.template_id IS NOT OLD.template_id OR NEW.template_version IS NOT OLD.template_version OR
  NEW.inspector_id IS NOT OLD.inspector_id OR NEW.location_id IS NOT OLD.location_id OR
  NEW.header_json IS NOT OLD.header_json OR NEW.form_json IS NOT OLD.form_json OR
  NEW.deficiencies_summary IS NOT OLD.deficiencies_summary OR
  NEW.inspection_type IS NOT OLD.inspection_type OR NEW.inspection_date IS NOT OLD.inspection_date OR
  NEW.supersedes_id IS NOT OLD.supersedes_id OR
  NEW.content_hash IS NOT OLD.content_hash OR NEW.created_at IS NOT OLD.created_at OR
  (NEW.items_json IS NOT OLD.items_json AND NEW.reopened_at IS OLD.reopened_at) OR
  NOT (
    -- unchanged lock, optionally submitted -> acknowledged (OM sign-off)
    (NEW.locked IS OLD.locked AND NEW.submitted_at IS OLD.submitted_at AND
     (NEW.status IS OLD.status OR (OLD.status = 'submitted' AND NEW.status = 'acknowledged')))
    OR
    -- return for changes, before sign-off only
    (OLD.status = 'submitted' AND NEW.status = 'draft' AND NEW.locked = 0 AND NEW.submitted_at IS NULL)
  )
)
BEGIN SELECT RAISE(ABORT, 'Locked checklist submissions cannot be overwritten; create a correction instead'); END;
