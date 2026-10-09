# D1 Data Move 3a (Foundation and Checklists): Implementation Plan

> **How this plan was used:** Claude implemented it directly in a cloud workspace, on branch `feat/d1-core-checklists`. There was no Cursor hand-off this time. Each task below is one commit. The code in that commit is the reference, so this plan lists files, interfaces and the tests that gate each task rather than repeating the code.

**Goal:** Build the D1 schema, the session-authenticated `/api/data/<group>.<op>` API, and the browser `d1` repository adapter for users, schedule, checklists, checklist approvals, notifications and settings. Production must stay unchanged (`VITE_DATA_SOURCE=supabase`).

**Architecture:**
```
browser repos/d1 → fetch /api/data/<op> → worker/data/routes.js → service.js → rules.js (pure) + store.js (SQL) → D1
```
Templates come from the bundled registry. The Worker checks `template_id` against the form store's `templateKeys`.

**Tech stack:**
- Cloudflare Worker, D1 (SQLite), `node --test`
- Tests run against **real SQLite**: Node 22's `node:sqlite` behind a small D1-compatible shim, with migrations 0001+0002 applied. The triggers are therefore tested in `npm test`, not only by hand.

## Global constraints (from the spec)

- MANAGERS = `om`, `admin`; SUPERVISORS = `om`, `coo`, `admin`.
- Every `/api/data/*` route uses auth mode `session` and `csrf: true`.
- Photo data (`photo_url` / `photo_local_id` non-null) → 400 `Photo uploads are disabled`.
- Drawings: at most 6 per checklist, `data_uri` ≤ 820,000 characters each. Signatures ≤ 200,000 characters.
- Belize time for instance generation, with a 120-day backfill.
- No `Buffer`, no `node:fs` in Worker code. Never run `--remote` from automation.

## Deviations from the spec (decided while implementing)

| Spec | Implemented | Why |
|---|---|---|
| `store.js` memory twin for tests | Real SQLite via `tests/helpers/sqliteD1.js` | Exercises the real SQL and the triggers. No second implementation to drift |
| `assignment_rules.assigned_role/assigned_department` | `role`, `department` | `generatePendingInstances` and the Supabase table both use these names |
| — | `checklist_instances.completed_at` | `linkSubmissionToInstance` sets it, and on-time/late reports read it |
| `notifications.kind/link` | `event_type`, `href` | Matches the `NotificationRow` shape the UI already renders |
| `om_acknowledgment` in `persist` → 403 if changed | Always silently ignored | A correction copies the original's OM block. A 403 would make every correction fail |
| `checklist_drawings.section_key` NULL = form level | Stores the attachments key as given, plus a `position` column | The UI keys every drawing by its field key, and order must round-trip |
| — | `approvals.list` (read, any signed-in user) | Reports count pending approvals, which needs all of them, not only the inbox |
| — | `instances.rules` (read) | Spec §4 mentions it; it's listed here explicitly |
| — | Incident/work-order **reads** return empty lists in d1 mode; writes throw `Available in 3b` | The checklist page calls `incidents.list()` on load. Throwing there would break every checklist |
| — | Avatar upload in d1 mode answers `Profile photos are not available yet on the new login` | Avatars live in Supabase Storage. Moving them is 3c |

## File map

**Worker**
- `d1/migrations/0002_core.sql`: tables, indexes and triggers.
- `worker/data/rules.js`: pure guards: `isManager`, `isSupervisor`, `assert*` permission functions, `validateRecordPayload`, `splitRecord`, `foldAmendments`.
- `worker/data/store.js`: `createD1DataStore(db)`. All SQL. Batch-building helpers for submit, acknowledge and amend.
- `worker/data/service.js`: `createDataService({ store, forms, now })`. One method per op, as `(actor, args) => result`.
- `worker/data/routes.js`: `DATA_ROUTES`, built from the `OPS` table: GET reads (`?a=<json args>`) and POST writes (`{ args }`).
- `worker/index.js`: registers `DATA_ROUTES`.

**Tests**
- `tests/helpers/sqliteD1.js`: `createSqliteD1()`, a D1 shim (`prepare/bind/first/all/run`, `batch` in a transaction) with the migrations applied.
- `tests/dataRules.test.js`, `tests/dataService.test.js`, `tests/dataTriggers.test.js`, `tests/d1Adapter.test.js`.

**Browser**
- `src/data/repositories/reportAggregations.js`: moved verbatim from `supabase/index.js`.
- `src/data/repositories/d1/client.js`: `callData(op, args)`.
- `src/data/repositories/d1/index.js`: `createD1Repositories()`, registry enrichment and the drawings-changed cache.
- `src/data/repositories/index.js`: `getDataSource()` returns `'d1'`.
- `src/lib/authMode.js`: comment update.
- `src/lib/dataMode.js`: `isD1Data()`, `DRAWING_LIMIT`.
- `src/lib/drawings.js`: `compressDrawing(file)`, `countDrawings(attachments)`.
- `AuthContext.jsx`: in d1 mode, loads the profile with signature fields and implements `updateProfile`.
- `ChecklistForm.jsx`: no `PhotoUpload` in d1 mode; passes the drawing total and remaining room.
- `DrawingAttach.jsx`, `AttachmentsPanel.jsx`: compress in d1 mode, 600 KB refusal, total cap of 6.
- `ChecklistDetailPage.jsx`: in d1 mode the acknowledge block is shown to `om`/`admin`; no photo flow.
- `src/lib/submissions.js`: `upload_photo` queue jobs are dropped in d1 mode.

**Scripts**
- `scripts/d1-trigger-check.mjs`: trigger checks against local D1 through `wrangler d1 execute --local`.
- `scripts/data-smoke.mjs` (`npm run data:smoke`): end to end against `npm run dev`.
- `scripts/d1-import-config.mjs` (`npm run d1:import-config`): written now, run at 3c.

## Tasks

### Task 1: Migration and SQLite test harness
- Files: `d1/migrations/0002_core.sql`, `tests/helpers/sqliteD1.js`, `tests/dataTriggers.test.js`.
- Tests, all of which must abort:
  - updating a locked row's `header_json`
  - deleting a locked row
  - inserting a non-OM sign-off on a locked row
  - updating a locked sign-off
  - changing items without changing `reopened_at`
  - adding or deleting a drawing on a locked row
- Tests that must succeed:
  - the submit batch order (content → children → lock)
  - changing items together with `reopened_at`
  - `submitted` → `acknowledged`
  - upserting the OM sign-off on a locked row
- Commit: `feat(d1): core schema 0002 with locked-record triggers`

### Task 2: Pure rules
- Files: `worker/data/rules.js`, `tests/dataRules.test.js`.
- Interfaces:
  - `MANAGERS`, `SUPERVISORS`
  - `assertCanEditDraft(actor, row)`, `assertCanSubmit(actor, row)`, `assertCanDeleteDraft(actor, row)`
  - `assertCanAmend(actor)`, `assertCanAcknowledge(actor)`
  - `assertCanDecide(actor, approval, decision)`, `assertCanSeeApproval(actor, approval)`
  - `assertCanGenerate(actor)`, `assertCanWriteSettings(actor)`, `assertSelf(actor, id)`
  - `validateRecordPayload(record)` returns `{ header, items, signoffs, attachments, form }`
  - `validateProfilePatch(patch)`, `foldAmendments(rows)`
- Tests: every row of the spec's rule tables, including "COO can amend and reject but can't acknowledge by either route".
- Commit: `feat(d1): pure permission and validation rules for the data API`

### Task 3: Store and service
- Files: `worker/data/store.js`, `worker/data/service.js`, `tests/dataService.test.js`.
- Tests:
  - draft → submit → acknowledge, with approval, instance link and both notifications
  - a correction gets a new id and leaves the original untouched
  - amend writes one audit row, changes one item, and fold/undo works
  - `signed_by` is always the session user
  - the 7th drawing, an oversize drawing and an oversize signature are rejected
  - photo data → 400
  - `generate` twice creates no duplicates
  - settings save, reset and audit
  - notifications are scoped to their recipient
  - users: own signature is visible, other users' signatures only to supervisors, update is self-only
- Commit: `feat(d1): data service and D1 store for users, schedule, checklists, approvals, notifications, settings`

### Task 4: Routes
- Files: `worker/data/routes.js`, `worker/index.js`, `tests/dataRoutes.test.js` (through `createApiHandler` with a stub authenticator).
- Tests:
  - unknown op → 404
  - GET on a write op → 405
  - a cross-origin POST → 403
  - args round-trip through `?a=`
  - `HttpError` statuses pass through
- Commit: `feat(d1): /api/data/<group>.<op> routes`

### Task 5: Browser adapter
- Files:
  - `reportAggregations.js` (moved)
  - `d1/client.js`, `d1/index.js`
  - `repositories/index.js`, `authMode.js`, `dataMode.js`
  - `tests/d1Adapter.test.js` (fetch stubbed): enrichment, `drawings_changed` only when the attachments differ, incidents reads empty and writes throw
- Commit: `feat(d1): browser repository adapter over /api/data`

### Task 6: UI wiring
- Files: `AuthContext.jsx`, `ChecklistForm.jsx`, `DrawingAttach.jsx`, `AttachmentsPanel.jsx`, `ChecklistDetailPage.jsx`, `submissions.js`, `drawings.js`.
- Gate: `npm run build` in mock and d1 modes, then a browser click-through in d1 mode.
- Commit: `feat(d1): d1-mode UI (profile, photo controls hidden, compressed and capped drawings)`

### Task 7: Scripts and docs
- Files:
  - `scripts/d1-trigger-check.mjs`, `scripts/data-smoke.mjs`, `scripts/d1-import-config.mjs`
  - `package.json` scripts
  - `CLAUDE.md` section
- Gate: `npm run data:smoke` passes against local `npm run dev`.
- Commit: `feat(d1): trigger check, data smoke and config import scripts`

### Task 8: Full regression
- `npm test`, every `verify:*` check, 6-case PDF parity at 100% (before vs after), `npm run auth:smoke` locally, and `npm run build` with `VITE_DATA_SOURCE=supabase`.
