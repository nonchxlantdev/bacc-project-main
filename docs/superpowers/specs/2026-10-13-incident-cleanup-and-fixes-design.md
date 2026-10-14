# Incident page cleanup + submit/preview fixes — design

Date: 2026-10-13 · Status: approved in chat, awaiting spec review
Scope: three independent changes in one round. None alters an approved form's
content, wording or printed layout (BACC §14), and none changes a server-side rule.

---

## 1. Incident detail page cleanup (`src/pages/IncidentDetailPage.jsx`)

### Why
Staff found the page too much. Status shows 4 ways (strip badge, "Current Status"
select, stepper, "Change Status" select), Deficiency Level 3 ways, "Add update" 3
ways, plus a re-inspection select and a "More Actions" menu. The team wants
plain tick boxes instead of dropdowns.

### Tabs
- Keep: **Incident Details**, **Location**, **History**.
- Hide: **Photos & Attachments** and **Actions & Updates** behind two constants
  at the top of the page (`SHOW_PHOTOS_TAB = false`, `SHOW_UPDATES_TAB = false`).
  Code stays; one-line change brings either back. `?tab=photos|updates` in the URL
  falls back to `details` while hidden.
- Status changes keep writing an update row via `addIncidentUpdate` (unchanged),
  so the History tab keeps listing them.

### Right rail → one "Progress" card
Replaces the Status & Workflow, Assignment and Quick Actions cards. New component
`src/components/incidents/ProgressChecklist.jsx` (presentational; page passes the
incident, options and handlers).

| Step | Ticking it does | Enabled when |
|---|---|---|
| ☐ **Sent to a unit** — tick boxes Grounds / Electrical / Plumbing (Apron Supervisor sees only Operations Manager, as today). **One unit at a time**: ticking another moves the tick. Holds the **Due date** input and the SLA chip. | sets `assigned_unit` (+ `assigned_at` first time, as today) and moves status `open → assigned` once both a unit and a due date are set | always (while not closed) |
| ☐ **Work started** | status → `in_progress` | step 1 done |
| ☐ **Fixed** | status → `resolved` | step 2 done |
| ☐ **Checked and closed** | opens an inline confirm: "Is item {code} OK now (SAT)?" + optional note → **Yes, close it** records the SAT verification (same payload as today's `confirmVerification`) then status → `closed`, in that order | step 3 done |

Rules:
- A step's box is greyed (disabled, `aria-disabled`) until the step above is ticked.
- Only the **latest ticked** step can be unticked; unticking moves status back one
  step (e.g. `in_progress → assigned`). Unticking step 1 clears the unit and returns
  the incident to `open` (the due date is kept). Unticking "Checked and closed" is not offered
  (closed is final in the existing lifecycle).
- If a SAT re-inspection is already linked or the item is already verified, step 4
  skips the SAT question and just confirms closing.
- Every transition still goes through `incidentTransitionBlockers`; a blocker shows
  in the existing banner and the box does not tick.
- Real checkboxes (`<input type="checkbox">`) with ≥44px touch targets, labelled for
  screen readers.

### Removed from view
"Current Status" select, the stepper, "Change Status" button + select, "Link
re-inspection" select, "Close Incident" button, the rail's second Deficiency Level,
the "More Actions" menu, the separate "Assignment" card.

The "Related Checklist Item" `VerificationPanel` on the Details tab shrinks to one
line: **Item {code} · NO SAT | Verified SAT · View checklist** (link kept; verify/
withdraw buttons move into step 4).

### Unchanged
Top status strip, Details tab content (source info, description, level, impact,
immediate action, map), Edit Incident, Location tab, Create Incident modal, the
Worker's incident rules, `incidentLifecycle.js`.

---

## 2. Submitted checklists staying "Draft" (`src/pages/ChecklistDetailPage.jsx`)

### Cause (to be confirmed by reproduction first)
- `handleSubmit` has no error handling: if the save rejects, nothing is shown and
  the record stays a draft.
- Likely rejection on wildlife forms: their Date header is free text ("Date: _bn"),
  `save()` copies `header.date` into `inspection_date`, and the Worker accepts at
  most 10 characters there (`worker/data/rules.js` → `optionalText(..., 10)`).
  "October 13, 2026" fails. (A free-text value would fail a Postgres `date`
  column the same way.)
- Secondary: a pending 500 ms autosave of the draft can land after the submit.

### Fix
1. `handleSubmit`: wrap the save in try/catch; on failure show the server's message
   in the red banner, keep the form editable, keep local status `draft`. A
   `submitting` flag disables the Submit button while it runs.
2. New pure helper `recordInspectionDate(header, nowMs)` in `src/lib/belizeTime.js`
   (or `checklistSchema.js`): returns `header.date` if it is a valid `YYYY-MM-DD`,
   else the Belize date of `nowMs`. Used by both `save()` and `handleSubmit`. The
   typed header value is stored and printed exactly as entered.
3. Cancel the pending autosave timer when Submit starts (timer ref instead of the
   effect-local handle).

### Test
`tests/` unit test: for every template in the registry, build a draft with free-text
values in every date-like header field, mark it submitted, run it through
`validateRecordPayload` — all 36 must pass. Plus a test for `recordInspectionDate`.

---

## 3. PDF preview not showing

### Cause (to be confirmed in the browser first)
Since the Cloudflare move (Oct 8), `public/_headers` sends `object-src 'none'`,
`X-Frame-Options: DENY` and `frame-ancestors 'none'`. The blob preview inherits
`object-src 'none'`, which blocks the browser's PDF viewer in the iframe; the
Annex L reference PDF (a same-origin asset) is refused framing outright. Android
browsers also never render a PDF inside an iframe.

### Fix — render the preview ourselves with pdf.js
- Add `pdfjs-dist`. New `src/components/checklist/PdfPageCanvas.jsx` renders each
  page of a PDF (from bytes / blob URL) to a `<canvas>`, width-fitted, pages stacked.
- `PdfPreview.jsx` swaps its `<iframe>` for that renderer; same props, same toolbar
  ("Refresh preview"), same error line. The Annex L "View PDF" path uses it too.
- pdf.js and its worker are **lazy-loaded** only when a preview opens. The worker
  file is bundled by Vite (`?url` import) and served from our origin, so the current
  CSP (`script-src 'self'`) needs no change. Security headers stay as strict as now.
- Export PDF (download) is untouched; no change to export code, so the parity
  scripts are not required, but run them once anyway as a guard.

### Check
Reproduce the blank preview on production in the browser before the change; after,
confirm preview on desktop Chrome, a phone-width viewport, Annex D, one VAES
appendix, a wildlife form, and Annex L.

---

## Out of scope
Create Incident modal, incident list page, Category/Incident Type taxonomy,
re-enabling photos, any header/CSP loosening.
