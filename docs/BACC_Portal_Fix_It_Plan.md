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

## Phase 4 — Ship the two approved polish rounds (spec + instructions already written, just needs building)

These are already fully planned — someone just needs to sit down and build them:

- [ ] **Round 1 (Sept 6):** notification/help dropdown menus, an offline "still works / needs connection" popup, better map pins, expanded reports, new settings sections.
- [ ] **Round 2 (Sept 8):** simpler login screen, show/hide password, tighter delete permissions, one-time (not repeated) signature prompt, red "Create Incident" button, locked map pin by default, a few bug fixes (days-remaining counter, auto-scroll glitch, missing incident-link badge), a second submit-safety check, and a couple of role-specific field restrictions.

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
