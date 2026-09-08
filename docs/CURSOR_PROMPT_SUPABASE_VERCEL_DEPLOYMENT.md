# Cursor Prompt — Supabase Adapter, Security Fixes & Production Deployment

Paste into Cursor's agent chat with `bacc-project-main` open.

---

You are implementing the design in
`docs/superpowers/specs/2026-09-08-supabase-vercel-deployment-design.md`.
**Read that spec in full before writing any code — it governs and outranks
this prompt.** Also read `docs/security-audit-2026-09-03.md` in full (every
fix below is pulled directly from its findings — the finding IDs referenced
here match that document) and skim `CLAUDE.md` first; this codebase has
several hard-won, non-obvious conventions that this work must follow, not
rediscover.

This is the work every prior Cursor prompt (Phases 1–3, the UX enhancements
round) explicitly deferred: `VITE_DATA_SOURCE`, the Supabase adapter, RLS,
and the security audit findings. It happens now, in the order below, against
a local/throwaway Supabase instance — **nothing here touches the real
production Supabase project until §8, and nothing gets shown to BACC until
§9 passes.**

## Explicitly out of scope — do not touch

- BACC's still-pending config answers that don't block this deployment: B2
  (deficiency category taxonomy), C2 (culvert locations for DR-17/18/19), C4
  (email domain/IT contact). Leave `notificationRules.js` email transport as
  the existing stub.
- Updating `src/config/deficiencyLevels.js`'s colour ramp direction or
  `targetDays`, or wiring notification recipients into `notificationRules.js`.
  BACC has answered these (Level 4 most severe; ~1-2 day rectification;
  Kegan Moore + Michael Acevedo notified on a raised deficiency) but that's a
  small, separate config-value task — not part of this prompt. Flag it back
  as a quick follow-up, don't fold it in here.
- The Projects module. Still unbuilt, still separate.
- Anything under `scripts/verify-placement.mjs` or the PDF overlay field-map
  pipeline itself — this work fixes *who* can call the export endpoints, not
  *how* they render.

## 0. Ground rule

No component may import mock data or the Supabase adapter's internals
directly — everything continues through `src/data/repositories/index.js` and
the existing hooks pattern. This work fills in the Supabase side of that
interface for real; it does not change the interface or how components
consume it.

Set up locally: `supabase start` (via the Supabase CLI) for a local
instance, or a private throwaway cloud project only you can reach. Apply
migrations `001` through `009` against it before starting on the fixes
below. Everything in §§1–7 happens against this instance. Do not touch the
real production Supabase project until §8.

## 1. Root-cause security fixes, in this order

Fix and verify each one live against the local instance before moving to
the next — they build on each other.

**1.1 Role self-escalation.** `profiles_update_own`'s RLS policy has no
column restriction (a user can update their own `role`), and
`handle_new_user()` trusts client-supplied `raw_user_meta_data->>'role'` at
signup. Restrict `profiles_update_own` to a column allow-list excluding
`role`. Change `handle_new_user()` to assign a fixed default role
server-side — never read a role off the signup payload.

**1.2 Missing RLS on three tables.** `approvals`, `checklist_instances`, and
`notifications` (added in `008_phase3.sql`) need real, role-appropriate
SELECT/INSERT/UPDATE policies — mirror the pattern already used correctly on
`submissions` and `incidents`.

**1.3 Sign-off and self-acknowledgment forgery.** `submissions_update_own`
has no status/locked constraint and OR-combines permissively with the
OM-only policy — an inspector can acknowledge their own submission. Add the
missing status check. `signoffs_insert_related` and
`wo_signoffs_insert_related` check the relation but never check that the
inserter's own role matches the role they're inserting as — add an explicit
`auth.uid()`-to-`profiles.role` match check to both.

**1.4 Approver reopen path — new architecture, not in the original audit.**
BACC's actual correction workflow: an approver marks a NO SAT item SAT
directly on the same submitted inspection — not reject-and-resubmit, not a
fresh inspection. This supersedes the "fully immutable, corrections always
create a new record" design the immutability triggers currently enforce.

Change the Postgres triggers on `submissions`/`incidents`/`work_orders`
from "block all UPDATEs once submitted" to "block all UPDATEs once
submitted, except a defined reopen operation restricted to the assigned
approver for that record's department." Concretely:

- Add `reopened_at`/`reopened_by` columns to the submission record.
- Gate the reopen operation through its own RLS policy (not the general
  update policy) checking the caller is the assigned approver for that
  department.
- The trigger still blocks every other field from changing except the
  specific item(s) being corrected plus the audit pair above.

Keep the "bypass-proof for everyone except this one authorized path"
property — that's the point of doing this as a trigger change, not just
loosening the update policy.

## 2. Remaining critical findings

**2.1 Auth on all 5 Vercel API functions** (`api/export-checklist-pdf.js`,
`api/export-noc-register.js`, `api/export-report-pdf.js`,
`api/export-work-order.js`, `api/generate-checklist-instances.js`). Each
must validate the Supabase session JWT the SPA already holds before doing
any work, and re-check the caller's role/relationship to the requested
record server-side — never trust query parameters or the POST body for
authorization.

**2.2 Path traversal in the PDF export endpoints.** `fieldMap.basePdf` /
`templateKey` from the POST body currently go straight into `path.join()` +
`readFileSync` with no allow-list. Validate both against a fixed allow-list
of known template keys (from `src/data/templates/registry.js`) before any
filesystem access.

**2.3 Security headers.** Add CSP, HSTS, `X-Content-Type-Options`, and
`X-Frame-Options` (or `frame-ancestors`) to `vercel.json`. Relevant because
the session token lives in `localStorage` — a CSP that blocks unexpected
script origins meaningfully reduces XSS blast radius.

## 3. Remaining high-severity findings

- Column-level protection on `profiles.stored_signature_data_uri` (currently
  exposed to every authenticated user via `profiles_select_authenticated`).
  Use a view or column-level grant, not a further RLS widening.
- Owner-scoping on the `work-order-exports` storage bucket, matching every
  sibling bucket's existing pattern.
- Add the `locked=false` check to `submissions`/`incidents`/`work_orders`
  UPDATE policies — qualified per §1.4: locked, with the approver reopen
  exception, not "never editable."
- Rate limiting and array-size caps on the PDF/report/instance-generation
  endpoints, closed off by the same auth fix in §2.1 plus explicit caps on
  attacker-controlled counts (NOC register rows, report rows, photo counts).
  `generate-checklist-instances.js` specifically: `monthly`+ cadences don't
  cap backfill the way `daily`/`weekly` do, and `from`/`to`/`rules` are
  entirely client-controlled — clamp all of it.
- Offline-write gate (`AppShell.jsx` / `src/utils/offlineQueue.js`) currently
  checks `navigator.onLine` alone. Add an actual Supabase reachability probe
  so a real outage while "online" queues writes instead of throwing —
  concrete now that the confirmed field device is an Android tablet, not
  hypothetical.
- Cross-department write gaps: `incident_updates`/`incident_attachments`
  insert policies don't check the inserter's relation to the incident
  despite policy names implying they do. Add the check.

## 4. Supabase repository adapter

Implement `src/data/repositories/supabase/index.js` for real, replacing the
throwing stubs — but write each method against the RLS policy as it exists
*after* the relevant fix above, not before. Trail the fixes by roughly one
method at a time rather than writing the whole adapter first and hoping the
policies land underneath it correctly. Cover: checklist instances,
submissions (including the §1.4 reopen path), incidents/NOC, work orders,
approvals, notifications, profiles, and the storage-backed operations
(photos, signatures, PDF exports, the work-order-exports bucket).
`VITE_DATA_SOURCE` keeps switching mock vs. supabase exactly as it does
today — this doesn't change.

## 5. Error handling additions

No error-tracking SDK or React error boundary exists anywhere in the app.
Add a minimal error boundary at the app-shell level. For error tracking,
use structured console logging captured by Vercel's own log drain rather
than pulling in a new third-party SDK — keep this lightweight given the
timeline.

## 6. CI

Check `git remote -v` first. If the remote is GitHub, add a minimal GitHub
Actions workflow running `npm run verify:pdf`, `verify:signoffs`,
`verify:walkthrough`, `verify:palette`, and `verify:content` on every push.
If the remote is something else, flag back rather than assuming GitHub
Actions applies. This is intentionally minimal — lint/verify on push, not a
deployment pipeline.

## 7. Verification — do this before touching production

- Re-run the security audit's checklist (or ask for a fresh targeted audit)
  specifically against the now-implemented adapter and the §1.4 reopen path
  — the original audit assumed the stub and said several findings need
  re-verification against real query code.
- Run all `verify:*` scripts and confirm they pass.
- Confirm `npm run build` succeeds.

Do not proceed to §8 until all of the above pass clean.

## 8. Production provisioning and cutover

Only after §7 passes:

- Provision the real Supabase project. Run all migrations (`001`–`009` plus
  whatever new migration implements §1.1–§1.4 and §3) against it.
- Seed demo data respecting §14 of `BACC_Digital_Checklist_Technical_Requirements_v1.docx`
  — real approved form structure and content, never placeholder text that
  misrepresents the actual forms.
- Set Vercel env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, plus
  whatever server-side var the now-authenticated API functions need.
- Confirm the `vercel.json` security headers from §2.3 are present.
- Connect the custom domain if one exists; otherwise the default Vercel
  subdomain is fine.
- Any future Vercel preview deploy should point at a separate, non-production
  Supabase project (per the existing `.env.example` guidance) — this
  cutover itself is a single production deploy, but don't wire previews to
  hit real compliance data later.

## 9. Go-live smoke test

- Real login on the production URL.
- One full checklist submission end-to-end, including the PDF overlay
  export.
- One deliberate test of the §1.4 reopen path by an approver account.
- One deliberate attempt at a forbidden action per major role (inspector
  self-acknowledgment, non-approver sign-off forgery) — confirm RLS blocks
  it in production, not just locally.
- Confirm the offline queue behaves correctly on an Android tablet with
  connectivity actually disabled, not just `navigator.onLine` toggled in
  devtools.

## 10. Acceptance checklist

- [ ] `profiles_update_own` cannot change `role`; `handle_new_user()` never
      trusts client-supplied role
- [ ] `approvals`, `checklist_instances`, `notifications` have real RLS
      policies, verified per-role
- [ ] Inspector cannot acknowledge their own submission; sign-off insert
      policies check inserter role matches claimed role
- [ ] Approver reopen path works exactly once per correction, is logged
      (`reopened_at`/`reopened_by`), and blocks every other field from
      changing; everyone else still gets a hard immutability block
- [ ] All 5 Vercel API functions reject an unauthenticated request and a
      request from a user without the right relationship to the record
- [ ] PDF export endpoints reject a `templateKey`/`basePdf` not on the
      allow-list
- [ ] `vercel.json` carries CSP/HSTS/frame headers
- [ ] `profiles.stored_signature_data_uri` not readable by an unrelated
      authenticated user
- [ ] `work-order-exports` bucket owner-scoped like its siblings
- [ ] `locked=false` UPDATE check present with the reopen exception intact
- [ ] Rate limits / array caps in place on PDF/report/instance-generation
      endpoints; `monthly`+ cadence backfill capped like `daily`/`weekly`
- [ ] Offline gate checks real Supabase reachability, not just
      `navigator.onLine`
- [ ] `incident_updates`/`incident_attachments` insert policies check
      inserter relation
- [ ] Supabase adapter fully implemented, no throwing stubs left, all
      existing hooks/components work unchanged against it
- [ ] Error boundary present at app-shell level
- [ ] CI workflow runs verify scripts on push (or flagged back if remote
      isn't GitHub)
- [ ] All `verify:*` scripts and `npm run build` pass before §8
- [ ] Production Supabase provisioned, migrations applied, demo data seeded
      per §14, Vercel env vars set, custom domain connected if applicable
- [ ] Go-live smoke test (§9) completed and passed

## 11. Flag back, do not decide alone

- The §1.4 reopen-path design diverges from BACC's own written §11
  requirement ("a submitted checklist is a permanent record that is never
  overwritten") and §14 (controlled-document rule). This has been decided
  internally, but BACC hasn't been told their own written requirement no
  longer matches the implementation — that's a client-communication item,
  flag it, don't silently proceed without someone telling BACC.
- Whether the CI workflow should also gate deploys (block a Vercel deploy on
  CI failure) or just run advisory for now — the spec only asked for the
  workflow to exist, not for deploy gating.
- Anything in §7's re-audit that surfaces a finding not listed here — this
  prompt encodes the 2026-09-03 audit as it stood; a new finding from
  re-auditing the real adapter code is new information, not something to
  quietly patch without a note back.
