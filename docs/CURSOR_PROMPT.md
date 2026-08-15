# Cursor Prompt — BACC OMP, Annex D Slice (v2)

> **v2 supersedes v1.** If you built anything against v1's HTML + headless Chromium PDF approach, stop and read §5 — the export method has changed to overlay-onto-approved-PDF. Remove `playwright-core`, `@sparticuz/chromium`, and any HTML print-template work.

Paste into Cursor's agent chat with `bacc-project-main` open.

---

You are building the **Annex D slice** of the BACC Operations Management Portal for the Belize Airport Concession Company, operator of Philip S.W. Goldson International Airport (PGIA).

**Read these first — they govern everything and outrank this prompt where they conflict:**

- `docs/superpowers/specs/2026-08-14-checklist-pdf-portal-phase1-design.md` — the approved design (v2)
- `docs/BACC_Digital_Checklist_Technical_Requirements_v1.docx` — the client's own technical requirements
- `src/data/checklists/annex-d-drainage.json` — Annex D content, transcribed from the approved source. **Use verbatim. Never reword, renumber, or reorder.**

Brand assets: `src/assets/brand/PGIA_logo.png`, `src/assets/brand/BACC_logo.jpeg`.
Base form PDF: `src/assets/forms/annex-d-drainage-ed01.pdf`.

## The non-negotiable rule

Checklist content and the printable record are **controlled business documents**. Do not modify wording, item numbering, section order, form identifiers, revision information, signature blocks, or layout — not for convenience, not for aesthetics, not to make code simpler. Any change to an approved form is a controlled configuration change requiring BACC's validation. If something seems wrong in the source, **flag it, do not fix it**.

## Delivery model

Each annex is a self-contained slice: checklist → incidents → reporting. Annex D is slice one and carries all shared infrastructure. There are **31 approved forms** across two document families (Annexes A–K with `PGIA-PMM-Fxx` numbering; Appendices C-1 to C-20 with `PGIA-CL-VAES-xx` numbering and a different header/control block). Build every abstraction so a new form is *configuration only*. Never hardcode Annex D assumptions.

## 1. Project setup

Vite + React 19. Install `react-router-dom`, `@supabase/supabase-js`, `tailwindcss` + `@tailwindcss/vite`, `lucide-react`, `idb`, `vite-plugin-pwa`, `pdf-lib`, `pdfjs-dist`, `leaflet`. Tailwind via the Vite plugin. `.env.example` with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

Two Supabase projects — staging and production. Vercel preview deploys must never write to production compliance records.

## 2. Design tokens

Navy header/sidebar (`#0B1E3D`–`#0E2447`), mid blue for primary actions (`#1E5FA8`), PGIA teal accent (`#2FBFA0`) for highlights only, red for NO SAT (`#D64545`), green for SAT (`#2E9E5B`), light gray-blue row striping (`#F3F6FA`). Configure as Tailwind theme tokens — no scattered hex values.

## 3. Data model

Write SQL to `supabase/migrations/`. Do not attempt to run it. Use the schema in the design spec §7 verbatim — `checklist_templates` (versioned, with `content_schema`, `field_map`, `base_pdf_path`), `checklist_assignment_rules`, `checklist_submissions` (pins `template_version`, has `locked`, `content_hash`, `exported_pdf_path`), `checklist_items` (result `sat`/`no_sat`/`na`), `checklist_signoffs` (with `signature_image_path`), `audit_log`.

Two rules that are not optional:

- **Immutability.** Submitted records are never overwritten. Set `locked = true` on submit; corrections create a new submission referencing the original.
- **Version pinning.** A submission renders forever against the template version it was completed under, never the current one.

Add RLS policies (authenticated users read/write their own submissions; OM role can acknowledge). Storage buckets: `checklist-photos`, `checklist-signatures`, `checklist-exports`, `form-templates`.

## 4. Checklist template engine

- `src/lib/checklistSchema.js` — the template JSON shape
- `src/components/checklist/ChecklistForm.jsx` — generic renderer driven entirely by `content_schema`
- Supporting components: `ChecklistItemRow`, `SectionHeader`, `StatusPill`, `PhotoUpload`, `SignaturePad`, `SignoffBlock`

Layout follows the reference screenshot: item code + description left, SAT / NO SAT columns, remarks/location column, navy section header bars, alternating row striping, and a right-hand detail panel for the selected item.

**Validation:** block submission when any `no_sat` item has empty remarks. Surface it as a banner naming the specific item.

**NO SAT behaviour:** show the warning *"This item has been marked NO SAT. Please provide remarks and select an action."* and offer **Create Incident**. Creating an incident must not alter or clear the original response.

**Field ergonomics — these matter more than they look.** Add a "mark all SAT" bulk action; most inspections pass everything and 27 individual taps is what makes field staff abandon a tool. Large tap targets, sticky section navigation, auto-save on every change.

## 5. Approved-format export — OVERLAY, not HTML rendering

This is the part that must be exactly right, and it is **not** an HTML-to-PDF render. Per the client's §8, the approved blank form is the base layer and captured values are stamped onto it at mapped coordinates.

**Do not use Puppeteer, Playwright, headless Chromium, html2canvas, or any HTML-rendering path.** The base PDF *is* the approved artifact; fidelity comes from using it directly.

### Pipeline

`api/export-checklist-pdf.js` — a Vercel serverless function that:

1. Loads the submission, its pinned template version, field map, and base PDF
2. Opens the base PDF with **`pdf-lib`**
3. Stamps each value at its mapped coordinate — text, SAT/NO SAT marks, embedded signature PNGs
4. Appends continuation/attachment pages for overflow text and photo evidence
5. Stores the result in the `checklist-exports` bucket keyed to submission + template version, and returns it

Downloads serve the stored artifact, so a submitted record's PDF is fixed permanently.

### Field map

Format is in the design spec §5. **Coordinates are PDF points with a bottom-left origin** — `pdf-lib`'s convention, not top-left. This is the single most common source of misplaced-field bugs; get it right once and document it in the mapping tool.

### Overflow — client §10

Remarks wrap inside the approved field and must never overlap neighbouring content. **Never resize a field. Never move a fixed section.** When text exceeds its box, truncate visibly with a continuation marker (`— see continuation p.N`) and render the full text on an appended continuation page.

## 6. Coordinate-mapping tool — build this BEFORE mapping Annex D

A dev-only route (`/dev/field-mapper`, excluded from production builds) that:

- Loads a base PDF and renders it with `pdf.js`
- Lets a developer click to place a field, assign a field key, and set type (text / mark / image), box width/height, wrap and max lines
- Previews sample values stamped in position
- Exports the field-map JSON

31 forms get mapped through this tool. Time spent here is repaid many times over. Build it first, then map Annex D with it — and log how long Annex D takes, since that number is being used to scope the remaining 30.

## 7. Fidelity verification harness

`scripts/pdf-diff.mjs` — rasterise the generated PDF and the approved source at matching DPI (`pdftoppm`), diff with `pixelmatch`, output a match percentage and a visual diff image per page. This is BACC acceptance criterion #11 ("complete page-by-page comparison before production") and it doubles as regression protection whenever a field map changes. Wire it into a `npm run verify:pdf` script.

## 8. Pages & routing

`/login`, `/dashboard`, `/checklists/mine`, `/checklists/all`, `/checklists/:id`, `/incidents` (slice phase 2 — placeholder for now), `/locations`, `/users`, `/settings`.

Checklist lists must respect `checklist_assignment_rules` — a user sees only what's assigned to their department, role, location, frequency, and schedule (client §4). Do not show every template to everyone.

Shell: navy top bar with BACC logo, user name/role top-right, navy left sidebar with icon+label nav, light content area.

## 9. Offline / PWA

`vite-plugin-pwa` precaches the app shell. `src/utils/offlineQueue.js` (IndexedDB via `idb`) queues submissions and photo uploads offline, flushing on `online` events and app open — **not** Background Sync, which iOS does not support.

Compress photos to ~1600px / JPEG 0.8 on capture before queueing, and call `navigator.storage.persist()`. Losing an inspector's queued offline work once will permanently kill trust in the tool.

## 10. Auth & sign-off

Supabase Auth, email/password. Sign-off uses **drawn signature capture** (signature pad) for both inspector and OM acknowledgment — stored as PNG, stamped into the form's signature area via `pdf-lib` image embedding, alongside name, position, and server timestamp.

## 11. Acceptance checklist

- [ ] Field-mapping tool works and produced Annex D's field map
- [ ] Inspector logs in and sees only assigned checklists
- [ ] Annex D renders from `content_schema` with zero hardcoded questions
- [ ] All 5 sections, DR-01 to DR-27 present and correctly numbered
- [ ] Submission blocked when a NO SAT item lacks remarks
- [ ] Drawn signature captured and embedded in the exported PDF
- [ ] `npm run verify:pdf` reports a high per-page match against the approved source
- [ ] Submitted records are locked; a correction creates a new record, original intact
- [ ] Submission works offline and syncs on reconnect
- [ ] `npm run build` + `vercel dev` both work

## 12. Flag back, do not decide alone

- `DR-17`/`18`/`19` contain literal `[Location 1..3]` placeholders in the approved source
- Severity scale conflict: Annex G says Level 1–4, the requirements spreadsheet says Low/Medium/High/Critical
- `BACC_logo.jpeg` is 350×87 — insufficient above header size
- Any place where matching the approved form seems to require changing it
