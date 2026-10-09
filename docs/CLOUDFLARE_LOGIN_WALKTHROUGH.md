# Cloudflare Login Walkthrough (Sub-project 2)

This builds the new Cloudflare login and puts it on the live server, **switched off**. The portal keeps using Supabase logins until the D1 data move (sub-project 3), so your users see no change.

**Your time:** about 45 minutes, plus however long Cursor takes.
**Cost:** nothing extra. D1 is included in Workers Paid.

Related files:
- Spec: `docs/superpowers/specs/2026-10-08-cloudflare-auth-design.md`
- Plan: `docs/superpowers/plans/2026-10-08-cloudflare-auth.md`
- Cursor prompt: `docs/CURSOR_PROMPT_CLOUDFLARE_AUTH.md`

---

## Part A: Before Cursor (about 10 minutes)

### A1. Commit these docs
```powershell
cd "D:\Entrepreneur\Vision Forge Ltd\Airport Authorit Project\bacc-project-main"
git checkout main
git pull
git add docs/superpowers/specs/2026-10-08-cloudflare-auth-design.md docs/superpowers/plans/2026-10-08-cloudflare-auth.md docs/CURSOR_PROMPT_CLOUDFLARE_AUTH.md docs/CLOUDFLARE_LOGIN_WALKTHROUGH.md
git commit -m "docs: Cloudflare login spec, plan, Cursor prompt and walkthrough"
git push
```
This push only changes docs. GitHub will redeploy the same site, which is harmless.

### A2. Create the D1 database
```powershell
npx wrangler d1 create bacc-portal-db
```
- If it says you're not logged in, run `npx wrangler login` first.
- It prints a block that includes `"database_id": "xxxxxxxx-xxxx-…"`. **Copy that ID.** You'll paste it into Cursor. It's not a secret.
- If it asks whether to add the binding to `wrangler.jsonc`, answer **No**. Cursor adds it in a specific format.

### A3. Decide your admin login
Pick the **email** and **name** for the first admin, which is you. You'll set the password yourself in Part C. It never goes in a file or in chat.

---

## Part B: Let Cursor build it

1. Open `bacc-project-main` in Cursor.
2. Open `docs/CURSOR_PROMPT_CLOUDFLARE_AUTH.md` and copy everything **below the `---`**.
3. Paste it into Cursor's **Agent** chat, and at the end add:
   ```
   D1 database_id: <paste the ID from A2>
   ```
4. Let it run. **Cursor stops twice and asks you to do something:**
   - **Create a local test admin.** In the Cursor terminal, run:
     ```powershell
     npm run auth:create-admin -- --email admin@local.test --name "Local Admin"
     ```
     Type a password twice. You'll see `*` as you type, which is expected. This admin exists only on your computer.
   - **Run the local smoke test.** With `npm run dev` running, in a second terminal:
     ```powershell
     $env:SMOKE_ADMIN_EMAIL="admin@local.test"; $env:SMOKE_ADMIN_PASSWORD="<the password you just typed>"
     npm run auth:smoke
     ```
     It should end with **All checks passed**.
5. Cursor finishes with a summary. Paste it here and I'll check it before you go live.

### What Cursor will also have you look at (Task 9)
It temporarily switches your local app to the new login so you can see it:
- the login form
- the **"Choose your password"** screen a new user sees
- **Reset password** in Settings → Users & roles

Then it switches back.

---

## Part C: Put it on the live server (about 15 minutes)

### C1. Merge and deploy
```powershell
git checkout main
git pull
git merge --no-ff --no-edit feat/cloudflare-auth
git push
```
`--no-edit` skips the Vim screen from last time. Then watch **GitHub → Actions**: **verify** turns green, then **deploy**.

It's safe to deploy before the tables exist, because nothing uses the new login yet.

### C2. Create the tables in the live database
Run this on `main` (you're already there after C1), because the database binding now exists in `wrangler.jsonc`:
```powershell
npx wrangler d1 migrations apply bacc-portal-db --remote
```
Answer **yes** when it asks. It should list `0001_auth.sql` as applied.

### C3. Create your real admin account
```powershell
npm run auth:create-admin -- --email <your real email> --name "<Your Name>" --remote
```
Type your password twice, using at least 10 characters. You should see `Admin … created in PRODUCTION D1.`

### C4. Live smoke test
```powershell
$env:SMOKE_ADMIN_EMAIL="<your real email>"; $env:SMOKE_ADMIN_PASSWORD="<that password>"
npm run auth:smoke -- --url https://bacc.visionforgestudio.app
```
It should end with **All checks passed**. It creates two test users named `smoke-…@example.invalid` and deactivates them at the end. That's expected.

Then close that PowerShell window, so the password doesn't stay in the session.

### C5. Confirm nothing changed for users
At `https://bacc.visionforgestudio.app`:
1. Sign in with your **normal Supabase account**, as before. It works.
2. Export a checklist PDF. It works.

That's it. The new login is live but hidden, waiting for sub-project 3.

---

## If something goes wrong

| Problem | Fix |
|---|---|
| `wrangler d1 create` says the name already exists | Run `npx wrangler d1 list` and use the ID shown for `bacc-portal-db` |
| Deploy fails mentioning D1 or the binding | The `database_id` in `wrangler.jsonc` doesn't match. Compare it with `npx wrangler d1 list` |
| `auth:create-admin` says UNIQUE constraint failed | That email already exists. Use another, or carry on with the existing account |
| Smoke test shows `FAIL` lines | Paste the whole output here |
| Live site login or exports broke after C1 | Cloudflare → Workers & Pages → **bacc-portal** → **Deployments** → previous version → **Rollback**, then tell me |

---

## What's next

1. ✅ Hosting on Cloudflare
2. ✅ **Cloudflare login** (built, live, switched off)
3. **D1 data move:** a new empty database for the pilot, the secure data API, **photo uploads off**, and the switch to the new login
4. Security review and pilot launch
