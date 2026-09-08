# Cursor Prompt — Login, Delete Permissions, Signature Flow, Incident Workflow Fixes

Paste into Cursor's agent chat with `bacc-project-main` open.

---

You are implementing the design in
`docs/superpowers/specs/2026-09-08-portal-ux-fixes-design.md`.
**Read that spec in full before writing any code — it governs and outranks
this prompt.** Also skim `CLAUDE.md` first (the `desk:` vs `lg:` distinction,
`isolation: isolate` for third-party widgets, `min`/`max` being advisory on
number inputs, "empty must stay null" in Settings) — this work touches
several of those areas directly.

This is a feedback round on the current build, not new architecture. Several
items below are bug fixes in code that already mostly works — read the
"why" in each section before changing anything, since more than one of
these is "the plumbing exists, it's just wired wrong or not surfaced."

## Explicitly out of scope — do not touch

- The Supabase/Vercel deployment work (`docs/superpowers/specs/2026-09-08-supabase-vercel-deployment-design.md` / `docs/CURSOR_PROMPT_SUPABASE_VERCEL_DEPLOYMENT.md`). Separate track, unaffected by this round.
- BACC's still-pending config answers (deficiency categories, culvert locations, email/IT contact).
- The Projects module.

## 1. Login screen

`src/pages/LoginPage.jsx`: remove or drastically shrink the `VisualPanel` component (the "Ops Board" — beacon-pulse animated instrument tiles, live clock, Runway/System/Checklists/Incidents/Coordinates/Timezone readout). Replace with a plain panel: logo + airport name, no live-telemetry simulation, no animation. Simple and professional, not empty for its own sake — a single static line is fine.

Add a password visibility toggle: an `Eye`/`EyeOff` icon button (already used elsewhere via `lucide-react`) positioned inside the password `<label>` wrapper, toggling the input's `type` between `password` and `text`. `aria-label` must reflect state ("Show password" / "Hide password"), and the button needs its own `type="button"` so it doesn't submit the form.

## 2. Delete checklist — OM (Kegan) + admin only, any inspector's draft

**Migration** `supabase/migrations/014_restrict_draft_delete.sql` — replace migration 013's `submissions_delete_own_draft` policy:

```sql
drop policy if exists "submissions_delete_own_draft" on public.checklist_submissions;
create policy "submissions_delete_own_draft"
  on public.checklist_submissions for delete to authenticated
  using (
    locked = false
    and status = 'draft'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('om', 'admin')
    )
  );
```

Self-delete (`inspector_id = auth.uid()`) and the `'coo'` role are both removed — this is intentionally narrower than 013.

**Client:** add `canDeleteDraft(record, profile)` to `src/lib/submissions.js`:

```js
export function canDeleteDraft(record, profile) {
  return isDeletableDraft(record) && (profile?.role === 'om' || profile?.role === 'admin');
}
```

`src/pages/MyChecklistsPage.jsx`'s existing Delete button (`isDeletableDraft` check, `handleDelete`) switches to `canDeleteDraft(row, profile)` — an inspector viewing their own drafts no longer sees Delete unless they are also OM or admin.

**New surface:** `src/pages/ChecklistCataloguePage.jsx` (backed by `listAllSubmissions`, the org-wide view) gets a Delete action per draft row, using the same `canDeleteDraft` + `deleteDraft` from `lib/submissions.js`, visible only when it passes for the signed-in profile. This is the only place OM/admin can delete a draft that belongs to someone else — `MyChecklistsPage.jsx` stays scoped to "mine."

## 3. Signature flow — ask once, ever

`src/pages/ChecklistDetailPage.jsx`: remove the `useEffect` that sets `signaturePromptOpen` based on `shouldShowSignaturePrompt` on record load — no modal on opening a draft, period.

Add a `has_ever_signed` boolean column to `profiles` (new migration, default `false`). The first time a `SignoffBlock` captures a non-empty signature for the signed-in user's own signoff role (`selfSignoffRole(schema)`) and `has_ever_signed` is still false: set it true, and show a one-time prompt reusing `SignaturePromptModal`'s existing "no stored signature" branch (the save-to-profile UI) — but triggered from the signing action itself, not page load. After a signature is stored (`stored_signature_data_uri` set), `applyStoredSignature` continues to silently auto-fill every subsequent checklist's self-signoff exactly as today — no modal appears again, ever, for that user.

## 4. Create Incident button — alert color

Find the rendered "Create Incident" button wired to `onCreateIncident` (inside `ChecklistForm`'s NO SAT item detail/evidence panel — trace `onCreateIncident` from `ChecklistDetailPage.jsx` line ~695 down through `ChecklistForm.jsx` to find where it's actually rendered). Change its class to the `alert` token family already used for NO SAT styling elsewhere (`bg-alert` background, white text, matching the visual weight of `ChecklistItemRow.jsx`'s NO SAT toggle) instead of its current neutral/navy treatment.

## 5. Map pin locking — `src/components/incidents/LocationPicker.jsx`

Add a `locked` state: `true` whenever `latitude`/`longitude` are already set on mount or via props, `false` before any location exists. While locked: construct/update the marker with `draggable: false`; the `map.on('click', ...)` handler early-returns and does nothing. Add an "Edit location" button near the existing layer-toggle button that sets `locked` to `false` for exactly one more placement — the next drag-end or map click re-locks automatically (set `locked` back to `true` inside those same handlers after applying the change). No prop changes needed in `CreateIncidentModal.jsx` — this is entirely internal to `LocationPicker.jsx`, so every consumer gets it automatically.

## 6. Target Resolution days-remaining — diagnose before fixing

Do not guess-fix this. First, reproduce live: open the specific incident showing a wrong number, and log `incident.target_date`, `incident.deficiency_level`, and `getDeficiencyLevel(incident.deficiency_level)?.targetDays` (from `src/config/deficiencyLevels.js`). `slaState()`'s math is sound for a well-formed `targetDays` — the likely culprits are a level with `targetDays` still unset (producing a `null` `target_date` some render path mishandles) or a non-numeric value saved for it. Fix whichever of those is actually wrong.

Regardless of root cause, also add validation in the Deficiency Levels settings section (`src/components/settings/DeficiencyLevelsSection.jsx`) so `targetDays` can only be saved as a positive integer — never blank-coerced to `0` (per `CLAUDE.md`'s existing "empty must stay null" rule; a `0` here would mean "due immediately" for every future incident at that level, which is not what an unset value should ever mean).

## 7. Incident detail cleanup

`src/pages/IncidentDetailPage.jsx`: remove `<HowThisWorks incident={incident} />` (~line 819) and its import. Nothing replaces it.

Auto-scroll: no `scrollTo`/`scrollIntoView` exists in this file — this is not a stray line to delete. Prime suspect is the `reload()` call inside the "Add Update" handler (Updates tab, ~line 776) causing a loading-state remount that resets scroll to top. Confirm live against the running dev server, then fix the actual mechanism (e.g. avoid remounting page content during `reload()`, or explicitly preserve `window.scrollY` across it) — do not add a compensating scroll call without confirming this is really the cause.

## 8. NO SAT ↔ Incident link — fix the bug, then add the missing UI

**Bug fix, do this first:** in `ChecklistDetailPage.jsx`'s `CreateIncidentModal`'s `onCreated` callback (~line 762), `setItemIncidents((prev) => ({ ...prev, [incident.source_item_code]: incident.id }))` stores a bare string, while the page-load path (~line 104-111) stores the full incident object. `onCreateIncident` (~line 696) then does `itemIncidents[item.code].id` to navigate, which is `undefined` on a string — clicking an incident link right after creating it in the same session navigates to `/incidents/undefined`. Fix: store the full `incident` object in `onCreated`, matching the load path.

**Missing UI:** `src/components/checklist/ChecklistItemRow.jsx` never receives or renders anything about a linked incident. Thread the relevant entry (`linkedIncidentByCode[item.code]`, passed down from `ChecklistDetailPage.jsx` → `ChecklistForm.jsx` → here) plus a click-through callback into `ChecklistItemRow.jsx`. When a NO SAT item has a linked incident, render a small badge/link next to the NO SAT toggle showing the incident ref and status (e.g. "INC-2026-0031 · Open") that calls the same navigate-to-incident behavior `onCreateIncident` already provides. Needs to render in all three responsive tiers (phone card, tablet compact row, desktop table row) — not only reachable via the detail sheet.

## 9. Submit button at the bottom + gate on incident completion

In `ChecklistDetailPage.jsx`, add a second "Submit Checklist" button immediately after `<ChecklistForm ... />` closes (~line 723), identical to the existing one (~line 557-565): same `onClick={handleSubmit}`, same `!readOnly` guard, same styling. Pure convenience duplicate, not a new code path.

In `handleSubmit` (~line 217), after the existing `validateChecklist` check for NO SAT remarks and required header fields, add: for every item where `record.items[code].result === 'no_sat'`, confirm `itemIncidents[code]` exists. If any NO SAT item has no linked incident, set the same kind of error banner as the existing unresolved-items case ("Create an incident for NO SAT item(s) before submitting: …", listing the item codes) and `setSelectedCode` to the first offending one, then return without submitting.

## 10. Approvals — incident visibility

`src/pages/ApprovalsPage.jsx`'s review modal (the `active` detail panel, ~line 247-306) shows form/team/department/filed-by/inspected/with but nothing about incidents. Add an incident summary sourced the same way `ChecklistDetailPage.jsx` already does (`listIncidents()` filtered by the submission id the approval row references), rendered as a compact status count (e.g. "2 open, 1 resolved") with a link through to view them. If the submission raised no incidents, show nothing extra.

## 11. Apron Supervisor — restricted incident assignment

`src/config/incidentLookups.js`: add `{ value: 'om', label: 'Operations Manager' }` to `ASSIGNED_UNITS` (role slug `om` already exists, see `src/lib/roleStaffing.js`'s `ROLE_TITLES`).

`src/pages/IncidentDetailPage.jsx`'s "Assigned Unit" `SelectField` (~line 883-903): filter the `options` array by the signed-in profile's role. **Only** when `profile.role === 'apron_supervisor'`, the options are `[{ value: '', label: 'Unassigned' }, { value: 'om', label: 'Operations Manager' }]` — Grounds/Electrical/Plumbing hidden entirely. For every other role, options stay exactly as today (Grounds, Electrical, Plumbing) — the `om` value must never appear for any role except Apron Supervisor. This is scoped to this one field for this one role; nothing else about incident assignment changes.

## 12. Acceptance checklist

- [ ] Login screen has no animated instrument panel; password field has a working show/hide toggle with correct `aria-label`
- [ ] Inspector cannot delete any draft, including their own; OM (Kegan) and admin can delete any draft from the checklist catalogue; RLS matches (verify with a non-OM/admin account attempting delete directly)
- [ ] No signature modal appears on opening any draft; first-ever signature triggers exactly one save prompt; every later checklist auto-fills silently with no modal
- [ ] Create Incident button renders in alert red, matching NO SAT styling weight
- [ ] Map pin cannot be dragged or repositioned by clicking until "Edit location" is used; re-locks after the next placement
- [ ] Target Resolution shows a correct days-remaining/overdue figure for the incident used to diagnose the bug; Settings rejects non-integer/blank-as-zero `targetDays`
- [ ] `HowThisWorks` no longer renders on the incident detail page; adding an update does not scroll the page
- [ ] Creating an incident and immediately clicking its link from the checklist (same session, no reload) navigates correctly — regression check for the `.id` bug
- [ ] NO SAT items with a linked incident show a visible badge/link on the row in all three responsive tiers; clicking navigates to the incident
- [ ] A second "Submit Checklist" button exists at the bottom of the form; submitting with an incomplete incident is blocked with a clear message naming the item(s); succeeds once every NO SAT item has an incident on file
- [ ] Approvals review modal shows an accurate incident status summary when the submission raised any; shows nothing extra when it didn't
- [ ] Apron Supervisor's Assigned Unit field shows only "Operations Manager" (plus Unassigned); every other role's Assigned Unit options are unchanged (Grounds/Electrical/Plumbing, no Operations Manager)

## 13. Flag back, do not decide alone

- Whatever the actual root cause of the Target Resolution bug turns out to be — report it before fixing if it's something other than the two hypotheses in §6, since that may indicate a broader issue worth flagging.
- Whatever the actual root cause of the incident-updates auto-scroll turns out to be, if it's not the `reload()` remount hypothesis in §7.
- Whether `has_ever_signed` should also get retroactively set `true` for existing users who already have a `stored_signature_data_uri` (so they don't get a redundant prompt) — reasonable to default it that way in the migration, but confirm before shipping since it's a one-way backfill.
