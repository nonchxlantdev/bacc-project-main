# BACC OMP — Codebase Audit

Date: 2026-08-14 · Scope: `bacc-project-main` as committed
Method: read the tree, config, repository layer, business-rule modules, and verification scripts. Findings are from the code, not the specs.

## Verdict

The build is in better shape than most demos at this stage. The repository layer is real, `belizeTime.js` is careful, the safety gates exist, and the palette work was done properly. Three things will bite — one is a hard runtime error, one will misbehave in front of BACC, and one gives false assurance on the compliance requirement the whole project rests on.

---

## Critical

### 1. `workOrders.js` calls `getRepos()` without importing it

`src/lib/workOrders.js` imports only `airportYmd` from `belizeTime.js`, then uses `getRepos()` in four exported functions:

```js
import { airportYmd } from './belizeTime.js';   // ← only import
...
export async function persistWorkOrder(record) {
  return getRepos().workOrders.persist(record);  // ReferenceError
}
```

`persistWorkOrder`, `listWorkOrders`, `getWorkOrder`, and `upsertWorkOrderRemote` all throw `ReferenceError: getRepos is not defined` on first call. **The entire Annex H work-order flow is broken at runtime.** It was not caught because there are no tests and the path may not have been clicked through.

Fix: add `import { getRepos } from '../data/repositories/index.js';`

### 2. The SLA countdown runs on real time while the demo runs on a simulated clock

`IncidentDetailPage.jsx:76`:

```js
const sla = incident ? slaState(incident.target_date) : { kind: 'none' };
```

No `now` argument, so `slaState` falls back to `now = new Date()` — real wall-clock. Meanwhile the store runs on `demoNow`, seed data is anchored to it, `refreshInstanceStatuses` uses it, and Settings exposes an "advance clock" control.

Two consequences: the "days remaining" badge will contradict every other date in the demo as soon as `demoNow` drifts from today, and advancing the demo clock moves instance statuses but leaves the SLA badge frozen. This is the kind of thing that shows up mid-demonstration.

Fix: thread the store clock through — `slaState(incident.target_date, nowMs())` — and audit for other `new Date()` calls in render paths.

---

## Correctness and compliance risk

### 3. `verify:pdf` does not verify what it appears to verify

`scripts/verify-pdf.mjs` generates **blank** overlays and diffs those against the source PDFs:

```js
run('scripts/pdf-diff.mjs', ['tmp-pdf-diff/overlay-blank.pdf', 'src/assets/forms/annex-d-drainage-ed01.pdf']);
```

A blank overlay stamps nothing, so it will always match the source at ~100%. This is a useful check — it proves `pdf-lib` round-trips the approved base without corrupting it — but it proves **nothing about field placement**. A field map with every coordinate wrong would pass.

BACC acceptance criterion #11 asks for a page-by-page comparison of the *generated* PDF against the approved source. That is currently uncovered, while the passing script implies otherwise.

Fix: add a populated-fixture diff. Render a known submission, and assert (a) the base geometry still matches outside the field regions, and (b) stamped values land inside their declared boxes. A cheap version: diff populated-vs-blank and check that changed pixels fall only within mapped field rectangles.

### 4. Corrections share state with the locked original

`submissions.js`:

```js
export function createCorrection(original, user) {
  return { ...original, id: newSubmissionId(), ... };  // shallow
}
```

`items` is an object and is copied **by reference**. The mock repository does no cloning on persist (no `structuredClone`/JSON round-trip anywhere in `mock/index.js`). So editing a correction's items mutates the locked original held in the store.

For a system whose central compliance claim is "submitted records are never overwritten," this is the one invariant that must hold. It is currently violable in memory.

Fix: deep-clone in `createCorrection`, and clone on write in the mock repo so the store never hands out live references.

### 5. Work-order numbers contain `TEMP` and random hex

`workOrders.js`:

```js
work_order_number: `WO-${year}-TEMP-${crypto.randomUUID().slice(0, 6)}`,
```

"Work Order Number" is a controlled field on Annex H. `WO-2026-TEMP-a3f9c1` printed onto an approved regulatory form is not acceptable as a record identifier, and unlike the NOC number it has no sequence behind it.

Fix: mirror the NOC approach — a per-year sequence assigned on issue.

### 6. Re-inspection date comparison bypasses airport time

`incidentLifecycle.js`:

```js
return String(date) >= String(incident.reported_at).slice(0, 10);
```

Slicing an ISO timestamp takes the **UTC** calendar date. Everywhere else the codebase is disciplined about airport-local dates. At UTC−6 an incident reported after 18:00 local rolls to the next UTC day, so a same-day re-inspection can be wrongly rejected at the closure gate.

Fix: `airportYmd(Date.parse(incident.reported_at))`.

---

## Gaps against the specs

### 7. The scheduler silently handles only monthly checklists

`instanceGeneration.js`:

```js
for (const rule of rules) {
  if (rule.frequency !== 'monthly') continue;   // silent skip
```

The schema allows daily, weekly, monthly, quarterly, semi-annual, annual and ad-hoc. The VAES family is mostly daily, weekly, semi-annual and annual — so once forms beyond Annex D are configured, **most of them will generate no instances at all, with no error**. Annex D is monthly, which is why this hasn't surfaced.

Fix: implement the other cadences, or throw/log on an unsupported frequency rather than skipping. Silent no-ops are the worst failure mode here.

### 8. Magic number in overdue → missed

`refreshInstanceStatuses` hardcodes `ageDays > 14` for `missed`. Not in any spec, not configurable, and adjacent to SLA policy that is explicitly awaiting BACC. Move it to config with the other pending values.

### 9. No automated tests

Nothing under `src` or `scripts` matches `*.test.*` or `*.spec.*`, and there is no test runner in `package.json`.

The rules most worth testing are exactly the ones with consequences: the closure gate, the three work-order safety gates, instance-generation idempotency, airport-timezone boundaries, and record immutability. Finding #1 is a one-line import error that any smoke test would have caught.

A small Vitest suite over `lib/` — pure functions, no UI — would cover most of this cheaply.

### 10. `slaState` re-implements the airport offset

`deficiencyLevels.js` builds `` `${targetDate}T23:59:59-06:00` `` by hand instead of using `belizeTime.js`, whose header says due/overdue logic **must** use its helpers. Correct today (Belize has no DST) but it is a second source of truth.

---

## Housekeeping and deployment

### 11. GitHub Pages leftovers conflict with the Vercel target

`vite.config.js` still carries `base = process.env.GITHUB_PAGES === 'true' ? '/bacc-project-main/' : '/'` and a `spaFallback404Plugin`, inherited from the old project. `.github/workflows/` exists but is **empty**.

GitHub Pages cannot run `/api/*` functions, so a Pages deploy produces an app where every PDF export fails — quietly, since the UI would just error. Either delete the Pages path or document that Vercel is the only supported target.

### 12. Working-tree clutter

`tmp-annex-g-coords.json`, `tmp-annex-h-coords.json`, `tmp-pdf-diff/` and `dist/` are all present. They are gitignored (correctly), but `dist/` in particular shouldn't be sitting in the tree, and the tmp coord files look like field-mapper output that should either be promoted into `src/data/field-maps/` or deleted.

### 13. PWA icons are the wrong shape

`vite.config.js` declares `pgia-logo.png` at both `192x192` and `512x512`. That asset is **3999×1676** — a wide, transparent wordmark. Installed-app icons will be distorted, and `purpose: 'any maskable'` on a transparent wide logo will crop badly. Generate proper square icons.

### 14. README is two lines

For a project with eight migrations, an overlay pipeline, a field-mapper tool and three verification scripts, there is no setup, run, or verification documentation. The next person — or the next Cursor session — starts cold.

### 15. `Locations` and `Users` are stubs presented as finished

Both are ~40-line placeholders but appear in the sidebar without the `soon: true` marker that `Projects` and `Documents` carry. In a demo they read as broken features rather than unbuilt ones.

---

## What is genuinely good

Worth stating, because these were the hard parts and they were done right:

- **The repository layer is real.** `VITE_DATA_SOURCE` switches implementations, components go through `useRepos`, and the Supabase adapter throws a clear "not wired" message instead of failing silently. Wiring the backend will be an adapter swap, as intended.
- **`deficiencyLevels.js` holds the line.** No assumed severity ordering, `targetDays: null`, categorical colours, and a comment explaining why. Exactly right given BACC hasn't answered.
- **`belizeTime.js` is careful** — `Intl` with an explicit zone, airport-local day boundaries, no naive `Date` arithmetic.
- **Instance generation is idempotent** via the `assignment_rule_id|period_start` key, as specced.
- **The safety gates exist and are enforced** — area cleared, NOTAM reference, CEC clearance, and the re-inspection closure gate.
- **Charts follow the rules** — no dual axis, entity-stable colour per bar, `<title>` tooltips, percentage axis fixed at a sane max.
- **"Documents" is spelled correctly** in the sidebar; the mockup's "Locuments" typo didn't make it into code.

---

## Suggested order

1. Fix the missing import (#1) — one line, currently breaks work orders entirely
2. Thread the demo clock into SLA (#2) — before any BACC demonstration
3. Deep-clone corrections and mock writes (#4) — protects the core compliance claim
4. Make `verify:pdf` test populated output (#3) — otherwise the fidelity claim is unevidenced
5. Add a Vitest suite over `lib/` (#9) — locks in 1–4 and everything after
6. Work-order numbering (#5), airport-date comparison (#6), scheduler frequencies (#7)
7. Housekeeping: Pages leftovers, icons, README, tmp files
