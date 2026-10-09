# Cloudflare Go-Live Walkthrough: BACC Portal on `bacc.visionforgestudio.app`

This is your step-by-step guide for **sub-project 1** of the Cloudflare migration: serving the portal from a Cloudflare Worker. The app still uses Supabase for now. Cursor writes the code, and you handle the accounts, keys and dashboards.

**Time:** about 1–2 hours of your own time, plus however long Cursor takes.
**Cost:** Cloudflare Workers Paid, **$5/month**.

Related files in the repo:
- Spec: `docs/superpowers/specs/2026-10-08-cloudflare-workers-hosting-design.md`
- Plan: `docs/superpowers/plans/2026-10-08-cloudflare-workers-hosting.md`
- Cursor prompt: `docs/CURSOR_PROMPT_CLOUDFLARE_WORKERS_HOSTING.md`

---

## Part A: Before Cursor starts (about 20 minutes)

### A1. Check the domain is on Cloudflare
1. Log in at **dash.cloudflare.com**.
2. Under **Websites** (or **Domains**), find `visionforgestudio.app`. Its status must be **Active**.
   - If it's missing or says "Pending nameserver update", the domain isn't on Cloudflare yet. Click **Add a domain**, follow the steps, and change the nameservers at your registrar to the two Cloudflare gives you. Wait until it shows **Active**, which can take minutes to hours.

### A2. Turn on Workers Paid ($5/mo)
1. Left sidebar: **Compute (Workers)** → **Workers & Pages** → **Plans**.
2. Choose **Workers Paid** → **Purchase**.
   - This is required. On the free plan, PDF export would fail, because the free plan allows 10 ms of CPU per request and stamping a form takes much longer.

### A3. Copy your Account ID
1. **Workers & Pages** → **Overview**. The **Account ID** is on the right side.
2. Copy it into a notes file for now (call it **ACCOUNT_ID**).

### A4. Create the API token GitHub will deploy with
1. Click your profile icon (top right) → **My Profile** → **API Tokens** → **Create Token**.
2. Next to **Edit Cloudflare Workers**, click **Use template**.
3. Under **Account Resources**, choose **Include → your account**.
4. Under **Zone Resources**, choose **Include → Specific zone → visionforgestudio.app**. This limits the token to this one domain.
5. **Continue to summary** → **Create Token**.
6. Copy the token now, because it's only shown once. Save it as **CF_API_TOKEN** in your notes. Don't paste it anywhere else.

### A5. Get your Supabase values ready
Open `bacc-project-main\.env.local` and find:
- `VITE_SUPABASE_URL`, which looks like `https://xxxx.supabase.co`
- `VITE_SUPABASE_ANON_KEY`, a long string starting with `eyJ…`

Cursor puts both into `wrangler.jsonc`. They're public values, and the browser already uses them.

You also need the **service-role key**: Supabase dashboard → your project → **Project Settings** → **API Keys** → **service_role** → **Reveal**. **Keep this one secret.** You'll paste it into a terminal prompt in Part C, and nowhere else.

### A6. Add GitHub secrets and variables
Go to the repo on GitHub → **Settings** → **Secrets and variables** → **Actions**.

**Secrets** tab → **New repository secret**, twice:

| Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | the CF_API_TOKEN from A4 |
| `CLOUDFLARE_ACCOUNT_ID` | the ACCOUNT_ID from A3 |

**Variables** tab → **New repository variable**, twice:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | from `.env.local` |
| `VITE_SUPABASE_ANON_KEY` | from `.env.local` |

### A7. Make sure Poppler is installed (needed for the PDF comparison)
In PowerShell, run `pdftoppm -v`.
- If it prints a version, you're set.
- If it says "not recognized", install Poppler. The simplest way is `winget install oschwartz10612.Poppler`. Then close and reopen PowerShell and try again. `npm run verify:pdf` already needs it, so you may have it.

---

## Part B: Let Cursor build it (on a branch)

### B1. Get the latest code
```powershell
cd "D:\Entrepreneur\Vision Forge Ltd\Airport Authorit Project\bacc-project-main"
git checkout main
git pull
git status
```
`git status` should say "working tree clean". If it doesn't, commit or stash your changes first.

Then commit the three new docs (spec, plan, Cursor prompt) and this walkthrough to `main`:
```powershell
git add docs/superpowers/specs/2026-10-08-cloudflare-workers-hosting-design.md docs/superpowers/plans/2026-10-08-cloudflare-workers-hosting.md docs/CURSOR_PROMPT_CLOUDFLARE_WORKERS_HOSTING.md docs/CLOUDFLARE_GO_LIVE_WALKTHROUGH.md
git commit -m "docs: Cloudflare Workers hosting spec, plan, Cursor prompt and walkthrough"
git push
```
> This push to `main` only changes docs. Vercel will redeploy, which is harmless because no app code changed.

### B2. Run the Cursor prompt
1. Open `bacc-project-main` in Cursor.
2. Open `docs/CURSOR_PROMPT_CLOUDFLARE_WORKERS_HOSTING.md`, copy everything **below the `---` line**, and paste it into Cursor's **Agent** chat.
3. Let it work through Tasks 0–8. It creates the branch `feat/cloudflare-workers-hosting` and commits as it goes.
4. **Watch for "stop and report" moments.** The prompt tells Cursor to stop on parity failures, missing values or install errors. If it stops, paste its message into a chat with Claude.

### B3. Check Cursor's hand-back
When Cursor finishes Task 8, it summarises its work. Confirm:
- ✅ **Parity:** six cases, all `100% match`, for both "Task 4" and "Task 6"
- ✅ `npm test` and every `npm run verify:*` check pass
- ✅ It says whether it used the **Task 6 fallback**. Either answer is fine, but you want to know.

### B4. Quick test on your own machine
```powershell
npm run dev
```
Open **http://localhost:5173**:
1. Sign in.
2. Open a submitted checklist and click **Export PDF**. It downloads and looks right.
3. Do the same for a work order and the NOC register.

Press `Ctrl + C` in the terminal to stop it.

---

## Part C: One-time Wrangler setup (about 5 minutes)

### C1. Log Wrangler into Cloudflare
```powershell
npx wrangler login
```
A browser window opens. Click **Allow**, then return to PowerShell.

### C2. Store the Supabase service-role key as a Cloudflare secret
```powershell
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```
- It asks for the value. Paste the **service_role key** from A5 and press Enter.
- If it asks to create the Worker `bacc-portal`, answer **Yes**.

> This key lets the "Create user" screen make logins. It lives only inside Cloudflare, never in code or GitHub.

---

## Part D: Freeze Vercel (your safety net)

The new code removes the Vercel API functions, so the next Vercel build from `main` would break the live Vercel site. Turn off auto-deploy and Vercel will keep serving its **last good version** untouched. That frozen version is your rollback.

1. **vercel.com** → your BACC project → **Settings** → **Git**.
2. Disconnect the Git repository, or turn on **Ignored Build Step** with the command `exit 0` so it never builds.
3. Note your Vercel URL (e.g. `https://<something>.vercel.app`). That's the rollback address.

---

## Part E: Go live

### E1. Merge the branch
```powershell
git checkout main
git pull
git merge --no-ff feat/cloudflare-workers-hosting
git push
```

### E2. Watch the deploy
GitHub repo → **Actions** → the newest **Verify** run.
- The **verify** job runs first (tests, PDF checks, build).
- Then the **deploy** job runs. At the end of its log you should see `https://bacc.visionforgestudio.app`.
- The first deploy also creates the DNS record and SSL certificate. Give it 1–5 minutes before testing.

**If deploy fails:**
- "Authentication error" → the `CLOUDFLARE_API_TOKEN` secret is wrong. Redo A4 and A6.
- "cpu_ms … not allowed on free plan" → Workers Paid isn't active. Redo A2.
- "zone not found" / custom domain error → `visionforgestudio.app` isn't Active on this account. Redo A1.

### E3. Smoke test (every item must pass)

In PowerShell:
```powershell
curl.exe -s -o NUL -w "%{http_code}\n" https://bacc.visionforgestudio.app/
curl.exe -s -w "\n%{http_code}\n" -X POST -H "Content-Type: application/json" -d "{}" https://bacc.visionforgestudio.app/api/export-report-pdf
```
Expected: `200` for the first. For the second, `{"error":"Missing Authorization bearer token"}` followed by `401`. That second result is good: it shows the API refuses anyone who isn't logged in.

In the browser at **https://bacc.visionforgestudio.app**:
| # | Do this | Expect |
|---|---|---|
| 1 | Sign in with your normal account | Dashboard loads |
| 2 | Export Annex D, a VAES form (e.g. C-08), the NOC register, a work order and a report | Each PDF downloads and looks correct |
| 3 | As admin: Settings → Users & roles → create a test user | Success |
| 4 | Sign in as an inspector and try creating a user | Refused |
| 5 | Go to `/checklists/mine` and press F5 | Page reloads normally, not a 404 |
| 6 | On a phone: open the site → "Add to Home Screen" → turn on airplane mode → open the app | App shell opens |
| 7 | Cloudflare dashboard → Workers & Pages → **bacc-portal** → **Observability** | Export requests listed, CPU time well under 30 s |

### E4. Retire the Vercel config
Once **all** of E3 passes:
```powershell
git rm vercel.json
git commit -m "chore: retire Vercel config after Cloudflare cutover"
git push
```
**Don't delete the Vercel project yet.** Keep the frozen version as a fallback until the D1 work (sub-project 4) is live.

---

## If something goes wrong after go-live

- **Quick rollback:** send testers the old Vercel URL from Part D. Nothing else changes, since both point at the same Supabase data.
- **Bad deploy:** Cloudflare dashboard → **bacc-portal** → **Deployments** → choose the previous version → **Rollback**.
- **See errors:** **bacc-portal** → **Observability** → **Logs**. API errors are logged as JSON lines with `"level":"error"`.

---

## What's next (later sub-projects)

1. ✅ **Hosting on Cloudflare** (this guide)
2. **Replace login.** Choose and wire a sign-in system that runs on Cloudflare.
3. **Move data to D1.** New database, a secure API, and **photo uploads turned off for the pilot**.
4. **Security review and pilot launch.** Re-run the audit checks, add pilot users, and open to BACC testers.
