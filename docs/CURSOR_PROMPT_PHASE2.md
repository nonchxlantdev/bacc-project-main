# Cursor Prompt — BACC OMP, Annex D Slice, Phase 2 (Incidents)

Paste into Cursor's agent chat with `bacc-project-main` open. **Phase 1 must be working first** — this builds on its template engine, overlay export pipeline, and coordinate-mapping tool.

---

You are building **Phase 2 of the Annex D slice**: Incident Management for the BACC Operations Management Portal.

**Read first — these govern and outrank this prompt:**

- `docs/superpowers/specs/2026-08-14-incidents-noc-workorders-phase2-design.md` — the Phase 2 design
- `docs/superpowers/specs/2026-08-14-checklist-pdf-portal-phase1-design.md` — Phase 1 (v2), for the engine and export conventions
- `docs/BACC_Digital_Checklist_Technical_Requirements_v1.docx` — the client's requirements, especially §5 (SAT/NO SAT rules), §6 (incident traceability), §7 (geo-location)

Base forms: `src/assets/forms/annex-g-noc-register-ed01.pdf`, `src/assets/forms/annex-h-work-order-ed01.pdf`.

## The non-negotiable rule still applies

Annex G and Annex H are approved controlled documents. Do not change wording, field order, column order, or layout. If matching the form seems to require changing it, **flag it, do not fix it**.

## What you are building

An **Incident is a NOC** (Annex G register row). **Work orders** (Annex H) are raised against an incident — one incident can have several. Two entities, permanently linked.

Creating an incident **must never alter or clear** the originating checklist response.

## 1. Deficiency Level — do not invent an ordering

Severity is BACC's **Deficiency Level 1–4**, stored as a smallint. It is *not* High/Medium/Low.

**The annexes do not define what the levels mean, and it is unknown whether Level 1 is most or least severe.** Put the labels, colours, and SLA target days in `src/config/deficiencyLevels.js` as configuration with neutral defaults ("Level 1".."Level 4", neutral colour ramp). Do not encode an assumed severity ordering anywhere in logic — no `level <= 2 ? 'urgent'` shortcuts. When BACC supplies the definitions, only that config file should need to change.

## 2. Data model

Use the schema in the Phase 2 design §6 verbatim: `incidents`, `work_orders`, `work_order_signoffs`, `incident_updates`, `incident_attachments`. Write to `supabase/migrations/`; do not run it.

Points that matter:

- `incident_ref` (`INC-2026-0047`) and `noc_no` derive from **one** per-year sequence — do not create two independent counters
- Source linkage fields are denormalised onto the incident deliberately, so the register exports correctly even if a checklist is later superseded
- Work orders lock on completion, per Phase 1's immutability rule
- Both entities write to `audit_log`

## 3. Create Incident modal

Build to the mockup exactly. Opens from the NO SAT detail panel.

Left column editable (Title, Description with 500-char counter, Deficiency Level, Category, Incident Type, Location label, Capture Location buttons, Attachments). Right column read-only auto-populated source fields plus the blue explainer box. Red banner verbatim: *"You are creating an incident from a NO SAT item. The item details and remarks will be included in the incident."* Footer checkbox "Proceed to Incident Management after creating this incident", default checked.

Prefill Title from item description + location, Description from the item's remarks, and carry the item's photo into attachments.

**Must work offline** — queue like a checklist submission with a provisional reference reconciled on sync.

## 4. Incident Management page

Build to the mockup. Header strip, five mocked tabs **plus a sixth: Work Orders**.

Main column: Source Information (read-only) · Incident Description · Incident Location (Leaflet, draggable pin, lat/long/accuracy/captured-at, "You can drag the pin to adjust the exact location") · Related Checklist Item table linking back to the source submission.

Sidebar: Status & Workflow with the five-step stepper · Assignment · Target Resolution with SLA remaining · Quick Actions.

**Work Orders tab:** list plus "Issue Work Order". The work order form covers the complete Annex H field set — issue block *and* Work Completion Record (Description of Work Performed, Materials Used, Test/Verification Results, Area Cleared for Operations, CEC Written Clearance Issued) — with signature capture for OM/COO verification and CEC clearance.

## 5. Lifecycle and gates

`Open → Assigned → In Progress → Resolved → Verified/Closed`.

**Closure gate — enforce it.** Verified/Closed requires a linked re-inspection: a later submission of the same template where the same item code came back `sat`. Offer a "Link re-inspection" picker filtered to qualifying submissions. Block closure without one and explain why.

**Annex H operational gates — enforce these too.** Block a work order reaching `verified` when `area_cleared_for_operations` is false, or `notam_required` is true with no `notam_ref`, or CEC clearance is required and not issued. These are safety-of-operations fields.

## 6. Export engine — add register mode

Phase 1's field map handles fixed-field forms. **Annex G is a repeating-row register** and needs a new `mode: "register"` with a `table` block (first row Y, row height, rows per page, column x/width/wrap). Format is in the design §10.

Set `overflow: "repeat-base-page"` — when a period exceeds one page, append another copy of the blank approved base page and continue rows on it. Never synthesise a continuation page for the register; every page must be an approved artifact.

Extend the coordinate-mapping tool with register mode: place the first row band and column positions, set row height and rows per page, preview with sample rows.

Endpoints:

- `api/export-noc-register.js` — takes a date range (default current month), renders all incidents as rows, paginates. Generated on demand, not stored.
- `api/export-work-order.js` — one work order to Annex H. Generated on completion and stored, per Phase 1's rule.

Annex H is ordinary fixed-field mode — same map shape as Annex D.

## 7. Geo-location (client §7)

Capture GPS where permitted; **always** allow pin adjustment — the reporter may not be standing at the incident. Store latitude, longitude, accuracy, captured-at, capture method (`gps`/`map_pin`/`manual`), and whether the user moved the pin. Reuse Leaflet and offline tile handling. Offline, degrade to coordinates plus location label.

## 8. Acceptance checklist

- [ ] Incident created from NO SAT; source auto-populates; checklist response unchanged
- [ ] Bidirectional link between incident and checklist item
- [ ] GPS capture and pin capture both work, pin draggable, method recorded
- [ ] All five lifecycle states reachable, stepper reflects state
- [ ] Work order issued with NOC reference prefilled; full Annex H completion record captured
- [ ] `npm run verify:pdf` passes for Annex H against the approved source
- [ ] Register export renders multiple rows and paginates onto a repeated base page
- [ ] Closure blocked without a linked SAT re-inspection
- [ ] Work order blocked from verified when a safety gate is unmet
- [ ] Incident creation works offline and syncs

## 9. Flag back, do not decide alone

- Deficiency Level definitions and ordering — unknown, config only, no assumed logic
- NOC No. format (prefixed vs bare) in the register column
- Category and Incident Type taxonomies — the two mockups disagree; seed as configurable lookups
- SLA target days per level — depends on the level definitions
- Whether "Issued by OM or COO" and CEC clearance need distinct roles
- Sidebar nav label in the mockup reads "Locuments" — build it as "Documents"
