# BACC Operations Management Portal — Annex D Slice, Phase 1 Design (v2)
**Checklist Engine + Approved-Format PDF Export + App Foundation**

Date: 2026-08-14 (v2 supersedes v1 of the same date)
Status: Approved
Project: Belize Airport Concession Company (BACC) — Philip S.W. Goldson International Airport (PGIA)
Repo: `bacc-project-main` → GitHub → Vercel + custom domain

> **v2 changes from v1.** PDF export switched from HTML + headless Chromium to **overlay onto the approved form as a base PDF template**, per BACC's technical requirements §8. Sign-off switched from typed name to **drawn signature capture**. Added template versioning, record immutability, assignment rules, and geo-location. Delivery model changed to **per-annex vertical slices**. Reason: discovery of `BACC Docs`, containing BACC's own technical requirements document, a functional requirements spreadsheet, and 31 approved forms.

## 1. Governing Documents

This spec is subordinate to two client-authored documents. Where they conflict with anything here, **they win**:

- `BACC Docs/BACC_Digital_Checklist_Technical_Requirements_v1.docx` — Technical Requirements, Digital Checklist Engine & Approved-Format Export, v1.0
- `BACC Docs/BACC_Requirement Checklist_OMP_2026.xlsx` — Functional Requirements Checklist v1.0/v1.1

**BACC's non-negotiable rule (§14), reproduced verbatim in spirit:** checklist content and the printable record are controlled business documents. Do not modify wording, item numbering, section order, form identifiers, revision information, signatures, or layout for convenience. Any change to an approved form is a controlled configuration change requiring BACC validation.

## 2. Delivery Model — Per-Annex Vertical Slices

Each annex is delivered as a self-contained slice running its own phases:

- **Slice phase 1** — the checklist: configuration, interactive fill UI, validation, approved-format export
- **Slice phase 2** — incidents: NOC creation from NO SAT items, geo-location, work orders
- **Slice phase 3** — reporting, approvals, notifications for that annex

**Annex D (Duty Manager, `PGIA-PMM-F04`) is slice one** and is in progress.

Slice one is disproportionately heavy because it builds all shared infrastructure — auth, the template engine, the overlay export pipeline, the incident module, the coordinate-mapping tool. Every subsequent slice reuses that infrastructure and is predominantly configuration: a base PDF, a field map, a content schema, and a proofing pass.

## 3. Form Inventory — 31 Approved Forms, Two Families

**Family 1 — Annex 1-1 / PGIA 16-14** (Maintenance Paved & Unpaved Manual). Annexes A–K, forms `PGIA-PMM-F01`–`F11`. Annex L is a reference document, not a form.

A/F01 Daily Routine Inspection (5p, CFR) · B/F02 Operational Control Inspection (5p, Apron Sup) · C/F03 Technical Oversight Field Record (6p, Civil Eng) · **D/F04 Drainage System Inspection (3p, Duty Manager)** · E/F05 Aerodrome Sign Inspection (3p, Apron Sup) · F/F06 Unpaved Area Routine (3p, Apron Sup) · **G/F07 Deficiency & NOC Register (1p, OM)** · **H/F08 Maintenance Work Order & Completion Record (1p, OM)** · I/F09 Grass-Cutting Activity Log (1p, OM) · J/F10 Construction Area Daily Safety (3p, Apron Sup) · K/F11 Construction Safety Plan Template (6p, General)

**Family 2 — Annex 1-2 / PGIA 16-15** (Visual Aids & Electrical Systems). Appendices C-1 to C-20, documents `PGIA-CL-VAES-01`–`20`. Distinct header and a Document No. / Frequency control block absent from Family 1. Frequencies run daily through annual.

The engine must handle both families. Validate the overlay approach against one form from each before committing to all 31.

## 4. Tech Stack

Vite + React 19 + React Router + Tailwind, Supabase (Auth/Postgres/Storage/Realtime), `vite-plugin-pwa` + Workbox for offline, deployed to Vercel with serverless functions under `/api`. Leaflet for maps (reusing the prior project's offline map-tile work).

**No headless Chromium.** The overlay approach removes that dependency entirely, along with its bundle-size limits, cold starts, and font-matching risk.

## 5. Approved-Format Export — Overlay Pipeline

Per BACC §8: *"Use the approved form as the controlled base template/background or fixed-layout PDF template. Overlay captured values, SAT/NO SAT marks, remarks, signatures and dates into predefined positions."*

Each form comprises three artifacts:

1. **Base PDF** — the blank approved form, stored as an immutable versioned asset (`annex-d-drainage-ed01.pdf`)
2. **Field map** — coordinates for every dynamic value
3. **Content schema** — sections and items driving the interactive UI

Export loads the base PDF with **`pdf-lib`**, stamps values at mapped coordinates, appends continuation/attachment pages where required, and returns the result. Because the base document *is* the approved artifact, fidelity is guaranteed by construction rather than achieved by imitation.

### Field map format

```json
{
  "templateKey": "annex-d-drainage",
  "templateVersion": "ed01",
  "basePdf": "annex-d-drainage-ed01.pdf",
  "fields": {
    "inspection_date":  { "page": 0, "x": 210, "y": 646, "size": 9 },
    "inspection_type.monthly_routine": { "page": 0, "x": 331, "y": 619, "type": "mark" },
    "conducted_by":     { "page": 0, "x": 210, "y": 590, "size": 9, "lines": 2 },
    "DR-04.sat":        { "page": 0, "x": 402, "y": 385, "type": "mark" },
    "DR-04.no_sat":     { "page": 0, "x": 447, "y": 385, "type": "mark" },
    "DR-04.remarks":    { "page": 0, "x": 500, "y": 392, "width": 150, "height": 24,
                          "wrap": true, "maxLines": 2, "overflow": "continuation" },
    "inspector_signature": { "page": 2, "x": 105, "y": 355, "type": "image", "width": 160, "height": 34 },
    "om_signature":        { "page": 2, "x": 470, "y": 355, "type": "image", "width": 160, "height": 34 }
  }
}
```

Coordinates are PDF points with a **bottom-left origin** (`pdf-lib` convention), not top-left. This is the most common source of misplacement bugs.

### Overflow handling (BACC §10)

Remarks wrap inside the approved field without overlapping neighbours. Fields must never be resized and fixed sections must never be moved to accommodate longer text. When content exceeds its box, truncate visibly in place with a continuation marker (e.g. `— see continuation p.4`) and render the full text on an appended continuation page.

### Generation and retention

Generate server-side in a Vercel function (`/api/export-checklist-pdf`) on submission. Store the resulting PDF in Supabase Storage keyed to submission ID plus template version; downloads serve the stored artifact so a submitted record's PDF is fixed permanently. `pdf-lib` is pure JavaScript with a small footprint — no special runtime configuration required.

*Note for a later slice:* because `pdf-lib` also runs in the browser and the base PDF can be precached by the service worker, offline export becomes technically feasible. Not in scope now — the server-generated artifact remains the canonical record.

## 6. Coordinate-Mapping Tool (build before mapping form #2)

A dev-only route that loads a base PDF, renders it via `pdf.js`, lets a developer click to place fields and assign field keys, previews sample values in position, and exports the field-map JSON. Mapping 31 forms by hand versus through a tool is the difference between a week and a month. Decision taken: **build the tooling first, measure real per-form time on Annex D plus one VAES form, then scope the remaining templates from actual numbers.**

## 7. Data Model (Supabase)

```sql
-- Templates are versioned; submissions pin the version used.
create table checklist_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null,                       -- 'PGIA-PMM-F04'
  version text not null,                    -- 'ed01'
  title text not null,
  annex_label text,                         -- 'Annex D'
  document_family text not null,            -- 'PMM' | 'VAES'
  department text,
  content_schema jsonb not null,
  field_map jsonb not null,
  base_pdf_path text not null,
  effective_date date,
  status text not null default 'active'     -- active | retired
    check (status in ('active','retired')),
  unique (code, version)
);

-- Assignment rules: who sees which checklist, when (BACC §3, §4).
create table checklist_assignment_rules (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references checklist_templates(id),
  department text,
  role text,
  location_id uuid,
  frequency text check (frequency in
    ('daily','weekly','monthly','quarterly','semi_annual','annual','ad_hoc')),
  inspection_type text,
  due_time time
);

create table checklist_submissions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references checklist_templates(id),
  template_version text not null,           -- pinned; never follows template updates
  location_id uuid,
  inspector_id uuid not null references auth.users(id),
  inspection_type text not null,
  inspection_date date not null,
  rainfall_mm numeric,
  status text not null default 'draft'
    check (status in ('draft','submitted','acknowledged')),
  deficiencies_summary text,
  exported_pdf_path text,
  content_hash text,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  locked boolean not null default false
);

create table checklist_items (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references checklist_submissions(id) on delete cascade,
  item_code text not null,                  -- 'DR-04'
  result text check (result in ('sat','no_sat','na')),
  remarks text,
  photo_url text
);

create table checklist_signoffs (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references checklist_submissions(id) on delete cascade,
  role text not null check (role in ('inspector','om_acknowledgment')),
  name text not null,
  position text,
  signature_image_path text,                -- drawn signature PNG
  signed_at timestamptz not null default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  actor_id uuid references auth.users(id),
  detail jsonb,
  created_at timestamptz not null default now()
);
```

**Immutability (BACC §11).** Submitted records are never overwritten. Set `locked = true` on submission; corrections create a new submission referencing the original. Every create, edit, submit, and acknowledgment writes to `audit_log`.

**`result` includes `'na'`** because the requirements spreadsheet specifies Pass/Fail/N/A. Annex D has no N/A column — the engine supports it, the Annex D schema does not enable it.

## 8. Checklist Template Engine

Content schema drives the interactive UI; the field map drives the export. Annex D's schema lives at `src/data/checklists/annex-d-drainage.json` — sections, item codes DR-01 to DR-27, exact source wording, header fields, footer, signoff blocks.

Adding a form = base PDF + field map + content schema + proofing pass. **No engine changes.** BACC acceptance criterion #1: configure `PGIA-PMM-F04` without hard-coding individual questions.

**Validation:** every item marked NO SAT requires non-empty remarks before submission (BACC §5, acceptance criterion #4).

**NO SAT handling (BACC §5):** marking NO SAT surfaces the warning *"This item has been marked NO SAT. Please provide remarks and select an action."* and, where configured, offers **Create Incident**. Creating an incident must not alter or remove the original response; the checklist stays linked to the incident for traceability.

## 9. Sign-off

Drawn signature capture (signature pad) for both the inspector and OM acknowledgment, stored as PNG in Supabase Storage and stamped into the approved form's signature area via `pdf-lib`'s image embedding. Captured alongside name, position, and server timestamp.

## 10. Offline / PWA

App shell precached via `vite-plugin-pwa`. Submissions and photo uploads queue in IndexedDB (`idb`) and sync on reconnect. Compress photos client-side (~1600px, JPEG 0.8) before queueing and call `navigator.storage.persist()` — uncompressed camera images will otherwise exhaust quota and risk eviction of an inspector's queued work.

Confirm inspector device types before finalising sync design: iOS PWAs have no Background Sync API and evict storage after roughly 7 days idle, so sync must be foreground-triggered on app open and `online` events.

## 11. Incidents (slice phase 2 — designed separately)

Confirmed direction: mirror the approved forms rather than inventing a model.

- **Annex G / `PGIA-PMM-F07`** — Deficiency and Notice of Condition (NOC) Register. Maintained by OM, one row per deficiency from any inspection type. NOC No., Date, Source Inspection, **Level 1–4**, Description/Location.
- **Annex H / `PGIA-PMM-F08`** — Maintenance Work Order and Completion Record. Issued by OM to CEC/EEC/Maintenance. Carries **NOC Reference No.**, Deficiency Level, Target Completion Date, NOTAM-required flag, and a completion record.

Two entities: NOC is the deficiency record; work orders are raised against it. Lifecycle: Open → Assigned → In Progress → Resolved → Verified/Closed.

Incident creation inherits checklist, section, item, user, department, date/time, remarks, and evidence (BACC §6), and retains a permanent relationship to the originating checklist response.

**Geo-location (BACC §7):** capture current coordinates where permissions allow, and always allow the user to adjust the pin — the reporter may not be standing at the incident location. Store latitude/longitude, capture timestamp, capture method, and any user-adjusted position.

## 12. Acceptance Criteria (BACC §12)

1. Configure `PGIA-PMM-F04` without hard-coding individual questions
2. Represent all five sections and DR-01 through DR-27
3. Capture SAT/NO SAT for applicable items
4. Require remarks when NO SAT is selected
5. Allow linked incident creation from NO SAT
6. Carry source checklist information into the incident
7. Support incident map pin/location
8. Generate an approved-format PDF
9. Preserve source form structure, numbering, headers, sections, footer/revision information
10. Retain template version with historical records
11. **Complete page-by-page comparison of generated PDF against the approved source before production**

Automate #11: rasterise generated and source PDFs at matching DPI (`pdftoppm`) and diff with `pixelmatch`. Turns fidelity into a number and gives regression protection on every template change.

## 13. Open Items

- `DR-17`/`18`/`19` carry literal `[Location 1..3]` placeholders — confirm with BACC whether these become named culverts or per-submission fill-in
- **Severity scale conflict:** Annex G specifies Level 1–4; the requirements spreadsheet specifies Low/Medium/High/Critical. The approved form should govern — confirm
- OM acknowledgment sits in contracted Phase III but Annex D's signature block needs it — decide whether a minimal acknowledgment ships in the Annex D slice
- `BACC_logo.jpeg` is 350×87; request vector/high-res if needed above header size
- Confirm inspector device types (iOS vs Android) before finalising offline sync
- Validate overlay against one PMM form and one VAES form before committing to all 31
- Commercial: 31 templates is the largest work item in the project — re-scope from measured per-form time once the mapping tool exists
