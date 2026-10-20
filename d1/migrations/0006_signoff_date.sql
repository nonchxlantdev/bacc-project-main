-- 0006 — Sign-off date chosen by the signer (2026-10-20).
--
-- The "Date" beside each signature on the approved forms used to be the server
-- time the block was signed. A grass-cutting log done on the 15th and signed on
-- the 20th then printed 2026-10-20 under both signatures while the form's own
-- Date read 2026-10-15. The signer now picks the date they are signing for;
-- signed_at stays as the audit timestamp and is only the fallback when no date
-- was chosen (records signed before this migration).
--
-- Adding a column does not touch the 0002/0005 freeze triggers: sign-offs on a
-- locked checklist stay frozen, except the OM acknowledgment block.

ALTER TABLE checklist_signoffs ADD COLUMN sign_date TEXT
  CHECK (sign_date IS NULL OR sign_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');
