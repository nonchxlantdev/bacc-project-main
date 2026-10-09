# Cursor Prompt — Move Hosting to Cloudflare Workers (Sub-project 1)

Paste into Cursor's agent chat with `bacc-project-main` open.

---

You are implementing the plan in
`docs/superpowers/plans/2026-10-08-cloudflare-workers-hosting.md`, which
implements the design in
`docs/superpowers/specs/2026-10-08-cloudflare-workers-hosting-design.md`.
**Read the spec and the plan in full before writing any code.** The spec
outranks the plan, and the plan outranks this prompt. Also read `CLAUDE.md`
first. It has load-bearing conventions, including the rule about verifying
custom Tailwind variants after a build.

**What this work is.** Move the BACC portal off Vercel onto one Cloudflare
Worker (`bacc-portal`) at `bacc.visionforgestudio.app`. The app **keeps using
the existing Supabase backend**. Only the hosting and the six `/api` routes
move. The client (`src/`) doesn't change.

**The one thing that must not change:** every exported PDF. Task 1 captures
a baseline before you touch anything. Tasks 4 and 6 must each show
**100% visual match** against it with `scripts/parity-compare.mjs`. A
mismatch is a blocker, not a warning.

## Explicitly out of scope — do not touch

- Supabase Auth, the Supabase adapter (`src/data/repositories/supabase/`),
  migrations, or RLS. Replacing auth is sub-project 2, and D1 is sub-project 3.
- Turning off photo uploads or attachments. That happens in sub-project 3.
- Field maps (`src/data/field-maps/`), checklist schemas
  (`src/data/checklists/`), approved PDFs (`src/assets/forms/`), and
  `scripts/verify-placement.mjs`. These are controlled documents (§14).
- `server/overlay*.js` and `server/reportPdf.js`, except the single
  `dataUriToBytes` change in Task 2.
- Any UI, styling or copy change.
- Cloudflare Access, R2, D1, or Cloudflare's rate-limit binding.

## How to work

1. **Follow the plan's tasks in order (0 → 8)**, step by step, checking off
   each `- [ ]` as you go. Every code block in the plan is the complete
   intended content. Use it as written. Don't "improve" it on the way in.
2. **TDD where the plan says so.** Write the test, run it and **see it fail
   for the stated reason**, implement, then run it and see it pass. If a test
   fails for a different reason than the plan predicts, stop and work out why
   before continuing.
3. **Commit after each task** with the message the plan gives. Stay on
   branch `feat/cloudflare-workers-hosting`. **Never merge to `main` or push
   to `main`.** The user does that in Task 9, after turning off Vercel's
   auto-deploy.
4. **The shell is Windows PowerShell.** Use the commands exactly as the plan
   writes them (`curl.exe`, `Select-String`, `Get-ChildItem`).
5. **Never** commit `.dev.vars`, `.env.local`, `worker/formAssets.js` or
   `worker/generated/`. **Never** put `SUPABASE_SERVICE_ROLE_KEY` in
   `wrangler.jsonc`, any `VITE_*` variable or any committed file.
6. In Task 6 Step 5, fill `wrangler.jsonc` `vars` from `VITE_SUPABASE_URL`
   and `VITE_SUPABASE_ANON_KEY` in `.env.local`. These are public values. If
   `.env.local` doesn't have them, stop and ask the user rather than
   inventing values.

## Stop and report (don't work around) if

- Task 1's baseline export throws for any case.
- Task 3's "every field map resolves" test fails for a specific form. That's
  a pre-existing data problem.
- Any parity compare (Task 4 Step 12, Task 6 Step 15) shows less than 100%.
- `npm install` can't resolve `wrangler@^4` or `@cloudflare/vite-plugin`.
- Task 6 Step 12 doesn't find `sw.js`. Apply the plan's written **Fallback**
  exactly, then report that you did.
- Any existing `npm run verify:*` check, or `npm test`, starts failing.

## Task 9 is not yours

Task 9 (go-live and cutover) needs the user's Cloudflare, GitHub and Vercel
dashboards. When Task 8 is committed, stop and hand back a short summary
covering:

- every commit on the branch (`git log --oneline main..HEAD`)
- the parity results from Task 4 Step 12 and Task 6 Step 15 (all six cases)
- whether the Task 6 fallback was used
- the exact `form manifest: …` counts from Task 6 Step 3
- anything you had to stop and ask about

The user follows `docs/CLOUDFLARE_GO_LIVE_WALKTHROUGH.md` from there.
