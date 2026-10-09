# Cursor Prompt — Cloudflare Login (Sub-project 2)

Paste into Cursor's agent chat with `bacc-project-main` open. **Also paste the D1 `database_id`** from walkthrough step A2 at the end of your message.

---

You are implementing the plan in
`docs/superpowers/plans/2026-10-08-cloudflare-auth.md`, which implements
the design in `docs/superpowers/specs/2026-10-08-cloudflare-auth-design.md`.
**Read the spec and the plan in full before writing any code.** The spec
outranks the plan, and the plan outranks this prompt. Read `CLAUDE.md` first,
especially the "Hosting: one Cloudflare Worker" section, which describes the
Worker you're extending.

**What this work is.** A new email/password login that runs entirely on
Cloudflare: the Worker plus a D1 database called `bacc-portal-db`. It's built,
tested and deployed now, but **the live portal keeps using Supabase**. Users
see no change until the D1 data move (sub-project 3) switches it on. Existing
PDF exports must keep working for today's Supabase users.

**The D1 database already exists.** The user created it and gives you its
`database_id` at the end of this message. Use it in Task 0 Step 2. **Never
run `wrangler d1 create`**, and never run anything with `--remote`.

## Explicitly out of scope — do not touch

- Any Supabase code path, migration, RLS policy, or `src/data/repositories/supabase/`.
  Don't remove `/api/create-user` or the Supabase bearer fallback.
- `src/data/repositories/index.js` / `getDataSource()`. In this phase,
  `VITE_DATA_SOURCE=d1` deliberately means "D1 login + mock data".
- The offline queue (`src/utils/offlineQueue.js`). It already keeps failed jobs.
- PDF overlay code, field maps, checklist schemas and approved PDFs.
- Stored signatures, avatars, profile self-editing, email sending,
  "Forgot password" and 2FA.
- `.github/workflows/verify.yml`. No CI change is needed; D1 is just a binding.

## How to work

1. **Follow Tasks 0 → 10 in order**, checking off each `- [ ]`. Every code block
   is the complete intended content, so use it as written. In Task 9, apply the
   listed find/replace edits exactly. If a "find" string doesn't exist verbatim,
   stop and report it rather than guessing.
2. **TDD:** write the test, see it fail for the stated reason, implement, then
   see it pass. Commit after each task with the given message.
3. **Branch `feat/cloudflare-auth`.** Never merge or push to `main`.
4. **Windows PowerShell.** Run the commands as written.
5. **Two steps need the user at the keyboard:**
   - **Task 8 Step 4:** `npm run auth:create-admin` prompts for a password.
     Ask the user to run it and tell you when it's done. Never invent,
     hard-code or log a password.
   - **Task 8 Step 5:** the smoke run needs `SMOKE_ADMIN_PASSWORD`. Ask the user
     to set it in the terminal. Don't put it in any file.
6. **Never commit** `.env.local`, `.dev.vars`, `.wrangler/`, `worker/formAssets.js`
   or `worker/generated/`. In Task 9 Step 14 you temporarily set
   `VITE_DATA_SOURCE=d1` in `.env.local`. **Restore it afterwards.**

## Stop and report (don't work around) if

- You can't find the `database_id`.
- Any test fails for a reason other than the one the plan predicts.
- `npm run auth:smoke` against local reports any `FAIL`.
- The PDF parity compare in Task 10 is below 100% on any case.
- Any existing `npm test` or `verify:*` check starts failing.
- A Task 9 "find" string isn't in the file.

## Task 11 is not yours

After Task 10 is committed, stop and hand back:

- `git log --oneline main..HEAD`
- the full output of the local `npm run auth:smoke`
- the parity result from Task 10
- anything you had to stop and ask about

The user follows `docs/CLOUDFLARE_LOGIN_WALKTHROUGH.md` from there.
