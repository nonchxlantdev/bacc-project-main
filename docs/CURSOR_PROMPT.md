# Cursor Prompt — BACC Airport Portal, Phase 1

Paste everything below into Cursor's agent chat (Composer/Agent mode) with this folder open and empty:
`D:\Entrepreneur\Vision Forge Ltd\Airport Authorit Project\bacc-project-main`

---

You are building **Phase 1** of a new airport operations portal for the Belize Airport Concession Company (BACC), which manages Philip S.W. Goldson International Airport (PGIA). This is a brand-new repo — build from scratch, don't reference or copy any other project.

Full context: this repo already contains `docs/superpowers/specs/2026-08-14-checklist-pdf-portal-phase1-design.md` (the approved design spec — **read it first**, it's the source of truth for architecture decisions) and `src/data/checklists/annex-d-drainage.json` (the real content for the first checklist, transcribed from the official source PDF — use it verbatim, do not invent or reword checklist items). Brand logo files are already at `src/assets/brand/PGIA_logo.png` and `src/assets/brand/BACC_logo.jpeg`.

## What Phase 1 delivers

A working portal where an inspector logs in, fills out the "Drainage System Inspection Checklist" (Annex D, form PGIA-PMM-F04), attaches photos to failed items, and exports a PDF that matches the source document's layout **exactly** — this exact-match requirement exists because the exported PDF has to be accepted as an official compliance record, so treat visual fidelity as a hard requirement, not a nice-to-have.

## 1. Project setup

- Scaffold with Vite + React 19 (`npm create vite@latest . -- --template react`)
- Install: `react-router-dom`, `@supabase/supabase-js`, `tailwindcss` + `@tailwindcss/vite`, `lucide-react`, `idb`, `vite-plugin-pwa`
- Set up Tailwind via the Vite plugin (not the PostCSS CLI flow) per Tailwind's current Vite integration docs
- Add a `vercel.json` if needed for the serverless function config (see §5)
- `.env.example` with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

## 2. Design tokens (starting point — adjust once you can compare against the real brand assets)

Base the palette on the BACC/PGIA brand: deep navy for the header/sidebar (`#0B1E3D`–`#0E2447` range), a mid blue for links/primary actions (`#1E5FA8` range), the PGIA logo's teal accent (`#2FBFA0` range) for highlights only, red for NO-SAT/alert states (`#D64545` range), green for SAT/success (`#2E9E5B` range). Light gray-blue (`#F3F6FA` range) for table row striping, matching the checklist table's alternating rows in the source PDF. Configure these as Tailwind theme tokens, not one-off hex values scattered through components.

## 3. Data model — Supabase

Write these as SQL files under `supabase/migrations/` (don't try to run them — the user will apply them to their own Supabase project):

```sql
create table checklist_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  annex_label text,
  schema jsonb not null,
  print_template_key text not null,
  active boolean not null default true
);

create table checklist_submissions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references checklist_templates(id),
  location_id uuid,
  inspector_id uuid not null references auth.users(id),
  inspection_type text not null check (inspection_type in ('monthly_routine','semi_annual_cec','post_storm_emergency')),
  inspection_date date not null,
  rainfall_mm numeric,
  status text not null default 'draft' check (status in ('draft','submitted')),
  deficiencies_summary text,
  created_at timestamptz not null default now(),
  submitted_at timestamptz
);

create table checklist_items (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references checklist_submissions(id) on delete cascade,
  item_code text not null,
  result text check (result in ('sat','no_sat')),
  remarks text,
  photo_url text
);

create table checklist_signoffs (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references checklist_submissions(id) on delete cascade,
  role text not null check (role in ('inspector','om_acknowledgment')),
  name text not null,
  position text,
  signed_at timestamptz not null default now()
);
```

Add RLS policies (authenticated users can read/write their own submissions; refine later — don't over-engineer roles in Phase 1). Add a Supabase Storage bucket reference for checklist photos (name it `checklist-photos`).

Seed `checklist_templates` with one row for Annex D using the content in `src/data/checklists/annex-d-drainage.json` as the `schema` value, `print_template_key: 'annex-d-drainage'`.

## 4. Checklist template engine

Build this generically — Annex D is the first template, not the only one ever.

- `src/lib/checklistSchema.js` — types/shape documentation for a template JSON (sections → items, headerFields, footer, signoffs) matching `annex-d-drainage.json`'s structure
- `src/components/checklist/ChecklistForm.jsx` — generic renderer: reads a template's schema, renders header fields, then each section as a navy header bar + table of items (SAT / NO-SAT radio pair + remarks input + photo upload, matching the reference screenshot's layout — item code + description on the left, SAT/NO-SAT columns, remarks/location column, and a right-hand detail panel that opens for the selected NO-SAT item showing "Create Incident from this item?" as a disabled/placeholder button for now — Incidents is Phase 2, don't build it, just leave the UI affordance visually present but non-functional with a tooltip noting "Coming in a future update")
- `src/components/checklist/ChecklistItemRow.jsx`, `StatusPill.jsx`, `PhotoUpload.jsx`, `SignoffBlock.jsx`, `SectionHeader.jsx` as shared pieces
- Validation: block submission if any item marked `no_sat` has empty remarks. Surface this the same way the reference screenshot does — a banner calling out the specific unresolved item.

## 5. PDF export — pixel-exact to the source document

This is the highest-stakes part of Phase 1. Build:

**a) A print-template HTML component** (`src/components/checklist/print-templates/AnnexDDrainagePrint.jsx` or a plain HTML+CSS string generator, your call) that reproduces the source PDF's exact structure:
- Header row: BACC logo top-left (`src/assets/brand/BACC_logo.jpeg`), centered two-line title "AERODROME OPERATIONS MANUAL" / "PHILIP S.W. GOLDSON INTERNATIONAL AIRPORT" in bold, top-right "ANNEX 1-1" / "PGIA 16-14" stacked right-aligned with the PGIA logo (`src/assets/brand/PGIA_logo.png`) beneath it
- "ANNEX D" as a full-width navy bar, "Drainage System Inspection Checklist" centered bold below it, italic form number "Form: PGIA-PMM-F04" centered, then the description line
- A bordered info grid: Date / Inspection Type (three checkbox options inline) / Conducted by / Rainfall — matches the source's boxed field layout, not a generic form
- Each section: full-width navy bar with white text ("SECTION 1 — RUNWAY DRAINAGE" etc.) with SAT / NO SAT / Remarks-Location as the three right-hand column headers, then item rows with alternating light-blue/white striping, actual checkbox glyphs (☐ unchecked, ☑ checked) — not native HTML checkboxes, since this needs to render identically inside a headless-Chromium PDF print
- The "DRAINAGE DEFICIENCIES FOUND" bordered text box at the end
- Two-column signature block: "Conducted by (Name / Position / Signature)" and "OM Acknowledgment (Name / Signature / Date)", each with a "Date: ___" line
- Footer on every page: "Review: Ed. 01 Annex 2-1" left, "Date: March 12, 2026. Maintenance Paved and Unpaved Manual." centered, page number bottom-right in the literal "110 | P a g e" / "111 | P a g e" / "112 | P a g e" style (page numbers come from `annex-d-drainage.json`'s `footer.pages` array) — the header repeats top-of-page too ("ANNEX 1-1 / PGIA 16-14" + "AERODROME OPERATIONS MANUAL" line), same as the source PDF's repeating running header
- Use `@page` CSS and print-specific sizing (Letter or A4 — check the source PDF's page dimensions and match) so pagination breaks land in the same places as the source (Section 1+2 on page 1, Section 3+4+5 and deficiencies on page 2, signatures alone on page 3)

**b) A Vercel serverless function** `api/export-checklist-pdf.js`:
- Accepts a submission ID (or the fully-merged HTML) via POST
- Uses `playwright-core` + `@sparticuz/chromium` (the standard combo for headless Chromium on Vercel's Node runtime) to load the print-template HTML and print to PDF
- Returns the PDF as a binary stream with appropriate `Content-Type`/`Content-Disposition` headers
- Set a realistic `maxDuration` in `vercel.json` for this function (cold Chromium starts can take a few seconds)

Do not use `html2canvas` or client-only screenshot approaches — the exact-match requirement needs real CSS/font rendering via a browser engine, which is why this is a server-side render, not a client trick.

## 6. Pages & routing

React Router routes: `/login`, `/dashboard`, `/checklists/mine`, `/checklists/all`, `/checklists/:id` (fill/detail/export view), `/locations`, `/users`, `/settings`. Sidebar nav also lists `Incidents`, `Reports`, `Documents` — route these to a simple "Coming soon" placeholder page for now; don't build their logic.

Match the reference screenshot's shell: dark navy top bar with BACC logo + wordmark, user avatar/role in the top-right, dark navy left sidebar with icon+label nav items, light content area.

## 7. Offline / PWA

Configure `vite-plugin-pwa` to precache the app shell. Build `src/utils/offlineQueue.js` (IndexedDB via `idb`) so a checklist submission (including pending photo uploads) queues locally when offline and syncs to Supabase automatically on reconnect — mirror the pattern of a typical background-sync queue: write locally first, mark `pending_sync`, flush the queue on an `online` event listener. PDF export requires connectivity — if offline, let the user save the submission and show "Export available once you're back online."

## 8. Auth

Supabase Auth, email/password. On checklist submission, the "Conducted by" signoff auto-fills from the logged-in user's profile (name + position) with a server timestamp — no drawn signature in Phase 1.

## 9. Acceptance checklist — verify before calling Phase 1 done

- [ ] Inspector can log in, open Annex D checklist, fill all 5 sections + header fields + deficiencies + photo on a NO-SAT item, and submit
- [ ] Submitting with an unremarked NO-SAT item is blocked with a clear inline error
- [ ] Exported PDF, opened side-by-side with the source `DM_1.pdf`, matches: header layout, both logos in the right positions, navy section bars, table structure/striping, footer text and page numbers, signature block layout
- [ ] Submission works with network disabled, then syncs once reconnected
- [ ] `npm run build` produces a deployable static site + working `/api` function locally under `vercel dev`

## Notes / open items to flag back to the user, don't silently decide

- `DR-17`/`18`/`19` contain literal `[Location N]` placeholder text in the source form — confirm whether these should become real named culvert locations before go-live
- The BACC logo asset (`BACC_logo.jpeg`, 350×87) is low-res if it needs to render larger than header size anywhere
- Additional Annex checklists beyond Annex D will be added later as new template JSON + print-template files, following this same pattern — don't hardcode assumptions that Annex D is the only one
