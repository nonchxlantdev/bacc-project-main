# Incident Page Cleanup + Submit/Preview Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the incident detail page into a tick-off Progress card, stop submitted checklists from silently staying "Draft", and make the PDF preview render on every device.

**Architecture:** Pure, Node-testable logic goes in `src/lib/` (`incidentProgress.js`, `recordInspectionDate` in `belizeTime.js`) and is tested with `node:test`; React components stay thin. The PDF preview stops relying on the browser's built-in PDF viewer (blocked by our CSP) and draws pages to `<canvas>` with `pdfjs-dist`, which is already a dependency.

**Tech Stack:** React 19, Vite 7, Tailwind v4, react-router 7, `pdfjs-dist` ^6.2, Cloudflare Worker + D1, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-13-incident-cleanup-and-fixes-design.md`

## Global Constraints

- BACC §14: never change an approved form's wording, numbering, layout or printed values. The free-text Date a person typed stays in `header` and prints exactly as entered.
- Scheduling/dates compute in America/Belize via `src/lib/belizeTime.js` — never browser-local or UTC.
- No change to `public/_headers`, `worker/http.js` `SECURITY_HEADERS`, or any Worker rule.
- Staff-facing wording must read as production (no "pilot"/"test"/"demo"); `tests/noTrialWording.test.js` enforces this.
- Touch targets ≥ 44px on mobile (`min-h-11`), as elsewhere in the app.
- Run `npm test` after every task; all tests must pass.
- Commit after every task. End each commit message with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01YQTzFsVKK766RH6cRX5ZRz
  ```

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/belizeTime.js` | modify | add `recordInspectionDate(headerDate, nowMs)` |
| `tests/recordInspectionDate.test.js` | create | unit tests for the helper |
| `tests/submitAllForms.test.js` | create | every checklist schema submits through `validateRecordPayload` |
| `src/pages/ChecklistDetailPage.jsx` | modify | submit error handling, autosave cancel, date normalisation, canvas preview wiring |
| `src/lib/incidentProgress.js` | create | pure tick-off step logic |
| `tests/incidentProgress.test.js` | create | unit tests for it |
| `src/components/incidents/ProgressChecklist.jsx` | create | the Progress card UI |
| `src/pages/IncidentDetailPage.jsx` | modify | hide two tabs, replace right rail, shrink verification panel |
| `src/components/incidents/VerificationPanel.jsx` | delete | replaced by step 4 + one-line item status |
| `src/components/tour/tours.js`, `src/content/faq.js`, `src/content/incidentGuide.js` | modify | wording for the new controls |
| `src/components/checklist/PdfPageCanvas.jsx` | create | pdf.js page renderer |
| `src/components/checklist/PdfPreview.jsx` | modify | iframe → `PdfPageCanvas` |

---

### Task 1: Reproduce both bugs before changing code

No code. This confirms the causes the spec names. If an observation contradicts the spec, stop and report back before Task 2.

**Files:** none

- [ ] **Step 1: Reproduce "submitted but still Draft"**

  In production (`https://bacc.visionforgestudio.app`), or locally with `npm run dev` in the data mode production uses, open a new **Wildlife Incursion Report for the Movement Area**. Type `October 13, 2026` in the Date box, fill the rest, press **Submit Checklist**. Keep DevTools → Network open.

  Expected (confirms the spec): the `POST /api/data/checklists.persist` response (D1) or the Supabase `checklist_submissions` upsert returns 400 mentioning `inspection_date`; no banner appears; the page still says **In Progress**; My Checklists still shows **Draft**.

  Repeat with Date `2026-10-13`. Expected: submits normally. Record both results in the task report.

- [ ] **Step 2: Reproduce "PDF preview not working"**

  On any checklist, press **Show preview**. In DevTools Console expect a CSP message about `object-src` or the PDF frame being blocked, and a grey/blank frame. On Annex L, press **View PDF**: expect a "refused to frame … X-Frame-Options/frame-ancestors" console error. Record what you see.

- [ ] **Step 3: Report** the four observations. No commit.

---

### Task 2: `recordInspectionDate` helper

**Files:**
- Modify: `src/lib/belizeTime.js` (append at end)
- Test: `tests/recordInspectionDate.test.js`

**Interfaces:**
- Produces: `recordInspectionDate(headerDate: unknown, nowMs: number): string` — returns `headerDate` if it is a real `YYYY-MM-DD` calendar date, else `airportYmd(nowMs)`.

- [ ] **Step 1: Write the failing test** — `tests/recordInspectionDate.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { recordInspectionDate } from '../src/lib/belizeTime.js';

// 2026-10-14 03:00 UTC is still 2026-10-13 in Belize (UTC−6).
const NOW = Date.parse('2026-10-14T03:00:00Z');

test('keeps a real ISO calendar date', () => {
  assert.equal(recordInspectionDate('2026-09-30', NOW), '2026-09-30');
});

test('free text falls back to the Belize date of now', () => {
  assert.equal(recordInspectionDate('October 13, 2026', NOW), '2026-10-13');
  assert.equal(recordInspectionDate('13/10/2026', NOW), '2026-10-13');
});

test('empty, missing and non-string values fall back too', () => {
  for (const v of ['', '   ', null, undefined, 20261013, {}]) {
    assert.equal(recordInspectionDate(v, NOW), '2026-10-13');
  }
});

test('ISO-shaped but impossible dates fall back', () => {
  assert.equal(recordInspectionDate('2026-02-30', NOW), '2026-10-13');
  assert.equal(recordInspectionDate('2026-13-01', NOW), '2026-10-13');
});

test('result is always 10 characters (the Worker limit)', () => {
  assert.equal(recordInspectionDate('Monday the thirteenth of October', NOW).length, 10);
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `node --test tests/recordInspectionDate.test.js`
Expected: FAIL — `recordInspectionDate is not a function` / not exported.

- [ ] **Step 3: Implement** — append to `src/lib/belizeTime.js`:

```js
/**
 * The date stored on a checklist record (`inspection_date`).
 *
 * Several approved forms print their Date box as free text (the wildlife
 * reports' "Date: _bn"), so a person may type "October 13, 2026". That value
 * stays in the header exactly as typed and prints unchanged (BACC §14); the
 * record's own date column must still be a real calendar date — the Worker
 * accepts at most 10 characters and reports filter on it. A non-ISO value
 * falls back to the airport-local date of `nowMs`.
 */
export function recordInspectionDate(headerDate, nowMs) {
  if (typeof headerDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(headerDate)) {
    const [y, m, d] = headerDate.split('-').map(Number);
    const probe = new Date(Date.UTC(y, m - 1, d));
    if (probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d) {
      return headerDate;
    }
  }
  return airportYmd(nowMs);
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `node --test tests/recordInspectionDate.test.js`
Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/belizeTime.js tests/recordInspectionDate.test.js
git commit -m "feat: recordInspectionDate keeps record dates ISO when the form date is free text"
```

---

### Task 3: Every form submits through the Worker's validator

**Files:**
- Test: `tests/submitAllForms.test.js`

**Interfaces:**
- Consumes: `recordInspectionDate` (Task 2); `validateRecordPayload` from `worker/data/rules.js` (existing, throws an error with `.status === 400` on bad input).

- [ ] **Step 1: Write the test** — `tests/submitAllForms.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { validateRecordPayload } from '../worker/data/rules.js';
import { recordInspectionDate } from '../src/lib/belizeTime.js';

const dir = new URL('../src/data/checklists/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
const NOW = Date.parse('2026-10-13T18:00:00Z');
const FREE_TEXT_DATE = 'October 13, 2026 (morning)';

const isDateLike = (f) => f.type === 'date' || /date/i.test(f.label ?? '') || /date/i.test(f.key ?? '');

/** What ChecklistDetailPage sends on Submit, with a free-text value in every date-like box. */
function submittedRecord(schema, file) {
  const header = {};
  for (const f of schema.headerFields ?? []) header[f.key] = isDateLike(f) ? FREE_TEXT_DATE : 'x';
  return {
    id: randomUUID(),
    template_id: file.replace(/\.json$/, ''),
    template_version: 'ed01',
    status: 'submitted',
    locked: true,
    header,
    items: {},
    signoffs: [],
    inspection_type: header.inspectionType ?? 'monthly_routine',
    inspection_date: recordInspectionDate(header.date, NOW),
    submitted_at: new Date(NOW).toISOString(),
  };
}

test('checklist schemas are present', () => {
  assert.ok(files.length >= 36, `expected ≥36 schemas, found ${files.length}`);
});

for (const file of files) {
  test(`${file}: submits with free-text dates`, () => {
    const schema = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
    const out = validateRecordPayload(submittedRecord(schema, file));
    assert.equal(out.status, 'submitted');
    assert.match(out.inspection_date, /^\d{4}-\d{2}-\d{2}$/);
  });
}

test('control: the raw free-text date is what the Worker rejects', () => {
  const schema = JSON.parse(readFileSync(new URL('wildlife-incursion-report-movement-area.json', dir), 'utf8'));
  const rec = { ...submittedRecord(schema, 'wildlife-incursion-report-movement-area.json'), inspection_date: FREE_TEXT_DATE };
  assert.throws(() => validateRecordPayload(rec), (err) => err.status === 400);
});
```

- [ ] **Step 2: Run it**

Run: `node --test tests/submitAllForms.test.js`
Expected: all PASS (the helper from Task 2 already normalises). If a schema fails for a reason **other than** the date (e.g. header too large), report it — do not change the schema (BACC §14).

- [ ] **Step 3: Commit**

```bash
git add tests/submitAllForms.test.js
git commit -m "test: every checklist form submits through the Worker validator with free-text dates"
```

---

### Task 4: Submit never fails silently

**Files:**
- Modify: `src/pages/ChecklistDetailPage.jsx` — imports (line 26), state (~line 52), autosave effect (lines 135–143), `save()` (193–210), `handleSubmit()` (212–277), Submit buttons (~566–573 and ~756–762)

**Interfaces:**
- Consumes: `recordInspectionDate` from `../lib/belizeTime.js` (Task 2).

- [ ] **Step 1: Import the helper.** Change line 26:

```js
import { airportYmd, recordInspectionDate } from '../lib/belizeTime.js';
```

- [ ] **Step 2: Add submitting state and an autosave timer ref.** After `const [saving, setSaving] = useState(false);` add:

```js
  const [submitting, setSubmitting] = useState(false);
  const autosaveRef = useRef(null);
```

- [ ] **Step 3: Replace the autosave effect** (lines 135–143) so Submit can cancel it:

```js
  useEffect(() => {
    if (!record || readOnly) return undefined;
    autosaveRef.current = setTimeout(() => {
      autosaveRef.current = null;
      persistSubmission(record)
        .then(() => setLastSavedAt(new Date()))
        .catch(() => {});
    }, 500);
    return () => {
      clearTimeout(autosaveRef.current);
      autosaveRef.current = null;
    };
  }, [record, readOnly]);
```

- [ ] **Step 4: Normalise the stored date in `save()`.** Replace the `merged` object:

```js
      const merged = {
        ...nextRecord,
        inspection_type: nextRecord.header.inspectionType ?? nextRecord.inspection_type,
        inspection_date: recordInspectionDate(nextRecord.header.date, Date.now()),
        rainfall_mm: nextRecord.header.rainfallMm,
      };
```

- [ ] **Step 5: Make `handleSubmit` cancel autosave and report failures.** At the very top of `handleSubmit` add:

```js
    if (submitting) return;
```

  In the `next` object replace the two lines `inspection_type: …` / `inspection_date: …` with:

```js
      inspection_type: record.header.inspectionType ?? record.inspection_type,
      inspection_date: recordInspectionDate(record.header.date, Date.parse(signedAt)),
```

  Replace the last two lines (`await save(next);` and the success `setBanner`) with:

```js
    clearTimeout(autosaveRef.current);
    autosaveRef.current = null;
    setSubmitting(true);
    try {
      await save(next);
      setBanner({ type: 'ok', text: 'Submitted. You can export the official PDF when online.' });
    } catch (err) {
      setBanner({
        type: 'error',
        text: `Could not submit: ${err?.message || 'the server did not accept it'}. Your checklist is still a draft and nothing was lost — fix the issue and submit again.`,
      });
    } finally {
      setSubmitting(false);
    }
```

  (`save()` only calls `setRecord(saved)` on success, so on failure the page keeps the unlocked draft.)

- [ ] **Step 6: Disable both Submit buttons while submitting.** On each `<button … onClick={handleSubmit} …>` add `disabled={submitting}` plus `disabled:opacity-60` to its className, and change the label to `{submitting ? 'Submitting…' : 'Submit Checklist'}`.

- [ ] **Step 7: Run tests and build**

Run: `npm test && npm run build`
Expected: all tests pass; build succeeds.

- [ ] **Step 8: Manual check** — repeat Task 1 Step 1 locally: with `October 13, 2026` the wildlife report now submits, shows **Submitted**, and the PDF still prints `October 13, 2026`. Then force a failure (DevTools → Network → block `checklists.persist`) and confirm the red "Could not submit" banner and that the page stays **In Progress**.

- [ ] **Step 9: Commit**

```bash
git add src/pages/ChecklistDetailPage.jsx
git commit -m "fix: submit reports failures, cancels pending autosave, stores an ISO inspection date"
```

---

### Task 5: Pure tick-off logic (`incidentProgress.js`)

**Files:**
- Create: `src/lib/incidentProgress.js`
- Test: `tests/incidentProgress.test.js`

**Interfaces:**
- Consumes: `incidentStepIndex(status)` from `src/lib/incidentLifecycle.js` (existing; returns 0..4 for `open…closed`).
- Produces:
  - `PROGRESS_STEPS: Array<{ key: 'sent'|'started'|'fixed'|'closed', label: string, status: string }>`
  - `progressSteps(incident) → Array<{ key, label, status, done: boolean, enabled: boolean, canUntick: boolean }>`
  - `statusAfterUntick(stepKey) → string`
  - `withAutoAssign(incident) → incident` (status open↔assigned follows unit + due date)
  - `applyUnitChoice(incident, unit: string|null, nowIso: string) → incident`
  - `canClearUnit(incident) → boolean`

- [ ] **Step 1: Write the failing test** — `tests/incidentProgress.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROGRESS_STEPS,
  applyUnitChoice,
  canClearUnit,
  progressSteps,
  statusAfterUntick,
  withAutoAssign,
} from '../src/lib/incidentProgress.js';

const at = (status, extra = {}) => ({ status, assigned_unit: null, target_date: null, ...extra });
const byKey = (inc) => Object.fromEntries(progressSteps(inc).map((s) => [s.key, s]));

test('four steps in order', () => {
  assert.deepEqual(PROGRESS_STEPS.map((s) => s.key), ['sent', 'started', 'fixed', 'closed']);
});

test('open: nothing done, only step 1 enabled', () => {
  const s = byKey(at('open'));
  assert.deepEqual(Object.values(s).map((x) => x.done), [false, false, false, false]);
  assert.equal(s.sent.enabled, true);
  assert.equal(s.started.enabled, false);
});

test('in_progress: two done, step 3 enabled, only step 2 can be unticked', () => {
  const s = byKey(at('in_progress'));
  assert.equal(s.sent.done && s.started.done, true);
  assert.equal(s.fixed.enabled, true);
  assert.equal(s.closed.enabled, false);
  assert.equal(s.started.canUntick, true);
  assert.equal(s.sent.canUntick, false);
});

test('closed: everything done, nothing enabled, nothing untickable', () => {
  const s = Object.values(byKey(at('closed')));
  assert.ok(s.every((x) => x.done && !x.enabled && !x.canUntick));
});

test('unticking moves back exactly one status', () => {
  assert.equal(statusAfterUntick('sent'), 'open');
  assert.equal(statusAfterUntick('started'), 'assigned');
  assert.equal(statusAfterUntick('fixed'), 'in_progress');
});

test('open becomes assigned only once unit AND due date are set', () => {
  assert.equal(withAutoAssign(at('open', { assigned_unit: 'grounds' })).status, 'open');
  assert.equal(withAutoAssign(at('open', { target_date: '2026-10-20' })).status, 'open');
  assert.equal(withAutoAssign(at('open', { assigned_unit: 'grounds', target_date: '2026-10-20' })).status, 'assigned');
});

test('clearing the unit while assigned returns to open; later statuses are untouched', () => {
  assert.equal(withAutoAssign(at('assigned')).status, 'open');
  assert.equal(withAutoAssign(at('in_progress')).status, 'in_progress');
});

test('applyUnitChoice stamps assigned_at once and keeps it on reassignment', () => {
  const a = applyUnitChoice(at('open', { target_date: '2026-10-20' }), 'grounds', 'T1');
  assert.equal(a.assigned_unit, 'grounds');
  assert.equal(a.assigned_at, 'T1');
  assert.equal(a.status, 'assigned');
  const b = applyUnitChoice(a, 'electrical', 'T2');
  assert.equal(b.assigned_at, 'T1');
  const c = applyUnitChoice(b, null, 'T3');
  assert.equal(c.assigned_unit, null);
  assert.equal(c.assigned_at, null);
  assert.equal(c.status, 'open');
});

test('the unit can only be cleared before work has started', () => {
  assert.equal(canClearUnit(at('open')), true);
  assert.equal(canClearUnit(at('assigned')), true);
  assert.equal(canClearUnit(at('in_progress')), false);
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `node --test tests/incidentProgress.test.js`
Expected: FAIL — cannot find module `../src/lib/incidentProgress.js`.

- [ ] **Step 3: Implement** — `src/lib/incidentProgress.js`

```js
/**
 * The incident page's tick-off list, as pure functions so the rules can be
 * tested without a browser. Status names and the closure gate stay owned by
 * incidentLifecycle.js — this only maps four tick boxes onto that flow:
 *
 *   ☐ Sent to a unit      open        → assigned
 *   ☐ Work started        assigned    → in_progress
 *   ☐ Fixed               in_progress → resolved
 *   ☐ Checked and closed  resolved    → closed
 */
import { incidentStepIndex } from './incidentLifecycle.js';

export const PROGRESS_STEPS = [
  { key: 'sent', label: 'Sent to a unit', status: 'assigned' },
  { key: 'started', label: 'Work started', status: 'in_progress' },
  { key: 'fixed', label: 'Fixed', status: 'resolved' },
  { key: 'closed', label: 'Checked and closed', status: 'closed' },
];

const FLOW = ['open', 'assigned', 'in_progress', 'resolved', 'closed'];

/**
 * One row per step. A box is enabled once the step above it is ticked; only
 * the latest ticked box can be unticked, and nothing moves once closed.
 */
export function progressSteps(incident) {
  const reached = incidentStepIndex(incident?.status); // 0 (open) … 4 (closed)
  const closed = incident?.status === 'closed';
  return PROGRESS_STEPS.map((step, i) => ({
    ...step,
    done: reached >= i + 1,
    enabled: !closed && reached >= i,
    canUntick: !closed && reached === i + 1 && step.key !== 'closed',
  }));
}

/** Unticking a step returns the incident to the status before it. */
export function statusAfterUntick(stepKey) {
  const i = PROGRESS_STEPS.findIndex((s) => s.key === stepKey);
  return i < 0 ? null : FLOW[i];
}

/** Step 1 ticks itself: Open becomes Assigned once a unit and a due date are both set. */
export function withAutoAssign(incident) {
  if (incident.status === 'open' && incident.assigned_unit && incident.target_date) {
    return { ...incident, status: 'assigned' };
  }
  if (incident.status === 'assigned' && !incident.assigned_unit) {
    return { ...incident, status: 'open' };
  }
  return incident;
}

/**
 * Tick a unit (one at a time) or clear it. `assigned_at` is stamped when a unit
 * is first named and survives reassignment — the clock started when the work
 * left the manager's desk.
 */
export function applyUnitChoice(incident, unit, nowIso) {
  const next = {
    ...incident,
    assigned_unit: unit || null,
    assigned_at: unit ? incident.assigned_at ?? nowIso : null,
  };
  return withAutoAssign(next);
}

/** Once work has started the unit can be changed but not removed. */
export function canClearUnit(incident) {
  return incident?.status === 'open' || incident?.status === 'assigned';
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `node --test tests/incidentProgress.test.js`
Expected: 9 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/incidentProgress.js tests/incidentProgress.test.js
git commit -m "feat: incidentProgress — tick-off step rules for the incident page"
```

---

### Task 6: `ProgressChecklist` component

**Files:**
- Create: `src/components/incidents/ProgressChecklist.jsx`

**Interfaces:**
- Consumes: `progressSteps`, `canClearUnit` (Task 5); `Card` from `./detailUi.jsx`.
- Produces: default export `ProgressChecklist` with props:
  `incident`, `unitOptions: Array<{value,label}>`, `sla: { kind: 'none'|'ok'|'warning'|'overdue', remainingDays?: number }`, `alreadyVerified: boolean`, `confirming: boolean`, `note: string`, `busy: boolean`, and handlers `onUnitChange(unit|null)`, `onDueDateChange(ymd)`, `onTick(stepKey)`, `onUntick(stepKey)`, `onNoteChange(text)`, `onConfirmClose()`, `onCancelClose()`.

- [ ] **Step 1: Create the component**

```jsx
import { Calendar, Check } from 'lucide-react';
import { canClearUnit, progressSteps } from '../../lib/incidentProgress.js';
import { Card } from './detailUi.jsx';

/**
 * The incident's progress as four tick boxes. Every rule lives in
 * lib/incidentProgress.js and the page's handlers; this only draws.
 */
export default function ProgressChecklist({
  incident,
  unitOptions,
  sla,
  alreadyVerified,
  confirming,
  note,
  busy,
  onUnitChange,
  onDueDateChange,
  onTick,
  onUntick,
  onNoteChange,
  onConfirmClose,
  onCancelClose,
}) {
  const steps = progressSteps(incident);
  const closed = incident.status === 'closed';
  const code = incident.source_item_code;

  return (
    <Card title="Progress">
      <ol className="space-y-3">
        {steps.map((step, i) => {
          const isFirst = step.key === 'sent';
          const toggle = () => {
            if (busy) return;
            if (step.done) {
              if (step.canUntick) onUntick(step.key);
            } else if (step.enabled && !isFirst) {
              onTick(step.key);
            }
          };
          const clickable = !busy && (step.done ? step.canUntick : step.enabled && !isFirst);
          return (
            <li
              key={step.key}
              className={`rounded-md border px-3 py-2.5 ${
                step.done ? 'border-success/40 bg-success-soft/40' : 'border-line/15'
              } ${!step.enabled && !step.done ? 'opacity-50' : ''}`}
            >
              <label className={`flex min-h-11 items-center gap-3 ${clickable ? 'cursor-pointer' : 'cursor-default'}`}>
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={step.done}
                  disabled={!clickable}
                  aria-disabled={!clickable}
                  onChange={toggle}
                />
                <span
                  aria-hidden
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border-2 peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 ${
                    step.done ? 'border-success bg-success text-white' : 'border-line/30 bg-surface'
                  }`}
                >
                  {step.done && <Check size={14} />}
                </span>
                <span className="text-sm font-semibold text-ink">
                  {i + 1}. {step.label}
                </span>
              </label>

              {isFirst && (
                <div className="mt-2 space-y-3 pl-9">
                  <fieldset disabled={closed || busy} className="flex flex-wrap gap-2">
                    <legend className="sr-only">Unit</legend>
                    {unitOptions.map((opt) => {
                      const checked = incident.assigned_unit === opt.value;
                      return (
                        <label
                          key={opt.value}
                          className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm ${
                            checked ? 'border-primary bg-primary/5 font-semibold text-ink' : 'border-line/20 text-ink'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[var(--color-primary)]"
                            checked={checked}
                            onChange={() => {
                              if (!checked) onUnitChange(opt.value);
                              else if (canClearUnit(incident)) onUnitChange(null);
                            }}
                          />
                          {opt.label}
                        </label>
                      );
                    })}
                  </fieldset>

                  <div>
                    <span className="mb-1 block text-xs text-muted">Due date</span>
                    <div className="relative">
                      <input
                        type="date"
                        disabled={closed || busy}
                        value={incident.target_date || ''}
                        onChange={(e) => onDueDateChange(e.target.value)}
                        className="min-h-11 w-full rounded border border-line/20 bg-surface px-3 pr-9 text-sm text-ink desk:min-h-10"
                      />
                      <Calendar size={15} aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
                    </div>
                    <SlaChip sla={sla} />
                  </div>
                  {!step.done && (
                    <p className="text-xs text-muted">Tick a unit and set a due date to complete this step.</p>
                  )}
                </div>
              )}

              {step.key === 'closed' && confirming && (
                <div className="mt-2 rounded-md border border-success/40 bg-success-soft/60 p-3 pl-9">
                  {alreadyVerified ? (
                    <p className="text-sm font-semibold text-ink">Close this incident?</p>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-ink">Is item {code} OK now (SAT)?</p>
                      <p className="mt-0.5 text-xs text-muted">
                        Closing marks {code} SAT on the original checklist.
                      </p>
                      <textarea
                        rows={2}
                        value={note}
                        onChange={(e) => onNoteChange(e.target.value)}
                        placeholder="Optional note — what was checked on site"
                        className="mt-2 w-full rounded border border-line/20 bg-surface px-3 py-2 text-sm text-ink"
                      />
                    </>
                  )}
                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={onCancelClose}
                      className="min-h-11 rounded-md border border-line/20 bg-surface px-3 text-sm font-semibold text-ink hover:bg-surface-2 desk:min-h-9"
                    >
                      Not yet
                    </button>
                    <button
                      type="button"
                      onClick={onConfirmClose}
                      disabled={busy}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-success px-3 text-sm font-semibold text-white disabled:opacity-60 desk:min-h-9"
                    >
                      <Check size={14} aria-hidden /> Yes, close it
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function SlaChip({ sla }) {
  const tone =
    sla.kind === 'overdue'
      ? 'bg-alert-soft text-alert'
      : sla.kind === 'warning'
        ? 'bg-[#FDF3E2] text-[#9A6414]'
        : sla.kind === 'ok'
          ? 'bg-success-soft text-success'
          : 'bg-stripe text-muted';
  return (
    <span className={`mt-2 inline-block rounded px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {sla.kind === 'none' && 'No due date'}
      {(sla.kind === 'ok' || sla.kind === 'warning') && `${sla.remainingDays} days remaining`}
      {sla.kind === 'overdue' && `${Math.abs(sla.remainingDays)} days overdue`}
    </span>
  );
}
```

  Note: if `accent-[var(--color-primary)]` does not resolve in this Tailwind v4 theme, check `src/index.css` for the primary colour token name and use `accent-primary` instead.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: succeeds (component is not mounted yet, but it must compile).

- [ ] **Step 3: Commit**

```bash
git add src/components/incidents/ProgressChecklist.jsx
git commit -m "feat: ProgressChecklist — tick-off card for incident progress"
```

---

### Task 7: Wire the cleaned-up incident page

**Files:**
- Modify: `src/pages/IncidentDetailPage.jsx`
- Delete: `src/components/incidents/VerificationPanel.jsx`
- Modify: `src/components/tour/tours.js` (incident tour, ~lines 285–309), `src/content/faq.js` (~lines 108–132), `src/content/incidentGuide.js`

**Interfaces:**
- Consumes: `ProgressChecklist` (Task 6); `applyUnitChoice`, `withAutoAssign`, `statusAfterUntick`, `PROGRESS_STEPS` (Task 5); existing `incidentTransitionBlockers`, `hasSatVerification`, `incidentStatusLabel`, `persistIncident`, `addIncidentUpdate`, `syncSourceChecklist`.

- [ ] **Step 1: Tabs.** Replace the `TABS` constant with:

```js
// Hidden for now (the team asked for a simpler page). The tab code below stays
// in place — flip a flag to bring a tab back.
const SHOW_PHOTOS_TAB = false;
const SHOW_UPDATES_TAB = false;

const TABS = [
  { id: 'details', label: 'Incident Details', icon: AlertTriangle },
  { id: 'location', label: 'Location', icon: MapPin },
  SHOW_PHOTOS_TAB && { id: 'photos', label: 'Photos & Attachments', icon: Paperclip },
  SHOW_UPDATES_TAB && { id: 'updates', label: 'Actions & Updates', icon: Clock },
  { id: 'history', label: 'History', icon: HistoryIcon },
].filter(Boolean);
```

  The existing `?tab=` effect already ignores ids not in `TABS`, so `?tab=photos` stays on Details.

- [ ] **Step 2: Imports.** Add:

```js
import ProgressChecklist from '../components/incidents/ProgressChecklist.jsx';
import { PROGRESS_STEPS, applyUnitChoice, statusAfterUntick, withAutoAssign } from '../lib/incidentProgress.js';
```

  Remove the imports of `VerificationPanel`, `Dropdown`, `SelectField`, and the icons `ChevronDown`, `Lock`, `RefreshCw`, `Calendar` — but only those that are unused after Step 6 (`npm run build` will not flag unused imports, so search the file for each name before removing).

- [ ] **Step 3: State.** Remove `statusOpen` state. Rename nothing else; `verifyDraft` is reused as the step-4 confirm state (`null` = closed, `{ note }` = confirming).

- [ ] **Step 4: Handlers.** Remove `confirmVerification`, `clearVerification`, `attachVerificationPhoto`. In `changeStatus` delete the `setStatusOpen(false);` line. Add these after `changeStatus`:

```js
  /** Save, and when the status moved, log it so History shows the change. */
  async function saveAndLog(next, body) {
    const saved = await saveIncident(next);
    if (next.status !== incident.status) {
      await addIncidentUpdate(next, {
        body: body ?? `Status changed to ${incidentStatusLabel(next.status)}.`,
        status_from: incident.status,
        status_to: next.status,
        authorId: user?.id,
        authorName: displayName,
      });
    }
    await reload();
    return saved;
  }

  async function onUnitChange(unit) {
    setBanner(null);
    await saveAndLog(applyUnitChoice(incident, unit, new Date().toISOString()));
  }

  async function onDueDateChange(ymd) {
    setBanner(null);
    await saveAndLog(withAutoAssign({ ...incident, target_date: ymd || null }));
  }

  function onTick(stepKey) {
    setBanner(null);
    if (stepKey === 'closed') {
      setVerifyDraft({ note: '' });
      return;
    }
    const step = PROGRESS_STEPS.find((s) => s.key === stepKey);
    if (step) changeStatus(step.status);
  }

  function onUntick(stepKey) {
    setBanner(null);
    if (stepKey === 'sent') {
      onUnitChange(null);
      return;
    }
    const to = statusAfterUntick(stepKey);
    if (to) changeStatus(to);
  }

  /** Step 4: record SAT (unless already verified) and close, in one save. */
  async function closeIncident() {
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const alreadyVerified = hasSatVerification(incident);
      const note = verifyDraft?.note?.trim() || '';
      const next = {
        ...incident,
        verification: alreadyVerified
          ? incident.verification
          : {
              result: 'sat',
              verified_at: now,
              verified_by: user?.id ?? 'local',
              verified_by_name: displayName || profile?.full_name || 'User',
              note,
              photo_url: null,
            },
        status: 'closed',
        closed_at: now,
      };
      const blockers = incidentTransitionBlockers(next, 'closed', {
        reinspection: next.reinspection_submission_id,
      });
      if (blockers.length) {
        setBanner({ type: 'error', text: blockers.join(' ') });
        return;
      }
      await saveAndLog(
        next,
        alreadyVerified
          ? 'Status changed to Verified/Closed.'
          : `${incident.source_item_code} checked OK (SAT)${note ? ` — ${note}` : ''}. Status changed to Verified/Closed.`,
      );
      setVerifyDraft(null);
      setBanner({ type: 'ok', text: 'Incident closed.' });
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }
```

  `changeStatus` already calls `reload()` itself; leave it as is.

- [ ] **Step 5: Unit options for the checkboxes.** Replace `assignedUnitOptions` with (no "Unassigned" entry — unticking clears):

```js
  const assignedUnitOptions = useMemo(() => {
    if (profile?.role === 'apron_supervisor') return [{ value: 'om', label: 'Operations Manager' }];
    return ASSIGNED_UNITS.filter((u) => u.value !== 'om');
  }, [profile?.role]);
```

- [ ] **Step 6: Right rail.** Replace everything inside `<aside data-tour="incd-sidebar" …>` (the Status & Workflow, Assignment, Target Resolution and Quick Actions cards) with:

```jsx
          <ProgressChecklist
            incident={incident}
            unitOptions={assignedUnitOptions}
            sla={sla}
            alreadyVerified={verified}
            confirming={Boolean(verifyDraft)}
            note={verifyDraft?.note ?? ''}
            busy={busy}
            onUnitChange={onUnitChange}
            onDueDateChange={onDueDateChange}
            onTick={onTick}
            onUntick={onUntick}
            onNoteChange={(text) => setVerifyDraft((d) => ({ ...(d ?? {}), note: text }))}
            onConfirmClose={closeIncident}
            onCancelClose={() => setVerifyDraft(null)}
          />
```

  Delete the `STEP_LABELS` constant (only the removed stepper used it).

- [ ] **Step 7: Header actions.** Delete the whole `<Dropdown align="right"> … </Dropdown>` "More Actions" block. Keep Back and Edit Incident.

- [ ] **Step 8: One-line item status.** Replace the `<VerificationPanel … />` element on the Details tab with:

```jsx
              <section className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line/15 bg-surface px-4 py-3 text-sm shadow-card">
                <span className="font-semibold text-ink">Item {incident.source_item_code}</span>
                <span aria-hidden className="text-muted">·</span>
                {verified ? (
                  <span className="font-semibold text-success">Verified SAT</span>
                ) : (
                  <span className="font-semibold text-alert">NO SAT</span>
                )}
                {incident.submission_id && (
                  <>
                    <span aria-hidden className="text-muted">·</span>
                    <Link
                      to={`/checklists/${incident.submission_id}`}
                      className="inline-flex min-h-11 items-center text-primary hover:underline desk:min-h-0"
                    >
                      View checklist
                    </Link>
                  </>
                )}
              </section>
```

  Then delete `src/components/incidents/VerificationPanel.jsx`:

```bash
git rm src/components/incidents/VerificationPanel.jsx
```

- [ ] **Step 9: Wording.** In `src/components/tour/tours.js`, incident tour: bump `version: 1` → `version: 2` and change the last two step bodies to:

```js
        title: 'Details, location and history',
        body: 'Switch tabs to read the source item, see the location on the map, or check every change.',
```
```js
        title: 'Progress',
        body: 'Tick each step as the work moves along: send it to a unit with a due date, work started, fixed, then checked and closed.',
```

  In `src/content/faq.js` replace the three answers:

```js
        q: 'How do I assign an incident?',
        a: 'Open the incident and, under Progress, tick the unit doing the work (Grounds, Electrical, or Plumbing) and set a due date. Step 1 ticks itself once both are set. You assign a unit, not an individual.',
```
```js
        q: 'When does the original NO SAT become SAT?',
        a: 'When you tick "Checked and closed" on the incident and confirm the item is OK. The original checklist item then changes from NO SAT to SAT, with a record of when it changed and which incident caused the change.',
```
```js
        q: 'It is still not fixed. What do I do?',
        a: 'Leave "Checked and closed" unticked — answer "Not yet" — and keep the incident open. If it was marked Fixed too early, untick Fixed. Do not close it and raise a new one.',
```

  In `src/content/incidentGuide.js` change `closed:` to `'Someone re-checks it on site and ticks Checked and closed. That changes the original checklist item from NO SAT to SAT.'` and delete `VERIFICATION_HINT` if nothing else imports it (search `src/` first).

- [ ] **Step 10: Test and build**

Run: `npm test && npm run build`
Expected: all pass (`tests/tours.test.js` and `tests/noTrialWording.test.js` included).

- [ ] **Step 11: Manual check** (`npm run dev`, signed in as an OM) on a fresh incident:
  1. Only Details, Location, History tabs show; no More Actions menu.
  2. Tick Grounds → step 1 not yet done; set a due date → step 1 ticks, status strip says Assigned, History shows the change.
  3. Tick Electrical → Grounds unticks, assigned date unchanged.
  4. Tick Work started, then Fixed; untick Fixed → back to In Progress. Work started can't be unticked while Fixed is ticked.
  5. Tick Checked and closed → "Is item X OK now (SAT)?" → Not yet closes the prompt; Yes, close it → status Verified/Closed, the item line reads Verified SAT, and the source checklist item shows SAT.
  6. Phone width (390px): every box and unit option is a comfortable tap target, no horizontal scroll.
  7. As an Apron Supervisor: only "Operations Manager" is offered.

- [ ] **Step 12: Commit**

```bash
git add -A src/pages/IncidentDetailPage.jsx src/components/incidents src/components/tour/tours.js src/content
git commit -m "feat: simpler incident page — Progress tick-off card, hide photos/updates tabs"
```

---

### Task 8: PDF preview drawn with pdf.js

**Files:**
- Create: `src/components/checklist/PdfPageCanvas.jsx`
- Modify: `src/components/checklist/PdfPreview.jsx`
- Modify: `src/pages/ChecklistDetailPage.jsx` — preview state (~line 54), cleanup effect (64–68), `setPreviewBlobUrl`/`closePreview`/`handleShowPreview` (391–439), button label (553–564), reference iframe (656–661), `<PdfPreview>` (784)

**Interfaces:**
- Produces: `PdfPageCanvas({ source: Blob | string, className?: string })` — renders every page; `source` is a Blob (overlay result) or a same-origin URL string (Annex L asset).
- `PdfPreview` prop `url` is renamed to `source` (same types).

- [ ] **Step 1: Create `PdfPageCanvas.jsx`**

```jsx
import { useEffect, useRef, useState } from 'react';

/**
 * Draws a PDF's pages to <canvas> with pdf.js.
 *
 * Our CSP (`object-src 'none'`, `frame-ancestors 'none'`) blocks the
 * browser's built-in PDF viewer inside the page, and Android browsers never
 * render a PDF in an iframe at all — so the preview is drawn here instead.
 * pdf.js and its worker load only when a preview is opened. The worker is
 * bundled by Vite and served from our own origin (script-src 'self').
 *
 * A Blob is read directly (no fetch of a blob: URL, which connect-src would
 * refuse); a string is fetched as a same-origin asset.
 */
export default function PdfPageCanvas({ source, className = '' }) {
  const hostRef = useRef(null);
  const [state, setState] = useState({ status: 'loading', error: null });

  useEffect(() => {
    let cancelled = false;
    let doc = null;
    const host = hostRef.current;

    (async () => {
      try {
        setState({ status: 'loading', error: null });
        const [pdfjs, { default: workerUrl }] = await Promise.all([
          import('pdfjs-dist'),
          import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
        ]);
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

        const bytes =
          typeof source === 'string'
            ? await (await fetch(source, { credentials: 'same-origin' })).arrayBuffer()
            : await source.arrayBuffer();
        doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
        if (cancelled) return;

        host.replaceChildren();
        const width = host.clientWidth || 800;
        const ratio = window.devicePixelRatio || 1;
        for (let n = 1; n <= doc.numPages; n += 1) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * ratio });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = '100%';
          canvas.style.height = 'auto';
          canvas.className = 'mb-3 block rounded border border-line/15 bg-white shadow-card';
          canvas.setAttribute('aria-label', `Page ${n} of ${doc.numPages}`);
          canvas.setAttribute('role', 'img');
          host.appendChild(canvas);
          await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
        }
        if (!cancelled) setState({ status: 'ready', error: null });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', error: err?.message || 'Could not draw the preview.' });
      }
    })();

    return () => {
      cancelled = true;
      doc?.destroy();
    };
  }, [source]);

  return (
    <div className={className}>
      {state.status === 'loading' && <p className="px-4 py-6 text-center text-sm text-muted">Drawing preview…</p>}
      {state.status === 'error' && (
        <p className="border-b border-alert bg-alert-soft px-4 py-2 text-sm text-alert">{state.error}</p>
      )}
      <div ref={hostRef} className="p-3" />
    </div>
  );
}
```

  Before relying on the `page.render` signature, open `node_modules/pdfjs-dist/types/src/display/api.d.ts`, search `RenderParameters`, and confirm `canvas`/`canvasContext` are the parameter names in the installed version; adjust if they differ. If pdf.js logs a missing `wasmUrl`/`standardFontDataUrl` warning for any form, add `standardFontDataUrl` pointing at `pdfjs-dist/standard_fonts/` via a Vite `?url` glob — only if the warning actually appears.

- [ ] **Step 2: Swap the iframe in `PdfPreview.jsx`.** Change the signature to `export default function PdfPreview({ source, loading, error, onRefresh })`, add `import PdfPageCanvas from './PdfPageCanvas.jsx';`, replace `(url || loading)` with `(source || loading)`, and replace the `<iframe … />` branch with:

```jsx
      {source ? (
        <PdfPageCanvas source={source} className="max-h-[80dvh] overflow-y-auto bg-stripe lg:max-h-none" />
      ) : (
```

  (the empty-state branch after it is unchanged).

- [ ] **Step 3: `ChecklistDetailPage.jsx` state.** Replace `const [previewUrl, setPreviewUrl] = useState(null);` with `const [previewSource, setPreviewSource] = useState(null);`. Delete `previewUrlRef`, the unmount effect that revokes it (lines 64–68), and `setPreviewBlobUrl`.

- [ ] **Step 4: Preview handlers.** Replace `closePreview` and `handleShowPreview` with:

```js
  function closePreview() {
    setPreviewSource(null);
  }

  async function handleShowPreview() {
    // Nothing is stamped onto a reference sheet: show the approved file itself.
    if (isReference) {
      const url = baseFormUrl(record?.field_map?.basePdf);
      if (!url) {
        setPreviewError('The approved PDF for this document is not bundled with the app.');
        return;
      }
      setPreviewError(null);
      setPreviewSource(url);
      return;
    }
    scrollToPreview();
    if (!online) {
      setPreviewError('Preview is available once you are back online. Your checklist is saved.');
      return;
    }
    setPreviewing(true);
    setPreviewError(null);
    try {
      const current = (await save(record)) || record;
      setPreviewSource(await buildOverlayBlob(current));
      requestAnimationFrame(scrollToPreview);
    } catch (err) {
      setPreviewError(err.message);
    } finally {
      setPreviewing(false);
    }
  }
```

- [ ] **Step 5: Rename the remaining uses.** In the preview button replace both `previewUrl` with `previewSource`. Replace the reference-sheet `<iframe …>` (lines 656–661) with:

```jsx
      {isReference && previewSource ? (
        <PdfPageCanvas
          source={previewSource}
          className="rounded-lg border border-line/15 bg-stripe"
        />
      ) : (
```

  add `import PdfPageCanvas from '../components/checklist/PdfPageCanvas.jsx';`, and change the bottom element to `<PdfPreview source={previewSource} loading={previewing} error={previewError} onRefresh={handleShowPreview} />`. Search the file for `previewUrl` — there must be no matches left.

- [ ] **Step 6: Test and build**

Run: `npm test && npm run build`
Expected: all pass; the build output lists a separate `pdf.worker.min-*.mjs` asset and pdf.js in its own lazy chunk (not in the main bundle).

- [ ] **Step 7: Export parity guard** (export code is untouched; this proves it)

```bash
node scripts/parity-exports.mjs tmp-qa/parity-before   # run on the commit before Task 8 (git stash or checkout)
node scripts/parity-exports.mjs tmp-qa/parity-after
node scripts/parity-compare.mjs tmp-qa/parity-before tmp-qa/parity-after
```
Expected: zero visual difference.

- [ ] **Step 8: Manual check** (`npm run dev`, then again on production after deploy): Show preview renders the stamped pages on Annex D, one VAES appendix (e.g. C-08 Wind Cone), the Wildlife Incursion Report, and Annex L "View PDF"; Hide preview closes it; Refresh preview redraws after an edit; no CSP errors in the Console; at 390px width pages fit the screen with no sideways scroll; Export PDF still downloads.

- [ ] **Step 9: Commit**

```bash
git add src/components/checklist/PdfPageCanvas.jsx src/components/checklist/PdfPreview.jsx src/pages/ChecklistDetailPage.jsx
git commit -m "fix: draw PDF preview with pdf.js so it works under our CSP and on phones"
```

---

### Task 9: Final verification

**Files:** none (fix-ups only if a check fails)

- [ ] **Step 1:** `npm test` — all pass.
- [ ] **Step 2:** `npm run build` — succeeds.
- [ ] **Step 3:** Re-run Task 1's two reproductions on the deployed build: the wildlife report with `October 13, 2026` submits and shows **Submitted** in My Checklists; previews render on desktop and a phone.
- [ ] **Step 4:** Walk Task 7 Step 11 once more on production with a real incident.
- [ ] **Step 5:** Report results with the commit list for "2026-10-13 incident cleanup + submit/preview fixes".
