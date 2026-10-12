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

1. **Config import (remote)** — you run it.
2. **Create your admin and the staff accounts on D1.**
3. **Switch production to D1** (merge/deploy with `VITE_DATA_SOURCE=d1`).
4. **Live check** on https://bacc.visionforgestudio.app.

Do not flip the site to D1 before steps 1 and 2.

---

## Rollback — read this before you start

Rollback = set the deploy build back to `VITE_DATA_SOURCE=supabase`, push
`main`, wait for GitHub Actions to deploy. Users sign in with Supabase again
and see the old Supabase data.

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

### C1. Config import (remote)

```powershell
npm run d1:import-config -- --remote
```

Enter the service-role key. Confirm the dry run. You should see schedule
rules and settings written to **production** D1.

### C2. Admin and staff on D1 (before the flip)

The Worker already exposes D1 login and `/api/users/*` on the live host even
while the SPA is still built for Supabase. Create accounts here, then flip.

**First admin** (skip if you already created one in production D1):

```powershell
npm run auth:create-admin -- --email <your email> --name "<Your Name>" --remote
```

Type a password (≥10 characters) twice. You should see
`Admin … created in PRODUCTION D1.`

**Staff** — for each person, while authenticated as that admin against
production (`POST /api/auth/login`, then `POST /api/users/create` with the
session cookie, same fields as Settings → Users & roles: full_name, email,
position, department, role, is_approver). Save each temporary password
somewhere safe offline.

Easier alternative if you prefer the UI: create only your admin in this step,
flip in C3, then immediately Add user for every staff member in
Settings → Users & roles **before** you invite anyone else. Do not hand out
temp passwords until the accounts exist. The important part is: import and
the accounts you need are ready before the team uses the new login.

Each person later: sign in → **Choose your password** → the app loads.

Do not create BACC staff until you have decided it is D1 day.

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

At https://bacc.visionforgestudio.app:

1. Sign in with your D1 admin (email + password from C2).
2. Confirm Settings look right (imported).
3. Open All Checklists / schedule context — rules present as imported.
4. Optionally start a draft checklist (you can discard it). Do **not** file
   real pilot work until you are happy; filing makes rollback lossy (see
   above).

---

## After a good live check

- Hand temp passwords to staff; each completes **Choose your password**.
- Leave Supabase removal for a later PR (separate commits), after a few
  stable days.
- Profile photos stay **off** (initials only) for the pilot. Avatars are a
  later add-on.

---

## How to roll back

1. On `main`, in `.github/workflows/verify.yml`, set the **deploy** job's
   `VITE_DATA_SOURCE` back to `supabase`.
2. Commit, push, wait for deploy.
3. Confirm Supabase login and old data on the live site.

Remember: anything filed on D1 after C3 is not in Supabase.

---

## If something goes wrong

| Problem | Fix |
|---|---|
| Import dry run skips every rule | Form codes in Supabase do not match the registry — paste the skip list |
| Admin create says UNIQUE constraint | That email already exists in production D1 — sign in with it or use another |
| Live site still shows Supabase login after C3 | Wait for the deploy job; hard-refresh. Confirm the deploy log shows `VITE_DATA_SOURCE=d1` |
| Need to undo before staff file work | Rollback steps above |
| Staff already filed on D1 and you must undo | Rollback restores Supabase UX/data only; D1 filings stay in D1 unused — tell the team |

---

## What's next

1. ✅ Hosting on Cloudflare  
2. ✅ D1 login (built)  
3a–3b ✅ Core checklists + incidents on D1 (switched off until this cutover)  
3c **This cutover**  
4. Security review and pilot with BACC staff  
