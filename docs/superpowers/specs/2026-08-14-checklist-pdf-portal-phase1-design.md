# BACC Airport Portal Revamp — Phase 1 Design
**Checklist Engine + Pixel-Exact PDF Export + App Foundation**

Date: 2026-08-14
Status: Approved (pending final spec review)
Project: Belize Airport Concession Company (BACC) — Philip S.W. Goldson International Airport (PGIA) operations portal
Repo: `airportauthorityproj-main` (currently on GitHub Pages, moving to Vercel + custom domain)

## 1. Background & Goal

The existing repo is an early trial/demo (`air-authority-project`) — a generic job/task management dashboard with mocked login, built as a single 95KB `src/main.jsx` file. It does not yet contain any of the checklist/inspection functionality this project actually needs.

The real goal: a portal where airport maintenance inspectors complete regulatory checklists (drawn from the *Aerodrome Operations Manual*, e.g. Annex D — Drainage System Inspection Checklist, form PGIA-PMM-F04) on web/mobile, and export completed checklists to PDF that **matches the source manual's layout exactly** — same header/logo placement, same navy section bars, same table structure, same footer/page numbering — because the exported PDF must be acceptable as an official compliance record alongside (or in place of) the paper/Word original.

This is a large system (design system, checklist engine, PDF export, incidents, reports, documents, locations, users). It is being built in phases. **This spec covers Phase 1 only.**

## 2. Phase 1 Scope

**In scope:**
- App foundation: proper routing (React Router) and component structure, replacing the monolithic `main.jsx`
- A reusable, data-driven checklist template engine
- Annex D (Drainage System Inspection Checklist) built as the first template, using real content from the supplied source PDF
- Pixel-exact PDF export for any checklist built on the template engine
- Core pages: Dashboard, My Checklists, All Checklists (list + fill/detail view), Locations (extends existing GPS/offline work), Users (basic), Settings
- Photo evidence upload on NO-SAT items, embedded in the exported PDF
- Sign-off as typed name/position + server timestamp (no drawn signature)
- Offline-first submission (existing PWA/IndexedDB queue pattern extended to checklists)

**Explicitly out of scope for Phase 1 (later phases):**
- Incidents module, including "Create Incident from NO-SAT item" (Phase 2)
- Reports, Documents modules, and full Users/Locations/Settings build-out (Phase 3)
- Additional Annex checklists beyond Annex D (added as data once source PDFs are supplied)
- Drawn/captured e-signatures
- SSO / advanced RBAC beyond Supabase Auth email+password

## 3. Tech Stack Decision

**Keep Vite + React 19 + Supabase.** Considered migrating to Next.js for built-in routing/API routes, but rejected: this app is 100% behind Supabase auth (no SEO/SSR need), and the existing offline-first PWA work (Workbox service worker via `vite-plugin-pwa`, hand-rolled IndexedDB queue/sync in `src/utils/offline*.js`) is real, working investment that a Next.js SSR model would fight against — offline support is fundamentally a static-shell problem, and Next's server-rendering default undermines it unless mostly disabled (at which point you've rebuilt a Vite-like SPA inside a heavier toolchain). Vercel serverless functions (needed for PDF rendering) work identically under a plain Vite + `/api` setup — Next.js is not required to get them.

**Additions:** React Router (client-side routing/pages), Tailwind CSS (replacing ad-hoc `styles.css` growth, faster to hit the target brand look than adopting a full component library mid-revamp).

## 4. Data Model (Supabase / Postgres)

- **`checklist_templates`** — `id`, `code` (e.g. `PGIA-PMM-F04`), `title`, `annex_label` (e.g. `Annex D`), `schema` (jsonb — see §5), `print_template_key` (which HTML print-template to use), `active`
- **`checklist_submissions`** — `id`, `template_id` (fk), `location_id` (fk), `inspector_id` (fk, Supabase auth user), `inspection_type` (`monthly_routine` / `semi_annual_cec` / `post_storm_emergency`), `inspection_date`, `rainfall_mm` (nullable), `status` (`draft` / `submitted`), `deficiencies_summary` (text), `submitted_at`
- **`checklist_items`** — `id`, `submission_id` (fk), `item_code` (e.g. `DR-04`), `result` (`sat` / `no_sat` / `null`), `remarks` (text), `photo_url` (nullable, Supabase Storage)
- **`checklist_signoffs`** — `id`, `submission_id` (fk), `role` (`inspector` / `om_acknowledgment`), `name`, `position`, `signed_at`

Photos land in a Supabase Storage bucket (reuse/extend the existing `job-attachments` bucket pattern and RLS policies already in `supabase/rls_policies.sql`).

## 5. Checklist Template Engine

Each annex is defined as JSON, not a hand-coded form component:

```json
{
  "code": "PGIA-PMM-F04",
  "title": "Drainage System Inspection Checklist",
  "annexLabel": "Annex D",
  "sections": [
    {
      "title": "SECTION 1 — RUNWAY DRAINAGE",
      "items": [
        { "code": "DR-01", "text": "Runway 07 end drainage swale clear of sediment, vegetation, and debris" },
        { "code": "DR-04", "text": "Runway west edge drainage channel (full length) free of blockage" }
      ]
    }
  ],
  "headerFields": ["date", "inspectionType", "conductedBy", "rainfallMm"],
  "footerNote": "Review: Ed. 01 Annex 2-1 | Date: March 12, 2026. Maintenance Paved and Unpaved Manual.",
  "pageRef": "ANNEX 1-1 / PGIA 16-14"
}
```

One generic renderer reads this to draw both the on-screen fill-in form and (merged with submission data) the print-template HTML used for PDF export. Item codes (DR-01 … DR-27) and section text are transcribed from the supplied Annex D PDF. Validation rule carried over from the source form: any item marked NO-SAT requires non-empty remarks before submission.

Adding a future annex = a new JSON file + a new print-template HTML file following this pattern. No engine changes required.

## 6. PDF Export Pipeline

1. On export, the client (or a server call) merges a submission's data with its template's JSON into the matching print-template HTML — built to reproduce the source PDF's exact structure: BACC logo top-left, "AERODROME OPERATIONS MANUAL / PHILIP S.W. GOLDSON INTERNATIONAL AIRPORT" centered, "ANNEX 1-1 / PGIA 16-14" + PGIA watermark logo top-right, navy `SECTION N` bars, striped table rows, checkbox glyphs for SAT/NO-SAT, footer with review/date/manual name and page numbers.
2. That HTML is POSTed to a Vercel serverless function (`/api/export-checklist-pdf`) running headless Chromium (`playwright-core` + `@sparticuz/chromium`, the standard combo for Puppeteer/Playwright on Vercel's Node runtime).
3. The function prints the HTML to PDF and streams it back for download. CSS-driven rendering via a real browser engine is far more reliable for exact reproduction (fonts, spacing, borders) than an `html2canvas` screenshot approach.
4. PDF export requires connectivity (server call) — offline users can save/queue a submission and export once back online.

## 7. Brand Assets (supplied)

- `PGIA_logo.png` — 3999×1676 RGBA PNG, transparent background, white/teal-gradient PGIA wordmark with silhouette treatment. Use for header watermark and dark-background contexts.
- `BACC.jpeg` — 350×87 JPEG, Belize Airport Concession Company Limited logo (full color). Usable at header size but low resolution for anything scaled larger — **flagged as a follow-up: request a higher-res or vector (SVG/EPS) version if BACC logo needs to appear larger than ~350px wide anywhere** (e.g. a login screen or large-format print).

Both saved for reference alongside this spec; to be placed in `src/assets/brand/` during implementation.

## 8. App Structure / Design System

Pages (React Router): `/dashboard`, `/checklists/mine`, `/checklists/all`, `/checklists/:id` (fill/detail view), `/locations`, `/users`, `/settings`. Incidents/Reports/Documents nav items exist but route to a "coming soon" placeholder until Phase 2/3.

Shared components: `SectionHeader`, `ChecklistItemRow` (SAT/NO-SAT toggle + remarks + photo), `StatusPill`, `PhotoUpload`, `SignoffBlock`. Tailwind CSS for styling, matching the navy/blue palette and layout already established in the current header/sidebar screenshot the project is targeting.

## 9. Offline Behavior

Checklist submissions and photo uploads queue in IndexedDB when offline (extending the existing `offlineQueue`/`offlineSync`/`offlineWrites` utilities) and sync to Supabase when connectivity returns, matching the current job-write queue pattern. The app shell continues to be precached via `vite-plugin-pwa`/Workbox so inspectors can open and fill a checklist with zero signal.

## 10. Auth & Sign-off

Supabase Auth (email/password), unchanged. Sign-off captured as the authenticated user's name + position (from their profile) and a server-generated timestamp — no drawn signature in Phase 1.

## 11. Error Handling

- Required-field validation before submission (all NO-SAT items need remarks; header fields required per template's `headerFields`)
- PDF export failures (serverless timeout, Chromium cold-start) surface a retry option; submission data itself is never lost (already saved to Supabase before export is attempted)
- Offline write conflicts follow the existing queue/sync conflict handling already in `src/utils/offlineSync.js`

## 12. Testing / QA

- Manual visual comparison of the generated Annex D PDF against the source PDF (side-by-side / overlay check for header, section bars, table structure, footer, page numbers)
- Form validation tests (NO-SAT-requires-remarks rule, required header fields)
- Offline queue tests: fill/submit a checklist with network disabled, confirm it syncs on reconnect

## 13. Open Follow-ups (not blocking Phase 1 start)

- Higher-resolution/vector BACC logo, if needed at larger display sizes
- Additional Annex PDFs, to be supplied later and added as new template JSON + print-template files
- Phase 2 (Incidents) and Phase 3 (Reports, Documents, full Users/Locations/Settings) specs to be brainstormed separately when Phase 1 is underway/complete
