# Cursor Prompt — BACC OMP, Annex D Slice, Phase 3

Paste into Cursor's agent chat with `bacc-project-main` open.

---

You are building **Phase 3 of the Annex D slice**: approvals, scheduling, notifications, and reports for the BACC Operations Management Portal.

**Read first — these govern and outrank this prompt:**

- `docs/superpowers/specs/2026-08-14-approvals-reports-notifications-phase3-design.md` — the Phase 3 design
- `docs/superpowers/specs/2026-08-14-checklist-pdf-portal-phase1-design.md` (v2) and `...-phase2-design.md`
- `docs/BACC_Digital_Checklist_Technical_Requirements_v1.docx`

## Context: this app is a demo

There is **no Supabase connection and no production data**. Phase 3 is built the same way — working UI on mock data, so BACC can be shown the whole system. That is deliberate.

## 0. The instruction that matters most — do this before anything else

**No component may import mock data.** Everything reads through a repository interface.

```
src/data/
  repositories/
    index.js        ← picks implementation from VITE_DATA_SOURCE (default 'mock')
    types.js        ← the interface both implementations satisfy
    mock/
    supabase/       ← real query signatures; stubs that throw 'not wired'
  seed/
    generateSeed.js
```

Components use hooks (`useChecklists`, `useIncidents`, `useNotifications`, `useApprovals`, `useReports`) that call repositories. Mock methods return **the exact shapes the Supabase queries will return**, relations included.

**Retrofit Phases 1 and 2 to this pattern as part of this work.** If any existing screen reads mock data directly, move it behind a repository now. Wiring Supabase later must be one adapter swap, not a rewrite — this is the whole reason building as a demo is safe.

For report aggregations, define input and output shapes in `types.js` first. Mock computes client-side; Supabase will implement them as SQL views or RPC. Write the contract before either.

## 1. Seed data

Deterministic, fixed seed, **six months** of coherent data: users across the real roles (Maintenance Inspector, Duty Manager, OM, COO, CEC, EEC, Apron Supervisor), monthly Annex D submissions plus post-storm entries, mostly all-SAT with a realistic NO SAT minority, incidents at every level and lifecycle state, work orders in every state including NOTAM refs and CEC clearances, notifications, pending approvals, activity feed.

**Referential integrity is the point.** Every incident traces to a real seeded checklist item; every closure to a real re-inspection. A demo dies the moment someone clicks into a dangling record.

## 2. Approvals

Annex D: submit → OM approval queue → OM acknowledges with drawn signature → status `acknowledged`, PDF regenerated with the signature in Annex D's acknowledgment block. **The submitted record stays immutable — acknowledgment appends, never edits.**

Annex H: completion record → OM/COO verification → CEC clearance where required → `verified`. Phase 2's safety gates still enforced (area cleared, NOTAM ref present when required, CEC clearance issued).

Build an **Approvals inbox** route listing what awaits the current user, grouped by type, with age and deep links. This feeds the Approvals KPI card. Schema in design §4.

## 3. Scheduler and checklist instances

Assignment rules carry a frequency but generate nothing. Add `checklist_instances` (schema in design §5) — a due checklist is not yet a submission.

`unique (assignment_rule_id, period_start)` makes generation idempotent; a job running twice must not double-book.

**Timezone: America/Belize (UTC−6).** Compute due, "due today", and overdue in airport local time — never the browser's, never UTC. Use an explicit timezone-aware helper; do not use bare `new Date()` comparisons for due logic.

Demo: seed instances across the window with realistic pending/overdue/submitted mixes, plus a dev-only "advance clock" control to show transitions. Real: `/api/generate-checklist-instances` driven by Vercel Cron or `pg_cron` — write the endpoint, leave it unscheduled.

## 4. Notifications

In-app working end to end: bell with badge (as mocked), notification centre, read/unread, mark all read, deep links.

Events: incident assigned · incident raised at an alerting level · approval required · checklist due · checklist overdue · work order assigned · work order awaiting verification · SLA breach imminent · SLA breached.

**Email: interface only, no provider.** Put sending behind `notificationTransport` with an in-app implementation and a stub email implementation that logs. Recipients, triggers, and templates live in `src/config/notificationRules.js` as configuration — BACC has not specified who receives what, so it must be changeable without touching trigger logic.

## 5. Reports

Two audiences: the executive dashboard from the requirements spreadsheet (KPI cards, department overview, activity feed, quick actions) and compliance views (completion rate, overdue/missed inspections, open deficiencies by level, deficiency ageing and mean time to close, SLA adherence, NOC register status, re-inspection verification rate).

Form selection table is in design §7. Follow it. Key points:

- **KPI cards are stat tiles, not charts.** When the number is the point, show the number.
- **Never build a dual-axis chart.** Two scales → two charts, small multiples, or index to a common base. This is the single most common charting mistake.
- **Categorical hues in fixed order, never cycled. Color follows the entity, not its rank** — filtering out series must not repaint the survivors.
- **Status colors (good/warning/serious/critical) are reserved** for SLA and overdue state. Never reuse them as a categorical series, and always pair them with an icon or label so state is never conveyed by color alone.
- **Deficiency Level gets a categorical palette, not a sequential ramp** — we do not know whether Level 1 is most or least severe, and a light→dark ramp asserts an ordering we cannot justify. When BACC defines the levels, switching to a correctly-directed sequential ramp should be one change in `src/config/deficiencyLevels.js`.
- **Validate the categorical palette for color-vision deficiency before shipping.** Adjacent-pair separation ΔE ≥ 8 (OKLab ×100), normal-vision floor ≥ 15, adequate contrast against the chart surface. Compute it — do not eyeball it. Re-step any failing pair rather than papering over it with a second encoding.
- Legend for ≥ 2 series, selective direct labels, recessive grid and axes, text in ink tokens not series colors, hover tooltips by default, and a table view for every chart.

Export to CSV and PDF. **Report PDFs are house-style documents — do NOT use the overlay pipeline.** That is only for approved annexes.

## 6. Acceptance checklist

- [ ] No component imports mock data; everything goes through repositories
- [ ] Phases 1 and 2 retrofitted to the repository pattern
- [ ] `VITE_DATA_SOURCE` switches implementations; Supabase adapter exists with stubs
- [ ] Six months of coherent seed with full referential integrity
- [ ] OM acknowledgment with drawn signature; PDF regenerates; original record untouched
- [ ] Work order verification enforces all safety gates
- [ ] Approvals inbox correct per user
- [ ] Instance generation idempotent; due/overdue correct in America/Belize on a device set to another timezone
- [ ] Notification centre works with deep links; email behind a stub transport
- [ ] Dashboard and compliance views read repository aggregations, not inline math
- [ ] Palette passes CVD validation; zero dual-axis charts; table view on every chart
- [ ] CSV and PDF export working, overlay pipeline untouched

## 7. Flag back, do not decide alone

- Deficiency Level definitions and ordering — still unknown, config only
- Notification recipients and escalation order and timing
- Whether an approver may reject a submitted regulatory record, or whether correction requires a fresh inspection
- SLA target days per level
- Record retention requirements under BCAR-139
- The Projects module appears in the nav and KPI cards but has no design — build the card reading from a repository method that returns empty, and flag it
