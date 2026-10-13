# D1 Data Move, Part 3c: Cutover — Design

**Date:** 2026-10-12  
**Status:** Approved for build (2026-10-12).  
**Builds on:** 3a (`0002_core.sql`, data API) and 3b (`0003_incidents.sql`), both on `main`.

## Context

Production still serves Supabase login and Supabase repositories
(`VITE_DATA_SOURCE=supabase` in the deploy job). D1 login and the D1 data API
are live but unused by the built SPA. 3c is the switch: import configuration,
create staff accounts by hand, flip the build to `d1`, then (separately)
remove Supabase.

### What is copied vs what starts fresh

`npm run d1:import-config` copies **configuration only**: schedule rules
(`checklist_assignment_rules` → `assignment_rules`) and Settings
(`audit_log` / app_settings → `app_settings`). The script states this
explicitly.

**Existing Supabase checklists, incidents, work orders, photos and history
are not copied.** The pilot starts with an empty operational history on D1.
Staff reopen work from day one on D1; old Supabase records remain readable
only while production is still on Supabase (or after a rollback to Supabase).

## Goals

1. Rehearse and document config import (`npm run d1:import-config`).
2. Give Glen a checklist for creating BACC staff on D1 (no accounts created
   in this sub-project until he says it is D1 day).
3. Turn production onto D1 with a documented rollback (see §3).
4. Remove Supabase **after** D1 is confirmed, as a later commit set so the
   flip can be undone alone.
5. Keep profile photos off for the pilot; note avatars as a later add-on.
6. Fix `npm run verify:walkthrough` (stale `input[type="email"]` selector).

## Non-goals

- Creating BACC staff accounts in code or in production (until D1 day).
- Migrating historical checklists / incidents / photos.
- Turning work-order screens on (`WORK_ORDERS_ENABLED` stays `false`).
- Turning checklist / incident photo uploads on.
- Profile avatars for the pilot (later add-on).
- Security review and the BACC pilot (sub-project 4).

## Decisions

| Topic | Choice |
|---|---|
| Historical records | **Not copied.** Pilot starts fresh on D1. Config (schedules + settings) only. |
| Staff accounts | Admin creates each person in Settings → Users & roles. Forced password change on first sign-in (already built). Checklist only — **no accounts until Glen says D1 day**. |
| Config import | Existing `npm run d1:import-config` (local rehearsal; `--remote` is Glen only). |
| Cutover-day order | (1) remote config import → (2) create admin + staff on D1 → (3) switch production to D1 → (4) live check. |
| Production flip | Deploy job sets `VITE_DATA_SOURCE=d1`. |
| Rollback | Flip deploy env back to `supabase` and redeploy. **Clean only until staff start filing on D1** — see §3. |
| Supabase removal | Separate later commits after D1 is confirmed live. |
| Avatars | **Off for the pilot** (initials only). Later add-on after the pilot. |
| Walkthrough verify | Update Playwright to the current login form. |

## 1. Config import

Script: `scripts/d1-import-config.mjs` (already on `main`).

- Reads Supabase: `checklist_templates`, `checklist_assignment_rules`,
  `audit_log` for `app_settings`.
- Writes D1: `assignment_rules` (upsert by id), `app_settings` +
  `settings_audit` (upsert by section).
- Clears `assigned_user` on import (role/dept schedule only).
- Prompts for the service-role key (hidden); never writes it to disk.
- Safe to re-run.
- Does **not** copy checklists, incidents or other records.

**3c work:** confirm the Supabase REST selects still match today's tables;
run a local rehearsal; document the remote run in the walkthrough. Fix the
script only if the dry run shows a real mismatch.

## 2. Staff accounts (checklist only)

On D1 day, Glen (or the first admin) for each BACC person:

1. Settings → Users & roles → Add user (name, email, position, department,
   role, approver flag).
2. Copy the one-time temporary password; share it out of band.
3. They sign in → **Choose your password** → app loads.

Do **not** seed staff from Supabase or from a script in 3c. Demo/local-only
admins stay local.

## 3. Turn D1 on in production

Today (`.github/workflows/verify.yml`):

- verify build: `VITE_DATA_SOURCE=mock`
- deploy build: `VITE_DATA_SOURCE=supabase` (+ Supabase Vite vars)

Cutover change (one commit):

- deploy build: `VITE_DATA_SOURCE=d1`
- Supabase Vite vars can stay until the removal commits (harmless if unused)

### Cutover-day order (binding)

1. **Config import (remote)** — Glen runs
   `npm run d1:import-config -- --remote`.
2. **Accounts on D1** — create the production admin (if not already) and all
   BACC staff via Users & roles (or `auth:create-admin -- --remote` for the
   first admin only). Forced password change on first sign-in.
3. **Switch production to D1** — merge/deploy with
   `VITE_DATA_SOURCE=d1` in the deploy job.
4. **Live check** — sign in on the live site, open a checklist, confirm
   settings/schedules look right.

Do not flip the SPA to D1 before steps 1–2, or staff will hit a login with
no usable accounts / empty config.

### Rollback

Change the deploy job back to `VITE_DATA_SOURCE=supabase`, push to `main`,
wait for Actions deploy. Users return to Supabase login and Supabase data.

**Rollback is clean only until staff start using D1.** Any checklist,
incident or other record filed on D1 after the flip **will not exist in
Supabase** after a rollback. Those D1 rows remain in D1 unused; they are
not migrated back. Prefer to roll back immediately if something is wrong
before people file real work.

## 4. Remove Supabase (later commit set)

After D1 is confirmed in production, a separate series of commits removes:

- Browser Supabase client and `src/data/repositories/supabase/`
- Auth modes `supabase` and `either` (export routes become `session` only)
- `/api/create-user` and its Worker wiring
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` from `wrangler.jsonc` vars and
  GitHub deploy env
- Supabase-only scripts (seed, migrate helpers that only target Supabase)

Keep until then: D1 paths, mock repositories, and the flip commit's
rollback story.

## 5. Avatars — off for the pilot (later add-on)

Profile photos stay refused on D1 (`avatar_url` patch → 400; UI shows not
available). Top bar uses **initials only**. Checklist/incident photos stay
off for the light run regardless.

**Later add-on (not 3c):** small stored avatars (D1 blob or R2, size/type
limits, upload UI). Out of scope for cutover and the pilot.

## 6. Fix `verify:walkthrough`

`scripts/verify-walkthrough.mjs` fills `input[type="email"]`. The login form
uses `type="text"` + `inputMode="email"`. Update the selector (prefer
accessible name / `input[inputmode="email"]`) and confirm the rest of the
mock-mode walkthrough still passes. This unblocks CI on PRs that run
`verify:walkthrough`.

## Success criteria

- Local: `d1:import-config` dry-run + apply against local D1 succeeds.
- Deploy job builds with `VITE_DATA_SOURCE=d1`.
- Documented cutover-day order and rollback limits.
- Staff checklist exists; no BACC accounts created by this work.
- `npm run verify:walkthrough` passes.
- Supabase removal is planned as later commits, not mixed into the flip.
- Walkthrough file Glen can follow click-by-click.

## Out of scope reminders

- No `--remote` from the agent. No `wrangler d1 create`.
- No merge/push to `main` by the agent.
- No passwords/keys in chat, code, docs or commits.
- `data:smoke` is local only; wait 60s between smoke runs.
