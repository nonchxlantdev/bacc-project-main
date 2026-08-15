# BACC OMP — Annex D Slice, Phase 3 Design
**Approvals · Scheduling · Notifications · Reports**

Date: 2026-08-14
Status: Design for approval
Depends on: Phase 1 (v2) and Phase 2 designs

## 1. Scope and demo posture

**The application is currently a demo — no Supabase, no production data.** Phase 3 is built the same way: working UI against mock data, so BACC can be shown a complete system end to end. This maps to the contract's *Core System Demonstration* milestone.

That is a reasonable choice, but it has one condition attached, and it is the most important instruction in this document:

> **Every screen reads through a repository interface, never from mock data directly.**
> If components import mock objects, wiring Supabase later is a rewrite. If they call `checklistRepo.listDueForUser()`, it is a one-adapter swap. This applies retroactively to Phases 1 and 2 as well.

**In scope:** data-access layer, seed data generator, approval workflows, recurring-instance scheduler, in-app notification centre, executive dashboard, compliance reports.

**Out of scope:** live email sending (contracts specced, provider unwired), Projects module (contracted Phase I, separate), other annex slices.

## 2. Data access layer — build this first

```
src/data/
  repositories/
    index.js               ← selects implementation from VITE_DATA_SOURCE
    types.js               ← the interface every implementation satisfies
    mock/                  ← reads the seeded in-memory store
    supabase/              ← real queries; stubs that throw until wired
  seed/
    generateSeed.js        ← deterministic mock dataset
```

`VITE_DATA_SOURCE=mock|supabase`, defaulting to `mock`. Components and hooks never touch either implementation directly — they consume `useChecklists()`, `useIncidents()`, `useNotifications()` and similar, which call the repository.

Repository methods return the same shapes the Supabase queries will return, including relations. Where the mock cannot honour something (server-side aggregation, real-time), it computes an equivalent client-side and marks the method in `types.js` so the Supabase adapter's contract is unambiguous.

**Report aggregations are the one exception worth planning for.** In mock they run client-side over the seed. In Supabase they should become SQL views or RPC functions. Define each aggregation's input and output shape now, in `types.js`, so the SQL can be written to match rather than the UI reshaped to fit.

## 3. Seed data

A demo dashboard showing four records looks like a prototype. Generate a **deterministic, plausible six-month dataset** with a fixed seed:

- Users across the real roles: Maintenance Inspector, Duty Manager, OM, COO, CEC, EEC, Apron Supervisor
- ~6 months of Annex D submissions on a monthly cadence plus post-storm entries, mostly all-SAT with a realistic minority of NO SAT items
- Incidents at every Deficiency Level and every lifecycle state, some closed with re-inspections, some overdue, some approaching SLA
- Work orders in each state, a few with NOTAM references and CEC clearances
- Notifications, approvals pending, and a recent activity feed consistent with all of the above

Consistency matters more than volume: every incident must trace to a real seeded checklist item, every closure to a real re-inspection. A demo falls apart the moment someone clicks through to a dangling record.

## 4. Approval workflows

Resolves the open item on OM acknowledgment timing — it lands here, matching the contract.

**Annex D checklist acknowledgment.** Inspector submits → the submission enters the OM's approval queue → OM reviews and acknowledges with a drawn signature → status moves to `acknowledged` and the PDF is regenerated with the OM signature stamped into Annex D's acknowledgment block. The submitted record itself stays immutable; acknowledgment appends, it does not edit.

**Annex H work order verification.** Completion record filled → OM or COO verification signature → CEC written clearance where required → `verified`. The Phase 2 safety gates still apply and are enforced here: area cleared for operations, NOTAM reference present when required, CEC clearance issued.

**Approvals inbox** — a route listing everything awaiting the current user, grouped by type, with age and a direct link to the item. This is the surface the "Approvals" KPI card counts.

```sql
create table approvals (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('checklist_submission','work_order')),
  entity_id uuid not null,
  approval_role text not null
    check (approval_role in ('om_acknowledgment','om_coo_verification','cec_clearance')),
  assigned_to uuid references auth.users(id),
  status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  signature_image_path text,
  notes text,
  created_at timestamptz not null default now()
);
```

Rejection returns the item to the originator with notes and raises a notification. Whether rejection is even permitted for a regulatory record — versus requiring a fresh inspection — is an open question for BACC.

## 5. Scheduler and checklist instances

Phase 1's assignment rules carry a frequency but nothing generates work from them. A checklist that is *due* is not yet a submission, so it needs its own record:

```sql
create table checklist_instances (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references checklist_templates(id),
  template_version text not null,
  assignment_rule_id uuid references checklist_assignment_rules(id),
  assigned_role text,
  assigned_department text,
  assigned_user uuid references auth.users(id),
  location_id uuid,
  period_start date not null,
  period_end date not null,
  due_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending','in_progress','submitted','overdue','missed')),
  submission_id uuid references checklist_submissions(id),
  created_at timestamptz not null default now(),
  unique (assignment_rule_id, period_start)
);
```

The unique constraint on rule + period makes generation idempotent — a job that runs twice cannot double-book.

**Timezone: America/Belize (UTC−6).** Due dates, "due today", and overdue thresholds must be computed in the airport's local time, not the browser's and not UTC. A monthly inspection due 31 May must not flip to overdue at 18:00 on the 30th for a user whose device is set elsewhere.

**Real implementation** (when the backend lands): a scheduled job — Vercel Cron or Supabase `pg_cron` — hitting `/api/generate-checklist-instances` to roll forward the next period and mark past-due instances `overdue`. **Demo implementation:** the seed generates instances across the six-month window with realistic pending/overdue/submitted mixes, and a dev-only "advance clock" control demonstrates the transition.

## 6. Notifications

**In-app, working end to end.** The bell and badge from the mockups, a notification centre with read/unread and mark-all-read, and deep links to the originating entity.

Event types: incident assigned · incident raised at a level configured to alert · approval required · checklist due · checklist overdue · work order assigned · work order completed awaiting verification · SLA breach imminent · SLA breached.

```sql
create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id),
  event_type text not null,
  entity_type text,
  entity_id uuid,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
```

**Email — contracts only, no provider.** Define recipients, triggers, and templates as configuration in `src/config/notificationRules.js`, and put sending behind a provider-agnostic `notificationTransport` interface with an in-app implementation now and a stub email implementation that logs. Connecting Resend, SES, or whatever BACC's IT prefers then means writing one adapter, with no change to trigger logic.

Recipient rules are configuration rather than code because BACC has not yet specified who receives what. Escalation on overdue — inspector, then supervisor, then OM — is the expected shape but needs confirming.

## 7. Reports

Two audiences, one module.

### Executive dashboard (from the requirements spreadsheet)

KPI cards — Active Projects, Incidents, Checklists, Approvals — plus department overview, recent activity feed, and quick actions.

**KPI cards are stat tiles, not charts.** A single headline number with a label, and where useful a small delta against the prior period. Do not put a number on a chart when the number is the point.

### Compliance views (what BACC would actually be audited on)

- Checklist completion rate by template, department, and period
- Overdue and missed inspections
- Open deficiencies by Deficiency Level
- Deficiency ageing and mean time to closure
- SLA adherence and breaches
- NOC register status — open versus closed over the period
- Re-inspection verification rate: closures backed by a SAT re-inspection

### Chart guidance

Pick the form from the data's job, then assign color by the job it does — never the reverse.

| View | Job | Form |
|---|---|---|
| KPI cards | single headline | stat tile, no plot |
| Completion rate over time | change over time | line, one series per template |
| Open deficiencies by Level | magnitude by category | horizontal bar |
| Incidents by lifecycle state | magnitude by category | horizontal bar or stacked single bar |
| Deficiency ageing | distribution | bucketed bar |
| Department overview | magnitude by category | horizontal bar |
| Overdue inspections | identity of specific records | table, not a chart |
| SLA adherence | state | status-colored tiles plus a table |

Rules that are not negotiable:

- **Never a dual-axis chart.** Two measures at different scales become two charts, small multiples, or index both to a common base.
- **Categorical hues assigned in fixed order, never cycled**, and color follows the entity — a filter that removes series must not repaint the survivors.
- **Status colors (good / warning / serious / critical) are reserved** for SLA and overdue state. They never double as a categorical series, and they always ship with an icon or label so state is never color-alone.
- **Deficiency Level uses a categorical palette for now, not a sequential ramp.** A sequential light→dark ramp encodes magnitude, and we do not yet know whether Level 1 is the most or least severe. Once BACC defines the levels, switch to a single-hue sequential ramp in the correct direction — one change in `src/config/deficiencyLevels.js`.
- **Legend present for two or more series**, direct labels used selectively, grid and axes recessive, text in ink tokens rather than series colors.
- **Hover layer by default** — crosshair and tooltip on line charts, per-mark tooltip on bars.
- **Validate the categorical palette for color-vision deficiency before shipping.** Target adjacent-pair CVD separation of ΔE ≥ 8 (OKLab ×100), with a normal-vision floor of 15 and adequate contrast against the chart surface. Do not eyeball this; compute it. Any pair failing the normal-vision floor must be re-stepped, not excused by adding a second encoding.
- Every chart needs a table view. Dark mode, if built, is stepped and validated against the dark surface — not an automatic inversion.

Reports export to CSV and PDF. **Report PDFs are ordinary documents, not controlled forms** — they use house-style layout, not the overlay pipeline, which applies only to approved annexes.

## 8. Acceptance criteria

- [ ] Every Phase 3 screen reads through a repository; no component imports mock data
- [ ] `VITE_DATA_SOURCE` switches implementations; the Supabase adapter exists with stubs
- [ ] Seed produces a coherent six months — every incident traces to a real item, every closure to a real re-inspection
- [ ] OM acknowledges an Annex D submission with a drawn signature; PDF regenerates with it; the original record is unmodified
- [ ] Work order verification enforces the Phase 2 safety gates
- [ ] Approvals inbox lists exactly what awaits the current user
- [ ] Instances generate per assignment rule and period; regeneration is idempotent
- [ ] Due and overdue compute correctly in America/Belize regardless of device timezone
- [ ] Notification centre works end to end with deep links; email transport stubbed behind the interface
- [ ] Dashboard and compliance views render from repository aggregations, not inline calculations
- [ ] Categorical palette passes CVD validation; no dual-axis chart exists; every chart has a table view
- [ ] Reports export to CSV and PDF without touching the overlay pipeline

## 9. Open items

- **Deficiency Level definitions** — still the blocking one. Governs level colour ramp direction, SLA defaults, and which levels trigger alerts.
- Notification recipient and escalation rules — who is told, after how long, and in what order
- Whether an approver may reject a submitted regulatory record, or whether a correction requires a fresh inspection
- SLA target days per level
- Email provider and sending domain, when BACC's IT is ready
- Retention: how long submissions, exports, and audit logs must be kept under BCAR-139
- Projects module (contracted Phase I) remains unscoped — it appears in the nav and in the KPI cards but has no design yet
