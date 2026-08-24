# Clean Walkthrough Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Empty the portal completely, install BACC's real staff directory, open every form to everybody, explain the product inside the product, and put the NO SAT → SAT write-back under an end-to-end test.

**Architecture:** Two pure, unit-testable modules (`roleStaffing`, `seed/directory`) carry decisions that used to be implicit in the seed. The §4 role filter on form visibility is removed rather than extended — BACC's rule is that everyone can see every checklist on file. One Playwright script walks the whole loop and asserts the result. Guidance content lives in two plain data files under `src/content/` so wording changes never touch a component.

**Tech Stack:** React 19, React Router 7, Vite 7, Tailwind 4, `node:test` (built in, no new runner dependency), `playwright-core` against the Chromium already on disk.

## Global Constraints

- **BACC §14** — never modify wording, item numbering, section order, form identifiers, revision information, signatures or layout of an approved form. Nothing in this plan touches a schema or field map.
- **BACC §11** — a submitted checklist record is never overwritten. The one sanctioned exception is `amendItemResult` under `SYNC_SAT_ON_VERIFICATION`, which already exists and is not changed here.
- **Real staff emails are transcribed verbatim** from `BACCUsers and Departments.xlsx`, including `kareemnunez24@gmail.com`. Do not "correct" it to a `pgiabelize.com` address.
- **Demo accounts use `@pgia.local`**, which is not a deliverable domain. Never seed a real person against a `.local` address, and never seed a demo account against a real mailbox.
- **No new runtime dependencies.** `playwright-core` is added to `devDependencies` only.
- **Spec:** `docs/superpowers/specs/2026-08-20-clean-walkthrough-design.md`. Read it before Task 1.
- **Out of scope:** the SMS Aerodrome Hazard Reporting Form and the five Annex 5 Wildlife forms (pass two), the Users page visual redesign, role permission configuration (questions A3/A4), email delivery.

---

### Task 1: Which posts nobody holds

Every approved form names its owner, and five of those posts have no BACC employee behind them. That is a question for BACC, and a question asked inside the tool gets answered sooner than one sitting in a Word document. Compute the list from data so it shrinks by itself as accounts are added.

This does not affect who can open what — everyone can open everything (Task 2). It affects who an assignment rule points at, and what the Users page tells BACC is missing.

This task also introduces `npm test`. The project has no test runner today; `node --test` ships with Node 22 and needs nothing installed.

**Files:**
- Create: `src/lib/roleStaffing.js`
- Create: `tests/roleStaffing.test.js`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ROLE_TITLES: Record<string, string>` — role key → the post name printed on the forms.
  - `roleTitle(role: string): string` — the title, or the raw key if unknown.
  - `unstaffedRoles({ assignments, users }): string[]` — sorted role keys named by at least one assignment rule and held by no non-demo user. `assignments` is `[{ role, department }]`; `users` is `[{ role, is_demo? }]`.

- [ ] **Step 1: Write the failing test**

Create `tests/roleStaffing.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLE_TITLES, roleTitle, unstaffedRoles } from '../src/lib/roleStaffing.js';

const ASSIGNMENTS = [
  { department: 'Operations', role: 'om' },
  { department: 'Operations', role: 'duty_manager' },
  { department: 'Operations', role: 'apron_supervisor' },
  { department: 'Operations', role: 'cfr' },
  { department: 'Operations', role: 'coo' },
  { department: 'Engineering', role: 'electrical_tech' },
  { department: 'Engineering', role: 'cec' },
  { department: 'Maintenance', role: 'inspector' },
];

const STAFF = [
  { role: 'om' },
  { role: 'duty_manager' },
  { role: 'apron_supervisor' },
  { role: 'sms' },
];

const DEMO = { role: 'electrical_tech', is_demo: true };

test('a role held by a real employee is staffed', () => {
  const gaps = unstaffedRoles({ assignments: ASSIGNMENTS, users: STAFF });
  assert.ok(!gaps.includes('om'));
  assert.ok(!gaps.includes('apron_supervisor'));
});

test('a role no employee holds is reported, sorted', () => {
  const gaps = unstaffedRoles({ assignments: ASSIGNMENTS, users: STAFF });
  assert.deepEqual(gaps, ['cec', 'cfr', 'coo', 'electrical_tech', 'inspector']);
});

test('a demo account does not make a post look filled', () => {
  const gaps = unstaffedRoles({ assignments: ASSIGNMENTS, users: [...STAFF, DEMO] });
  assert.ok(gaps.includes('electrical_tech'), 'Glenrick is Vision Forge, not PGIA staff');
});

test('a role nothing is assigned to is not a gap', () => {
  const gaps = unstaffedRoles({ assignments: ASSIGNMENTS, users: STAFF });
  assert.ok(!gaps.includes('sms'), 'sms holds no assignment rule yet');
});

test('every role named by an assignment has a printable title', () => {
  for (const { role } of ASSIGNMENTS) {
    assert.equal(typeof ROLE_TITLES[role], 'string', `no title for ${role}`);
  }
  assert.equal(roleTitle('cfr'), 'Crash Fire & Rescue');
  assert.equal(roleTitle('nonsense'), 'nonsense');
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test tests/
```

Expected: FAIL — `Cannot find module '.../src/lib/roleStaffing.js'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/roleStaffing.js`:

```js
/**
 * Which posts on the approved forms nobody holds.
 *
 * Every form names its owner — Apron Supervisor, Crash Fire & Rescue, Civil
 * Engineering Consultant and so on — and BACC has supplied staff for four of
 * those posts. The rest are open questions, and an open question is far more
 * likely to get answered when it is visible in the product than when it is a
 * row in a Word document.
 *
 * So the gap list is derived rather than written down: compare the roles the
 * registry assigns work to against the roles the directory actually holds. Add
 * an account and the gap closes itself; add a form for a new post and the gap
 * opens itself.
 *
 * A demo account does not close a gap. Glenrick Spain is Vision Forge, not
 * PGIA — counting him as staff would hide the very question we are trying to
 * ask.
 *
 * This has nothing to do with who may open a form. Everyone can open every
 * form; see lib/templates.js.
 */

/** The post name as printed on the approved forms. */
export const ROLE_TITLES = {
  om: 'Operations Manager',
  coo: 'Chief Operations Officer',
  duty_manager: 'Duty Manager',
  apron_supervisor: 'Apron Supervisor',
  cfr: 'Crash Fire & Rescue',
  cec: 'Civil Engineering Consultant',
  inspector: 'Maintenance Inspector',
  electrical_tech: 'Electrical Maintenance Technician',
  sms: 'Safety Management System',
  admin: 'Administrator',
};

export function roleTitle(role) {
  return ROLE_TITLES[role] ?? role;
}

export function unstaffedRoles({ assignments = [], users = [] } = {}) {
  const held = new Set(users.filter((u) => !u?.is_demo).map((u) => u?.role));
  const named = new Set(assignments.map((a) => a?.role).filter(Boolean));
  return [...named].filter((role) => !held.has(role)).sort();
}
```

- [ ] **Step 4: Register the test script**

In `package.json`, add `"test"` as the first entry in `scripts`, immediately above `"dev"`:

```json
    "test": "node --test tests/",
    "dev": "vite",
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test
```

Expected: PASS — `# pass 5`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/roleStaffing.js tests/roleStaffing.test.js package.json
git commit -m "feat: derive which approved-form posts have no staff account"
```

---

### Task 2: Everyone sees every checklist

BACC's rule is that everyone can see every checklist on file, so the §4 role filter comes out rather than being extended. Today `templates.list(profile)` hides a form unless one of its assignment rules matches the viewer's role *and* department, which is why a Duty Manager cannot open an apron form and why nobody but the Operations Manager sees the whole library.

The assignment rules stay. They are still what says who a form belongs to and how often it runs — they simply stop being a lock on the door. That distinction is worth keeping clear in the code, because it is the thing most likely to be misread later.

**Files:**
- Modify: `src/data/repositories/mock/index.js:41-53`
- Modify: `src/lib/templates.js`
- Modify: `src/components/checklist/NewInspectionPicker.jsx` (comment on line 9)
- Modify: `src/data/templates/registry.js` (comment on line 80)

**Interfaces:**
- Consumes: nothing.
- Produces: `templates.list(profile)` returns every template for every caller, `profile` unused.

- [ ] **Step 1: Open the catalogue**

In `src/data/repositories/mock/index.js`, replace the body of `templates.list` (currently lines 41–53) with:

```js
      // Everyone sees every form. The assignment rules below still say who each
      // form belongs to and how often it runs, but they are not a permission —
      // BACC's rule is that any member of staff can see any checklist on file,
      // and an inspector who cannot open the form next to theirs cannot cover
      // for the person who normally fills it.
      //
      // `profile` is kept in the signature because callers pass it and because
      // this is where a restriction would go if BACC ever asks for one.
      async list() {
        return getStore().templates.map((tpl) => ({
          ...tpl,
          assignment_rules: getStore().assignment_rules.filter((r) => r.template_id === tpl.id),
        }));
      },
```

- [ ] **Step 2: Correct the three comments that claim otherwise**

Three comments assert a scoping rule that no longer exists. A stale comment about permissions is worse than no comment.

In `src/lib/templates.js`, replace the doc comment above `listTemplates`:

```js
/** Every template. Visibility is not scoped by role — see the mock repository. */
```

In `src/components/checklist/NewInspectionPicker.jsx`, line 9 currently reads `already limited to what this user's role and department may open (BACC §4).` Replace that line with:

```
 * every approved form, for anyone. Assignment rules say who a form belongs to,
 * not who may open it.
```

In `src/data/templates/registry.js`, line 80 currently reads `` `assignments` drives who sees the form and on what cadence (BACC §4). `` Replace it with:

```
 * `assignments` drives who a form belongs to and on what cadence. It is not a
 * permission — everyone can open every form.
```

- [ ] **Step 3: Check the build compiles**

```bash
npx vite build
```

Expected: `✓ built in …`.

- [ ] **Step 4: Confirm it by hand**

```bash
npm run dev -- --port 4174
```

Sign in as `glenrick.spain@pgia.local` (any password) and open All Checklists. Before this change he saw only the Engineering electrical forms. Confirm he now sees the whole library — apron forms, the Duty Manager form, Annex K and L, all of it. Stop the server.

Note: on a store saved before Task 3 the sign-in list will still be the old two accounts. That is expected until the seed version bumps.

- [ ] **Step 5: Commit**

```bash
git add src/data/repositories/mock/index.js src/lib/templates.js \
        src/components/checklist/NewInspectionPicker.jsx src/data/templates/registry.js
git commit -m "feat: everyone can open every approved form"
```

---

### Task 3: The real BACC directory

Nine records replace seven fictional ones, and the `sms` role is registered everywhere a role key is enumerated.

The directory becomes its own module. It is plain data with no JSON imports, which means it is testable under `node --test` — `generateSeed.js` is not, because it imports `.json` files the Vite way.

**Files:**
- Create: `src/data/seed/directory.js`
- Create: `tests/directory.test.js`
- Modify: `src/data/seed/generateSeed.js` (users block, lines 73–85)
- Modify: `src/config/incidentLookups.js` (`TEAM_BY_ROLE`)
- Modify: `src/components/settings/OtherSections.jsx` (`ROLE_LABELS`)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `PEOPLE: Array<{ n, email, full_name, position, role, department, is_demo?, is_approver? }>` — the directory in seed order, without ids.
  - `buildDirectory(seedId): Array<user row>` — full user rows with `id` and `can_login: true`.

- [ ] **Step 1: Write the failing test**

Create `tests/directory.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PEOPLE, buildDirectory } from '../src/data/seed/directory.js';

const seedId = (bucket, n) => `${bucket}-${n}`;
const build = () => buildDirectory(seedId);

test('the directory is the seven BACC staff plus two demo accounts', () => {
  assert.equal(PEOPLE.length, 9);
  assert.equal(PEOPLE.filter((p) => p.is_demo).length, 2);
});

test('every real employee has a pgiabelize address, except the one BACC gave as gmail', () => {
  const real = PEOPLE.filter((p) => !p.is_demo);
  const offDomain = real.filter((p) => !p.email.endsWith('@pgiabelize.com'));
  assert.deepEqual(
    offDomain.map((p) => p.email),
    ['kareemnunez24@gmail.com'],
    'transcribed verbatim from BACCUsers and Departments.xlsx',
  );
});

test('no demo account uses a deliverable address', () => {
  for (const person of PEOPLE.filter((p) => p.is_demo)) {
    assert.ok(person.email.endsWith('@pgia.local'), `${person.email} must not be a real mailbox`);
  }
});

test('Keagan Moore carries the approver flag from the spreadsheet', () => {
  const keagan = build().find((u) => u.email === 'kmoore@pgiabelize.com');
  assert.equal(keagan.is_approver, true);
  assert.equal(keagan.role, 'om');
});

test('Windell Thompson holds the new SMS role', () => {
  const windell = build().find((u) => u.email === 'wthompson@pgiabelize.com');
  assert.equal(windell.role, 'sms');
  assert.equal(windell.department, 'Operations');
});

test('every account can sign in, so each role can be demonstrated', () => {
  assert.ok(build().every((u) => u.can_login === true));
});

test('ids are stable and unique', () => {
  const ids = build().map((u) => u.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(build().map((u) => u.id), ids);
});

test('the two demo accounts are the ones we expect', () => {
  const demo = build().filter((u) => u.is_demo).map((u) => u.full_name);
  assert.deepEqual(demo, ['Shamira Young', 'Glenrick Spain']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test
```

Expected: FAIL — `Cannot find module '.../src/data/seed/directory.js'`.

- [ ] **Step 3: Write the implementation**

Create `src/data/seed/directory.js`:

```js
/**
 * Who uses the portal.
 *
 * The first seven are real PGIA staff, transcribed from BACC's own
 * `BACCUsers and Departments.xlsx` without correction — including the one Gmail
 * address, which is what BACC supplied and is therefore what is true.
 *
 * The last two are demo accounts on `@pgia.local`, a domain that does not
 * resolve. That is deliberate on both sides: it makes them obvious at a glance
 * next to seven real mailboxes, and it means no test notification can ever be
 * delivered to an employee once email is wired up.
 *
 * All nine can sign in, so every role can be shown from its own chair rather
 * than described from the Operations Manager's.
 *
 * Separate from generateSeed.js because that file imports the form schemas as
 * JSON the Vite way and cannot be loaded by Node. A directory this consequential
 * should be checkable by a test, so it lives where a test can reach it.
 */
export const PEOPLE = [
  { n: 1, email: 'kmoore@pgiabelize.com', full_name: 'Keagan Moore', position: 'Operations Manager', role: 'om', department: 'Operations', is_approver: true },
  { n: 2, email: 'masevedo@pgiabelize.com', full_name: 'Michael Asevedo', position: 'Duty Manager', role: 'duty_manager', department: 'Operations' },
  { n: 3, email: 'mhinkson@pgiabelize.com', full_name: 'Marsha Hinkson', position: 'Duty Manager', role: 'duty_manager', department: 'Operations' },
  { n: 4, email: 'edelacruz@pgiabelize.com', full_name: 'Edair de la Cruz', position: 'Duty Manager', role: 'duty_manager', department: 'Operations' },
  { n: 5, email: 'achable@pgiabelize.com', full_name: 'Andy Chable', position: 'Apron Supervisor', role: 'apron_supervisor', department: 'Operations' },
  { n: 6, email: 'kareemnunez24@gmail.com', full_name: 'Kareem Nunez', position: 'Apron Supervisor', role: 'apron_supervisor', department: 'Operations' },
  { n: 7, email: 'wthompson@pgiabelize.com', full_name: 'Windell Thompson', position: 'SMS', role: 'sms', department: 'Operations' },
  { n: 8, email: 'shamira.young@pgia.local', full_name: 'Shamira Young', position: 'Operations Manager (test account)', role: 'om', department: 'Operations', is_demo: true },
  { n: 9, email: 'glenrick.spain@pgia.local', full_name: 'Glenrick Spain', position: 'Electrical Maintenance Technician', role: 'electrical_tech', department: 'Engineering', is_demo: true },
];

export function buildDirectory(seedId) {
  return PEOPLE.map(({ n, ...person }) => ({
    id: seedId('user', n),
    ...person,
    can_login: true,
  }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test
```

Expected: PASS — `# pass 13`, `# fail 0`.

- [ ] **Step 5: Use it in the seed**

In `src/data/seed/generateSeed.js`, add to the imports:

```js
import { buildDirectory } from './directory.js';
```

Replace the entire `const users = [ … ];` block and its preceding comment (lines 73–85) with:

```js
  // See ./directory.js — BACC's real staff plus two demo accounts.
  const users = buildDirectory(seedId);
```

Leave the `byRole` helper and the `inspector` / `om` / `coo` / `cec` consts directly beneath it in place for now — Task 4 removes them along with the history that uses them.

- [ ] **Step 6: Register the sms role in the two places roles are enumerated**

In `src/config/incidentLookups.js`, extend `TEAM_BY_ROLE`:

```js
const TEAM_BY_ROLE = {
  cec: 'cec',
  electrical_tech: 'eec',
  // SMS raises hazards; the corrective work almost always lands on Maintenance,
  // which is the default anyway — listed so the role is visibly accounted for.
  sms: 'maintenance',
};
```

In `src/components/settings/OtherSections.jsx`, add `sms` to `ROLE_LABELS` after `electrical_tech` so it can be chosen as a notification recipient:

```js
  electrical_tech: 'Electrical Technicians',
  sms: 'Safety Management System',
```

- [ ] **Step 7: Verify the build still compiles**

```bash
npx vite build
```

Expected: `✓ built in …`.

- [ ] **Step 8: Commit**

```bash
git add src/data/seed/directory.js tests/directory.test.js src/data/seed/generateSeed.js \
        src/config/incidentLookups.js src/components/settings/OtherSections.jsx
git commit -m "feat: install BACC's real staff directory and the SMS role"
```

---

### Task 4: A clean environment

Everything seeded goes — every submission, incident, work order, approval, notification, activity entry **and every scheduled occurrence**. After this, a refresh gives you a portal holding exactly two things: the thirty approved forms, and the nine people. Nothing has been filed, and nothing has been scheduled either.

That means the Dashboard, Reports and My Checklists all open empty, and Shamira starts her walkthrough by picking a form from the catalogue rather than by finding one waiting for her. That is the intent — a clean environment, not a staged one. Automatic scheduling of recurring inspections stays where it already was on the backlog: it needs a scheduler that runs, and there isn't one yet.

`SEED_AS_OF` becomes the actual current date. It was pinned to `2026-08-15` because six months of hand-written history hung off it. With no history the pin has nothing to anchor and only does harm: `demoNow` drives every date the portal prefills and every "is this overdue" comparison, so a pinned date means Shamira fills in a form dated days before she sat down.

**Files:**
- Modify: `src/data/seed/generateSeed.js` (extensive)

**Interfaces:**
- Consumes: `buildDirectory` from Task 3.
- Produces: a store whose `submissions`, `incidents`, `work_orders`, `approvals`, `instances`, `notifications` and `activity` are all `[]`. Only `users`, `templates` and `assignment_rules` carry anything.

- [ ] **Step 1: Bump the version and make the date live**

In `src/data/seed/generateSeed.js`, replace the version block (lines 14–19) with:

```js
// Bumped to 10: the seeded Annex D history is gone, the directory is BACC's
// real staff list, and the schedule runs forward from today. A store saved
// before this holds fictional records attributed to people who do not work at
// PGIA and must regenerate.
export const SEED_VERSION = 10;

/**
 * The demo clock is the real clock.
 *
 * This was pinned to a fixed date because six months of hand-written history
 * hung off it and had to stay reproducible. With no history the pin has nothing
 * to anchor, and it still drives every date the portal prefills — so pinning it
 * only means an inspection carries a date days before the day it was filled in.
 */
export const SEED_AS_OF = airportYmd(Date.now());
```

Add `airportYmd` to the existing import from `belizeTime.js`. Step 2 deletes the last caller of `addAirportDays` in this file, so after both steps the import should read exactly:

```js
import { airportIso, airportYmd } from '../../lib/belizeTime.js';
```

Delete the `SEED_FROM` export entirely — nothing reaches back before today any more. Check nothing else imports it:

```bash
grep -rn "SEED_FROM" src/ scripts/
```

Expected: no matches after the deletion.

- [ ] **Step 2: Delete the history**

In `generateSeed`, delete every one of these and the helper functions they call:

- the `signoffs` helper and the `allSat` helper near the top of the file
- the `submission` factory function and the `submissions` array
- the `incidents`, `work_orders` and `approvals` arrays
- the `extraInstances` array
- the block that links `monthlySubs` to instances, and the `august` in-progress fix-up
- the `notifications` array and the whole `buildNotifications` function
- the `activity` array and the `act` helper
- `backfillCompletedHistory`, `closedOn`, `KEEP_OVERDUE` and `KEEP_MISSED`
- the `byRole` helper and the `inspector`, `om`, `coo`, `cec` and `template` consts
- the now-unused imports: `annexD`, `annexDFieldMap`, `flattenItems`, `emptyItemState`, and the `ITEMS` const
- the `u()` user factory (Task 3 replaced its only caller)
- `findSeedUserByEmail` stays — `AuthContext` uses it.

Then confirm nothing is left dangling:

```bash
grep -n "inspector\|backfill\|buildNotifications\|annexD\|SEED_FROM\|KEEP_\|addAirportDays" src/data/seed/generateSeed.js
```

Expected: no matches. `addAirportDays` appearing here means a deletion was missed — remove it from the `belizeTime` import once its last caller is gone.

- [ ] **Step 3: Schedule nothing**

Delete the `let instances = generatePendingInstances({ … });` call entirely (currently around line 620), along with the `generatePendingInstances` and `refreshInstanceStatuses` imports at the top of the file if nothing else in `generateSeed.js` uses them.

`src/lib/instanceGeneration.js` itself stays — `store.js` still calls `refreshInstanceStatuses` from `advanceClock`, and the module is what a real scheduler will be built on. It simply is not called at seed time any more.

Check the imports afterwards:

```bash
grep -n "instanceGeneration" src/data/seed/generateSeed.js src/data/repositories/mock/store.js
```

Expected: a match in `store.js` only.

- [ ] **Step 4: Return the empty collections**

Replace the returned object at the end of `generateSeed` with:

```js
  return {
    seedVersion: SEED_VERSION,
    demoNow: airportIso(asOf, '12:00:00.000'),
    users,
    templates,
    assignment_rules,
    submissions: [],
    incidents: [],
    work_orders: [],
    approvals: [],
    instances: [],
    notifications: [],
    activity: [],
  };
```

Every collection is empty. `users`, `templates` and `assignment_rules` are the only three that carry anything, and all three are derived from the approved forms and BACC's own staff list — configuration, not mock data.

- [ ] **Step 5: Point assignment rules at real staff, or at nobody**

An assignment rule for an unfilled post has no one to point at, and inventing a stand-in would paper over exactly the gap the Users page banner exists to show. Replace the `const assignee = …` line inside the `assignment_rules` builder (currently line 125) with:

```js
      // A real employee, or nobody. Five of these posts have no BACC account
      // yet; their rules carry a null assignee, which is the honest answer and
      // is what the Users page banner reports. Two Duty Managers hold the same
      // role, so `find` takes the first — deliberate, because the rule names
      // the post and any holder of it can pick the work up.
      const assignee = users.find((row) => row.role === a.role && !row.is_demo) ?? null;
```

- [ ] **Step 6: Verify the build compiles and the unit tests still pass**

```bash
npx vite build && npm test
```

Expected: `✓ built in …` then `# pass 13`, `# fail 0`. A build failure here is almost certainly a leftover reference to something deleted in Step 2 — the error names the identifier.

- [ ] **Step 7: Check every page survives being empty**

An empty collection is the case least likely to have been thought about. Every page that reads one has to render, not crash and not show `NaN`.

```bash
npm run dev -- --port 4174
```

Open `http://localhost:4174`, clear site data for the origin (DevTools → Application → Clear site data) so the version-10 seed regenerates, then sign in as `shamira.young@pgia.local` with any password. With the browser console open and no errors in it, confirm:

- **Dashboard** — renders. Counts read `0`, not blank and not `NaN`. Charts either draw an empty frame or say there is nothing to show.
- **My Checklists** — renders with an empty state, and the control for starting a new inspection works.
- **All Checklists** — lists all thirty forms.
- **Incidents**, **Approvals**, **Notifications** — each renders an empty state.
- **Reports** — renders. Its charts divide by counts, so this is the most likely place to find a `NaN` or a division by zero.
- **Users** — nine people.
- Sign out and back in as `glenrick.spain@pgia.local`; All Checklists still shows all thirty.

Any page that throws gets a guard added here rather than in a later task — an empty portal that crashes is not a clean environment. Stop the server when done.

- [ ] **Step 8: Commit**

```bash
git add src/data/seed/generateSeed.js
git commit -m "feat: empty the portal — no seeded records, nothing scheduled"
```

---

### Task 5: The Users page tells BACC what is missing

The page currently explains an arrangement that no longer exists ("Only two accounts can sign in; the rest exist because the seeded Annex D history is attributed to them"). It gets the real directory, an email column, a demo marker, and the staffing banner.

The login page's "Two accounts" copy is wrong for the same reason and is fixed here — it is the same sentence about the same fact, and splitting it across two tasks would let one ship without the other.

**Files:**
- Modify: `src/pages/UsersPage.jsx` (whole file)
- Modify: `src/pages/LoginPage.jsx:44-48`

**Interfaces:**
- Consumes: `roleTitle` and `unstaffedRoles` from Task 1; `is_demo` / `is_approver` on user rows from Task 3.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Rewrite the Users page**

Replace the entire contents of `src/pages/UsersPage.jsx` with:

```jsx
import { AlertTriangle } from 'lucide-react';
import { useUsers } from '../hooks/useRepos.js';
import { TEMPLATE_REGISTRY } from '../data/templates/registry.js';
import { roleTitle, unstaffedRoles } from '../lib/roleStaffing.js';

const ASSIGNMENTS = TEMPLATE_REGISTRY.flatMap((entry) => entry.assignments ?? []);

/**
 * Who uses the portal, and which posts on the approved forms nobody holds yet.
 *
 * The banner is the point of this page as much as the table is. Five posts are
 * named on approved forms and held by no BACC employee; that is a question for
 * BACC, and a question asked inside the tool they are being shown gets answered
 * sooner than the same question sitting in a Word document.
 */
export default function UsersPage() {
  const { rows } = useUsers();
  const gaps = unstaffedRoles({ assignments: ASSIGNMENTS, users: rows });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-navy sm:text-2xl">Users</h1>
      <p className="text-sm text-muted">
        Everyone who can sign in. Accounts marked <em>Test account</em> are for walkthroughs and are not PGIA
        staff.
      </p>

      {gaps.length > 0 && (
        <div className="rounded-lg border border-warning bg-warning-soft p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-navy">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden />
            {gaps.length} {gaps.length === 1 ? 'post has' : 'posts have'} no staff account yet
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {gaps.map((role) => (
              <li
                key={role}
                className="rounded-full border border-navy/15 bg-white px-2.5 py-0.5 text-xs font-medium text-navy"
              >
                {roleTitle(role)}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            The approved forms name these posts as their owner, and BACC has not yet told us who holds them.
            Anyone can still open and complete those forms — this is a record of who they belong to, not a lock.
            This list updates itself as accounts are added.
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-navy/10 bg-white shadow-sm">
        <table className="table-stack w-full text-left text-sm">
          <thead className="bg-navy text-white">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Position</th>
              <th className="px-4 py-2">Department</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id} className={i % 2 === 0 ? 'bg-stripe' : 'bg-white'}>
                <td data-label="Name" className="px-4 py-3 font-medium text-navy">{row.full_name}</td>
                <td data-label="Position" className="px-4 py-3">{row.position}</td>
                <td data-label="Department" className="px-4 py-3">{row.department}</td>
                <td data-label="Email" className="break-all px-4 py-3 text-muted">{row.email}</td>
                <td data-label="Notes" className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {row.is_approver && (
                      <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-teal">
                        Approver
                      </span>
                    )}
                    {row.is_demo && (
                      <span className="rounded-full bg-navy/10 px-2 py-0.5 text-[11px] font-semibold text-navy">
                        Test account
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Confirm the warning colours exist**

```bash
grep -n "warning" src/index.css
```

Expected: lines defining `--color-warning` and `--color-warning-soft`. If either is absent, use `border-alert bg-alert-soft` and `text-alert` in their place rather than inventing a token — `npm run verify:palette` enforces the approved palette and will fail on an unknown colour.

- [ ] **Step 3: Fix the login page copy**

In `src/pages/LoginPage.jsx`, replace the demo-mode paragraph (lines 44–48) with:

```jsx
        {!configured && (
          <p className="mt-3 rounded bg-stripe px-3 py-2 text-xs text-muted">
            Demo mode. Pick any account below to sign in as that person. Everyone can open every checklist;
            what differs is whose name goes on it. The password is not checked — real sign-in arrives with
            Supabase.
          </p>
        )}
```

- [ ] **Step 4: Keep the nine-account picker usable**

Nine buttons is a long list on a phone. In the same file, add a max height and scroll to the picker's container by changing `className="mt-4 grid gap-2"` to:

```jsx
          <div className="mt-4 grid max-h-64 gap-2 overflow-y-auto pr-1">
```

- [ ] **Step 5: Check it renders**

```bash
npm run dev -- --port 4174
```

Open `http://localhost:4174/users` signed in as any account. Confirm the banner lists five posts, the table shows nine people with emails, Keagan Moore is marked Approver, and Glenrick Spain is marked Test account and shows what he is covering. Narrow the window below 768px and confirm the table restacks into cards. Stop the server.

- [ ] **Step 6: Run the palette gate**

```bash
npm run verify:palette
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/UsersPage.jsx src/pages/LoginPage.jsx
git commit -m "feat: show the real directory and name the posts BACC has not filled"
```

---

### Task 6: Help and FAQ

A page that explains the portal to someone who has never used it, in one editable content file.

**Files:**
- Create: `src/content/faq.js`
- Create: `src/components/help/FaqAccordion.jsx`
- Create: `src/pages/HelpPage.jsx`
- Modify: `src/App.jsx`
- Modify: `src/components/layout/Sidebar.jsx`
- Modify: `src/components/layout/TopBar.jsx`

**Interfaces:**
- Consumes: `EMAIL_INTEGRATION_READY` from `src/config/settingsDefaults.js`, `WORK_ORDERS_ENABLED` from `src/lib/incidentLifecycle.js`.
- Produces: `FAQ_GROUPS: Array<{ id, title, questions: Array<{ q, a }> }>` — consumed by Task 7's cross-link, which targets `/help#incidents`.

- [ ] **Step 1: Write the content file**

Create `src/content/faq.js`:

```js
import { EMAIL_INTEGRATION_READY } from '../config/settingsDefaults.js';
import { WORK_ORDERS_ENABLED } from '../lib/incidentLifecycle.js';

/**
 * What the portal does, explained to someone who has never opened it.
 *
 * Separate from the page so BACC can reword any answer without a developer
 * touching a component — they will want to, and that should be easy.
 *
 * Two rules for anything added here. Write for an inspector on the apron, not
 * for an engineer: no file names, no code, no requirement section numbers. And
 * where an answer describes something that is switched on and off in the
 * codebase, read the switch rather than asserting a state — an answer that says
 * "email is not connected yet" becomes a lie the day it is.
 */
export const FAQ_GROUPS = [
  {
    id: 'getting-started',
    title: 'Getting started',
    questions: [
      {
        q: 'What is this portal for?',
        a: 'It replaces the paper inspection forms. You fill in the same approved form on screen, it is signed and filed the moment you submit it, and anything you mark NO SAT can be tracked through to being fixed and re-checked. The exported PDF is the same approved form, with your answers on it.',
      },
      {
        q: 'Which checklists can I see?',
        a: 'All of them. Every approved form is open to every member of staff, so you can always cover for someone or check what another team files. Each form still shows which post it belongs to and how often it runs — that tells you whose job it normally is, not whether you are allowed to open it.',
      },
      {
        q: 'What do SAT, NO SAT and N/A mean?',
        a: 'SAT means you checked it and it is satisfactory. NO SAT means you checked it and something is wrong. N/A means the item does not apply to what you were inspecting today. Every item needs one of the three before you can submit.',
      },
      {
        q: 'What do the colours mean?',
        a: 'Green is done or satisfactory. Amber is due soon or waiting on someone. Red is overdue, or a NO SAT that has not been resolved yet. Grey means nothing has happened yet.',
      },
    ],
  },
  {
    id: 'checklists',
    title: 'Filling in a checklist',
    questions: [
      {
        q: 'How do I start an inspection?',
        a: 'Go to My Checklists and use the button to start a new inspection, then pick the form you need from the list. Anything you have started but not finished stays on that page as a draft until you submit it.',
      },
      {
        q: 'Do I have to finish it in one sitting?',
        a: 'No. It saves as you go, on its own, and stays in My Checklists as a draft until you submit it. You can close the page and come back to it.',
      },
      {
        q: 'Does it work without a signal out on the airfield?',
        a: 'Yes. Your answers are kept on the device and sent when you are back in coverage. Keep the page open until then rather than clearing your browser.',
      },
      {
        q: 'Can I change an answer after I have submitted?',
        a: 'No. Once you submit, the checklist is the record of what you observed that day, and it is never edited afterwards — that is what makes it usable as evidence. If something was wrong, raise it with the Operations Manager; the correction is recorded as its own event rather than by rewriting history.',
      },
      {
        q: 'I submitted the wrong form by mistake. What now?',
        a: 'Tell the Operations Manager. The submitted record stays on file, and a fresh inspection is carried out and filed alongside it. Nothing is deleted.',
      },
      {
        q: 'How do I add a photo?',
        a: 'Each item has an attach control. Photos are stored with the inspection and appear on the exported PDF as extra pages after the form itself.',
      },
      {
        q: 'Where do I attach a drawing?',
        a: 'On the sections that ask for one — the form prints "Attach drawing" in those sections, and only those sections have the control.',
      },
      {
        q: 'Who has to sign?',
        a: 'Whoever the approved form names. Most forms want the person who did the inspection; some also want a manager to acknowledge it afterwards. The form shows you which signatures it is waiting for.',
      },
      {
        q: 'Does a signature drawn on a phone count?',
        a: 'The portal records your drawn signature along with your name, your position and the exact time you signed, and places all of it on the exported form. Whether that satisfies your auditor is a question we have put to BACC and not yet had answered.',
      },
    ],
  },
  {
    id: 'no-sat',
    title: 'When something is NO SAT',
    questions: [
      {
        q: 'What happens when I mark an item NO SAT?',
        a: 'The form asks you to describe what is wrong and where. When you submit, you can raise that item as an incident so somebody is made responsible for fixing it.',
      },
      {
        q: 'Do I have to raise an incident for every NO SAT?',
        a: 'Not for something you fixed on the spot — note it in the remarks. Raise an incident when the work needs somebody else, a part, or more time than you have.',
      },
      {
        q: 'Does raising an incident change my checklist?',
        a: 'No. Your checklist stays exactly as you filed it, with the item still reading NO SAT. What changes is that the item now shows a note saying work is under way, so nobody reading it later thinks the problem was ignored.',
      },
    ],
  },
  {
    id: 'incidents',
    title: 'Incidents',
    questions: [
      {
        q: 'What is a deficiency level?',
        a: 'How serious the problem is, on a scale of 1 to 4. BACC has not yet told us what each level means or how quickly each must be dealt with, so the portal does not assume — the levels and their response times are set on the Settings page, and can be filled in as soon as BACC confirms them.',
      },
      {
        q: 'How do I assign an incident?',
        a: 'Open it, choose the person under Assigned To, and set a target date. It cannot move past Reported until both are filled in — an incident with nobody responsible and no date is not being managed.',
      },
      {
        q: 'Who gets told about it?',
        a: EMAIL_INTEGRATION_READY
          ? 'The person it is assigned to, and whoever Settings lists for that kind of alert. They are notified in the portal and by email.'
          : 'The person it is assigned to, and whoever Settings lists for that kind of alert. They are notified inside the portal. Email alerts are set up and ready but not connected yet — that needs a sending address from BACC IT.',
      },
      {
        q: 'What does verification mean?',
        a: 'Somebody goes back and checks the fix on site. Reporting the work as finished is not the same as it being verified, and the incident cannot be closed on the word of whoever did the work alone.',
      },
      {
        q: 'When does the original NO SAT become SAT?',
        a: 'When you confirm the item as SAT on the incident. At that moment the item on the original checklist changes from NO SAT to SAT, and the checklist records that it was changed, when, and because of which incident. If you later withdraw the verification, the item goes back to NO SAT.',
      },
      {
        q: 'It is still not fixed. What do I do?',
        a: 'Mark the item NO SAT on the incident instead of SAT. The incident stays open and keeps its history — do not close it and raise a new one.',
      },
      ...(WORK_ORDERS_ENABLED
        ? [
            {
              q: 'What is a work order?',
              a: 'The formal instruction to carry out the corrective work, raised from the incident. It records what was done, who cleared the area, and any NOTAM reference.',
            },
          ]
        : []),
    ],
  },
  {
    id: 'approvals',
    title: 'Approvals',
    questions: [
      {
        q: 'What am I approving?',
        a: 'That you have read a submitted inspection and accept it as filed. You are not re-doing the inspection — you are acknowledging it, which is what the approved form asks for.',
      },
      {
        q: 'Why is my approvals list grouped by team?',
        a: 'Because the forms are. Each approved form belongs to a team — Apron Supervisor, Crash Fire & Rescue and so on — and grouping the queue the same way means you can work through one team at a time.',
      },
      {
        q: 'Can I reject something?',
        a: 'Not yet. What rejection should do in your process — send it back for correction, or require a fresh inspection — is a question we have put to BACC and not yet had answered, and we would rather build it once, correctly.',
      },
    ],
  },
  {
    id: 'reports',
    title: 'Reports and PDFs',
    questions: [
      {
        q: 'How do I get a PDF of a checklist?',
        a: 'Open the checklist and use Show preview, then export. What comes out is the approved form itself with your answers, signatures and dates placed on it — not a redrawn version.',
      },
      {
        q: 'Why is my drawing on a separate page instead of on the form?',
        a: 'The approved form has no space set aside for a drawing, and its layout may not be altered. So each drawing is added as its own page after the form, labelled with the section it belongs to. The approved sheets come out exactly as they went in.',
      },
      {
        q: 'Can I choose what goes in a report?',
        a: 'Yes. The Reports page has a control for picking which sections you want to see, so you can produce a short report for one audience and a full one for another.',
      },
    ],
  },
  {
    id: 'account',
    title: 'Your account and settings',
    questions: [
      {
        q: 'Why can I not change some settings?',
        a: 'Most settings are the Operations Manager’s to set, because they affect everybody. Your own profile is always yours to edit.',
      },
      {
        q: 'Who can change the deficiency levels?',
        a: 'The Operations Manager, on the Settings page. Changing them changes what every incident in the portal is measured against, so the change is recorded with who made it and when.',
      },
      {
        q: 'Some posts show as having no account. Why?',
        a: 'The approved forms name owners — Crash Fire & Rescue, Civil Engineering Consultant and others — that BACC has not yet given us staff for. Their forms still open and complete normally; what is missing is the name of the person responsible for them. The Users page lists which posts are still open.',
      },
    ],
  },
];
```

- [ ] **Step 2: Write the accordion**

Create `src/components/help/FaqAccordion.jsx`:

```jsx
import { ChevronDown } from 'lucide-react';

/**
 * One group of questions.
 *
 * Built on <details>, which is open/close behaviour the browser already has —
 * keyboard accessible, findable by the browser's own find-in-page, and correct
 * without a line of state management.
 */
export default function FaqAccordion({ group, openAll }) {
  return (
    <section id={group.id} className="scroll-mt-4 rounded-lg border border-navy/10 bg-white shadow-sm">
      <h2 className="border-b border-navy/10 px-4 py-3 text-sm font-bold uppercase tracking-wide text-navy">
        {group.title}
      </h2>
      <div className="divide-y divide-navy/5">
        {group.questions.map((item) => (
          <details key={item.q} open={openAll} className="group px-4">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-medium text-navy marker:hidden hover:text-primary">
              {item.q}
              <ChevronDown
                className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <p className="pb-3.5 pr-7 text-sm leading-relaxed text-muted">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Write the page**

Create `src/pages/HelpPage.jsx`:

```jsx
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import FaqAccordion from '../components/help/FaqAccordion.jsx';
import { FAQ_GROUPS } from '../content/faq.js';

export default function HelpPage() {
  const [query, setQuery] = useState('');
  const term = query.trim().toLowerCase();

  const groups = useMemo(() => {
    if (!term) return FAQ_GROUPS;
    return FAQ_GROUPS.map((group) => ({
      ...group,
      questions: group.questions.filter(
        (item) => item.q.toLowerCase().includes(term) || item.a.toLowerCase().includes(term),
      ),
    })).filter((group) => group.questions.length > 0);
  }, [term]);

  const hits = groups.reduce((n, group) => n + group.questions.length, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-navy sm:text-2xl">Help</h1>
        <p className="mt-1 text-sm text-muted">
          How the portal works. If something here does not match what you see, tell the Operations Manager.
        </p>
      </div>

      <label className="relative block max-w-md">
        <span className="sr-only">Search help</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search — try “signature” or “NO SAT”"
          className="min-h-11 w-full rounded-md border border-navy/20 bg-white pl-9 pr-3 text-sm"
        />
      </label>

      {term && (
        <p className="text-sm text-muted" role="status">
          {hits === 0 ? 'Nothing matched that.' : `${hits} ${hits === 1 ? 'answer' : 'answers'} matched.`}
        </p>
      )}

      <div className="space-y-4">
        {groups.map((group) => (
          <FaqAccordion key={group.id} group={group} openAll={Boolean(term)} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add the route**

In `src/App.jsx`, add the import alongside the others (alphabetical, after `DashboardPage`):

```jsx
import HelpPage from './pages/HelpPage.jsx';
```

and the route immediately after the `reports` route:

```jsx
            <Route path="help" element={<HelpPage />} />
```

- [ ] **Step 5: Add it to the sidebar**

In `src/components/layout/Sidebar.jsx`, add `CircleHelp` to the `lucide-react` import list (keep the list alphabetical — it goes after `ClipboardCheck`), then add to the end of `NAV`:

```js
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/help', label: 'Help', icon: CircleHelp },
```

- [ ] **Step 6: Add the top-bar control**

In `src/components/layout/TopBar.jsx`, add `CircleHelp` to the `lucide-react` import, then insert this `Link` immediately before the notifications `Link`:

```jsx
        <Link
          to="/help"
          className="flex h-11 w-11 items-center justify-center rounded-md text-white/80 hover:bg-white/10 hover:text-white"
          aria-label="Help"
        >
          <CircleHelp className="h-4 w-4" />
        </Link>
```

- [ ] **Step 7: Check it works**

```bash
npm run dev -- --port 4174
```

Open `http://localhost:4174/help`. Confirm: seven groups render — the spec lists "Your account" and "Settings" separately, but between them they hold three questions, so they are one group here; clicking a question opens it; typing `signature` filters to the signature answers and opens them; clearing the box restores all groups closed; the `?` in the top bar and the Help entry in the sidebar both navigate here. Stop the server.

- [ ] **Step 8: Run the palette gate and the build**

```bash
npm run verify:palette && npx vite build
```

Expected: both PASS.

- [ ] **Step 9: Commit**

```bash
git add src/content/faq.js src/components/help/FaqAccordion.jsx src/pages/HelpPage.jsx \
        src/App.jsx src/components/layout/Sidebar.jsx src/components/layout/TopBar.jsx
git commit -m "feat: add a Help page explaining the portal in plain language"
```

---

### Task 7: The guide inside the incident

Five stages, named exactly as the buttons name them, with a plain line under each — and the sentence that matters placed where the decision is actually made rather than at the top of a page that will have been scrolled past.

`IncidentDetailPage.jsx` is 1,083 lines. This goes in its own component.

**Files:**
- Create: `src/content/incidentGuide.js`
- Create: `src/components/incidents/HowThisWorks.jsx`
- Modify: `src/pages/IncidentDetailPage.jsx` (right rail, after the `Status & Workflow` card)
- Modify: `src/components/incidents/VerificationPanel.jsx`

**Interfaces:**
- Consumes: `INCIDENT_STATUSES`, `incidentStepIndex`, `itemResolutionState` from `src/lib/incidentLifecycle.js`; `FAQ_GROUPS` group id `incidents` from Task 6.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the content file**

Create `src/content/incidentGuide.js`:

```js
/**
 * What each stage of an incident means, in one line.
 *
 * Keyed to the status values in incidentLifecycle.js so the guide always names
 * the stages the same way the buttons do — a guide that says "Fixed" while the
 * control says "Resolved" costs more than it gives.
 *
 * Wording lives here rather than in the component for the same reason as the
 * FAQ: BACC will want to reword it, and that should not need a developer.
 */
export const INCIDENT_STAGES = {
  open: 'Describe what is wrong and where it is.',
  assigned: 'Choose who will fix it and set a target date.',
  in_progress: 'Record what is being done. Add photos as the work goes on.',
  resolved: 'The person who did the work says it is finished.',
  closed: 'Someone re-checks it on site. Confirming SAT here changes the original checklist item from NO SAT to SAT.',
};

/** Beside the verification controls, where the choice is actually made. */
export const VERIFICATION_HINT =
  'Confirming SAT updates the original checklist. Choose NO SAT if it still is not right — the incident stays open.';
```

- [ ] **Step 2: Write the component**

Create `src/components/incidents/HowThisWorks.jsx`:

```jsx
import { Check, CircleHelp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { INCIDENT_STAGES } from '../../content/incidentGuide.js';
import { INCIDENT_STATUSES, incidentStepIndex, itemResolutionState } from '../../lib/incidentLifecycle.js';
import { fmtDate } from '../../lib/airportFormat.js';
import { Card } from './detailUi.jsx';

/**
 * What happens next, and what it will do to the checklist this came from.
 *
 * The stepper in Status & Workflow already shows where the incident is; it does
 * not say what any stage means or what closing one does. That matters most at
 * the last stage, because confirming SAT reaches back and changes an item on a
 * checklist somebody else filed — behaviour nobody would guess, and the whole
 * reason this portal exists rather than a folder of PDFs.
 */
export default function HowThisWorks({ incident }) {
  const step = incidentStepIndex(incident?.status);
  const resolution = itemResolutionState(incident);
  const cleared = resolution?.tone === 'cleared';

  return (
    <Card title="How this works">
      <ol className="space-y-2.5">
        {INCIDENT_STATUSES.map((status, i) => {
          const done = i < step;
          const current = i === step;
          return (
            <li key={status.value} className="flex gap-2.5">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold ${
                  done
                    ? 'border-success bg-success text-white'
                    : current
                      ? 'border-primary bg-primary text-white'
                      : 'border-navy/20 bg-white text-muted'
                }`}
              >
                {done ? <Check size={11} aria-hidden /> : i + 1}
              </span>
              <div className="min-w-0">
                <p className={`text-xs font-semibold ${current ? 'text-navy' : 'text-muted'}`}>
                  {status.label}
                  {current && <span className="ml-1.5 font-normal text-primary">— you are here</span>}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{INCIDENT_STAGES[status.value]}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {incident?.source_item_code && (
        <p
          className={`mt-4 rounded-md border px-3 py-2 text-xs leading-relaxed ${
            cleared ? 'border-success bg-success-soft text-navy' : 'border-navy/15 bg-stripe text-muted'
          }`}
        >
          {cleared ? (
            <>
              <Check size={12} className="mr-1 inline text-success" aria-hidden />
              Item {incident.source_item_code} now reads SAT on the original checklist.
            </>
          ) : (
            <>
              Raised from item {incident.source_item_code} on {incident.source_template_code}
              {incident.source_inspection_date ? `, filed ${fmtDate(incident.source_inspection_date)}` : ''}.
            </>
          )}
        </p>
      )}

      <Link
        to="/help#incidents"
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
      >
        <CircleHelp size={13} aria-hidden />
        More about incidents
      </Link>
    </Card>
  );
}
```

- [ ] **Step 3: Mount it in the right rail**

In `src/pages/IncidentDetailPage.jsx`, add the import alongside the other incident components:

```jsx
import HowThisWorks from '../components/incidents/HowThisWorks.jsx';
```

In the right rail (`<aside className="h-fit space-y-4 xl:sticky xl:top-4">`, around line 845), insert immediately **before** the `<Card title="Status & Workflow">` element:

```jsx
          <HowThisWorks incident={incident} />
```

It goes above rather than below because a first-time user needs to know what the stages mean before they use the control that changes them.

- [ ] **Step 4: Add the hint beside the verification controls**

In `src/components/incidents/VerificationPanel.jsx`, add to the imports:

```js
import { VERIFICATION_HINT } from '../../content/incidentGuide.js';
```

Then insert this immediately after the closing `</table>` tag and before the closing `</div>` of the `overflow-x-auto` wrapper's sibling content — that is, as the first element following the table block:

```jsx
      <p className="mt-2 rounded-md border border-navy/15 bg-stripe px-3 py-2 text-xs leading-relaxed text-muted">
        {VERIFICATION_HINT}
      </p>
```

- [ ] **Step 5: Check it renders**

```bash
npm run dev -- --port 4174
```

You need an incident to look at, and the portal no longer ships one. Sign in as `shamira.young@pgia.local`, go to My Checklists, start a new inspection and pick Annex D, mark one item NO SAT with a remark, answer the rest SAT, sign and submit, then raise an incident from that item. Then confirm on the incident page:

- The How this works card sits above Status & Workflow, with stage 1 marked "you are here".
- The line at the bottom reads `Raised from item <code> on <form code>, filed <date>`.
- The hint appears under the Related Checklist Item table.
- Assigning it and stepping the status forward moves the highlight down the list.
- Confirming SAT changes the bottom line to `Item <code> now reads SAT on the original checklist.`
- `More about incidents` opens the Help page scrolled to the Incidents group.

Stop the server.

- [ ] **Step 6: Run the palette gate and the build**

```bash
npm run verify:palette && npx vite build
```

Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add src/content/incidentGuide.js src/components/incidents/HowThisWorks.jsx \
        src/pages/IncidentDetailPage.jsx src/components/incidents/VerificationPanel.jsx
git commit -m "feat: explain the incident lifecycle where the work happens"
```

---

### Task 8: The walkthrough, checked on every build

`SYNC_SAT_ON_VERIFICATION` is a deliberate, named departure from §5 and §11, made on BACC's instruction. A departure like that needs a test that fails loudly if it ever stops behaving as agreed — this is that test, and it is the whole of Shamira's walkthrough besides.

**Files:**
- Create: `scripts/verify-walkthrough.mjs`
- Modify: `package.json` (scripts, devDependencies)

**Interfaces:**
- Consumes: everything from Tasks 3–7.
- Produces: `npm run verify:walkthrough`.

- [ ] **Step 1: Add the dependency and the script entry**

In `package.json`, add to `devDependencies` (alphabetical, before `pngjs`):

```json
    "playwright-core": "^1.49.0",
```

and to `scripts`, after `verify:signoffs`:

```json
    "verify:walkthrough": "node scripts/verify-walkthrough.mjs",
```

Then install:

```bash
npm install
```

- [ ] **Step 2: Write the script**

Create `scripts/verify-walkthrough.mjs`:

```js
/**
 * Shamira's walkthrough, performed by a machine.
 *
 * Sign in against an empty portal, start a checklist, fail one item, submit,
 * raise the deficiency, assign it, work it through to verified, then reopen the
 * original checklist and confirm the item now reads SAT.
 *
 * That last assertion is the point. Writing back to a submitted record is a
 * deliberate departure from §5 and §11, made on BACC's instruction because this
 * is not the final draft — and the thing a sanctioned departure needs most is a
 * test that fails loudly if it ever stops behaving the way it was agreed.
 *
 * Runs against the dev server rather than a preview build, because the clean-
 * environment assertions are only meaningful against a freshly generated store
 * and the dev server is the cheapest way to get one.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4179;
const BASE = `http://localhost:${PORT}`;
const SHAMIRA = 'shamira.young@pgia.local';
const GLENRICK = 'Glenrick Spain';

const failures = [];
const check = (ok, what) => {
  if (!ok) failures.push(what);
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}`);
};

async function browserOrSkip() {
  try {
    return await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    });
  } catch (err) {
    console.log(`SKIP — no Chromium available (${err.message.split('\n')[0]})`);
    console.log('       Install one with:  npx playwright install chromium');
    console.log('       Or point PLAYWRIGHT_CHROMIUM_PATH at an existing binary.');
    return null;
  }
}

async function startServer() {
  const proc = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: root,
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  for (let i = 0; i < 60; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(BASE);
      if (res.ok) return proc;
    } catch {
      /* not up yet */
    }
  }
  proc.kill();
  throw new Error(`dev server did not come up on ${PORT} within 30s`);
}

const browser = await browserOrSkip();
if (!browser) process.exit(0);

const server = await startServer();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

try {
  // ── 1. Sign in ────────────────────────────────────────────────────────────
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', SHAMIRA);
  await page.fill('input[type="password"]', 'demo');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 15000 });
  check(true, 'signed in as Shamira Young');

  // ── 2. The environment is clean ───────────────────────────────────────────
  const clean = await page.evaluate(() => {
    const store = JSON.parse(localStorage.getItem('bacc-demo-store') || '{}');
    const counts = {};
    for (const key of ['submissions', 'incidents', 'work_orders', 'approvals', 'instances', 'notifications', 'activity']) {
      counts[key] = store[key]?.length ?? -1;
    }
    return { counts, users: store.users?.length ?? 0, templates: store.templates?.length ?? 0 };
  });
  for (const [key, n] of Object.entries(clean.counts)) {
    check(n === 0, `${key} is empty (found ${n})`);
  }
  check(clean.users === 9, `directory holds nine accounts (found ${clean.users})`);
  check(clean.templates === 30, `thirty approved forms are present (found ${clean.templates})`);
  check(
    !(await page.locator('text=NaN').first().isVisible().catch(() => false)),
    'the dashboard renders no NaN against empty data',
  );

  // ── 3. Start a checklist ──────────────────────────────────────────────────
  // Nothing is scheduled — the environment is clean — so this begins the way
  // Shamira will: My Checklists, start a new inspection, pick a form.
  await page.goto(`${BASE}/checklists/mine`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /new inspection|start/i }).first().click();
  await page.getByRole('button', { name: /Annex D/i }).first().click();
  await page.waitForURL(/\/checklists\/[0-9a-f-]{8,}/, { timeout: 15000 });
  check(true, `opened ${page.url().split('/').pop()}`);

  // ── 4. One NO SAT, everything else SAT ────────────────────────────────────
  const satButtons = page.getByRole('button', { name: /^Mark .* SAT$/ });
  await satButtons.first().waitFor({ timeout: 15000 });
  const noSat = page.getByRole('button', { name: /^Mark .* NO SAT$/ }).first();
  await noSat.scrollIntoViewIfNeeded();
  await noSat.click();
  const itemCode = await page.evaluate(() => {
    const store = JSON.parse(localStorage.getItem('bacc-demo-store') || '{}');
    const draft = (store.submissions ?? []).find((s) => s.status === 'draft');
    return Object.entries(draft?.items ?? {}).find(([, v]) => v.result === 'no_sat')?.[0] ?? null;
  });
  check(Boolean(itemCode), `item ${itemCode} answered NO SAT`);

  console.log('\nThe remaining steps drive form controls whose names depend on the');
  console.log('form this run opened. Implement steps 5-9 against that form, then');
  console.log('delete this notice.\n');
} finally {
  await browser.close();
  server.kill();
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nWalkthrough intact.');
```

- [ ] **Step 3: Run it and confirm steps 1–4 pass**

```bash
npm run verify:walkthrough
```

Expected: an `ok` line per empty collection, then the directory and template counts, then the checklist opened and one item answered NO SAT, then the notice about steps 5–9. Exit code 0.

If `Annex D` is not the form you want the walkthrough to use, change the selector in step 3 — Annex D is chosen because its drainage items map cleanly onto an incident, not because it is special.

If it reports `SKIP — no Chromium available`, set the path first:

```bash
PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run verify:walkthrough
```

- [ ] **Step 4: Commit the working portion**

```bash
git add scripts/verify-walkthrough.mjs package.json package-lock.json
git commit -m "test: assert the environment is clean and start a checklist"
```

- [ ] **Step 5: Finish steps 5–9 against the real template**

Run the dev server, open the same checklist the script opened, and read the actual control names with DevTools. Then replace the notice block at the end of the `try` with the remaining steps:

```js
  // ── 5. Answer the rest SAT, sign, submit ──────────────────────────────────
  const remaining = await satButtons.count();
  for (let i = 0; i < remaining; i += 1) {
    const button = satButtons.nth(i);
    await button.scrollIntoViewIfNeeded();
    await button.click();
  }
  // The signature pad listens for mouse and touch events, not pointer events,
  // and its coordinates are viewport-relative — so it must be scrolled into
  // view before the mouse is driven across it.
  const pad = page.locator('canvas').first();
  await pad.scrollIntoViewIfNeeded();
  const box = await pad.boundingBox();
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(700); // autosave debounce is 500ms
  await page.getByRole('button', { name: /submit/i }).first().click();
  await page.waitForTimeout(1000);
  check(
    await page.evaluate(() => {
      const store = JSON.parse(localStorage.getItem('bacc-demo-store') || '{}');
      return (store.submissions ?? []).some((s) => s.status !== 'draft');
    }),
    'checklist submitted',
  );

  // ── 6. Raise the incident ─────────────────────────────────────────────────
  await page.getByRole('button', { name: /create incident|raise/i }).first().click();
  await page.getByRole('button', { name: /^create|^save|^raise/i }).last().click();
  await page.waitForURL(/\/incidents\/[0-9a-f-]{8,}/, { timeout: 15000 });
  const incidentUrl = page.url();
  check(true, 'incident raised from the NO SAT item');

  // ── 7. Assign to Glenrick, set a target, work it forward ──────────────────
  await page.getByLabel('Assigned To').selectOption({ label: new RegExp(GLENRICK) });
  await page.waitForTimeout(400);
  const target = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  await page.getByLabel(/due date|target/i).first().fill(target);
  await page.waitForTimeout(400);
  for (const status of ['assigned', 'in_progress', 'resolved']) {
    await page.getByLabel('Current Status').selectOption(status);
    await page.waitForTimeout(500);
  }
  check(
    await page.evaluate(() => {
      const store = JSON.parse(localStorage.getItem('bacc-demo-store') || '{}');
      return store.incidents?.[0]?.status === 'resolved';
    }),
    'assigned to Glenrick and worked through to Resolved',
  );

  // ── 8. Verify SAT and close ───────────────────────────────────────────────
  await page.getByRole('button', { name: /verified SAT$/i }).first().click();
  await page.getByRole('button', { name: /confirm/i }).first().click();
  await page.waitForTimeout(800);
  await page.getByLabel('Current Status').selectOption('closed');
  await page.waitForTimeout(800);
  check(
    await page.evaluate(() => {
      const store = JSON.parse(localStorage.getItem('bacc-demo-store') || '{}');
      return store.incidents?.[0]?.status === 'closed';
    }),
    'incident verified SAT and closed',
  );

  // ── 9. The original checklist now reads SAT ───────────────────────────────
  const writeBack = await page.evaluate((code) => {
    const store = JSON.parse(localStorage.getItem('bacc-demo-store') || '{}');
    const filed = (store.submissions ?? []).find((s) => s.status !== 'draft');
    const item = filed?.items?.[code];
    return { result: item?.result ?? null, amendment: item?.amendment ?? null };
  }, itemCode);
  check(writeBack.result === 'sat', `item ${itemCode} now reads SAT on the original checklist`);
  check(
    writeBack.amendment?.previous_result === 'no_sat',
    'the original answer is retained in the amendment trail',
  );
  check(
    writeBack.amendment?.reason === 'incident_verified_sat',
    'the amendment records why it changed',
  );

  await page.goto(incidentUrl, { waitUntil: 'networkidle' });
  check(
    await page.getByText(/now reads SAT on the original checklist/i).isVisible(),
    'the incident page says so in plain language',
  );
```

Adjust selectors to match what the page actually exposes. Where a control has no accessible name, add an `aria-label` to the component rather than reaching for a CSS class — a control a test cannot name is a control a screen reader cannot name either.

- [ ] **Step 6: Run the full walkthrough**

```bash
npm run verify:walkthrough
```

Expected: every line `ok`, ending `Walkthrough intact.` Exit code 0.

- [ ] **Step 7: Run every gate together**

```bash
npm test && npm run verify:palette && npm run verify:pdf && npm run verify:signoffs && npm run verify:walkthrough
```

Expected: all five pass.

- [ ] **Step 8: Commit**

```bash
git add scripts/verify-walkthrough.mjs
git commit -m "test: prove the NO SAT to SAT write-back end to end"
```

---

## Manual step for Glenrick

The device bridge cannot delete files. After Task 4, `src/data/seed/generateSeed.js` will have shed most of its content but nothing needs deleting from disk — no file becomes obsolete in this plan. If a previous session left `src/pages/ChecklistListPage.jsx` or `src/pages/dev/` behind, remove them now; nothing here imports them.

## What this plan does not do

Carried forward unchanged: the SMS and Wildlife forms (pass two, blocked on PDF exports of the five Word originals), the Users page visual redesign, role permission configuration, email delivery, and the Locations page stub.
