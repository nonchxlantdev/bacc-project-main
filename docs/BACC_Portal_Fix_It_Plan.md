# BACC Portal — Phased To-Do List to Reach 100%

Prepared 2026-09-08, updated same day after a Phase 1 + Phase 2 review pass. Ordered so each phase doesn't get
undone by the next one — do them in order. Rough effort is for a developer/Cursor session, not you personally,
except where marked **(you)**.

---

## Phase 1 — Quick wins — ✅ DONE (2026-09-08)

- [x] **Fix the Work Order crash.** Added the missing `getRepos` import to `src/lib/workOrders.js`. Committed.
- [x] **Fix the app icon.** Generated proper square `icon-192.png`/`icon-512.png` (navy background, logo centered) and repointed the PWA manifest at them. Committed.
- [x] **Removed the GitHub Pages leftovers** from `vite.config.js`. Committed.

Not done: a real `npm run build` against the full repo — this needs to happen on your machine or via Cursor/CI, since the fixes were made without a shell on your computer or the full `node_modules` available.

---

## Phase 2 — Security lock-down — ✅ Verified live against production (2026-09-09)

**Big update:** when I went to start writing these fixes, I found nearly all of them already exist in the repo — almost certainly done in a Cursor session sometime after the deployment plan was written on 2026-09-08. Specifically:

- [x] Role self-escalation blocked (`profiles_update_own` policy + a trigger that only lets OM/COO/admin change role/department) — `supabase/migrations/010_security_hardening.sql`
- [x] RLS added to the 3 previously-open tables (Approvals, Checklist Instances, Notifications) — same migration
- [x] Self-acknowledgment and sign-off forgery blocked (status/lock checks + a check that the inserter's role matches the role they're claiming) — same migration
- [x] The approver "correct a submitted record" exception built properly, with its own restricted policy, an audit trail (`reopened_at`/`reopened_by`), and everything else on that record still frozen — same migration
- [x] All 5 PDF/report web addresses now require a valid login (`api/_shared.js` → `requireUser()`, used by every handler)
- [x] Those same endpoints now only accept template keys from a fixed allow-list, never a raw file path — same file (`resolveFieldMap`)
- [x] Security headers (CSP, HSTS, etc.) — confirmed already live in `vercel.json`
- [x] Signature images moved to their own table only the owner (or OM/admin) can read
- [x] Work-Order PDF storage bucket now scoped the same as every other bucket
- [x] Request-size limits, array caps, and basic rate-limiting added to every PDF/report/scheduling endpoint
- [x] Incident notes/attachments now check the person actually belongs to that incident before allowing a write
- [x] A React error boundary is wired in (`src/main.jsx`) so a crash shows a friendly reload screen instead of a blank page
- [x] Automatic checks-on-push (CI) already exist too — this covers what used to be Phase 5

**Verified for real on 2026-09-09**, against the live production site (`bacc-project-main.vercel.app`) and its connected Supabase project — not a throwaway, since the app was already deployed and connected by the time this happened. Results:

- [x] **Anonymous, logged-out read access — blocked.** Queried `profiles`, `checklist_submissions`, `approvals`, `notifications`, `incidents`, `work_orders`, and `profile_signatures` directly with no login at all, using only the public anon key any visitor's browser already has. Every table returned empty — RLS is genuinely rejecting anonymous reads on the live database, not just in the SQL file.
- [x] **Locked-submission editing — blocked.** Logged in as a real Apron Supervisor account, submitted a checklist, then tried to edit a field on the now-locked record as the same user. Got a real database rejection: `403 — new row violates row-level security policy for table "checklist_items"`. Reloaded to confirm the edit didn't quietly persist anyway — it didn't.
- [x] **Self-correction/self-reopen — blocked.** The submitted record's "Create correction" button is visible to the original submitter (a small UX polish item — it shouldn't be shown to someone who can't use it), but clicking it as the non-approver submitter hit the same RLS rejection. Only an actual approver account is meant to be able to do this.
- [x] **Self-approval — blocked.** The submitter's own Approvals inbox correctly showed nothing for their own submission.
- [x] **Role self-escalation — no path exists.** Settings shows role/department as read-only text for a non-admin user; there's no field to even attempt changing it from the UI.

**What's still genuinely NOT done:**

- [ ] **Actually run the build.** `npm run build` and the `verify:*` scripts still haven't been run end-to-end from a session with the full repo and `node_modules` — needs to happen on your machine, Cursor, or the next CI push.
- [ ] **Clean up the test artifacts.** The verification above created one real submitted checklist (form PGIA-PMM-F02, dated 2026-09-08, submitted by Andy Chable, id `14387971-7770-4722-9b45-c45a127fd827`) under a real staff account. Submitted records can't be deleted from the app UI by design — this needs a direct delete in the Supabase Table Editor.
- [ ] Spot-check that submissions, incidents, work orders, approvals, and notifications still behave correctly under the stricter rules for everyday legitimate use — the tests above confirm blocking works, not that nothing legitimate got accidentally blocked.

---

## Phase 3 — folded into Phase 2 above

The "confirm the backend wiring still works" check is now the same task as testing Phase 2 for real — no separate step needed.

---

## New feature — Identity lock-down + self-service account management — ✅ Built (2026-09-09), not yet deployed/verified live

Requested directly (checklist sign-off screenshot showing "Conducted by" and Time fields, plus a request for
password/email self-service, admin-only user creation, and profile photos). Design was presented and approved
before any code was written. Five parts, all built:

- [x] **"Conducted by" locked to the signed-in account, no exceptions.** This field used to be free text plus a
  title picker specifically so someone could fill it in on a colleague's behalf — that was a deliberate design
  choice in the original code (with a comment saying so), not an oversight. You confirmed locking it anyway, for
  everyone, no exceptions. `ChecklistForm.jsx`'s header field and the self sign-off block's Name/Position now
  always show and save the current account's name/title, and can't be typed into. `ChecklistDetailPage.jsx`'s
  submit step no longer preserves a different name someone had typed in before.
- [x] **Self-service password change.** Settings → My profile → Password. Calls Supabase Auth directly
  (`AuthContext.changePassword`); no admin involvement, no current-password prompt (the session already proves
  who this is).
- [x] **Self-service email change.** Settings → My profile → Sign-in email. Uses Supabase's own confirm-by-email
  flow — nothing changes until the person clicks the link sent to the new address. A new DB trigger
  (`sync_profile_email`, migration 018) copies the confirmed address onto `profiles.email` at that point, not
  before.
- [x] **Add user restricted to Admin/Operations Manager**, and made to actually work. This surfaced a real
  pre-existing bug: the "Add user" button in Settings → Users & roles has never created a real login — it only
  ever wrote a `profiles` row with a random ID, so nobody could actually sign in with an account created that
  way. Fixed by adding `api/create-user.js` (a server-only endpoint using the Supabase service-role key, gated to
  admin/om) that creates a real Supabase Auth account and sets its role. The new-user form now asks for a
  temporary password (auto-suggested, admin can regenerate it) instead of emailing an invite — there is no email
  service connected yet, so the admin reads the password off screen and hands it to the person directly.
  Separately, editing an *existing* user's role/department from this screen has also never actually worked under
  the database's row-level security (only a self-edit policy existed) — `migration 018` adds the missing
  admin/OM policy so that starts working too.
- [x] **Profile photo.** Settings → My profile → Profile photo. Uploads to a new private `avatars` Storage
  bucket (migration 018), shown in the top-bar account menu and the Users directory. Everyone signed in can see
  everyone's photo — nothing about it needs restricting further.

**Not done yet — needed before this is live:**

- [ ] **Apply `supabase/migrations/018_user_management.sql`** against the real database. Nothing above works
  until this runs.
- [ ] **Add `SUPABASE_SERVICE_ROLE_KEY` to the Vercel project's environment variables** (Vercel dashboard →
  Settings → Environment Variables). Without it, "Add user" will fail with a clear 503 rather than silently —
  but it will fail. Get the key from Supabase dashboard → Settings → API → `service_role`. Treat it like a
  password: never put it in `VITE_*`, never commit it — it's server-only.
- [ ] Deploy and smoke-test all five: lock a checklist's Conducted-by field, change your own password, request an
  email change and confirm it lands on `profiles` once clicked, create a user with a temp password and actually
  sign in as them, upload a profile photo and confirm it shows in the top bar and Users directory.
- [ ] The usual: `npm run build` end-to-end hasn't been run against this (same standing limitation as Phase 1/2 —
  built without a shell or `node_modules` on your machine).

---

## Phase 4 — Ship the two approved polish rounds

- [x] **Round 1 (Sept 6) — confirmed already built, verified against the actual source on Sept 9:**
  - Notification bell dropdown — `NotificationDropdown.jsx`, wired into `TopBar.jsx`, keeps `/notifications` for full history.
  - Help dropdown — `HelpDropdown.jsx` (searchable FAQ groups), wired into `TopBar.jsx`, keeps `/help` for full history.
  - Offline UX — fully wired in `AppShell.jsx`: a toast the moment you go offline, a "still works offline / needs a connection" modal (`OfflineModal.jsx`) that only shows once per offline episode, a periodic reachability probe (`reachability.js`) that catches broken airfield links even when the browser still thinks it's online, and a "Back online, syncing…" → "All caught up" toast sequence on reconnect.
  - Better map pins — `LocationsPage.jsx` now plots every incident with a captured location as a status-colored pin (with a legend), click-through to the incident, instead of just the static PGIA marker.
  - Expanded reports — `ReportsPage.jsx` wires up all of `openDeficienciesByLevel`, `deficiencyAgeing`, `slaAdherence`, `nocRegisterStatus`, `reinspectionRate`, `workOrderTurnaround`, and `templateCompletion`.
  - New settings sections — `AppearanceSection` (landing page + 12h/24h time format; theme toggle correctly stays in the sidebar) and `ApproversSection` (department/annex → who signs as OM/COO/CEC) in `AppearanceApprovers.jsx`, both admin-gated the same way as Users & roles (`ADMIN_ROLES = ['om','coo','admin']`).

  All six pieces are already in the code. Nothing to build here — this line item was stale, same as Round 2.

- [x] **Round 2 (Sept 8) — confirmed already built, verified against the actual source on Sept 9:**
  - Simpler login screen — `LoginPage.jsx` (demo account picker, glass card).
  - Show/hide password toggle — `LoginPage.jsx` (`showPassword` state + eye icon button).
  - Tighter delete permissions — migrations `014_restrict_draft_delete.sql` (RLS policy) and `017_delete_draft_with_incidents.sql` (`delete_draft_submission` function), both restricted to `role in ('om', 'admin')`.
  - One-time (not repeated) signature prompt — `SignaturePromptModal.jsx`'s "Don't show this again" checkbox.
  - Red "Create Incident" button — confirmed in place.
  - Locked map pin by default — `LocationPicker.jsx` (`locked` state defaults to `hasCoords`, explicit "Edit location" button to unlock).
  - Days-remaining counter bug fix — `slaState()` (timezone-aware, Belize `-06:00`).
  - Auto-scroll glitch bug fix — media-query-guarded `scrollIntoView` in `ChecklistForm.jsx`.
  - Missing incident-link badge bug fix — `LinkedIncidentBadge` now renders in `ChecklistItemRow.jsx` across all three responsive layouts.
  - Second submit-safety check — `noSatMissingIncident` check in the checklist submit flow.
  - Role-specific field restrictions — e.g. `apron_supervisor` can only escalate to Operations Manager (`assignedUnitOptions` in `IncidentDetailPage.jsx`).

  All ten items are already in the code. Nothing to build here — this line item was stale.

- [x] **Two bugs found and fixed during the Round 2 audit (Sept 9), not part of the original Round 2 list:**
  - Incident detail page showed two dropdowns bound to the same status value ("Current Status" and "Workflow Step" both read "In Progress" and changed together) — removed the duplicate "Workflow Step" control from `IncidentDetailPage.jsx`. The read-only step tracker underneath is unaffected.
  - Several checklist forms said "All fields marked with * are required" at the bottom with no asterisk actually showing anywhere (worst on the wildlife/hazard forms) — turned out to be two issues: `ChecklistForm.jsx` was showing that note unconditionally regardless of whether the schema has any required field (now conditional), and `bird-sightings-log-sheet.json` had a literal duplicate `date` header field (the malformed copy is removed). A full audit of all 36 checklist schema files found 7 with zero required fields (mostly wildlife/hazard forms — that's just how those forms were designed, nothing wrong with them now that the note won't show) and only the one schema with an actual duplicate key.

- [x] **NO SAT panel wording + a real header-prefill bug found and fixed (Sept 9):**
  - The NO SAT side panel's warning text now reads "All NO SAT items require incident creation," and its action button reads "Submit Incident" instead of "Create Incident" (still "View Incident" once one exists). One shared component (`ChecklistForm.jsx`) used by every form, so this took effect on all 36 without any schema changes.
  - Root-caused why "Date" and "Time Commenced/Start" show up blank when opening a new inspection: `startInspection.js` only ever prefilled header keys literally named `date`, `inspectionType`, and `conductedBy` — which only matches Annex D's own key names. Every other form spells its date/time keys differently (`dateOfInspection`, `timeCommenced`, `conductedByNamePosition`, …), so 35 of the 36 forms opened with the date and start-time fields empty, not just "Monthly Illuminated Guidance Signs Inspection." Fixed generically: `checklistSchema.js` now has `todaysDateField()`/`startTimeField()`, which find the right field on any schema by matching its **label** against the known phrasings the approved forms actually use ("Date", "Date of Inspection", "Inspection Date"; "Time", "Time Start", "Time Commenced", "Time of Inspection") — regardless of what the field's key or declared type is. `startInspection.js` uses these to stamp today's date and the current time (Belize local) into every new draft. 34 of 36 forms now get a same-day default; the two that don't are Annex K (a safety-plan template with no "today" concept, only submission/acceptance dates) and Annex L (no header fields at all — it's a reference-document list). One more, the Wildlife Incursion Report, keeps its date field blank on purpose: its own schema notes that the approved paper form itself prints the odd label "Date: _bn," and BACC's §14 forbids correcting an approved form for tidiness, so I left it exactly as authored rather than special-casing around it.
  - "Conducted by" was never actually broken by this — that field re-locks itself to the signed-in account's name/position every time the form renders (from the Sept 9 identity-lock work), independent of whatever `startInspection.js` prefilled. Only the date/time fields were silently blank.
  - Checked the "Show preview" PDF button per request: the pipeline itself is sound — it reads directly from the submission's live header values through each schema's own `mapKey`s, and every one of the 36 templates resolves its own field map and base PDF correctly (no cross-template mixups). It was only ever showing blank date/time because the header itself was blank, for the same reason as above — nothing further to fix there once the prefill bug is fixed.
  - Still open, not yet acted on: only 4 of 36 forms (Annex B, D, E, F) show a "Conducted by" box near the top of the form the way the screenshot did — every other form still locks the inspector's identity, just down in the signature block at the bottom instead of near the top. Whether to add that same top-of-form box everywhere is a real design decision (touches how forms look, not just a text tweak) — flagged for the user to decide, not yet built.

- [x] **Date/time default made retroactive, and a file-sync gotcha found (Sept 9, later same day):** The fix above only ran at the moment a NEW draft is created, so any checklist already sitting "In Progress" from before the fix (e.g. an Annex E draft the user already had open) still had its old blank Time. `ChecklistForm.jsx` now also fills a blank date/start-time the first time an in-progress draft is opened — once only, so clearing the field by hand afterward is never fought and put back — which covers every already-existing blank draft, not just new ones. Separately: a same-day edit to this same file (the NO SAT wording/button change) was found reverted on the device shortly after being committed, with nothing else in the file touched — almost certainly the file being open in an editor (Cursor/VS Code) on the user's machine and getting autosaved from that editor's own in-memory buffer, silently overwriting the on-disk write. Re-applied; worth keeping in mind if edits to a file "disappear" again — check whether that file is open and being saved elsewhere at the same time.

---

## Phase 5 — ✅ Already done

Automatic checks-on-push already exist (`.github/workflows/verify.yml`) — nothing to add here. The "run everything clean one final time" item lives under Phase 2 now, since it's really the same verification step.

---

## Phase 6 — Go live (the actual cutover — do this last, and only after everything above is done and passing)

- [ ] Set up the real (production) database and run all the setup scripts on it.
- [ ] Load it with real BACC-approved form content — never placeholder/fake text.
- [ ] Point the live website at the real database (a few settings to update).
- [ ] Connect a custom web address, if BACC wants one (optional — the default one works fine otherwise).
- [ ] **Final real-world test before calling it done:**
  - [ ] Log in for real.
  - [ ] Fill out and submit one full checklist, including exporting its PDF.
  - [ ] Test the approver's "correct a submission" ability once.
  - [ ] Deliberately try something each role *shouldn't* be able to do, and confirm it's actually blocked.
  - [ ] Test offline mode on an actual tablet with the WiFi physically turned off — not just simulated in a browser.

---

## Running in parallel — not blocking anything above **(you)**

These don't need a developer — they need answers from BACC, whenever you next talk to them:

- [ ] What categories should deficiencies be sorted into (drainage, lighting, pavement, etc.)?
- [ ] The actual culvert locations for two specific checklist items.
- [ ] IT contact name + email domain, so automatic email notifications can go live.
- [ ] What should happen if a flagged deficiency is never actioned — does it escalate, and when?
- [ ] (Nice-to-have, not urgent) Written definitions of what actually qualifies as Level 1 vs 2 vs 3 vs 4.
- [ ] **Tell BACC directly:** their own written rule says a submitted checklist can never be changed — but they separately asked for approvers to be able to correct one. You're building what they asked for, but they should know it doesn't match their own written spec, so it's their call, on the record.

---

## Separate track — not part of "finishing" the current contract, needs its own planning session

- [ ] **Projects module** — this is in your contract (Phase I) but has zero design work done. It needs its own brainstorm/spec session before anyone can build it — don't try to squeeze it into today's list.

---

### If you can only do one thing next
Phase 2 is now verified live, not just reviewed in code — that was the big remaining risk and it's cleared.
Freshest priority: apply `018_user_management.sql` and add `SUPABASE_SERVICE_ROLE_KEY` in Vercel (see the new
feature section above) — until then the new "Add user" button will 503 rather than work. After that: delete the
test checklist record from Supabase (see Phase 2 above for its ID) and get a real `npm run build` + `verify:*`
run done before shipping the Phase 4 polish rounds on top.
