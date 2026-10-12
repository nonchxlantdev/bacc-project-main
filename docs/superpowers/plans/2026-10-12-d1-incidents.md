# D1 Data Move 3b (Incidents and Work Orders): Implementation Plan

> Implemented directly by Claude on branch `feat/d1-incidents`, the same way as 3a. Each task below is one commit. The code in that commit is the reference.

**Goal:** Incidents, incident updates, numbering, work orders and work-order approvals on D1, behind `VITE_DATA_SOURCE=d1`.

**Spec:** `docs/superpowers/specs/2026-10-12-d1-incidents-design.md`

## Global constraints

- Everything from 3a still applies:
  - `session` auth and `csrf` on writes
  - all SQL in `store.js`, all permissions in a pure rules module
  - tests on the SQLite shim
  - production unchanged
- Incident rules live in a new pure module, `worker/data/incidentRules.js`. Transition logic is imported from `src/lib/incidentLifecycle.js` so the browser and server can't disagree.

## Tasks

### Task 1: Migration `0003_incidents.sql` and trigger tests
- Creates `incidents`, `incident_updates`, `work_orders` and `work_order_signoffs`.
- Triggers:
  - a closed incident is frozen
  - a locked work order and its sign-offs are frozen
  - updates are append-only
- Tests in `tests/dataIncidentTriggers.test.js`.

### Task 2: Pure rules
- `worker/data/incidentRules.js`:
  - `canSeeIncident`, `assertCanEditIncident`
  - `validateIncidentPayload`, `validateWorkOrderPayload`
  - `assertWorkOrderTransition`, `assertCanDecideWorkOrder`
- Tests in `tests/dataIncidentRules.test.js`.

### Task 3: Store and service
- **Store:** incident and work-order SQL. Numbering uses `INSERT … SELECT COALESCE(MAX(seq),0)+1 … WHERE year = ?`.
- **Service:**
  - `incidents.*` and `workOrders.*` ops
  - `approvals.listInbox` and `approvals.decide` extended to work orders
  - `checklists.deleteDraft` cascade
- Tests in `tests/dataIncidentService.test.js`.

### Task 4: Routes and ops
- Add the new op names to `worker/data/ops.js`.
- Update the route test count.

### Task 5: Browser
- **Adapter:** `incidents`, `workOrders`, the inbox filter while `WORK_ORDERS_ENABLED` is false, and the report context.
- **Hidden photo UI in d1 mode:** the Photos tab, verification evidence and the modal carry-over.
- Adapter tests.

### Task 6: Smoke and docs
- `data:smoke` gains incident and work-order checks.
- CLAUDE.md section.
- Walkthrough.

### Task 7: Regression and independent review

**Review fixes (2026-10-12).** Each one has a test written first, in `tests/dataIncidentService.test.js`. Where a fix changes the spec, this list is the source of truth.

**Spec changes:**

- **CEC clearance.** Completing a work order that needs CEC clearance now also creates the `cec_clearance` approval. Deciding it records the CEC sign-off and sets `cec_clearance_issued`, but doesn't lock. Only the OM/COO verification locks, and it's blocked until CEC has cleared. (Supabase and mock locked on whichever approval came first, which left the second one undecidable.)
- **SAT write-back on the server.** When a verification changes on a filed checklist's incident, the server updates the checklist item in the same save, for whoever records it, including the reporting inspector. The flag and reason tag moved to `lib/incidentLifecycle.js`; `checklistSync.js` re-exports them. The browser's own sync then finds nothing left to do.
- **Raising an incident.** An incident can only be raised from a checklist you filed, or by the OM, COO or an admin.

**Other fixes:**

- **Re-inspection link:** it must be a filed checklist that is a SAT re-inspection of that item, checked with `isQualifyingReinspection`. Linking any checklist that merely exists is no longer enough to close an incident.
- **Numbering:**
  - Numbers come from a `number_counters` table, so they're never reused after a draft and its incidents are deleted.
  - A work order's number year is the airport's today.
  - `date_issued` must be a real date and is fixed once saved.
- **Draft delete:** it also clears stale re-inspection links and deletes the notifications for the incidents and work orders it removes.
- **Clearing the assigned unit:** an explicit `assigned_unit: null` now really clears it, along with `assigned_at`.
- **Work-order approvals in `approvals.list`:** only shown to people who could act on them.
- **Reopening a completed work order:** its pending approvals are withdrawn. Only a completed work order can be signed off.
- **Update history:** an update's `status_to` must be the incident's current status.
- `npm test`, the `verify:*` checks, parity, the auth and data smokes, and a browser run-through.
- Independent review, with fixes written test-first.
