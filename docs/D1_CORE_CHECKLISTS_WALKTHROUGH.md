# D1 Data Move, Part 3a: Walkthrough

This puts the new checklist database and data API on the live server, **switched off**. The portal keeps using Supabase until the 3c cutover, so users see no change.

**Your time:** about 20 minutes.
**Cost:** nothing extra.

Related files:
- Spec: `docs/superpowers/specs/2026-10-09-d1-core-checklists-design.md`
- Plan: `docs/superpowers/plans/2026-10-09-d1-core-checklists.md`

Claude built and tested this branch (`feat/d1-core-checklists`) and also ran the independent review. It reaches your PC as a git bundle in `Claude outputs/`.

---

## Part A: Bring the branch in (5 minutes)

```powershell
cd "D:\Entrepreneur\Vision Forge Ltd\Airport Authorit Project\bacc-project-main"
git checkout main
git pull
git status
```
If `docs/superpowers/specs/2026-10-09-d1-core-checklists-design.md` is listed as **untracked**, delete it. The branch carries the same file.

```powershell
git bundle verify "Claude outputs\d1-core-checklists.bundle"
git fetch "Claude outputs\d1-core-checklists.bundle" feat/d1-core-checklists:feat/d1-core-checklists
git checkout feat/d1-core-checklists
npm ci
npm test
```
`npm test` should end with every test passing (0 failing).

## Part B (optional): Try it on your PC (10 minutes)

1. `npx wrangler d1 migrations apply bacc-portal-db --local`, then answer **yes**.
2. Put `VITE_DATA_SOURCE=d1` in `.env.local`, then run `npm run dev`.
3. Sign in with your **local** admin. Open a checklist, save it, submit it and export the PDF. You'll see that the camera buttons are gone. On Annex K, drawings stop at "6 of 6".
4. In a second terminal, run the end-to-end check:
   ```powershell
   $env:SMOKE_ADMIN_EMAIL="admin@local.test"; $env:SMOKE_ADMIN_PASSWORD="<your local admin password>"
   npm run data:smoke
   ```
   It should end with **All checks passed**.
   - It only ever runs against your PC, never the live site.
   - If you run another smoke test straight after, wait a minute first, because sign-ins are limited to 20 per minute.
5. Put `.env.local` back the way it was, then close that terminal.

## Part C: Put it on the live server (5 minutes)

### C1. Merge and deploy
```powershell
git checkout main
git merge --no-ff --no-edit feat/d1-core-checklists
git push
```
Watch **GitHub → Actions**. **verify** should turn green, then **deploy**.

### C2. Create the new tables in the live database
```powershell
npx wrangler d1 migrations apply bacc-portal-db --remote
```
Answer **yes**. It should list `0002_core.sql` as applied.

### C3. Check nothing changed for users
At `https://bacc.visionforgestudio.app`:
1. Sign in with your **normal Supabase account**. It works as before.
2. Open a checklist and export the PDF. It works.

**Don't** run `npm run d1:import-config` yet. That copies your schedule and settings across at the 3c cutover.

---

## If something goes wrong

| Problem | Fix |
|---|---|
| `git bundle verify` fails | Tell Claude. Don't fetch from it |
| `git checkout` says an untracked file would be overwritten | Delete that file (the branch has its own copy), then repeat |
| `npm test` fails | Paste the output here |
| `data:smoke` shows `FAIL` lines | Paste the whole output here |
| `verify:walkthrough` fails | This happens on `main` too. The check still looks for the old sign-in email box. CI skips it, so it's not caused by this branch |
| Live site broke after C1 | Cloudflare → Workers & Pages → **bacc-portal** → **Deployments** → the previous version → **Rollback**, then tell Claude |

## What's next

1. ✅ Hosting on Cloudflare
2. ✅ Cloudflare login
3. D1 data move:
   - **3a ✅ checklists** (live, switched off)
   - 3b incidents and work orders
   - 3c switch-over
4. Security review and pilot launch
