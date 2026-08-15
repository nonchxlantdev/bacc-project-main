# BACC OMP — Phasing Options Compared

Date: 2026-08-14 · Decision aid, not yet a spec change

## Context discovered from `BACC Docs`

**31 fillable forms across two document families**, each with its own layout system, header block, and document-control scheme:

### Family 1 — Annex 1-1 / PGIA 16-14 (Maintenance Paved & Unpaved Manual)
Annexes A–K, forms `PGIA-PMM-F01`–`F11`. Annex L is a reference document, not a form.

| Annex | Form | Title | Pages | Role folder |
|---|---|---|---|---|
| A | F01 | Daily Routine Inspection Checklist | 5 | Crash Fire & Rescue |
| B | F02 | Operational Control Inspection Checklist | 5 | Apron Supervisor |
| C | F03 | Technical Oversight Inspection Field Record | 6 | Civil Engineer |
| **D** | **F04** | **Drainage System Inspection Checklist** | **3** | **Duty Manager** ← Phase 1 reference |
| E | F05 | Aerodrome Sign Inspection Checklist | 3 | Apron Supervisor |
| F | F06 | Unpaved Area Routine Inspection Checklist | 3 | Apron Supervisor |
| **G** | **F07** | **Deficiency and Notice of Condition (NOC) Register** | **1** | **Operations Manager** ← incidents |
| **H** | **F08** | **Maintenance Work Order and Completion Record** | **1** | **Operations Manager** ← work orders |
| I | F09 | Grass-Cutting Activity Log | 1 | Operations Manager |
| J | F10 | Construction Area Daily Safety Inspection Checklist | 3 | Apron Supervisor |
| K | F11 | Construction Safety Plan — Minimum Format Template | 6 | General |

### Family 2 — Annex 1-2 / PGIA 16-15 (Visual Aids & Electrical Systems)
Appendices C-1 to C-20, documents `PGIA-CL-VAES-01`–`20`. Different header and a document-control block (Document No. / Frequency) the PMM forms don't have.

Daily: C-11 Lighting Vault, C-16 CCR Log, C-2 Airfield Lighting Visual.
Weekly: C-12 Lighting Vault, C-18 Standby Generator.
Monthly: C-1 Safety Board & Equipment, C-3 Runway/Taxiway Light Fixture PMI, C-5 PAPI, C-7 Illuminated Guidance Signs, C-8 Wind Cone, C-9 Obstruction Light, C-13 Vault Insulation Resistance, C-17 CCR, C-19 Blackout Transfer Test.
Semi-annual: C-4 Runway/Taxiway Photometric, C-14 Lighting Vault.
Annual: C-6 PAPI Alignment, C-10 Obstruction Light Engineering, C-15 Vault Engineering.
Other: C-20 Construction Area Signage/Lighting/NAVAID.

**Implication:** "Department Checklist Configuration (XX Templates)" = 31 templates, each needing a base PDF, a coordinate field map, an item-content transcription, and a page-by-page proofing pass against the approved source. This is the single largest work item in the project and it is currently bundled inside one 4-week phase alongside the engine, incidents, and geo-location.

---

## Option A — Contract-aligned (your existing Phase I / II / III)

| Phase | Scope | Cost | Timeline |
|---|---|---|---|
| I | Login/Security, Dashboard, Departments, Projects, Users | $7,500 | 3 weeks |
| II | Checklist engine, 31 template configs, Incident Management, Geo-Location | $7,500 | 4 weeks |
| III | Approval Workflows, Reports, Notifications | $3,500 | 3 weeks |

Payment milestones: Contract signing 25% · Requirements gathering 15% · Core system demo 25% · Configuration complete 20% · UAT 10% · Go-live 5%.

**For:** Matches what BACC signed. No renegotiation, no explaining a changed plan, payments land where expected.

**Against:** The project's single riskiest unknown — whether an overlay export passes BACC's §11 page-by-page comparison — is not touched until Phase II. You would reach roughly 65% of collected payment before proving the thing the entire contract rests on. If fidelity fails acceptance, the remedy lands in the middle of the phase that also carries 31 templates.

Secondary concern: 4 weeks for engine + 31 templates + incidents + geo-location is optimistic. Even at 2–4 hours per form for mapping, transcription, and proofing, the templates alone are 60–120 hours.

---

## Option B — Technical sequencing (risk-first)

| Phase | Scope |
|---|---|
| 1 | Foundation + checklist engine + Annex D + overlay PDF export proven against source |
| 2 | Incidents (Annex G NOC + Annex H Work Order) + geo-location |
| 3 | Remaining 30 templates, Projects, approvals, reports, notifications |

**For:** Proves exact-match export in week one, when a failure is cheap. Everything downstream depends on that one capability working, so it should be settled first.

**Against:** Doesn't map onto the contracted milestones. "Core System Demonstration" and "Configuration Complete" no longer correspond to phase boundaries, which muddies invoicing and means a conversation with BACC about why the plan changed.

---

## Option C — Contract phases, risk-first spike (recommended)

Keep Option A's phase boundaries, scope, costs, and payment milestones exactly as contracted. Change one thing: build the Annex D overlay export as a spike during Phase I and present it at the **Core System Demonstration** milestone.

**Why this works:** The contract already has a demo milestone at 25% payment. Today that demo would show login, dashboard, and user management — none of which BACC is worried about. Showing them a generated Annex D PDF laid against their approved source is a far stronger demo, and it converts the project's biggest technical unknown into a settled question before Phase II begins. Cost is a few days inside Phase I, not a restructure.

**Also recommended alongside it, regardless of option:**

- Renegotiate or explicitly stage the 31 templates. Options: treat Phase II as engine + a defined subset (say the 6 PMM inspection checklists), and price remaining templates as a per-form rate in a Phase IV. This protects you from absorbing 100+ hours inside a fixed $7,500 phase.
- Build the coordinate-mapping tool before mapping form #2. Mapping 31 forms by hand is the difference between a week and a month.
- Note that Annex G and H are 1-page register/record forms, unlike the multi-page inspection checklists — they are the cheapest templates in the set and good second and third candidates after Annex D.

---

## Consequential open items

- **Deficiency Level 1–4** (Annex G) versus **Low/Medium/High/Critical** (requirements spreadsheet). These are different scales for what appears to be the same field. Confirm which governs; the approved form should win.
- **OM acknowledgment / approval workflow** sits in contracted Phase III, but Annex D's signature block and Annex H's completion record both need it. Decide whether a minimal acknowledgment ships earlier.
- **Digital signature** confirmed required (drawn capture, stamped into the PDF signature area).
- **Two layout families** mean two base-template patterns. Validate the overlay approach against one PMM form and one VAES form before committing to all 31.
