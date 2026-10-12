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
- `npm test`, the `verify:*` checks, parity, the auth and data smokes, and a browser run-through.
- Independent review, with fixes written test-first.
