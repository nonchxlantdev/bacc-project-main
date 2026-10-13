# D1 Data Move, Part 3c: Cutover Walkthrough

This turns the live portal from Supabase onto Cloudflare D1 login and the D1
data API.

**Your time:** about 30–45 minutes on cutover day (plus staff password handoff).

Related files:
- Spec: `docs/superpowers/specs/2026-10-12-d1-cutover-design.md`
- Plan: `docs/superpowers/plans/2026-10-12-d1-cutover.md`

---

## What moves and what does not

| Copied to D1 | Not copied — pilot starts fresh |
|---|---|
| Schedule rules | Checklists / submissions |
| Settings | Incidents and updates |
| | Work orders |
| | Photos and history |

`npm run d1:import-config` copies **configuration only**. Existing Supabase
checklists and incidents stay in Supabase. After you switch production to D1,
new work is filed only in D1.

---

## Cutover-day order (do it in this order)

1. **Cloudflare sign-in check** — `wrangler whoami` (no CI tokens in the shell).
2. **Config import (remote)** — you run it.
3. **Create your admin on D1** (staff come after the live check, via the UI).
4. **Empty the offline queue** on every staff device still on the Supabase build.
5. **Switch production to D1** (merge/deploy with `VITE_DATA_SOURCE=d1`).
6. **Live check** on https://bacc.visionforgestudio.app (private window, Ctrl+F5).
7. **Add staff** in Settings → Users & roles, then hand out temporary passwords.

Do not flip the site to D1 before steps 1–4.

---

## Rollback — read this before you start

**Instant rollback:** Cloudflare → Workers & Pages → `bacc-portal` → Deployments
→ previous (Supabase) version → Rollback. That puts the old SPA back immediately.

**Make it stick:** on `main`, set the deploy job's `VITE_DATA_SOURCE` back to
`supabase`, commit and push, so the next GitHub Actions deploy does not flip
to D1 again.

**Rollback works cleanly only until staff start using D1.** Any record filed
on D1 after the flip (checklist, incident, etc.) **will not be in Supabase**
after a rollback. Those rows stay in D1 unused; nothing copies them back. If
something looks wrong, roll back **before** people file real work.

---

## Before cutover day

### B1. Preflight

- Parts 3a and 3b are on `main`; remote migrations `0002_core.sql` and
  `0003_incidents.sql` are already applied.
- Local branch `feat/d1-cutover` is reviewed; PR is open (or ready).
- You have the Supabase **service-role** key ready (typed at a prompt — never
  pasted into chat or a file).

### B2. Optional local rehearsal

```powershell
cd "D:\Entrepreneur\Vision Forge Ltd\Airport Authorit Project\bacc-project-main"
npm run d1:import-config
```

Enter the service-role key when asked (you will not see it as you type). Read
the dry run, then confirm to write into **local** D1.

---

## Cutover day

### C0. Cloudflare sign-in check (before C1)

The remote config import talks to Cloudflare as **you**, not as the CI token.
Clear any CI credentials from this shell first, then confirm Wrangler is
signed in interactively:

```powershell
Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue
Remove-Item Env:CLOUDFLARE_ACCOUNT_ID -ErrorAction SilentlyContinue
npx wrangler whoami
```

You should see your Cloudflare account email. If the remote import later fails
with **error 7403** (authentication / account), run:

```powershell
npx wrangler logout
npx wrangler login
```

Then retry `whoami` and continue.

### C1. Config import (remote)

```powershell
npm run d1:import-config -- --remote
```

Enter the service-role key. Confirm the dry run. You should see schedule
rules and settings written to **production** D1.

### C2. Admin on D1 (before the flip)

The Worker already exposes D1 login and `/api/users/*` on the live host even
while the SPA is still built for Supabase. Create **only your admin** here,
then flip. Staff accounts come after the live check (see “After a good live
check” below).

**First admin** (skip if you already created one in production D1):

```powershell
npm run auth:create-admin -- --email <your email> --name "<Your Name>" --remote
```

Type a password (≥10 characters) twice. You should see
`Admin … created in PRODUCTION D1.`

Do not create BACC staff until after C4. Do not hand out temporary passwords
until those accounts exist in Settings → Users & roles.

> Footnote — API route (only if the UI is unreachable): while authenticated as
> that admin against production (`POST /api/auth/login`, then
> `POST /api/users/create` with the session cookie), same fields as
> Settings → Users & roles: full_name, email, position, department, role,
> is_approver. Prefer the UI.

### C2b. Empty the offline queue (before the flip)

Every staff device that has been using the live portal must clear its
browser offline queue **while the site is still on Supabase**, before you
merge.

On each device:

1. Open https://bacc.visionforgestudio.app while **online**.
2. Wait until the status shows **All caught up**.
3. If you see **N items failed to sync — tap to retry**, tap **Retry** until
   it clears.
4. Submit any drafts they care about (or deliberately discard them).
5. **Stop filing** until you say the new login is ready.

**Why:** the SPA keeps a local queue (`src/utils/offlineQueue.js`) and flushes
it from `AppShell.jsx` when the network returns. Queued writes from the
Supabase build would otherwise replay against D1 after the switch — wrong
backend, wrong shape, or silent failures. An empty queue means the cutover
starts clean.

### C3. Switch production to D1

```powershell
git checkout main
git pull
git merge --no-ff --no-edit feat/d1-cutover
git push
```

Watch **GitHub → Actions**: **verify** green, then **deploy** green. The
deploy job builds with `VITE_DATA_SOURCE=d1`.

### C4. Live check

Use a **private / incognito window** and hard-refresh with **Ctrl+F5** so you
are not looking at a cached Supabase SPA.

At https://bacc.visionforgestudio.app:

1. Sign in with your D1 admin (email + password from C2).
2. Confirm Settings look right (imported).
3. Open All Checklists / schedule context — rules present as imported.
4. Optionally start a draft checklist (you can discard it). Do **not** file
   real pilot work until you are happy; filing makes rollback lossy (see
   above).

---

## After a good live check

1. **Add staff** in Settings → Users & roles (Add user for each person).
2. Hand temporary passwords to staff; each completes **Choose your password**.
3. Leave Supabase removal for a later PR (separate commits), after a few
   stable days — only when you say “D1 is live and stable”.
4. Profile photos stay **off** (initials only) for the pilot. Avatars are a
   later add-on.

---

## How to roll back

1. **Instant:** Cloudflare dashboard → Workers & Pages → `bacc-portal` →
   Deployments → select the previous (Supabase) deployment → **Rollback**.
   Users immediately get the old SPA and Supabase data again.
2. **Make it stick:** on `main`, in `.github/workflows/verify.yml`, set the
   **deploy** job's `VITE_DATA_SOURCE` back to `supabase`. Commit, push, wait
   for Actions. Otherwise the next deploy from `main` would build D1 again
   and undo the dashboard rollback.
3. Confirm Supabase login and old data on the live site (private window,
   Ctrl+F5).

Remember: anything filed on D1 after C3 is not in Supabase.

---

## If something goes wrong

| Problem | Fix |
|---|---|
| Import fails with error 7403 | `wrangler logout` then `wrangler login`; clear `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` from the shell |
| Import dry run skips every rule | Form codes in Supabase do not match the registry — paste the skip list |
| Admin create says UNIQUE constraint | That email already exists in production D1 — sign in with it or use another |
| Live site still shows Supabase login after C3 | Private window + Ctrl+F5; wait for the deploy job; confirm the deploy log shows `VITE_DATA_SOURCE=d1` |
| Offline queue still has failed items | Stay on Supabase; Retry until “All caught up”; do not merge until every device is clear |
| Need to undo before staff file work | Rollback steps above (dashboard first, then pin `supabase` on main) |
| Staff already filed on D1 and you must undo | Rollback restores Supabase UX/data only; D1 filings stay in D1 unused — tell the team |

---

## What's next

1. ✅ Hosting on Cloudflare  
2. ✅ D1 login (built)  
3a–3b ✅ Core checklists + incidents on D1 (switched off until this cutover)  
3c **This cutover**  
4. Security review and pilot with BACC staff  
