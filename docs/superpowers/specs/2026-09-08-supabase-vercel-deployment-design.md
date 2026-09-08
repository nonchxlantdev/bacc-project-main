# Supabase + Vercel Production Deployment — Design

Date: 2026-09-08
Status: Approved
Target: internal/client demo for BACC review, 2-4 weeks out, on real Supabase + Vercel infrastructure

## 1. Goal and definition of success

Get the BACC Operations Management Portal onto real Vercel + Supabase infrastructure, with the repository adapter (`src/data/repositories/supabase/index.js`, currently a stub) actually implemented, and with the 2026-09-03 security audit's critical and high findings fixed — so the URL handed to BACC is production-grade, not a vulnerable demo that happens to look finished.

Success means: real login and role-based access work correctly; checklists, incidents, and approvals persist through Supabase with RLS actually enforcing who can do what; the 5 Vercel API functions require auth; nothing in the audit's critical or high list is still open; and the approver reopen-workflow decided on 2026-09-08 (see §5.4) is implemented and enforced at the database level, not just in the UI.

## 2. Scope and non-goals

In scope: Supabase adapter implementation, all critical + high findings from the 2026-09-03 audit, the approver reopen-path architecture change, Vercel API auth and security headers, minimal CI, production provisioning, and a go-live smoke test.

Out of scope for this deployment: BACC's still-pending config answers that aren't deployment blockers (B2 deficiency categories, C2 culvert locations, C4 email domain/IT contact — see `bacc-portal-open-items.md`), the unbuilt Projects module (separate contracted-Phase-I work), and email notification delivery (stays stubbed behind its existing interface until C4 is answered).

## 3. Environments and sequencing

Approach: fix-everything-first, deploy-once. All adapter implementation and security work happens against a local Supabase instance (`supabase start` via the CLI) or a private throwaway project nobody outside this work sees. Nothing is public until verification (§7) passes. Only then is the real production Supabase project provisioned and the real Vercel deployment stood up, in a single cutover (§10).

Rationale: given the timeline is 2-4 weeks with no fixed drop-dead date, this trades a bit of early visibility for the guarantee that BACC (or anyone else) never sees an unfixed version. It also avoids running two parallel Supabase projects (staging + production) that would otherwise need to be kept in sync during active development — added at the cost of no incremental "it's alive" checkpoint until near the end, which should be managed with clear internal milestones (§12) rather than external ones.

## 4. Component: Supabase repository adapter

`src/data/repositories/supabase/index.js` implements the same interface every other repository in `src/data/repositories` already implements, so no component above the repository layer changes. It is built and iterated against the local/dev Supabase instance from §3, in parallel with the RLS fixes in §5 — the adapter's queries need to be written against the RLS policies as they will actually exist post-fix, not the current broken ones, so adapter work should trail RLS work by roughly one fix at a time rather than being written all at once against a moving target.

Interface surface: CRUD for checklist instances, submissions, incidents (NOC), work orders, approvals, notifications, profiles, and the storage-backed operations (photos, signatures, PDF exports, work-order-export bucket). `VITE_DATA_SOURCE` continues to select mock vs. supabase at build/runtime, per the existing pattern — this deployment does not change that switch mechanism, only what's behind it.

## 5. Component: Supabase security and RLS fixes

Fixed in root-cause order, each verified live against the local instance before moving to the next, per the audit's own sequencing guidance (items 1-3 are root causes; fixing them shrinks the blast radius of everything after).

**5.1 Role self-escalation.** Two independent holes: the `profiles_update_own` RLS policy has no column restriction (a user can update their own `role`), and `handle_new_user()` trusts client-supplied `raw_user_meta_data->>'role'` at signup. Fix: restrict `profiles_update_own` to a column allow-list that excludes `role`, and change `handle_new_user()` to assign a fixed default role server-side, never trusting the signup payload. This is fixed first because nearly every other policy keys off `profiles.role`.

**5.2 Missing RLS on three tables.** `approvals`, `checklist_instances`, and `notifications` (all added in `008_phase3.sql`) currently ship with RLS enabled at the table level but no policies defined, which in Postgres means no access at all through the anon-key path once RLS is turned on for real use — or, if RLS was never actually enabled on these three, means unrestricted access. Either way, each needs explicit, role-appropriate SELECT/INSERT/UPDATE policies mirroring the pattern already used correctly on `submissions` and `incidents`.

**5.3 Sign-off and self-acknowledgment forgery.** `submissions_update_own` has no status/locked constraint and OR-combines permissively with the OM-only policy, letting an inspector acknowledge their own submission. `signoffs_insert_related` and `wo_signoffs_insert_related` check the relation but never check that the inserter's own role matches the role they're inserting as, letting any related user forge an OM/COO/CEC row. Fix: add the missing status check to the inspector-side policy, and add an explicit `auth.uid()`-to-`profiles.role` match check to both sign-off insert policies.

**5.4 Approver reopen path (new, decided 2026-09-08).** BACC's actual correction workflow is that an approver marks a NO SAT item SAT directly on the same submitted inspection, not "reject and resubmit" or "fresh inspection required" — which supersedes the earlier "fully immutable, corrections always create a new record" design. The existing Postgres immutability triggers on `submissions`/`incidents`/`work_orders` need to change from "block all UPDATEs once submitted" to "block all UPDATEs once submitted, except a defined reopen operation restricted to the approver role for that record's department." Concretely: add a `reopened_at`/`reopened_by` audit pair to the submission record, gate the reopen operation through a dedicated RLS policy (not the general update policy) that checks the caller is the assigned approver, and keep the trigger blocking every other field from changing except the specific item(s) being corrected and the audit pair. This keeps the audit's "genuinely bypass-proof" property for everyone except the one authorized path, and keeps a record of who reopened what and when. Flag to the user: BACC's own §14 non-negotiable rule about not changing approved form content, and the written §11 permanent-record language, are both worth a one-line heads-up to BACC that the actual implemented workflow now diverges from that written text — a client-communication item, not a build blocker.

**5.5 Remaining critical items.** Auth on all 5 Vercel API functions (§6). Path traversal in the PDF export endpoints — `fieldMap.basePdf`/`templateKey` from the POST body currently go straight into `path.join()` + `readFileSync` with no allow-list; fix by validating both against a fixed allow-list of known template keys before any filesystem access. No CSP/HSTS/security headers anywhere (§6).

**5.6 Remaining high-severity items.** Column-level protection on `profiles.stored_signature_data_uri` (currently exposed to every authenticated user via the table-level `profiles_select_authenticated` policy) — fix via a view or column-level grant rather than widening RLS further. Owner-scoping on the `work-order-exports` storage bucket, matching every sibling bucket. Mass-assignment gaps: add the missing `locked=false` check to `submissions`/`incidents`/`work_orders` UPDATE policies (now qualified per §5.4 — locked, with the approver reopen exception). Rate limiting and unbounded attacker-controlled array caps on the PDF/report endpoints, closed off by the same fix as the path-traversal item and the auth fix in §6. The `navigator.onLine`-based offline-write gate should check actual Supabase reachability, not just the local network signal — real testing on Android tablets (per the C5 answer) makes this concrete rather than theoretical. Cross-department write gaps on `incident_updates`/`incident_attachments` insert policies.

## 6. Component: Vercel API function hardening

All 5 functions (`api/export-checklist-pdf.js`, `api/export-noc-register.js`, `api/export-report-pdf.js`, `api/export-work-order.js`, `api/generate-checklist-instances.js`) currently have zero auth — reachable by anyone with the URL. Fix: each function validates a Supabase JWT from the request (the same session token the SPA already holds) before doing any work, and re-checks the caller's role/relationship to the requested record server-side rather than trusting query parameters. Security headers (CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options` or equivalent `frame-ancestors`) get added to `vercel.json` — relevant because the session token currently lives in `localStorage`, so a CSP that blocks unexpected script origins meaningfully reduces XSS blast radius even though no XSS vector is currently known.

## 7. Verification before anything goes public

Before any deploy: re-run the audit's checklist (or a fresh targeted audit) specifically against the now-implemented adapter and the §5.4 reopen path, since the original audit explicitly assumed the stub and several findings need re-verification against real query code. Run the existing `verify:*` scripts (`verify:pdf`, `verify:signoffs`, `verify:walkthrough`, `verify:palette`, `verify:content`). Add a minimal GitHub Actions workflow that runs these on every push — there is currently zero CI, and this is the only thing standing between "looks fixed" and "stays fixed" as more annexes get touched later. This is intentionally minimal: lint/test/verify on push, not a full deployment pipeline.

## 8. Data flow (representative path)

Login → Supabase Auth issues a session JWT → `profiles.role` (server-assigned, per §5.1) determines what the SPA renders and what RLS permits. Inspector fills a checklist, submits → `submissions` INSERT policy checks role and department match → immutability trigger locks the record. Approver reviews → marks an item NO SAT → SAT via the §5.4 reopen path → RLS policy checks approver role and department assignment → trigger allows only the audited reopen operation, blocks everything else. PDF export requested → SPA calls the relevant Vercel function with its session JWT → function validates the JWT and the caller's relationship to the record (§6) → function reads the approved base PDF + field map (validated against the allow-list from §5.5) → `pdf-lib` overlay → response.

## 9. Error handling

Offline-write gate switches from checking `navigator.onLine` alone to also probing actual Supabase reachability, so a real outage while "online" queues writes instead of throwing (this was already an open finding; fixing it here rather than deferring it, since Android tablets — the confirmed device per C5 — will hit real airfield connectivity gaps in practice). Rate limiting and array-size caps on the export/generation endpoints turn attacker-controlled or malformed input into a clean 4xx rather than a resource-exhaustion event. No error-tracking SDK or global error boundary currently exists anywhere in the app; given this is now going to real infrastructure, add a minimal React error boundary at the app-shell level and a lightweight error-tracking hook (even just structured console logging captured by Vercel's own log drain, rather than pulling in a new third-party SDK given the timeline) so a production failure doesn't just show a blank page with nothing captured.

## 10. Production provisioning and cutover

Once §7 verification passes: provision the real Supabase project. Run all migrations (`001` through `009`, plus whatever new migration implements §5.1-5.6) against it. Seed demo data respecting §14's controlled-document rule — the seed data must use the real approved form structure and content, not placeholder text that misrepresents the actual forms. Set Vercel env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, plus any server-side var the now-authenticated API functions need). Add the security headers to `vercel.json` (§6). Connect the custom domain if one exists; otherwise use the default Vercel subdomain. Keep the `.env.example`'s existing staging/preview guidance in mind for any future Vercel preview deploys — those should point at a separate, non-production Supabase project so a preview build never writes to real compliance records, even though this initial cutover itself is a single production deploy.

## 11. Go-live day checklist

Real login on the production URL. One full checklist submission end-to-end, including the PDF overlay export (the part most tied to real file assets present in production). One deliberate test of the §5.4 reopen path by an approver account. One deliberate attempt at a forbidden action per major role (e.g., inspector attempting self-acknowledgment, non-approver attempting a sign-off forgery) to confirm RLS actually blocks it in production, not just in the local dev instance. Confirm the offline queue behaves correctly on an Android tablet with connectivity actually disabled, not just `navigator.onLine` toggled in devtools.

## 12. Timeline

2-4 week window, no fixed external date. Suggested internal pacing: root-cause fixes (§5.1-5.4) and adapter work in week 1; remaining critical/high fixes (§5.5-5.6) and Vercel hardening (§6) in week 2; verification and CI (§7) in week 2-3; production provisioning and cutover (§10-11) in week 3-4, leaving buffer before the 2-4 week ceiling.

## 13. Risks and open dependencies

Phase II's original $7,500/4-week contracted budget was already a known risk before this security work was added on top — worth surfacing to BACC regardless of this deployment's own timeline. BACC's B2 (deficiency category taxonomy) answer is still pending and unrelated to this deployment's critical path, but should be chased in parallel since it blocks a Phase III item. The §5.4 reopen-path divergence from BACC's own written §11 requirement should be communicated to BACC as a heads-up, not left implicit. No fixed external deadline exists yet for this deployment specifically, which is good for quality but means schedule slippage will only be caught by whoever is tracking the internal pacing in §12 — worth a lightweight check-in cadence rather than assuming it self-corrects.
