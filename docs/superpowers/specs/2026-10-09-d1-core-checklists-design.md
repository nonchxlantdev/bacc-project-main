# D1 Data Move, Part 3a: Foundation and Checklists — Design

**Date:** 2026-10-09
**Status:** Approved in brainstorming. Written spec awaiting review.
**Repo:** `bacc-project-main`
**Builds on:**
- `2026-10-08-cloudflare-workers-hosting-design.md` (sub-project 1, live)
- `2026-10-08-cloudflare-auth-design.md` (sub-project 2: D1 login, live but switched off)

## Context

Sub-project 3 moves the portal's data from Supabase to Cloudflare D1. It's split into three parts, each shipped and tested on its own:

- **3a, this spec:** the D1 schema, the browser↔Worker data plumbing, and the core inspection workflow:
  - users and profiles, including stored signatures
  - schedule rules and due inspections
  - checklists (draft, submit, sign-off, lock, acknowledge, correct)
  - the checklist part of approvals
  - notifications
  - settings
- **3b:** incidents (NOC), work orders, the work-order part of approvals, NOC and WO numbering, and the incident audit trail. Reports start working end to end at this point, because they're computed in the browser from the lists.
- **3c:** the cutover. Photos and attachments are locked down everywhere, the config is imported from Supabase, production switches to `VITE_DATA_SOURCE=d1` with the D1 login, and the Supabase code paths are removed.

**Production stays on Supabase through 3a and 3b.** All 3a work is exercised locally with `VITE_DATA_SOURCE=d1` against local D1. The code merges to `main` without changing anything for users.

### Findings that shaped this design

1. **The Supabase adapter silently drops data.**
   - `checklists.persist` stores only `inspection_type`, `inspection_date` and `rainfall_mm` from the header. The rest of `header`, the Annex K drawings (`record.attachments`) and any other form state never reach the database. Only the mock adapter keeps the full record.
   - The D1 design stores the complete record, so this gap closes.
2. **Approvals are coupled to checklists.**
   - Submitting creates an `om_acknowledgment` approval.
   - Approving it acknowledges the checklist, signs it and locks it.
   - So approvals, limited to the checklist entity type, are part of 3a.

## Decisions

| Decision | Choice |
|---|---|
| Data access pattern | **One Worker endpoint per repository operation.** Each operation authenticates, runs a pure permission check, and then reads or writes D1 through a single store module |
| Templates and forms | **Static, from the bundled registry** (`src/data/templates/registry.js`), exactly as mock mode does. Only schedule rules live in D1 |
| Template identity | `template_id` = the registry entry's `key` (e.g. `annex-d-drainage`) |
| Existing records | Fresh start. D1 begins empty (decided in sub-project 2) |
| Configuration | **Copied once from Supabase** (schedule rules + saved Settings) by an import script run at 3c cutover |
| Annex K drawings | Kept. Compressed on attach, **max 6 per checklist, at most ~600 KB each** |
| Photos in d1 mode | Controls hidden. The Worker rejects photo data. Full lockdown happens in 3c |
| Offline | The existing offline queue keeps working. In d1 mode its handlers call the Worker |

## 1. Architecture

```
browser page ──► useRepos / lib/*  ──► src/data/repositories/d1/  ──fetch──►  /api/data/<group>.<op>
                                         (thin; enriches records                │
                                          with template schema from             ▼
                                          the bundled registry)        worker/data/handlers.js
                                                                        ├─ authenticate (sub-project 2 session)
                                                                        ├─ rules.js   (pure, unit-tested)
                                                                        └─ store.js   (all SQL; memory twin for tests)
                                                                                 │
                                                                                 ▼
                                                                         D1 bacc-portal-db
```

- **`getDataSource()`** returns `'d1'` when `VITE_DATA_SOURCE=d1`.
- **`getRepos()`** builds the d1 adapter in that case.
- **Groups not built in 3a** (`incidents`, `workOrders`, and the non-checklist parts of `approvals`) keep throwing a clear "available in 3b" error in d1 mode. Pages that need them show their usual error state.
- **Reports** use the existing browser-side aggregation code over the adapter's lists.
- **Reused unchanged:**
  - `lib/instanceGeneration.js`
  - `lib/belizeTime.js`
  - `lib/signoffFields.js`
  - `lib/storedSignature.js`
  - `lib/incidentLifecycle.js`
  - `data/templates/templateMeta.js`

  The Worker imports the pure ones where server logic needs them (instance generation, airport dates).

**Endpoint shape.** One route prefix, `/api/data/`. The operation name is in the path: `GET /api/data/checklists.listAll`, `POST /api/data/checklists.persist` with a JSON body of `{ args }`. All routes use auth mode `session` (D1 cookie required) and `csrf: true` for POST, through the existing `worker/http.js`.

## 2. Schema: migration `d1/migrations/0002_core.sql`

All ids are TEXT (`crypto.randomUUID()`), timestamps are ISO-8601 UTC TEXT, booleans are INTEGER 0/1, and JSON is TEXT.

### Users and profiles

- **`users`** (extended from `0001`):
  - `ALTER TABLE users ADD COLUMN location_id TEXT;`
  - `ALTER TABLE users ADD COLUMN has_ever_signed INTEGER NOT NULL DEFAULT 0;`
- **`profile_signatures`**:
  - `user_id` TEXT PK → `users(id)`
  - `stored_signature_data_uri` TEXT
  - `stored_signature_updated_at` TEXT
  - `hide_signature_prompt` INTEGER NOT NULL DEFAULT 0

  The Worker rejects a data URI over **200,000 characters**.

### Schedule

- **`assignment_rules`**:
  - `id` PK, `template_id` NOT NULL, `template_version` NOT NULL DEFAULT `'ed01'`
  - `frequency` NOT NULL (the same values `instanceGeneration.js` accepts)
  - `assigned_role`, `assigned_department`, `assigned_user`, `location_id`
  - `active` INTEGER NOT NULL DEFAULT 1
  - `created_at`, `updated_at`
- **`checklist_instances`**:
  - `id` PK, `template_id`, `template_version`, `assignment_rule_id`
  - `assigned_role`, `assigned_department`, `assigned_user`, `location_id`
  - `period_start`, `period_end`, `due_at`
  - `status` NOT NULL DEFAULT `'pending'`, `submission_id`, `created_at`
  - **`UNIQUE(assignment_rule_id, period_start)`**

### Checklists

- **`checklist_submissions`**:

  | Column | Type / constraint |
  |---|---|
  | `id` | PK |
  | `template_id`, `template_version` | NOT NULL |
  | `inspector_id` | NOT NULL → `users(id)` |
  | `location_id` | |
  | `status` | NOT NULL, CHECK IN (`'draft'`, `'submitted'`, `'acknowledged'`) |
  | `locked` | INTEGER NOT NULL DEFAULT 0 |
  | `inspection_type`, `inspection_date` | |
  | `header_json` | TEXT NOT NULL DEFAULT `'{}'` |
  | `items_json` | TEXT NOT NULL DEFAULT `'{}'` |
  | `form_json` | TEXT NOT NULL DEFAULT `'{}'`. Every other top-level form field the UI keeps (e.g. `summary`), except the keys listed below |
  | `deficiencies_summary` | |
  | `supersedes_id` | → `checklist_submissions(id)` |
  | `reopened_at`, `reopened_by` | |
  | `content_hash` | |
  | `created_at`, `updated_at`, `submitted_at` | |

  Indexes on `inspector_id`, `status`, `inspection_date`.
- **`checklist_signoffs`**:
  - `submission_id` → `checklist_submissions(id)` ON DELETE CASCADE
  - `role`, `name` NOT NULL, `position`
  - `signature_data_uri` (≤ 200,000 characters)
  - `signed_at` NOT NULL
  - **`signed_by`** NOT NULL → `users(id)`
  - PK (`submission_id`, `role`)
- **`checklist_drawings`**:
  - `id` PK
  - `submission_id` → ON DELETE CASCADE
  - `section_key` (NULL means the form-level attachments panel)
  - `label`, `content_type`
  - `data_uri` (≤ 820,000 characters, which is about 600 KB binary)
  - `added_by`, `added_at`
  - The Worker enforces **≤ 6 rows per submission**.

### Approvals, notifications, settings, audit

- **`approvals`**:
  - `id` PK
  - `entity_type` NOT NULL (`'checklist_submission'` in 3a; 3b adds `'work_order'`)
  - `entity_id`, `approval_role` NOT NULL
  - `assigned_to`
  - `status` NOT NULL DEFAULT `'pending'`, CHECK IN (`'pending'`, `'approved'`, `'rejected'`)
  - `notes`, `decided_by`, `decided_at`, `signed` INTEGER DEFAULT 0, `created_at`
  - **`UNIQUE(entity_type, entity_id, approval_role)` where `status = 'pending'`**, as a partial unique index
- **`notifications`**:
  - `id` PK, `recipient_id` NOT NULL
  - `kind`, `title`, `body`, `link`, `entity_type`, `entity_id`
  - `created_at`, `read_at`
  - Index on (`recipient_id`, `read_at`).
- **`app_settings`**: `section` PK, `value_json` NOT NULL, `updated_at`, `updated_by`.
- **`settings_audit`**: `id` PK, `section`, `action` (`'save'` | `'reset'`), `from_json`, `to_json`, `by`, `by_name`, `at`.
- **`audit_log`**: `id` PK, `entity_type`, `entity_id`, `action`, `actor_id`, `detail_json`, `created_at`. Index on (`entity_type`, `entity_id`).

### Triggers (the database-level safety net)

```sql
-- A locked checklist can't be deleted.
CREATE TRIGGER submissions_no_delete_locked BEFORE DELETE ON checklist_submissions
WHEN OLD.locked = 1 BEGIN SELECT RAISE(ABORT, 'Locked checklist submissions cannot be deleted'); END;

-- A locked checklist's content is frozen. Only these may change:
-- items_json + reopened_at + reopened_by (approver correction), status submitted→acknowledged,
-- and updated_at.
CREATE TRIGGER submissions_frozen_when_locked BEFORE UPDATE ON checklist_submissions
WHEN OLD.locked = 1 AND (
  NEW.template_id IS NOT OLD.template_id OR NEW.template_version IS NOT OLD.template_version OR
  NEW.inspector_id IS NOT OLD.inspector_id OR NEW.header_json IS NOT OLD.header_json OR
  NEW.form_json IS NOT OLD.form_json OR NEW.deficiencies_summary IS NOT OLD.deficiencies_summary OR
  NEW.inspection_type IS NOT OLD.inspection_type OR NEW.inspection_date IS NOT OLD.inspection_date OR
  NEW.supersedes_id IS NOT OLD.supersedes_id OR NEW.submitted_at IS NOT OLD.submitted_at OR
  NEW.locked IS NOT OLD.locked OR
  (NEW.status IS NOT OLD.status AND NOT (OLD.status = 'submitted' AND NEW.status = 'acknowledged')) OR
  (NEW.items_json IS NOT OLD.items_json AND NEW.reopened_at IS OLD.reopened_at)
) BEGIN SELECT RAISE(ABORT, 'Locked checklist submissions cannot be overwritten; create a correction instead'); END;

-- Sign-offs on a locked checklist are frozen, except the OM acknowledgment block.
CREATE TRIGGER signoffs_frozen_when_locked_ins BEFORE INSERT ON checklist_signoffs
WHEN NEW.role <> 'om_acknowledgment'
 AND (SELECT locked FROM checklist_submissions WHERE id = NEW.submission_id) = 1
BEGIN SELECT RAISE(ABORT, 'Sign-offs on a locked checklist cannot change'); END;
CREATE TRIGGER signoffs_frozen_when_locked_upd BEFORE UPDATE ON checklist_signoffs
WHEN OLD.role <> 'om_acknowledgment'
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
CREATE TRIGGER drawings_frozen_when_locked_del BEFORE DELETE ON checklist_drawings
WHEN (SELECT locked FROM checklist_submissions WHERE id = OLD.submission_id) = 1
BEGIN SELECT RAISE(ABORT, 'Drawings on a locked checklist cannot change'); END;
```

A correction (`amendItemResult`) must set a new `reopened_at` in the **same** UPDATE that changes `items_json`. The trigger only allows item changes when `reopened_at` changes too.

**The submit transaction.** Locking happens in the final UPDATE of the submit batch. Sign-offs, drawings and items are written **before** that UPDATE, in one `db.batch([...])`, so the frozen-row triggers don't block the submit itself.

## 3. Operations and rules

Every operation is a route `/api/data/<group>.<op>`. **Every route requires a D1 session.** The rule column is enforced in `worker/data/rules.js`, a set of pure functions with exhaustive unit tests.

Role sets used below:
- **MANAGERS** = `om`, `admin`
- **SUPERVISORS** = `om`, `coo`, `admin`

### users

| Op | Who | Rule |
|---|---|---|
| `users.list`, `users.getById`, `users.getByEmail`, `users.listLogins` | any signed-in user | Public profile fields only, never hashes or lockout data. `stored_signature_data_uri` of **other** users is only returned to SUPERVISORS; everyone sees their own |
| `users.update` (`id`, patch) | the user themselves | Only `full_name`, `position`, `stored_signature_data_uri`, `hide_signature_prompt`. Role, active, email and approver changes go through sub-project 2's `/api/users/update` |

### checklists

| Op | Who | Rule |
|---|---|---|
| `listMine` | any signed-in user | `inspector_id = me` |
| `listAll`, `get` | any signed-in user | BACC rule: any staff member may view any checklist on file |
| `persist`: new draft | any signed-in user | `inspector_id` is forced to **me**. `status` must be `draft` |
| `persist`: update draft | owner or MANAGERS | Row must be `draft` and unlocked. `inspector_id` can't change |
| `persist`: submit | owner | Draft → `submitted`, `locked = 1`, `submitted_at = now`. Creates the pending `om_acknowledgment` approval (assigned to the first active `om`, else null). Links the matching due instance (`linkSubmissionToInstance`) |
| `persist` on a locked row | — | 409 `Locked checklist submissions cannot be overwritten; create a correction instead` |
| `deleteDraft` | MANAGERS | Unlocked drafts only |
| `amendItemResult` | SUPERVISORS | Locked row only. Changes **one** item's `result`. Sets `reopened_at = now` and `reopened_by = me` in the same UPDATE. Appends an `audit_log` (`amend_item`) entry. Returns the record with `amendments` (read from `audit_log`) |
| `acknowledge` | MANAGERS | Status `submitted` → `acknowledged`. Upserts the `om_acknowledgment` sign-off (`signed_by = me`). Approves the pending approval (`decided_by = me`) |
| `listQualifyingReinspections` | any signed-in user | Same as today, via `isQualifyingReinspection` over `listAll` |
| corrections | owner | A new draft with `supersedes_id` set (browser-built as today via `createCorrection`). The original is never touched |

**Sign-offs inside `persist`:**
- The block whose role is `om_acknowledgment` may only be written by MANAGERS, through `acknowledge`. Inside `persist` it's ignored, with a 403 if present and changed.
- Other blocks are written only while the row is an unlocked draft, by the owner or MANAGERS. Each written block gets `signed_by = me`.
- Empty stubs (no name and no signature) are skipped, as today.

**Validation in `persist`:**
- Item results are `sat`, `no_sat`, `na` or `null`.
- Any `photo_url` or `photo_local_id` value that's non-null → **400** `Photo uploads are disabled`.
- More than 6 drawings, a drawing over size, or a signature over size → **400** with a clear message.
- The body is capped by the existing 12 MB wrapper limit.

**Where fields go on save.** `header` → `header_json`, `items` → `items_json` (items carry only `result`, `remarks`, `photo_url: null`), `signoffs` → `checklist_signoffs`, `attachments` → `checklist_drawings`. All other top-level fields go into `form_json`, **except** these, which are owned by the server or the registry: `id`, `template_id`, `template_version`, `inspector_id`, `status`, `locked`, `schema`, `content_schema`, `field_map`, `print_template_key`, `template_code`, `inspector_name`, `amendments`, `pending_sync`, `updatedAt`, `created_at`, `submitted_at`, `reopened_at`, `reopened_by`, `supersedes_id`, `exported_pdf_path`.

### approvals (checklist entity only)

| Op | Who | Rule |
|---|---|---|
| `listInbox` | any signed-in user | Pending approvals assigned to me, plus all pending for SUPERVISORS. Each is enriched with the checklist summary (title, code, group, filed by, date, href, status) |
| `get` | assignee or SUPERVISORS | |
| `decide` `approved` | MANAGERS only (same as `checklists.acknowledge`) | Pending only. On a checklist entity it runs exactly the `checklists.acknowledge` steps. A COO gets 403, because only MANAGERS may sign `om_acknowledgment` by any route |
| `decide` `rejected` | assignee or SUPERVISORS | Pending only. Records `notes`, `decided_by`, `decided_at`. The checklist stays `submitted` and locked |
| `decide` on any non-checklist entity | — | 501 `Available in 3b` |

### instances

| Op | Who | Rule |
|---|---|---|
| `list` | any signed-in user | Rows where `assigned_user = me`, or `assigned_department = my department`, or all for SUPERVISORS. Statuses are refreshed with `refreshInstanceStatuses(rows, now)` |
| `generate` | SUPERVISORS | `generatePendingInstances` over active `assignment_rules`, backfilling **120 days** in Belize time. Inserted with `INSERT OR IGNORE`, so it's idempotent via the unique index. Returns `{ created, total }` |
| `getClock` | any signed-in user | `{ demoNow: now, nowMs: now }` (same as Supabase mode) |
| `advanceClock`, `resetDemo`, `loadShowcase`, `clearAll` | — | Demo-only, so they throw, as today |

### notifications

`listForUser`, `unreadCount`, `markRead` and `markAllRead` only ever touch rows where `recipient_id = me`. The `userId` argument from the browser is ignored, because the server uses the session. **No create endpoint in 3a:** notifications are created server-side by the operations that cause them.
- **3a:** submitting a checklist notifies the assigned OM. Acknowledging it notifies the inspector.

### settings

| Op | Who | Rule |
|---|---|---|
| `get` | any signed-in user | `{ [section]: value }` from `app_settings` |
| `save` (`section`, `value`) | MANAGERS | Upsert `app_settings`, append `settings_audit` (`save`, from, to, me) |
| `resetSection` | MANAGERS | Delete the row, append `settings_audit` (`reset`) |
| `audit` | MANAGERS | `settings_audit`, newest first |

## 4. Browser

### The d1 adapter

`src/data/repositories/d1/index.js` exports `createD1Repositories()`, matching `REPOSITORY_METHODS`. It is a thin layer:
- `call(op, args)` does a `fetch` to `/api/data/<op>`: GET for list/get-style ops, POST otherwise. Same error shape as `authClient`.
- **Template enrichment:** submissions and approvals are enriched in the browser with `schema`, `content_schema`, `field_map`, `print_template_key` and `template_code` from `getRegistryEntry(template_id)`. This uses the same helper as mock mode.
- `templates.list` and `templates.get` come from the registry plus `assignment_rules`, fetched via `instances.rules` (a read-only op for any signed-in user).
- `reports` uses the existing `createReportAggregations(loadCtx)`, where `loadCtx` fetches the needed lists through the adapter. Incident-based reports return empty results until 3b.

  **This requires a small refactor:** `createReportAggregations` moves out of `supabase/index.js` into `src/data/repositories/reportAggregations.js`, unchanged, so both adapters import it.

### Other browser changes

- **`getDataSource()`** returns `'d1'` for `VITE_DATA_SOURCE=d1`. **`prepareRepos()`** doesn't load the mock module in d1 mode.
- **`AuthContext.updateProfile`** in d1 mode calls `users.update`, replacing sub-project 2's "not available yet" error.
- **Offline queue:** `lib/submissions.js` `queueHandlers` (`persist_submission`, etc.) already go through `getRepos()`, so in d1 mode they reach the Worker. In d1 mode, `upload_photo` jobs are never created, and any leftover one is dropped with a console warning. Failed jobs stay queued, as today.
- **Photo controls:** `PhotoUpload` and the row camera buttons don't render when `getDataSource() === 'd1'`. Also hidden: the incident "Photos & Attachments" tab, the verification-photo picker, and `CreateIncidentModal`'s photo carry-over.
- **Drawings:**
  - `AttachmentsPanel` and `DrawingAttach` compress each image with `lib/imageCompress.js` (max 1400 px, JPEG quality 0.75).
  - A compressed image over 600 KB is refused with "This drawing is too large even after compression."
  - The UI caps the total at **6 per checklist**, showing "6 of 6" and disabling Add.

## 5. One-time config import: `scripts/d1-import-config.mjs`

Run at 3c cutover, documented here because 3a creates its tables.

1. Reads from Supabase, using `SUPABASE_URL` and a `SUPABASE_SERVICE_ROLE_KEY` entered at a hidden prompt (never written to disk):
   - `checklist_templates` (id → code), to map rule `template_id` to a registry `key` through `code`
   - `checklist_assignment_rules`
   - `audit_log` rows with `entity_type = 'app_settings'`. It folds them into the **current** overrides per section, using the same logic as the Supabase adapter's `loadSettingsOverrides`.
2. **Converts:**
   - Rules whose template code has no registry entry are **skipped and listed**.
   - `assigned_user` is set to `NULL`, because those people don't exist in the fresh D1. Each affected rule is listed so it can be re-assigned.
3. **Dry run:** prints a summary (N rules, M skipped, K person-assignments cleared, S settings sections) and asks `Write to <local|PRODUCTION> D1? (y/N)`.
4. Writes one SQL file to the OS temp folder and runs `wrangler d1 execute bacc-portal-db [--remote] --file`, then deletes the file.
5. **Idempotent:** rules are upserted by their original id, and settings by section. `settings_audit` gets one `import` entry per section.

## 6. Testing

- **Unit (`node --test`):**
  - `rules.js`: every row of every table above, including "inspector cannot delete a draft", "inspector cannot sign `om_acknowledgment`", "COO can amend and reject, but can't acknowledge through either `checklists.acknowledge` or `approvals.decide`", and "notifications ignore the userId argument".
  - Service-level tests for each operation against the in-memory store:
    - draft → submit → acknowledge
    - correction creates a new id and leaves the original unchanged
    - amend writes an audit entry and changes only one item
    - `signed_by` is always the session user
    - drawing and signature caps
    - photo data → 400
    - instance generation is idempotent
    - settings save, reset and audit
- **Trigger tests** (`scripts/d1-trigger-check.mjs` against local D1, run by hand and in the smoke):
  - a direct UPDATE of a locked row's `header_json` aborts
  - DELETE of a locked row aborts
  - a non-OM sign-off insert on a locked row aborts
  - an items change without a `reopened_at` change aborts
- **End-to-end `npm run data:smoke`** against local `npm run dev`, with admin, OM and inspector created through the sub-project 2 endpoints:
  1. The inspector creates, saves, edits and submits a checklist.
  2. The submitted checklist is locked. An inspector edit returns 409.
  3. The OM sees the approval in the inbox and acknowledges it. The inspector is notified.
  4. The inspector can't delete drafts (403), but the OM can.
  5. The inspector can't sign `om_acknowledgment` (403).
  6. COO-style amend works and appears in `amendments`.
  7. A correction leaves the original untouched.
  8. Photo data is rejected. A 7th drawing is rejected.
  9. `instances.generate` twice creates no duplicates.
  10. Settings save, reset and audit work.
  11. Notifications are scoped to their recipient.
- **Browser click-through** in d1 mode: create, fill, save, go offline, edit, come back online and sync, submit, OM acknowledges, export the PDF. The PDF must look the same as the parity fixtures.
- **Regression:**
  - all existing `npm test` and `verify:*` checks
  - 6-case PDF parity at 100%
  - `npm run auth:smoke` still passes
  - production (Supabase mode) is unchanged

## 7. Rollout (3a)

1. Merge to `main`. This is inert for users, because production `VITE_DATA_SOURCE` stays `supabase`.
2. Apply `0002_core.sql` to production D1: `npx wrangler d1 migrations apply bacc-portal-db --remote`.
3. **No config import yet.** That runs at 3c, so it picks up the latest Supabase settings.

## Out of scope (3a)

- Incidents, work orders, NOC and WO numbering, and work-order approvals (3b).
- Production switch, Supabase removal, config import execution, and final photo lockdown (3c).
- Email or push delivery of notifications (in-app only, as today).
- Real-time updates. Pages refresh on load or action, as today.

## Risks

- **Concurrent edits** to the same draft are "last write wins", the same as today. The lock on submit prevents any edit after filing.
- **D1 2 MB row limit:** a checklist row holds only JSON text (tens of KB). Drawings and signatures live in their own rows with hard caps well under 2 MB.
- **Payload size:** a checklist with 6 drawings is about 5 MB of JSON per save. That's under the 12 MB wrapper limit, but slow on weak connections. The browser sends drawings only when they've changed (`drawings_changed: true` flag); otherwise the Worker keeps the stored ones.
