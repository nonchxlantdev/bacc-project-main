# D1 Data Move, Part 3b: Incidents and Work Orders — Design

**Date:** 2026-10-12
**Status:** Approved in brainstorming (2026-10-12).
**Builds on:** `2026-10-09-d1-core-checklists-design.md` (3a, live but switched off)

## Context

3b moves incidents (NOC), the incident updates and history trail, incident and work-order numbering, work orders (Annex H) and the work-order approvals from Supabase to D1.

- Production stays on Supabase. All 3b work runs only with `VITE_DATA_SOURCE=d1`.
- Merging changes nothing for users.

### Decisions (brainstorming, 2026-10-12)

| Decision | Choice |
|---|---|
| Work orders | **Build them** (data layer, approvals, numbering, locking), even though `WORK_ORDERS_ENABLED = false` keeps their screens hidden |
| Incident visibility | **Same as today, plus the COO**: reporter, assigned person, OM, COO, admin |
| Photos and attachments | Off. There's no attachments table. Photo data → 400. Incident photo controls are hidden in d1 mode |
| Numbering | Server-allocated per year, inside the INSERT statement itself (atomic in D1): `INC-YYYY-NNNN`, NOC `NNNN`, `WO-YYYY-NNNN` |

## 1. Schema: migration `d1/migrations/0003_incidents.sql`

### `incidents`

- **Identity:** `id` PK, `year` and `seq` NOT NULL with `UNIQUE(year, seq)`, `incident_ref` UNIQUE, `noc_no`.
- **Source:**
  - `submission_id` → `checklist_submissions(id)`
  - `source_template_code`, `source_section`, `source_item_code`, `source_item_description`, `source_inspection_type`, `source_inspection_date`
  - `inspector_name`
- **Details:**
  - `title`, `description` NOT NULL
  - `deficiency_level` 1–4
  - `category`, `incident_type`, `potential_impact`, `immediate_action_taken`
- **Location:**
  - `location_label` NOT NULL, `location_id`
  - `latitude`, `longitude`, `location_accuracy_m`
  - `location_captured_at`
  - `location_capture_method` (gps, map_pin, manual)
  - `location_user_adjusted`
- **Workflow:**
  - `status` (open, assigned, in_progress, resolved, closed)
  - `reported_by` → `users(id)` NOT NULL, `reported_by_name`, `reported_at`, `department`
  - `assigned_to` → `users(id)`, `assigned_team`, `assigned_at`
  - `target_date`, `resolved_at`, `closed_at`, `closure_notes`
  - `reinspection_submission_id` → `checklist_submissions(id)`
  - `verification_json` (the in-app SAT verification record)
  - `created_at`, `updated_at`

These are columns that Supabase stored as "spa_extras" in `audit_log`: `verification_json`, `inspector_name`, `reported_by_name`, `assigned_team` (the unit).

### `incident_updates`

- Columns: `id`, `incident_id` (ON DELETE CASCADE), `author_id` → `users(id)`, `author_name`, `body` (≤ 2,000 characters), `status_from`, `status_to`, `created_at`.
- **Append-only:** triggers abort UPDATE, and abort DELETE unless the incident row itself is being deleted. Deleting a draft-linked incident cascades, so the delete is only allowed when the parent incident no longer exists.

### `work_orders`

- `id`, `incident_id` → `incidents(id)`, `work_order_number` UNIQUE, `year`, `seq` with `UNIQUE(year, seq)`.
- All of the Annex H fields from Supabase's `work_orders`.
- `status` (issued, in_progress, completed, verified), `locked`, `created_at`, `updated_at`.

### `work_order_signoffs`

- PK (`work_order_id`, `role`), with `role` IN (`om_coo_verification`, `cec_clearance`).
- `name`, `signature_data_uri` (≤ 200,000 characters), `signed_at`, `signed_by` → `users(id)`.

### Triggers

- **A closed incident is frozen:** no UPDATE and no DELETE. This is Supabase's "update only while not closed" rule, enforced in the database.
- **A locked (verified) work order is frozen:** no UPDATE, no DELETE, and its sign-offs can't change.
- **`incident_updates` is append-only**, as above.

## 2. Operations and rules

Role sets: MANAGERS = om, admin. SUPERVISORS = om, coo, admin. **Can see an incident** = SUPERVISORS, the reporter, or the assigned person. **Can edit an incident** = the same set, and only while the incident isn't closed.

### incidents

| Op | Who | Rule |
|---|---|---|
| `incidents.list` | any signed-in user | Only incidents they can see. Each carries `updates` |
| `incidents.get` | can see | A 404 is returned as `null` when they can't see it, so nothing about its existence leaks |
| `incidents.persist`: new | any signed-in user | `reported_by` is forced to me and `reported_by_name` to my name. Numbers are allocated by the server (any client `TEMP` ref or `seq` is ignored). `status` must be `open`. If `submission_id` is set, that checklist must exist and the item code must be on it |
| `incidents.persist`: update | can edit | `id`, numbers, `reported_by*`, `reported_at` and `submission_id` can't change. Status changes run `incidentTransitionBlockers` (the shared rule from `lib/incidentLifecycle.js`) on the server. `closed_at` and `resolved_at` are stamped by the server. `verification.verified_by` is forced to me and `verified_at` is set to now when the verification is new or changed. Photo fields → 400 |
| `incidents.addUpdate` | can see | `author_id` and `author_name` are the session user. Body is 1–2,000 characters |

### work orders

| Op | Who | Rule |
|---|---|---|
| `workOrders.listByIncident`, `get` | can see the incident | |
| `workOrders.persist`: new | can edit the incident | Number is allocated by the server. Status must be `issued` |
| `workOrders.persist`: update | can edit the incident | Locked → 409. Status `verified` can't be set here (only through approval). Sign-offs can't be written here. Moving to `completed` creates the pending `om_coo_verification` approval (assigned to the first active OM) and notifies them |

### approvals (extends 3a)

| Op | Who | Rule |
|---|---|---|
| `approvals.listInbox` | as 3a | Also returns `work_order` approvals: `om_coo_verification` for SUPERVISORS or the assignee, `cec_clearance` for admin or the assignee. The browser hides work-order rows while `WORK_ORDERS_ENABLED` is false |
| `approvals.decide` on `work_order` | `om_coo_verification`: SUPERVISORS. `cec_clearance`: admin or assignee (there is no CEC role yet) | Approved: `workOrderVerifiedBlockers` must pass, then the sign-off is upserted (`signed_by` = me), status becomes `verified` and the work order is locked, all in one batch. `cec_clearance` also sets `cec_clearance_issued = 1` |

### Other changes to 3a ops

- **`checklists.deleteDraft`** also deletes the incidents raised from that draft, together with their work orders, work-order sign-offs, approvals and updates, in one batch. (This matches Supabase's `delete_draft_submission`.)
- **Reports:** the browser report context now loads `incidents.list` and the visible work orders.

## 3. Browser (d1 mode only)

- The adapter routes `incidents.*` and `workOrders.*` to the API.
- Incident records keep the shape the UI already uses, with `verification` coming from `verification_json`. The adapter's 3b stubs are removed.
- **Hidden in d1 mode:**
  - the Photos & Attachments tab
  - the "Attach evidence" control in the verification panel
  - the photo carry-over in `CreateIncidentModal` (it shows a "photos are off" line instead)
- The NOC register and work-order PDF exports are unchanged.

## 4. Testing

- **Rules unit tests:** every row above.
- **Service tests on the SQLite shim:**
  - numbering: sequential, and per year
  - two concurrent inserts can't share a number
  - visibility and edit scope
  - transitions and blockers
  - verification attribution
  - append-only updates
  - closed incidents frozen
  - work-order complete → approval → verified → locked
  - CEC path
  - draft delete cascades
- **Trigger tests.**
- **`data:smoke`** extended with incidents and work orders.
- **Browser run-through:** a NO SAT checklist item → create incident → assign → in progress → resolved → verify → closed, and the checklist shows the cleared state.
- **Regression:** PDF parity, every existing test, and the auth smoke.

## Out of scope

- Incident attachments and photos (off for the light run).
- Turning the work-order screens back on (`WORK_ORDERS_ENABLED`).
- Email or push notifications.
- The 3c cutover.
