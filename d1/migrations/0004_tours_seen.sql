-- Guided tours: which tours (and which version of each) this account has
-- already seen, as a JSON object { "<tour id>": <version> }. Self-service via
-- users.update; returned only to the account itself.
-- See docs/superpowers/specs/2026-10-13-in-app-walkthrough-design.md
ALTER TABLE users ADD COLUMN tours_seen TEXT NOT NULL DEFAULT '{}';
