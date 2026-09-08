# Portal UX Fixes — Login, Delete Permissions, Signature Flow, Incident Workflow

Date: 2026-09-08
Status: Approved
Based on a live re-analysis of `bacc-project-main` on 2026-09-08 (Supabase adapter now implemented, migrations 010-013 landed, deficiency levels now Settings-driven) plus a round of BACC feedback on the current build.

## 1. Goal

A bundle of independent-but-related fixes and small features requested after reviewing the current build: a calmer login screen, tighter delete permissions, a less intrusive signature flow, clearer incident-creation affordances, a foolproof location picker, a due-date bug, incident-detail cleanup, a working link between a NO SAT checklist item and the incident it raised, submission gating on that link, approver visibility into incidents, and a role-based restriction on who an Apron Supervisor can assign an incident to. None of these change the deployment spec from 2026-09-08 — they're UI/workflow fixes layered on top of it.

## 2. Login screen

Remove or drastically shrink `LoginPage.jsx`'s `VisualPanel` — the "Ops Board" instrument panel (beacon-pulse animations, live clock, instrument tiles: Runway status, System status, Checklists on file, Open incidents, Coordinates, Timezone) added recently. Replace with a plain, mostly-empty panel: logo, airport name, nothing animated, nothing simulating live telemetry. The goal is "simple, professional, to the point," not empty for its own sake — a single static line of context is fine if it reads as calmer than the current board.

Add a password visibility toggle: an eye/eye-off icon button inside the password `<input>` (absolute-positioned within the existing `<label>` wrapper), toggling the input's `type` between `password` and `text`, `aria-label` reflecting the current state ("Show password" / "Hide password"). Standard pattern, no new dependency needed (`lucide-react`'s `Eye`/`EyeOff` are already used elsewhere in the codebase).

## 3. Delete checklist — restricted to OM (Kegan) and admin, any inspector's draft

Two coordinated changes:

**Server (RLS):** New migration, `014_restrict_draft_delete.sql`, replaces migration 013's `submissions_delete_own_draft` policy: drop the `inspector_id = auth.uid()` self-delete clause and the `'coo'` role, leaving only

```sql
using (
  locked = false
  and status = 'draft'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('om', 'admin')
  )
);
```

**Client:** A new shared helper, `canDeleteDraft(record, profile)` in `lib/submissions.js`, combining the existing `isDeletableDraft(record)` status/lock check with `profile?.role === 'om' || profile?.role === 'admin'`. `MyChecklistsPage.jsx`'s existing Delete button switches from `isDeletableDraft` to `canDeleteDraft` — inspectors lose the ability to delete even their own draft, matching the tightened policy.

New surface: `ChecklistCataloguePage.jsx` (the org-wide "last completed" view, backed by `listAllSubmissions`) gets a Delete action per draft row, visible only when `canDeleteDraft` passes for the signed-in profile — this is the only place OM/admin can act on a draft that isn't theirs, since `MyChecklistsPage.jsx` is scoped to "mine" by design and stays that way.

## 4. Signature flow — ask once, after the fact

Remove `SignaturePromptModal`'s proactive open-on-draft-load trigger from `ChecklistDetailPage.jsx` (`shouldShowSignaturePrompt` / the `useEffect` that sets `signaturePromptOpen` on record load) entirely — no modal appears before a person has done anything on the form.

New profile flag `has_ever_signed` (boolean, defaults false) — a new column on `profiles`, added via a small migration. Set the first time any `SignoffBlock` on any checklist captures a non-empty signature for the signed-in user's own signoff. The first time this transition happens (false → true), show a compact, one-time prompt — reuse `SignaturePromptModal`'s "no stored signature" branch (the save-to-profile UI), but trigger it from the signing action itself rather than page load. Once a signature is stored (`stored_signature_data_uri` set), `applyStoredSignature` keeps auto-filling every subsequent checklist's self-signoff exactly as it does today — silently, no modal, ever.

## 5. Create Incident button — alert color

Wherever `onCreateIncident` is wired to a visible button (inside `ChecklistForm`'s NO SAT item detail/evidence panel), change its class from its current neutral/navy treatment to the `alert` design token already used for NO SAT and warnings elsewhere (`bg-alert` / `border-alert` family, white text) — solid, unmissable red, consistent with the app's existing "this needs attention" vocabulary rather than a new color.

## 6. Map pin locking — `LocationPicker.jsx`

Add a `locked` boolean state, defaulting to `true` whenever `latitude`/`longitude` are already set (i.e., a location exists) and `false` while nothing has been placed yet. While locked: the marker is constructed/updated with `draggable: false`, and the `map.on('click', ...)` handler becomes a no-op (early-return). Add an "Edit location" button (near the existing layer toggle) that flips `locked` to `false` for exactly one more placement — the next drag-end or map click re-locks it automatically. `CreateIncidentModal.jsx` passes no new props for this; it's entirely internal to `LocationPicker.jsx`, so every consumer gets the fool-proofing automatically.

## 7. Target Resolution days-remaining — diagnose live, then fix

Traced the full path: `IncidentDetailPage.jsx` calls `slaState(incident.target_date, clockMs)` from `config/deficiencyLevels.js`. `clockMs` comes from a `getRepos().instances.getClock()` call that isn't implemented in either the mock or Supabase repository — it always throws, and the code correctly falls back to `Date.now()`. The `slaState`/`targetDateFor` math itself is sound for a well-formed `targetDays` value. Given BACC reported "a wrong number entirely" rather than an off-by-one, the most likely causes are: a deficiency level with `targetDays` still `null`/unset in Settings → Deficiency Levels producing a `target_date` of `null` on incidents raised against it (which some render path may be mishandling instead of showing "no due date"), or a non-numeric value having been entered for `targetDays` there.

Action: before writing a fix, reproduce live — open the specific incident showing the wrong number, log `incident.target_date`, `incident.deficiency_level`, and `getDeficiencyLevel(incident.deficiency_level)?.targetDays`, and fix whichever of those is actually wrong. Separately, regardless of root cause, add input validation in the Deficiency Levels settings section so `targetDays` can only be saved as a positive integer (not blank-coerced-to-zero, matching the existing "empty must stay null" convention already documented in `CLAUDE.md`), and make `slaState` explicit about a missing `target_date` (return `{kind: 'none'}` as it already does) so a future config gap reads as "no due date set" rather than any computed number.

## 8. Incident detail cleanup

Remove `<HowThisWorks incident={incident} />` from `IncidentDetailPage.jsx` (currently rendered in the right-hand column, ~line 819) and its import. The stepper explaining incident stages was judged unnecessary clutter; nothing replaces it.

Auto-scroll on adding an update: no explicit `scrollTo`/`scrollIntoView` call exists anywhere in `IncidentDetailPage.jsx`, so this isn't a stray line to delete. Leading hypothesis is that `reload()` (called after `addIncidentUpdate` succeeds, see the "Add Update" handler in the Updates tab) triggers a brief loading state that remounts page content and resets scroll to top. Confirm live against the running app, then fix the actual mechanism — e.g., avoid a full remount during `reload()`, or explicitly preserve scroll position across it — rather than adding a compensating scroll call that would just be papering over the real cause.

## 9. NO SAT ↔ Incident link (fixes a real existing bug)

`ChecklistDetailPage.jsx` already builds an `itemIncidents` map (item code → incident) on load and passes it to `ChecklistForm` as `linkedIncidentByCode`, and its `onCreateIncident` handler already knows to navigate straight to an existing incident instead of reopening the create modal. Two things are missing or broken:

**Bug:** the initial page-load path stores the *full incident object* in `itemIncidents[code]`, but the `CreateIncidentModal`'s `onCreated` callback stores only `incident.id` (a bare string) after creating a new incident in the current session. The `onCreateIncident` handler then does `itemIncidents[item.code].id` to navigate — which is `undefined` on a string, so clicking through to an incident you just created in the same session navigates to `/incidents/undefined`. Fix: `onCreated` stores the full `incident` object, matching the load path.

**Missing UI:** `ChecklistItemRow.jsx` never receives or renders anything about a linked incident today — the capability exists one layer up but isn't visible on the row. Thread `linkedIncidentByCode` (or just the single relevant entry, `linkedIncidentByCode[item.code]`) and an `onCreateIncident`/`onViewIncident` callback down from `ChecklistForm.jsx` into `ChecklistItemRow.jsx`. When a NO SAT item has a linked incident, render a small badge/link next to the NO SAT toggle (incident ref + status, e.g. "INC-2026-0031 · Open") that calls through to the existing navigate-to-incident behavior — visible in all three of the row's responsive tiers (phone, tablet, desktop), not just the detail sheet.

## 10. Submit button duplicated at bottom, gated on incident completion

Add a second "Submit Checklist" button in `ChecklistDetailPage.jsx`, rendered immediately after `<ChecklistForm ... />` closes, identical in behavior to the existing top one (`onClick={handleSubmit}`, same `disabled`/`readOnly` guard) — purely a convenience duplicate, not a second code path.

In `handleSubmit`, alongside the existing NO SAT-remarks and required-header validation (`validateChecklist`), add a check that every item with `result === 'no_sat'` has a corresponding entry in `itemIncidents`. If any NO SAT item lacks one, block submission with a banner naming the item code(s) ("Create an incident for NO SAT item(s) before submitting: …"), same pattern as the existing unresolved-items banner, and select the first offending item so the person lands on it.

## 11. Approvals — incident visibility for the reviewer

`ApprovalsPage.jsx`'s review modal (the `active` detail panel) currently shows form/team/department/filed-by/inspected/with — nothing about incidents raised from the submission being reviewed. Add an incident summary line sourced the same way `ChecklistDetailPage.jsx` already does it (`listIncidents()` filtered by `submission_id === active.entity_id` or equivalent id the approval row carries), rendered as a compact count-by-status string (e.g. "2 open, 1 resolved") with a link to view them, so Kegan can check incident status before deciding without leaving the approval flow. If the submission raised none, show nothing extra — don't clutter the modal for the common case.

## 12. Apron Supervisor — restricted incident assignment

`config/incidentLookups.js`'s `ASSIGNED_UNITS` gains a fourth value: `{ value: 'om', label: 'Operations Manager' }` (role slug `om` already exists and maps to "Operations Manager" via `lib/roleStaffing.js`'s `ROLE_TITLES`).

In `IncidentDetailPage.jsx`'s "Assigned Unit" `SelectField`, the options list is filtered by the signed-in profile's role: **only** when `profile.role === 'apron_supervisor'`, the dropdown offers exactly one real choice — Operations Manager (plus "Unassigned") — Grounds, Electrical, and Plumbing are hidden. For every other role, the options stay exactly as they are today (Grounds, Electrical, Plumbing); the new "Operations Manager" value is never shown to anyone except an Apron Supervisor assigning an incident. This is scoped precisely to that one role and that one field — nothing else about incident assignment, or any other role's options, changes.

## 13. Explicitly out of scope

The Supabase/Vercel deployment work from the 2026-09-08 deployment spec (adapter, RLS security hardening, production cutover) is unaffected by this round and continues on its own track. BACC's still-pending config answers (B2 categories, C2 culvert locations, C4 email/IT contact) aren't touched here. The Projects module remains unbuilt and unscoped.

## 14. Testing

Manual verification for each item against the running dev server (per the project's existing QA harness pattern where applicable): login renders calmly with a working password toggle; a non-OM/admin inspector can no longer delete any draft including their own, while OM/admin can delete any draft from the catalogue; a first-time signer sees exactly one save prompt, ever, and every later checklist auto-fills silently; Create Incident renders in alert red; a placed map pin resists drag and click until "Edit location" is used; the Target Resolution fix is verified against the specific incident used to diagnose it; HowThisWorks no longer renders and the auto-scroll no longer fires when adding an update; creating an incident in the same session and immediately clicking its link from the checklist navigates correctly (regression check for the `.id` bug); submitting a checklist with an incomplete incident is blocked with a clear message and succeeds once completed; Approvals shows an accurate incident summary; and an Apron Supervisor's Assigned Unit field shows only Operations Manager while every other role's options are unchanged.
