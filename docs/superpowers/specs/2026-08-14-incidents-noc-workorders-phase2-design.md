# BACC OMP — Annex D Slice, Phase 2 Design
**Incident Management: NOC Register (Annex G) + Maintenance Work Orders (Annex H)**

Date: 2026-08-14
Status: Design for approval
Depends on: `2026-08-14-checklist-pdf-portal-phase1-design.md` (v2)

## 1. Scope

Phase 2 of the Annex D slice: raising an incident from a NO SAT checklist item, tracking it to verified closure, and exporting both approved forms.

**In scope:** Create Incident modal, Incident Management detail page, NOC register, work orders, geo-location capture, assignment and SLA, re-inspection closure loop, Annex G period-register export, Annex H work-order export.

**Out of scope:** Reports, notifications/email, approval workflows (contracted Phase III), other annexes' incident flows (each annex slice reuses this module unchanged).

## 2. Governing forms

Both are approved controlled documents. The BACC §14 non-negotiable rule applies — wording, numbering, layout, and field order must not change for convenience.

### Annex G — Deficiency and Notice of Condition (NOC) Register · `PGIA-PMM-F07` · p.119
*"Maintained by OM. A new row is completed for every deficiency identified through any inspection type."*

An **8-column repeating-row register**, not a per-incident sheet:

| NOC No. | Date | Source Inspection | Level (1–4) | Description / Location | Assigned To | Target Date | Closed Date / Notes |

### Annex H — Maintenance Work Order and Completion Record · `PGIA-PMM-F08` · p.120
*"Issued by OM for each maintenance task assigned to CEC, EEC, or Maintenance Personnel."*

A **fixed-field form**, two blocks plus signatures:

*Issue block:* Work Order Number · Date Issued · Issued by OM or COO (Name) · Assigned to · **NOC Reference No.** · Deficiency Level · Description of Work Required · Location · Target Completion Date · NOTAM Required (Yes/No + NOTAM Ref.)

*Work Completion Record:* Date Works Completed · Completed by · Description of Work Performed · Materials Used (type, quantity) · Test / Verification Results (if applicable) · **Area Cleared for Operations** (Yes / No + explain) · **CEC Written Clearance Issued** (Yes + Date / No)

*Signatures:* OM or COO Verification (Name / Signature / Date) · CEC (Name / Signature / Date) where required

## 3. Model — two entities

An **Incident is a NOC.** One incident = one row in the Annex G register. Work orders are raised against it and each exports its own Annex H.

```
checklist_items (DR-04, no_sat)
        │  Create Incident
        ▼
    incidents  ──── one row in Annex G register (period export)
        │
        ├── work_orders ──── each exports one Annex H form
        ├── incident_updates (Actions & Updates tab)
        ├── incident_attachments (Photos tab)
        └── audit_log (History tab)
```

Creating an incident **must not alter or clear** the originating checklist response (BACC §5). The link is permanent and bidirectional.

## 4. Severity — Deficiency Level 1–4

**Decision: BACC's own scale, presented as their forms present it.** The UI's severity control is **Deficiency Level (1–4)**, not High/Medium/Low. Both Annex G and Annex H carry Level as a first-class field, so it is stored canonically as an integer 1–4.

> **Open — blocks colour coding, sort order, and SLA defaults:** the annexes reference "Level (1–4)" without defining the levels. The definitions live elsewhere in the Aerodrome Operations Manual. **Do not assume Level 1 is most severe or least severe.** Obtain the definitions from BACC, along with any response timeframes attached to each level, before finalising SLA rules or the level colour ramp.

Until confirmed, render levels neutrally (Level 1 / 2 / 3 / 4 with a configurable colour and label map in `src/config/deficiencyLevels.js`), and drive SLA from an explicit per-level target-days setting rather than an inferred ordering.

Separate from Level, the mockup shows **Category** and **Incident Type** (the two screens disagree — the modal shows Category = Infrastructure, the detail page shows Category = Drainage, Incident Type = Infrastructure). Define both as configurable lookups, seeded from BACC's own terminology; do not hardcode.

## 5. Numbering

Single per-year sequence, two presentations:

- `incident_ref` — `INC-2026-0047`, the UI display ID shown in the mockup
- `noc_no` — the same sequence value as it appears in the register's NOC No. column

Deriving both from one sequence prevents drift. **Confirm with BACC** whether the register's NOC No. should carry a prefix or be a bare number.

## 6. Data model

```sql
create table incidents (
  id uuid primary key default gen_random_uuid(),
  seq integer not null,                          -- per-year sequence
  year integer not null,
  incident_ref text not null unique,             -- 'INC-2026-0047'
  noc_no text not null,                          -- register column value

  -- Source linkage (BACC §6) — permanent, never cleared
  submission_id uuid references checklist_submissions(id),
  checklist_item_id uuid references checklist_items(id),
  source_template_code text,                     -- 'PGIA-PMM-F04'
  source_section text,
  source_item_code text,                         -- 'DR-04'
  source_item_description text,
  source_inspection_type text,                   -- Annex G 'Source Inspection'
  source_inspection_date date,

  title text not null,
  description text not null,
  deficiency_level smallint not null check (deficiency_level between 1 and 4),
  category text,
  incident_type text,
  potential_impact text,
  immediate_action_taken text,

  location_label text not null,                  -- 'Runway West Edge – Near RWY 25 End'
  location_id uuid,
  latitude numeric(9,6),
  longitude numeric(9,6),
  location_accuracy_m numeric,
  location_captured_at timestamptz,
  location_capture_method text
    check (location_capture_method in ('gps','map_pin','manual')),
  location_user_adjusted boolean not null default false,

  status text not null default 'open'
    check (status in ('open','assigned','in_progress','resolved','closed')),
  reported_by uuid not null references auth.users(id),
  reported_at timestamptz not null default now(),
  department text,
  assigned_to uuid references auth.users(id),
  assigned_team text,
  assigned_at timestamptz,
  target_date date,                              -- Annex G 'Target Date'
  closed_at timestamptz,
  closure_notes text,                            -- Annex G 'Closed Date / Notes'
  reinspection_submission_id uuid references checklist_submissions(id),
  unique (year, seq)
);

create table work_orders (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references incidents(id) on delete restrict,
  work_order_number text not null unique,
  date_issued date not null,
  issued_by uuid references auth.users(id),      -- OM or COO
  issued_by_name text not null,
  assigned_to_name text not null,                -- CEC / EEC / Maintenance Personnel
  assigned_to_user uuid references auth.users(id),
  noc_reference_no text not null,                -- denormalised from incident
  deficiency_level smallint not null,
  description_of_work text not null,
  location_text text,
  target_completion_date date,
  notam_required boolean,
  notam_ref text,

  -- Work Completion Record
  date_works_completed date,
  completed_by text,
  description_of_work_performed text,
  materials_used text,
  test_verification_results text,
  area_cleared_for_operations boolean,
  area_not_cleared_explanation text,
  cec_clearance_issued boolean,
  cec_clearance_date date,

  status text not null default 'issued'
    check (status in ('issued','in_progress','completed','verified')),
  exported_pdf_path text,
  locked boolean not null default false
);

create table work_order_signoffs (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references work_orders(id) on delete cascade,
  role text not null check (role in ('om_coo_verification','cec_clearance')),
  name text not null,
  signature_image_path text,
  signed_at timestamptz not null default now()
);

create table incident_updates (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references incidents(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  body text not null,
  status_from text,
  status_to text,
  created_at timestamptz not null default now()
);

create table incident_attachments (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references incidents(id) on delete cascade,
  work_order_id uuid references work_orders(id),
  file_path text not null,
  caption text,
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz not null default now()
);
```

Incidents and work orders both write to `audit_log`. Completed work orders lock, consistent with the Phase 1 immutability rule.

## 7. Lifecycle

`Open → Assigned → In Progress → Resolved → Verified/Closed`, matching the mockup's stepper.

- **Open** — created from a NO SAT item or reported directly
- **Assigned** — assignee and target date set; typically the first work order is issued here
- **In Progress** — work under way
- **Resolved** — work order completion record filled in; awaiting verification
- **Verified/Closed** — see the closure gate below

### Closure gate (decided)

Moving to **Verified/Closed requires a linked re-inspection** in which the originating item came back **SAT**. The UI offers "Link re-inspection", listing submissions of the same template containing that item code with `result = 'sat'` and an inspection date after the incident was reported. `reinspection_submission_id` is set on close, and closure is blocked without it.

This makes good on the modal's stated promise — *"Once corrective action is completed, the item must be re-inspected and updated to SAT"* — and gives the audit trail a verifiable endpoint rather than an assertion.

**Additional operational gates from Annex H.** Where a work order records `area_cleared_for_operations = false`, or `notam_required = true` with no `notam_ref`, or a required CEC clearance is not issued, block the work order from reaching `verified` and surface why. These are safety-of-operations fields, not paperwork.

## 8. Create Incident modal

Per mockup. Opened from the NO SAT detail panel's **Create Incident** button.

**Left — Incident Information (editable):** Title (required, prefilled from item description + location) · Description/Remarks (required, prefilled from the item's remarks, 500-char limit with counter) · Deficiency Level (required) · Category (required) · Incident Type · Location label (required) · Capture Location — "Use Current Location" and "Pin on Map" · Attachments/Photos, prefilled with the checklist item's photo.

**Right — Source Checklist Item (read-only, auto-populated):** Form · Checklist · Section · Item ID · Item Description · Response (NO SAT pill) · Inspection Type · Inspection Date · Inspector · Remarks/Location. Plus the blue explainer box, verbatim from the mockup.

Red banner at top, verbatim: *"You are creating an incident from a NO SAT item. The item details and remarks will be included in the incident."*

Footer: "Proceed to Incident Management after creating this incident" checkbox (default checked) · Cancel · Create Incident.

**Offline:** the modal must work offline — queue the incident like a checklist submission, assigning a provisional reference reconciled server-side on sync.

## 9. Incident Management page

Per mockup. Header strip: status pill, level, Incident ID, Date Reported, Reported By, Department, Assigned To, Due Date.

**Tabs:** Incident Details · Location · Photos & Attachments · Actions & Updates · History · **Work Orders** *(added — Annex H is its own approved form and needs a home)*

**Main column:** Source Information card (read-only, from the checklist) · Incident Description card (Issue/Remarks, Level, Category, Incident Type, Potential Impact, Immediate Action Taken) · Incident Location card with Leaflet map, draggable pin, lat/long/accuracy/captured-at, and the "You can drag the pin to adjust the exact location" note (BACC §7 requires the pin be adjustable — the reporter may not be standing at the incident) · Related Checklist Item table with a View Checklist link back to the source submission.

**Right sidebar:** Status & Workflow (status, level, workflow stepper) · Assignment (assigned to, CC, assigned date) · Target Resolution (due date, SLA remaining) · Quick Actions (Add Update, Change Status, Close Incident).

**Work Orders tab:** list of work orders with number, assignee, target date, status; "Issue Work Order" action prefills NOC Reference No., Deficiency Level, Description, and Location from the incident; each work order opens a form covering the full Annex H field set including the completion record, with Export Annex H.

**SLA:** derived from `target_date`. Amber inside the warning window, red when overdue, matching the mockup's treatment. Default target days per level are configuration, pending BACC's level definitions.

## 10. Export engine extension — register mode

Annex D is a **fixed-field** template. Annex G is a **repeating-row register**. The Phase 1 field-map format handles the former; extend it with a `register` mode:

```json
{
  "templateKey": "annex-g-noc-register",
  "templateVersion": "ed01",
  "basePdf": "annex-g-noc-register-ed01.pdf",
  "mode": "register",
  "table": {
    "firstRowY": 560,
    "rowHeight": 22,
    "rowsPerPage": 18,
    "overflow": "repeat-base-page",
    "columns": {
      "noc_no":            { "x": 52,  "width": 42 },
      "date":              { "x": 96,  "width": 52 },
      "source_inspection": { "x": 150, "width": 78 },
      "level":             { "x": 230, "width": 40, "align": "center" },
      "description":       { "x": 272, "width": 132, "wrap": true, "maxLines": 2 },
      "assigned_to":       { "x": 406, "width": 84 },
      "target_date":       { "x": 492, "width": 60 },
      "closed_date_notes": { "x": 554, "width": 90, "wrap": true, "maxLines": 2 }
    }
  }
}
```

`overflow: "repeat-base-page"` appends another copy of the blank base page and continues rows when a period exceeds one page — the approved page is reused rather than a synthesised continuation, keeping every page an approved artifact.

Annex H uses ordinary fixed-field mode, identical in shape to Annex D's map.

The coordinate-mapping tool needs a register mode too: place the first row band and column x-positions, set row height and rows per page, then preview with sample rows.

### Export endpoints

- `/api/export-noc-register` — date range (default current month), renders all incidents as rows, paginating across repeated base pages
- `/api/export-work-order` — one work order to Annex H

Register exports are period snapshots, so they are generated on demand rather than stored immutably. Work-order exports follow Phase 1's rule: generated on completion, stored, and served thereafter from storage.

## 11. Geo-location (BACC §7)

Capture current coordinates where permissions allow; **always** allow manual pin adjustment. Store latitude, longitude, accuracy, capture timestamp, capture method (`gps` / `map_pin` / `manual`), and whether the user adjusted the pin.

Reuse the prior project's Leaflet and offline map-tile work. Offline, fall back to coordinates plus the location label; render the map when tiles are available.

## 12. Acceptance criteria

- [ ] Create Incident from a NO SAT item; source fields auto-populate and the checklist response is unchanged
- [ ] Incident carries a permanent bidirectional link to its checklist item
- [ ] Geo-location captured by GPS and by pin, pin draggable, capture method recorded
- [ ] Incident progresses through all five lifecycle states
- [ ] Work order issued against an incident with NOC reference prefilled
- [ ] Annex H export matches the approved source page-by-page (`npm run verify:pdf`)
- [ ] Annex G register export renders multiple incidents as rows and paginates correctly across a repeated base page
- [ ] Closure blocked without a linked re-inspection showing the item back at SAT
- [ ] Work order blocked from verified when area not cleared, NOTAM missing, or CEC clearance outstanding
- [ ] Incident creation works offline and syncs on reconnect

## 13. Open items

- **Deficiency Level 1–4 definitions and ordering — needed from BACC.** Blocks colour coding, sort order, and SLA defaults. Do not guess which end is most severe.
- NOC No. format — prefixed or bare number in the register column
- Category and Incident Type taxonomies — seed from BACC's terminology; the two mockups are inconsistent
- SLA target days per level — depends on the level definitions
- Whether "Issued by OM or COO" should be restricted by role, and whether CEC clearance requires a distinct CEC role
- Minor: the mockup's sidebar reads "Locuments" — should be "Documents"
