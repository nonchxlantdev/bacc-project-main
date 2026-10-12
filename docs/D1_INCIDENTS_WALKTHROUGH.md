# D1 Data Move, Part 3b: Walkthrough

This puts incidents, incident updates, numbering, work orders and work-order approvals on the live server, **switched off**. The portal keeps using Supabase until the 3c cutover, so users see no change.

**Your time:** about 15 minutes.

Related files:
- Spec: `docs/superpowers/specs/2026-10-12-d1-incidents-design.md`
- Plan, including the review fixes: `docs/superpowers/plans/2026-10-12-d1-incidents.md`

Claude built, tested and independently reviewed this branch (`feat/d1-incidents`). It reaches your PC as a git bundle in `Claude outputs/`.

---

## Part A: Bring the branch in (5 minutes)

First stop anything holding files open. That means Ctrl+C in any `npm run dev` window, and closing Cursor. Then:
```powershell
taskkill /F /IM workerd.exe
cd "D:\Entrepreneur\Vision Forge Ltd\Airport Authorit Project\bacc-project-main"
git checkout main
git pull
git status
```
If `docs/superpowers/specs/2026-10-12-d1-incidents-design.md` is listed as **untracked**, delete it.

```powershell
git bundle verify "Claude outputs\d1-incidents.bundle"
git fetch "Claude outputs\d1-incidents.bundle" feat/d1-incidents:feat/d1-incidents
git checkout feat/d1-incidents
npm test
```
`npm test` should show every test passing and 0 failing. If it complains about missing packages, run `npm ci` first.

## Part B (optional): Try it on your PC

1. `npx wrangler d1 migrations apply bacc-portal-db --local`, then answer **yes**. It should list `0003_incidents.sql`.
2. Make sure `.env.local` has `VITE_DATA_SOURCE=d1`, then run `npm run dev`.
3. Sign in with your local admin and walk through the flow:
   - On a checklist, mark an item **NO SAT** and add a remark.
   - Use **Create Incident**. It gets a real number, for example `INC-2026-0001`.
   - On the incident, set the unit and due date, then move the status through Assigned, In Progress and Resolved.
   - Click the SAT circle on the related item and confirm.
   - Close the incident.

   You'll notice there's no Photos tab, and the checklist item now reads SAT.
4. Run the end-to-end check from a second terminal:
   ```powershell
   $env:SMOKE_ADMIN_EMAIL="admin@local.test"; $env:SMOKE_ADMIN_PASSWORD="<your local admin password>"
   npm run data:smoke
   ```
   It should end with **All checks passed**.
5. Put `.env.local` back the way it was.

## Part C: Put it on the live server (5 minutes)

**C1. Merge and deploy**
```powershell
git checkout main
git merge --no-ff --no-edit feat/d1-incidents
git push
```
Wait for **verify**, then **deploy**, to turn green in GitHub → Actions.

**C2. Create the new tables in the live database**
```powershell
npx wrangler d1 migrations apply bacc-portal-db --remote
```
Answer **yes**. It should list `0003_incidents.sql`.

**C3. Check nothing changed for users**

Sign in at `https://bacc.visionforgestudio.app` with your normal account, then open the Incidents page and a checklist.

---

## If something goes wrong

| Problem | Fix |
|---|---|
| `npm ci` says EPERM or EBUSY | Stop dev servers with `taskkill /F /IM workerd.exe` and `taskkill /F /IM node.exe`, close Cursor, run `Remove-Item -Recurse -Force node_modules`, then `npm ci` |
| `npm test` fails | Paste the last 20 lines here |
| `data:smoke` shows `FAIL` | Paste the whole output here |
| Live site broke after C1 | Cloudflare → Workers & Pages → **bacc-portal** → **Deployments** → the previous version → **Rollback** |

## What's next

3c, the switch-over:
1. Copy your schedule and settings from Supabase.
2. Turn on the D1 login and data for everyone.
3. Create the staff accounts.
4. Remove the Supabase code.
