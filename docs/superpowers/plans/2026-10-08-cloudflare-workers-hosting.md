# Cloudflare Workers Hosting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the BACC portal and its six `/api` routes from one Cloudflare Worker at `bacc.visionforgestudio.app`. It still talks to the existing Supabase backend, and every exported PDF must be visually identical to today's.

**Architecture:** The pure PDF builders in `api/*.js` stop reading from disk. They get approved forms from an injected *form store*, built from a generated static manifest in the Worker and from the filesystem in Node scripts and tests. A small HTTP wrapper (`worker/http.js`) replaces the Vercel `handler(req, res)` functions. `@cloudflare/vite-plugin` runs the same Worker under `npm run dev`. GitHub Actions deploys with `wrangler deploy` once all verify checks pass.

**Tech Stack:** Cloudflare Workers (Paid plan, static assets, `nodejs_compat`), Wrangler 4, `@cloudflare/vite-plugin`, Vite 7, React 19, pdf-lib, supabase-js, Node 22 `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-08-cloudflare-workers-hosting-design.md`, which outranks this plan where they differ.

## Global Constraints

- Subdomain is exactly `bacc.visionforgestudio.app`. Worker name is exactly `bacc-portal`.
- Workers **Paid** plan. `limits.cpu_ms` is `30000`.
- Route paths stay exactly: `/api/export-checklist-pdf`, `/api/export-noc-register`, `/api/export-work-order`, `/api/export-report-pdf`, `/api/generate-checklist-instances`, `/api/create-user`. All are POST only.
- The client (`src/`) is unchanged except where a task says otherwise. It already calls same-origin `/api/...` through `src/lib/apiFetch.js`.
- Error responses are always `{ "error": string }` with the same status codes as today (400/401/403/405/413/429/503/500).
- `SUPABASE_SERVICE_ROLE_KEY` is a Wrangler **secret** only. It never goes in `vars`, never gets a `VITE_` prefix, and is never committed.
- HSTS is `max-age=63072000; includeSubDomains`, with no `preload`.
- No Cloudflare Access gate.
- **PDF parity bar: zero visual difference** against the pre-port output for every parity case.
- `server/overlay*.js` and `server/reportPdf.js` change only in Task 2 (`dataUriToBytes`). Field maps, checklist schemas and approved PDFs are not modified (CLAUDE.md and §14 of the client requirements).
- The user is on Windows. Shell commands below work in PowerShell, and `curl.exe` is used instead of `curl`.
- Work on a branch, `feat/cloudflare-workers-hosting`. **Don't merge to `main` until the user has turned off Vercel's Git auto-deploy** (Task 9).

## File map

| File | Status | Responsibility |
|---|---|---|
| `scripts/parity-exports.mjs` | create | Writes one PDF per parity case, either by calling the builders in-process or by POSTing to a running server |
| `scripts/parity-compare.mjs` | create | Rasterises two parity output folders and fails on any pixel difference |
| `server/overlayChecklistPdf.js` | modify | `dataUriToBytes` uses `atob`, not `Buffer` |
| `api/_formStore.js` | create | `createFormStore({ fieldMaps, basePdfs, schemas })`, the allow-listed lookup of approved forms |
| `scripts/lib/nodeFormStore.mjs` | create | Builds a form store from disk for Node scripts and tests |
| `api/_shared.js` | rewrite | `HttpError`, `LIMITS`, guards, `requireUser(request, env, opts)`, `rateLimit(key, opts)`. No `node:fs` |
| `api/export-*.js`, `api/generate-checklist-instances.js` | rewrite | Pure `build*(body, ctx)` functions only, with no Vercel handlers |
| `api/create-user.js` | rewrite | `buildCreateUser(body, { env })` |
| `worker/http.js` | create | `createApiHandler({ routes, forms, authenticate })` plus `SECURITY_HEADERS` |
| `worker/index.js` | create | Worker entry. Route table and fetch handler |
| `scripts/build-form-manifest.mjs` | create | Generates `worker/formAssets.js` and `worker/generated/forms/*.pdf.bin` |
| `wrangler.jsonc` | create | Worker config |
| `public/_headers` | create | Security headers for static assets |
| `vite.config.js` | modify | Adds `cloudflare()` and removes `pdfExportApiPlugin` |
| `vite.pdf-api.js` | delete | Replaced by the real Worker in dev |
| `package.json` | modify | Adds devDeps and the `predev`, `prebuild` and `deploy` scripts |
| `.gitignore` | modify | Adds `.wrangler`, `.dev.vars`, `worker/formAssets.js`, `worker/generated/` |
| `.github/workflows/verify.yml` | modify | Adds `npm test` and a `deploy` job |
| `CLAUDE.md`, `.env.example` | modify | Hosting notes |
| `vercel.json` | delete | Only at cutover (Task 9) |
| `tests/dataUriToBytes.test.js`, `tests/formStore.test.js`, `tests/createUser.test.js`, `tests/workerHttp.test.js` | create | Unit tests (`npm test` = `node --test`) |

> **Spec deviation, already decided:** the spec says `.pdf` files are imported through a Wrangler `Data` rule. `@cloudflare/vite-plugin` doesn't apply Wrangler `rules`. It imports `.bin` files as `ArrayBuffer` instead. So the manifest script copies each approved PDF to `worker/generated/forms/<name>.pdf.bin` (gitignored) and imports that. The bytes are identical, and `.bin` is also in Wrangler's default Data rule, so a plain `wrangler` bundle would read them the same way.

---

### Task 0: Branch

- [ ] **Step 1: Create the branch from an up-to-date `main`**

```powershell
git checkout main
git pull
git checkout -b feat/cloudflare-workers-hosting
```

---

### Task 1: Parity harness and pre-port baseline

Captures today's PDF output **before any code changes**, so every later task can prove nothing visual moved.

**Files:**
- Create: `scripts/parity-exports.mjs`
- Create: `scripts/parity-compare.mjs`

**Interfaces:**
- Produces: `node scripts/parity-exports.mjs <outDir> [--url <baseUrl>]` writes `<outDir>/<case>.pdf` for each case in `PARITY_CASES`. `node scripts/parity-compare.mjs <dirA> <dirB>` exits 0 only if every page of every case matches 100%.
- Consumes, in-process mode: `buildExport`, `buildNocRegisterExport`, `buildWorkOrderExport` and `buildReportExport` from `api/*.js`, called as `build(body, ctx)`. Before Task 4, `ctx` is ignored by the old signatures. After Task 4, `ctx.forms` comes from `scripts/lib/nodeFormStore.mjs` (Task 3).

- [ ] **Step 1: Create `scripts/parity-exports.mjs`**

```js
/**
 * PDF parity harness for the Cloudflare Workers port.
 *
 * Writes one PDF per case so a before/after pair can be rasterised and
 * diffed by scripts/parity-compare.mjs. Two modes:
 *
 *   node scripts/parity-exports.mjs <outDir>
 *       Calls the api/*.js builders in-process (Node).
 *
 *   node scripts/parity-exports.mjs <outDir> --url http://localhost:5173
 *       POSTs each case to a running server (vite dev with the Worker, or
 *       the deployed Worker). Local dev needs DEV_SKIP_AUTH=1 in .dev.vars;
 *       a deployed Worker needs PARITY_TOKEN set to a real session JWT.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schema = (key) =>
  JSON.parse(readFileSync(path.join(root, 'src/data/checklists', `${key}.json`), 'utf8'));

/** A deterministic submission that exercises item marks and remarks. */
function recordFor(templateKey, templateCode) {
  const items = {};
  let i = 0;
  for (const section of schema(templateKey).sections ?? []) {
    for (const item of section.items ?? []) {
      const noSat = i % 3 === 0;
      items[item.code] = {
        result: noSat ? 'no_sat' : 'sat',
        remarks: noSat ? `Parity remark for ${item.code}` : '',
      };
      i += 1;
    }
  }
  return {
    id: `PARITY-${templateKey}`,
    template_code: templateCode,
    header: {},
    items,
    signoffs: [],
  };
}

export const PARITY_CASES = [
  {
    name: 'annex-d',
    route: '/api/export-checklist-pdf',
    builder: 'checklist',
    body: {
      templateKey: 'annex-d-drainage',
      templateVersion: 'ed01',
      submission: recordFor('annex-d-drainage', 'PGIA-PMM-F04'),
    },
  },
  {
    name: 'annex-a',
    route: '/api/export-checklist-pdf',
    builder: 'checklist',
    body: {
      templateKey: 'annex-a-daily-routine-inspection-checklist',
      templateVersion: 'ed01',
      submission: recordFor('annex-a-daily-routine-inspection-checklist', 'PGIA-PMM-F01'),
    },
  },
  {
    name: 'vaes-c08',
    route: '/api/export-checklist-pdf',
    builder: 'checklist',
    body: {
      templateKey: 'appendix-c08-wind-cone',
      templateVersion: 'ed01',
      submission: recordFor('appendix-c08-wind-cone', 'PGIA-CL-VAES-08'),
    },
  },
  {
    name: 'work-order',
    route: '/api/export-work-order',
    builder: 'workOrder',
    body: {
      workOrder: {
        id: 'PARITY-WO',
        work_order_number: 'WO-2026-0001',
        date_issued: '2026-10-08',
        issued_by_name: 'Parity Issuer',
        assigned_to_name: 'Parity Assignee',
        noc_reference_no: 'NOC-2026-001',
        description: 'Clear debris from RWY 25 west edge drainage channel.',
      },
    },
  },
  {
    name: 'noc-register',
    route: '/api/export-noc-register',
    builder: 'nocRegister',
    body: {
      from: '2026-10-01',
      to: '2026-10-31',
      incidents: [1, 2, 3].map((n) => ({
        noc_no: `NOC-2026-00${n}`,
        reported_at: `2026-10-0${n}T10:00:00Z`,
        deficiency_level: n,
        description: `Parity incident ${n}`,
        location_label: 'RWY 07/25',
        target_date: `2026-10-2${n}`,
      })),
    },
  },
  {
    name: 'report',
    route: '/api/export-report-pdf',
    builder: 'report',
    body: {
      totals: { behind: 2, outstanding: 5 },
      onTimeRate: 80,
      teams: [{ label: 'Operations', completed: 4, scheduled: 5, rate: 0.8, overdue: 1, missed: 0, late: 1 }],
      weeks: [{ label: '2026-09-28', onTime: 3, late: 1 }],
      late: [{ code: 'PGIA-PMM-F04', team: 'Operations', due: '2026-10-01', completed: '2026-10-03', daysLate: 2 }],
    },
  },
];

async function inProcessBuilders() {
  const [checklist, nocRegister, workOrder, report] = await Promise.all([
    import('../api/export-checklist-pdf.js'),
    import('../api/export-noc-register.js'),
    import('../api/export-work-order.js'),
    import('../api/export-report-pdf.js'),
  ]);
  let ctx = {};
  try {
    const { createNodeFormStore } = await import('./lib/nodeFormStore.mjs');
    ctx = { forms: createNodeFormStore() };
  } catch (err) {
    // Before Task 3 the form store does not exist yet and the old builders
    // read from disk themselves; any other failure is real.
    if (err?.code !== 'ERR_MODULE_NOT_FOUND') throw err;
  }
  return {
    ctx,
    checklist: checklist.buildExport,
    nocRegister: nocRegister.buildNocRegisterExport,
    workOrder: workOrder.buildWorkOrderExport,
    report: report.buildReportExport,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const outDir = args.find((a) => !a.startsWith('--'));
  const urlIdx = args.indexOf('--url');
  const baseUrl = urlIdx >= 0 ? args[urlIdx + 1] : null;
  if (!outDir) {
    console.error('Usage: node scripts/parity-exports.mjs <outDir> [--url <baseUrl>]');
    process.exit(1);
  }
  const absOut = path.resolve(root, outDir);
  mkdirSync(absOut, { recursive: true });

  const local = baseUrl ? null : await inProcessBuilders();
  for (const c of PARITY_CASES) {
    let bytes;
    if (local) {
      // structuredClone: builders may mutate the body they are given.
      const result = await local[c.builder](structuredClone(c.body), local.ctx);
      bytes = result.bytes;
    } else {
      const headers = { 'Content-Type': 'application/json' };
      if (process.env.PARITY_TOKEN) headers.Authorization = `Bearer ${process.env.PARITY_TOKEN}`;
      const res = await fetch(new URL(c.route, baseUrl), {
        method: 'POST',
        headers,
        body: JSON.stringify(c.body),
      });
      if (!res.ok) throw new Error(`${c.name}: HTTP ${res.status} ${await res.text()}`);
      bytes = new Uint8Array(await res.arrayBuffer());
    }
    writeFileSync(path.join(absOut, `${c.name}.pdf`), bytes);
    console.log(`wrote ${path.join(outDir, `${c.name}.pdf`)} (${bytes.length} bytes)`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

- [ ] **Step 2: Create `scripts/parity-compare.mjs`**

```js
/**
 * Compare two parity output folders page by page via scripts/pdf-diff.mjs
 * (Poppler pdftoppm + pixelmatch). Exits non-zero on ANY difference.
 *
 *   node scripts/parity-compare.mjs tmp-pdf-diff/parity-before tmp-pdf-diff/parity-after
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [dirA, dirB] = process.argv.slice(2).map((d) => path.resolve(root, d ?? ''));
if (!process.argv[2] || !process.argv[3]) {
  console.error('Usage: node scripts/parity-compare.mjs <dirA> <dirB>');
  process.exit(1);
}

const pageCount = async (file) => (await PDFDocument.load(readFileSync(file))).getPageCount();

let failed = false;
for (const name of readdirSync(dirA).filter((f) => f.endsWith('.pdf')).sort()) {
  const a = path.join(dirA, name);
  const b = path.join(dirB, name);
  let pagesA;
  let pagesB;
  try {
    [pagesA, pagesB] = [await pageCount(a), await pageCount(b)];
  } catch (err) {
    console.error(`FAIL ${name}: ${err.message}`);
    failed = true;
    continue;
  }
  if (pagesA !== pagesB) {
    console.error(`FAIL ${name}: page count ${pagesA} vs ${pagesB}`);
    failed = true;
    continue;
  }
  const out = execFileSync('node', [path.join(root, 'scripts/pdf-diff.mjs'), a, b], {
    cwd: root,
    encoding: 'utf8',
  });
  const report = JSON.parse(out.slice(out.indexOf('{')));
  const worst = Math.min(...report.results.map((r) => r.matchPct));
  if (worst < 100) {
    console.error(`FAIL ${name}: worst page match ${worst}%`);
    failed = true;
  } else {
    console.log(`ok   ${name}: ${pagesA} page(s), 100% match`);
  }
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 3: Capture the baseline from the untouched code**

Run: `node scripts/parity-exports.mjs tmp-pdf-diff/parity-before`
Expected: six `wrote tmp-pdf-diff/parity-before/<case>.pdf (… bytes)` lines and exit code 0. If any case throws, **stop and report it.** It means the fixture body doesn't fit the current builder, and the case has to be corrected before anything else changes.

- [ ] **Step 4: Prove the comparator works (self-compare)**

Run: `node scripts/parity-compare.mjs tmp-pdf-diff/parity-before tmp-pdf-diff/parity-before`
Expected: six `ok … 100% match` lines and exit 0. Requires Poppler's `pdftoppm` on PATH, which `npm run verify:pdf` already needs.

- [ ] **Step 5: Commit** (the `tmp-pdf-diff/` outputs are already gitignored)

```powershell
git add scripts/parity-exports.mjs scripts/parity-compare.mjs
git commit -m "test: add PDF parity harness for the Workers port"
```

---

### Task 2: Runtime-neutral `dataUriToBytes`

**Files:**
- Modify: `server/overlayChecklistPdf.js` (the `dataUriToBytes` function at the end of the file)
- Test: `tests/dataUriToBytes.test.js`

**Interfaces:**
- Produces: `dataUriToBytes(dataUri: string | null | undefined): Uint8Array | null`. It returns a plain `Uint8Array` (not a `Buffer`), and returns `null` for empty input, non-data-URIs or corrupt base64.

- [ ] **Step 1: Write the failing test** in `tests/dataUriToBytes.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataUriToBytes } from '../server/overlayChecklistPdf.js';

// 1x1 transparent PNG.
const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('decodes a PNG data URI to the same bytes Buffer would', () => {
  const bytes = dataUriToBytes(`data:image/png;base64,${PNG_1PX}`);
  assert.deepEqual([...bytes], [...Buffer.from(PNG_1PX, 'base64')]);
});

test('returns a plain Uint8Array, not a Node Buffer (Workers have no Buffer by default)', () => {
  const bytes = dataUriToBytes(`data:image/png;base64,${PNG_1PX}`);
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(Buffer.isBuffer(bytes), false);
});

test('returns null for empty input and non-data URIs', () => {
  assert.equal(dataUriToBytes(null), null);
  assert.equal(dataUriToBytes(''), null);
  assert.equal(dataUriToBytes('https://example.com/a.png'), null);
});

test('returns null for corrupt base64 instead of throwing', () => {
  assert.equal(dataUriToBytes('data:image/png;base64,@@@@'), null);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test tests/dataUriToBytes.test.js`
Expected: FAIL on "returns a plain Uint8Array, not a Node Buffer", and on "corrupt base64".

- [ ] **Step 3: Replace `dataUriToBytes`** in `server/overlayChecklistPdf.js`

Replace the whole existing function:

```js
export function dataUriToBytes(dataUri) {
  if (!dataUri) return null;
  const match = String(dataUri).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return Buffer.from(match[2], 'base64');
}
```

with:

```js
export function dataUriToBytes(dataUri) {
  if (!dataUri) return null;
  const match = String(dataUri).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return base64ToBytes(match[2]);
}

/**
 * atob-based decode so this module runs unchanged on Cloudflare Workers, in
 * the browser and in Node 22 (all three have atob). Returns null on corrupt
 * input rather than Buffer's silent partial decode.
 */
function base64ToBytes(b64) {
  let binary;
  try {
    binary = atob(b64);
  } catch {
    return null;
  }
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}
```

- [ ] **Step 4: Run the tests and the existing PDF checks**

Run: `node --test tests/dataUriToBytes.test.js`
Expected: 4 passing.

Run: `npm run verify:signoffs` then `npm run verify:pdf`
Expected: both pass as before. The fixtures embed signature PNGs through `dataUriToBytes`.

- [ ] **Step 5: Commit**

```powershell
git add server/overlayChecklistPdf.js tests/dataUriToBytes.test.js
git commit -m "refactor: decode data URIs with atob so overlay runs on Workers"
```

---

### Task 3: Form store (the allow-list of approved forms)

**Files:**
- Create: `api/_formStore.js`
- Create: `scripts/lib/nodeFormStore.mjs`
- Modify: `api/_shared.js`. Add **only** `HttpError` in this task (the full rewrite comes in Task 4).
- Test: `tests/formStore.test.js`

**Interfaces:**
- Produces:
  - `class HttpError extends Error { status: number }`, exported from `api/_shared.js`, constructed as `new HttpError(status, message)`.
  - `createFormStore({ fieldMaps, basePdfs, schemas })` from `api/_formStore.js`. Its inputs:
    - `fieldMaps: Record<string, object>`, keyed by file stem, e.g. `'annex-d-drainage-ed01'`
    - `basePdfs: Record<string, Uint8Array | ArrayBuffer>`, keyed by file name, e.g. `'annex-d-drainage-ed01.pdf'`
    - `schemas: Record<string, object>`, keyed by template key, e.g. `'annex-d-drainage'`

    It returns a `FormStore`:
    - `templateKeys: Set<string>`
    - `resolveFieldMap(templateKey: string, version = 'ed01'): object`, a deep copy. Throws `HttpError(400)`.
    - `readApprovedBasePdf(fieldMap: { basePdf: string }): Uint8Array`. Throws `HttpError(400)`.
    - `loadSchema(templateKey: string): object | null`, a deep copy.
  - `loadFormSources(rootDir?: string)` from `scripts/lib/nodeFormStore.mjs`, returning `{ fieldMaps, basePdfs, schemas }`.
  - `createNodeFormStore(): FormStore` from `scripts/lib/nodeFormStore.mjs`.
- Consumes: `assertSafeKey(value, label)` from `api/_shared.js`. It exists today and Task 4 keeps the same name and behaviour.

- [ ] **Step 1: Add `HttpError` to `api/_shared.js`**

Add this directly below the imports (leave everything else in the file as is for now):

```js
/** An error that carries the HTTP status the API should answer with. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
```

- [ ] **Step 2: Write the failing test** in `tests/formStore.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFormStore } from '../api/_formStore.js';
import { loadFormSources, createNodeFormStore } from '../scripts/lib/nodeFormStore.mjs';

const sources = loadFormSources();
const store = createNodeFormStore();

test('every field map resolves and its approved base PDF is present', () => {
  const stems = Object.keys(sources.fieldMaps);
  assert.ok(stems.length >= 36, `expected at least 36 field maps, found ${stems.length}`);
  for (const stem of stems) {
    const [, key, ver] = stem.match(/^(.*)-(ed\d+)$/i);
    const map = store.resolveFieldMap(key, ver);
    const bytes = store.readApprovedBasePdf(map);
    assert.ok(bytes instanceof Uint8Array, `${stem}: base PDF not bytes`);
    assert.equal(
      new TextDecoder().decode(bytes.slice(0, 5)),
      '%PDF-',
      `${stem}: ${map.basePdf} is not a PDF`,
    );
  }
});

test('the register and work-order forms resolve by their fixed keys', () => {
  assert.equal(store.resolveFieldMap('annex-g-noc-register', 'ed01').basePdf, 'annex-g-noc-register-ed01.pdf');
  assert.equal(store.resolveFieldMap('annex-h-work-order', 'ed01').basePdf, 'annex-h-work-order-ed01.pdf');
});

test('rejects traversal, separators and unknown keys with HTTP 400', () => {
  for (const bad of ['../annex-d-drainage', 'annex/d', 'annex\\d', 'x\0y', '', 'not-a-form']) {
    assert.throws(() => store.resolveFieldMap(bad, 'ed01'), (err) => err.status === 400, `accepted ${JSON.stringify(bad)}`);
  }
  assert.throws(() => store.resolveFieldMap('annex-d-drainage', '../ed01'), (err) => err.status === 400);
  assert.throws(() => store.resolveFieldMap('annex-d-drainage', 'ed99'), (err) => err.status === 400);
});

test('base PDF lookup ignores inherited object keys', () => {
  for (const name of ['constructor', '__proto__', 'toString']) {
    assert.throws(() => store.readApprovedBasePdf({ basePdf: name }), (err) => err.status === 400);
  }
});

test('schemas load by template key; unknown keys give null', () => {
  assert.ok(Array.isArray(store.loadSchema('annex-d-drainage').sections));
  assert.equal(store.loadSchema('nope'), null);
  assert.equal(store.loadSchema(''), null);
});

test('returned field maps and schemas are copies', () => {
  store.resolveFieldMap('annex-d-drainage', 'ed01').fields = null;
  assert.ok(store.resolveFieldMap('annex-d-drainage', 'ed01').fields);
  store.loadSchema('annex-d-drainage').sections = null;
  assert.ok(store.loadSchema('annex-d-drainage').sections);
});

test('accepts ArrayBuffer PDFs (the Worker manifest imports .bin as ArrayBuffer)', () => {
  const pdf = sources.basePdfs['annex-d-drainage-ed01.pdf'];
  const ab = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength);
  const s = createFormStore({
    fieldMaps: { 'annex-d-drainage-ed01': sources.fieldMaps['annex-d-drainage-ed01'] },
    basePdfs: { 'annex-d-drainage-ed01.pdf': ab },
    schemas: {},
  });
  const bytes = s.readApprovedBasePdf(s.resolveFieldMap('annex-d-drainage'));
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(bytes.length, pdf.length);
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `node --test tests/formStore.test.js`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `api/_formStore.js`.

- [ ] **Step 4: Create `api/_formStore.js`**

```js
/**
 * The approved forms the export API is allowed to read.
 *
 * Built from a static manifest inside the Worker (worker/formAssets.js,
 * generated by scripts/build-form-manifest.mjs) and from disk in Node
 * scripts/tests (scripts/lib/nodeFormStore.mjs). Nothing outside these maps
 * is reachable — the maps ARE the allow-list, which is tighter than the old
 * directory scan. Callers never pass file paths, only keys.
 */
import { HttpError, assertSafeKey } from './_shared.js';

const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

export function createFormStore({ fieldMaps = {}, basePdfs = {}, schemas = {} } = {}) {
  const templateKeys = new Set();
  for (const stem of Object.keys(fieldMaps)) {
    const m = stem.match(/^(.*)-(ed\d+)$/i);
    templateKeys.add(m ? m[1] : stem);
  }

  return {
    templateKeys,

    resolveFieldMap(templateKey, version = 'ed01') {
      const key = assertSafeKey(templateKey, 'templateKey');
      const ver = assertSafeKey(version, 'templateVersion');
      if (!templateKeys.has(key)) throw new HttpError(400, `Unknown templateKey: ${key}`);
      const stem = `${key}-${ver}`;
      if (!own(fieldMaps, stem)) throw new HttpError(400, `Field map not found for ${stem}`);
      return structuredClone(fieldMaps[stem]);
    },

    readApprovedBasePdf(fieldMap) {
      const name = assertSafeKey(fieldMap?.basePdf, 'basePdf');
      if (!own(basePdfs, name)) throw new HttpError(400, `Approved base PDF missing: ${name}`);
      const bytes = basePdfs[name];
      return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    },

    loadSchema(templateKey) {
      if (!templateKey || !own(schemas, templateKey)) return null;
      return structuredClone(schemas[templateKey]);
    },
  };
}
```

- [ ] **Step 5: Make `assertSafeKey` throw `HttpError`** in `api/_shared.js`

Replace the existing `assertSafeKey` function with:

```js
export function assertSafeKey(value, label = 'key') {
  const s = String(value ?? '');
  if (!s || /[\\/\0]/.test(s) || s.includes('..')) {
    throw new HttpError(400, `Invalid ${label}`);
  }
  return s;
}
```

- [ ] **Step 6: Create `scripts/lib/nodeFormStore.mjs`**

```js
/**
 * Node-side form store: reads the approved forms from disk. Used by tests
 * and scripts (parity harness). The Worker uses worker/formAssets.js instead.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFormStore } from '../../api/_formStore.js';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const FORM_DIRS = {
  basePdfs: 'src/assets/forms',
  fieldMaps: 'src/data/field-maps',
  schemas: 'src/data/checklists',
};

export function listFormFiles(rootDir = defaultRoot) {
  const list = (dir, ext) =>
    readdirSync(path.join(rootDir, dir))
      .filter((f) => f.toLowerCase().endsWith(ext))
      .sort();
  return {
    basePdfs: list(FORM_DIRS.basePdfs, '.pdf'),
    fieldMaps: list(FORM_DIRS.fieldMaps, '.json'),
    schemas: list(FORM_DIRS.schemas, '.json'),
  };
}

export function loadFormSources(rootDir = defaultRoot) {
  const files = listFormFiles(rootDir);
  const json = (dir, f) => JSON.parse(readFileSync(path.join(rootDir, dir, f), 'utf8'));
  const stem = (f) => f.replace(/\.json$/i, '');
  return {
    basePdfs: Object.fromEntries(
      files.basePdfs.map((f) => [f, new Uint8Array(readFileSync(path.join(rootDir, FORM_DIRS.basePdfs, f)))]),
    ),
    fieldMaps: Object.fromEntries(files.fieldMaps.map((f) => [stem(f), json(FORM_DIRS.fieldMaps, f)])),
    schemas: Object.fromEntries(files.schemas.map((f) => [stem(f), json(FORM_DIRS.schemas, f)])),
  };
}

export function createNodeFormStore(rootDir = defaultRoot) {
  return createFormStore(loadFormSources(rootDir));
}
```

- [ ] **Step 7: Run the tests**

Run: `node --test tests/formStore.test.js`
Expected: 7 passing. If "every field map resolves" fails for a specific stem, **stop and report it**. A field map pointing at a missing PDF is a pre-existing data bug, not something to paper over.

- [ ] **Step 8: Commit**

```powershell
git add api/_formStore.js api/_shared.js scripts/lib/nodeFormStore.mjs tests/formStore.test.js
git commit -m "feat: add allow-listed form store for approved PDFs, field maps and schemas"
```

---

### Task 4: Port the API builders off Vercel and the filesystem

Every `api/*.js` file becomes pure `build*(body, ctx)` functions with no `req`/`res`, no `node:fs` and no `process.env`.

**Files:**
- Rewrite: `api/_shared.js`
- Rewrite: `api/export-checklist-pdf.js`, `api/export-noc-register.js`, `api/export-work-order.js`, `api/export-report-pdf.js`, `api/generate-checklist-instances.js`, `api/create-user.js`
- Test: `tests/createUser.test.js`

**Interfaces:**
- Consumes: `FormStore` (Task 3) via `ctx.forms`. `HttpError` and `assertSafeKey` (Task 3).
- Produces, all in `api/`:
  - `_shared.js`:
    - `HttpError`, `LIMITS`, `assertSafeKey`, `rejectClientBasePdf(body)`, `capArray(arr, max, label)`
    - `requireUser(request: Request, env, { roles?: string[] }): Promise<{ user, supabase, profile }>`
    - `rateLimit(key: string, { limit = 30, windowMs = 60000, now = Date.now() }): void`, which throws `HttpError(429)`
  - `buildExport(body, { forms })` returns `{ bytes, filename, fieldMap }`
  - `buildNocRegisterExport(body, { forms })` returns `{ bytes, filename }`
  - `buildWorkOrderExport(body, { forms })` returns `{ bytes, filename }`
  - `buildReportExport(body)` returns `{ bytes, filename }`, and caps `teams`, `weeks` and `late` itself
  - `buildGenerateInstances(body)` returns `{ created, instances }` (unchanged)
  - `buildCreateUser(body, { env })` returns `{ id, email }`

- [ ] **Step 1: Write the failing test** in `tests/createUser.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCreateUser } from '../api/create-user.js';

const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key' };
const valid = { email: 'new@bacc.bz', password: 'longenough1', full_name: 'New Person' };

test('503 when the service role key is not configured', async () => {
  await assert.rejects(buildCreateUser(valid, { env: { SUPABASE_URL: env.SUPABASE_URL } }), (e) => e.status === 503);
});

test('400 for each invalid field, before any network call', async () => {
  const cases = [
    { ...valid, email: 'not-an-email' },
    { ...valid, password: 'short' },
    { ...valid, full_name: '   ' },
    { ...valid, role: 'superuser' },
    { ...valid, department: 'Finance' },
  ];
  for (const body of cases) {
    await assert.rejects(buildCreateUser(body, { env }), (e) => e.status === 400, JSON.stringify(body));
  }
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test tests/createUser.test.js`
Expected: FAIL with `buildCreateUser` not exported.

- [ ] **Step 3: Rewrite `api/_shared.js`** with the complete file:

```js
/**
 * Shared guards for the /api routes (run inside the Cloudflare Worker).
 *
 * Every route is authenticated by worker/http.js calling `requireUser` before
 * the builder runs. Template / basePdf lookups go through the form store
 * (api/_formStore.js) — never through client-supplied paths.
 */
import { createClient } from '@supabase/supabase-js';

/** An error that carries the HTTP status the API should answer with. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Hard caps — attacker-controlled arrays never drive unbounded PDF work. */
export const LIMITS = {
  photos: 40,
  images: 40,
  incidents: 500,
  teams: 100,
  weeks: 52,
  late: 200,
  rules: 100,
  backfillDays: 120,
  bodyBytes: 12 * 1024 * 1024,
};

export function assertSafeKey(value, label = 'key') {
  const s = String(value ?? '');
  if (!s || /[\\/\0]/.test(s) || s.includes('..')) {
    throw new HttpError(400, `Invalid ${label}`);
  }
  return s;
}

export function rejectClientBasePdf(body) {
  if (body?.basePdfBase64) throw new HttpError(400, 'Client-supplied base PDF is not allowed');
}

export function capArray(arr, max, label) {
  if (!Array.isArray(arr)) return [];
  if (arr.length > max) throw new HttpError(400, `${label} exceeds limit of ${max}`);
  return arr;
}

/**
 * Validate the Supabase session JWT the SPA already holds.
 * Returns { user, supabase, profile } or throws HttpError 401/403/503.
 */
export async function requireUser(request, env, { roles } = {}) {
  const url = env?.SUPABASE_URL || '';
  const anonKey = env?.SUPABASE_ANON_KEY || '';
  if (!url || !anonKey) throw new HttpError(503, 'Supabase is not configured on the server');

  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new HttpError(401, 'Missing Authorization bearer token');
  const token = match[1].trim();

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, 'Invalid or expired session');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, department, full_name, position')
    .eq('id', data.user.id)
    .maybeSingle();

  if (roles?.length) {
    const role = profile?.role;
    if (!role || !roles.includes(role)) throw new HttpError(403, 'Forbidden for this role');
  }
  return { user: data.user, supabase, profile: profile || { id: data.user.id, role: null } };
}

/** In-memory fixed-window rate limit (best-effort: per Worker isolate). */
const buckets = new Map();
export function rateLimit(key, { limit = 30, windowMs = 60_000, now = Date.now() } = {}) {
  let entry = buckets.get(key);
  if (!entry || now - entry.start > windowMs) {
    entry = { start: now, count: 0 };
    buckets.set(key, entry);
  }
  entry.count += 1;
  if (entry.count > limit) throw new HttpError(429, 'Too many requests');
}
```

- [ ] **Step 4: Rewrite `api/export-checklist-pdf.js`** with the complete file:

```js
import {
  overlayChecklistPdf,
  submissionToOverlayValues,
  dataUriToBytes,
} from '../server/overlayChecklistPdf.js';
import { HttpError, LIMITS, capArray, rejectClientBasePdf } from './_shared.js';

/** POST /api/export-checklist-pdf */
export async function buildExport(body, { forms }) {
  rejectClientBasePdf(body);
  const templateKey = body.templateKey || 'annex-d-drainage';
  const templateVersion = body.templateVersion || 'ed01';
  // Always resolved server-side from the allow-listed form store.
  const fieldMap = forms.resolveFieldMap(templateKey, templateVersion);
  const basePdfBytes = forms.readApprovedBasePdf(fieldMap);

  const record = body.submission ?? body;
  const schemaForMapping = hasMappingMetadata(record.schema ?? record.content_schema)
    ? record.schema ?? record.content_schema
    : forms.loadSchema(fieldMap.templateKey) ?? record.schema ?? record.content_schema;

  const values = body.values ?? submissionToOverlayValues({ ...record, schema: schemaForMapping });
  const images = {};
  for (const [key, uri] of Object.entries(body.images ?? {})) {
    const bytes = dataUriToBytes(uri);
    if (bytes) images[key] = bytes;
  }
  if (Object.keys(images).length > LIMITS.images) {
    throw new HttpError(400, `images exceeds limit of ${LIMITS.images}`);
  }

  const photos = [];
  for (const photo of capArray(body.photos ?? [], LIMITS.photos, 'photos')) {
    const bytes = dataUriToBytes(photo.dataUri);
    if (bytes) photos.push({ bytes, label: photo.label, caption: photo.caption, contentType: photo.contentType });
  }

  const pdfBytes = await overlayChecklistPdf({
    basePdfBytes,
    fieldMap,
    values,
    images,
    meta: {
      formCode: record.template_code || fieldMap.templateKey,
      templateVersion,
      submissionId: record.id,
      photos,
    },
  });

  const filename = `${fieldMap.templateKey}-${templateVersion}-${record.id || 'draft'}.pdf`.replace(
    /[^\w.\-]+/g,
    '_',
  );
  return { bytes: pdfBytes, filename, fieldMap };
}

function hasMappingMetadata(schema) {
  return (schema?.headerFields ?? []).some((f) => f.markPrefix || f.mapKey);
}
```

- [ ] **Step 5: Rewrite `api/export-noc-register.js`** with the complete file:

```js
import {
  overlayRegisterPdf,
  incidentToRegisterRow,
  filterIncidentsForPeriod,
  currentMonthRange,
} from '../server/overlayRegisterPdf.js';
import { LIMITS, capArray, rejectClientBasePdf } from './_shared.js';

/** POST /api/export-noc-register */
export async function buildNocRegisterExport(body, { forms }) {
  rejectClientBasePdf(body);
  const fieldMap = forms.resolveFieldMap('annex-g-noc-register', 'ed01');
  const basePdfBytes = forms.readApprovedBasePdf(fieldMap);
  const range = currentMonthRange();
  const from = body.from || range.from;
  const to = body.to || range.to;
  const incidents = filterIncidentsForPeriod(
    capArray(body.incidents ?? [], LIMITS.incidents, 'incidents'),
    from,
    to,
  );
  const rows = incidents.map(incidentToRegisterRow);
  const pdfBytes = await overlayRegisterPdf({ basePdfBytes, fieldMap, rows });
  const filename = `PGIA-PMM-F07-NOC-register-${from}_to_${to}.pdf`.replace(/[^\w.\-]+/g, '_');
  return { bytes: pdfBytes, filename };
}
```

- [ ] **Step 6: Rewrite `api/export-work-order.js`** with the complete file:

```js
import { overlayChecklistPdf, dataUriToBytes } from '../server/overlayChecklistPdf.js';
import { workOrderToOverlayValues } from '../server/overlayWorkOrderPdf.js';
import { HttpError, LIMITS, rejectClientBasePdf } from './_shared.js';

/** POST /api/export-work-order */
export async function buildWorkOrderExport(body, { forms }) {
  rejectClientBasePdf(body);
  const fieldMap = forms.resolveFieldMap('annex-h-work-order', 'ed01');
  const basePdfBytes = forms.readApprovedBasePdf(fieldMap);
  const wo = body.workOrder ?? body;
  const values = body.values ?? workOrderToOverlayValues(wo);
  const images = {};
  for (const [key, uri] of Object.entries(body.images ?? {})) {
    const bytes = dataUriToBytes(uri);
    if (bytes) images[key] = bytes;
  }
  if (Object.keys(images).length > LIMITS.images) {
    throw new HttpError(400, `images exceeds limit of ${LIMITS.images}`);
  }
  const pdfBytes = await overlayChecklistPdf({
    basePdfBytes,
    fieldMap,
    values,
    images,
    meta: {
      formCode: 'PGIA-PMM-F08',
      templateVersion: fieldMap.templateVersion,
      submissionId: wo.work_order_number || wo.id,
    },
  });
  const filename = `${wo.work_order_number || 'work-order'}.pdf`.replace(/[^\w.\-]+/g, '_');
  return { bytes: pdfBytes, filename };
}
```

- [ ] **Step 7: Rewrite `api/export-report-pdf.js`** with the complete file:

```js
import { buildReportPdf } from '../server/reportPdf.js';
import { LIMITS, capArray } from './_shared.js';

/** POST /api/export-report-pdf — house-style report, not an approved annex. */
export async function buildReportExport(body) {
  return buildReportPdf({
    ...body,
    teams: capArray(body.teams ?? [], LIMITS.teams, 'teams'),
    weeks: capArray(body.weeks ?? [], LIMITS.weeks, 'weeks'),
    late: capArray(body.late ?? [], LIMITS.late, 'late'),
  });
}
```

- [ ] **Step 8: Rewrite `api/generate-checklist-instances.js`** with the complete file:

```js
import { generatePendingInstances } from '../src/lib/instanceGeneration.js';
import { HttpError, LIMITS, capArray } from './_shared.js';

/**
 * POST /api/generate-checklist-instances — OM/COO/admin only (enforced by the
 * route's auth.roles in worker/index.js). Idempotent. Body:
 * { rules, existing, from, to, nowMs }. from/to are clamped to
 * LIMITS.backfillDays regardless of client input.
 */
export async function buildGenerateInstances(body = {}) {
  const nowMs = Number(body.nowMs) || Date.now();
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const maxMs = LIMITS.backfillDays * 86400000;
  const earliest = new Date(nowMs - maxMs).toISOString().slice(0, 10);
  let fromYmd = body.from || earliest;
  let toYmd = body.to || today;
  if (fromYmd < earliest) fromYmd = earliest;
  if (toYmd > today) toYmd = today;
  if (fromYmd > toYmd) throw new HttpError(400, 'from must be on or before to');

  const created = generatePendingInstances({
    rules: capArray(body.rules ?? [], LIMITS.rules, 'rules'),
    existing: capArray(body.existing ?? [], LIMITS.rules * LIMITS.backfillDays, 'existing'),
    fromYmd,
    toYmd,
    nowMs,
    idFactory: () => crypto.randomUUID(),
  });
  return { created: created.length, instances: created };
}
```

- [ ] **Step 9: Rewrite `api/create-user.js`** with the complete file:

```js
/**
 * POST /api/create-user — admin/OM only (enforced by the route's auth.roles
 * in worker/index.js): create a real Supabase Auth login for a staff member.
 *
 * Creating an auth user needs the service_role key, which must never reach
 * the browser. It lives only as a Wrangler secret (SUPABASE_SERVICE_ROLE_KEY).
 *
 * `handle_new_user()` (migration 010) always inserts the new profile with
 * role='inspector', ignoring metadata — intentional and kept. The real
 * role/department/position/approver flag is set in a second step with the
 * service-role client.
 */
import { createClient } from '@supabase/supabase-js';
import { HttpError } from './_shared.js';

// Mirrors ROLE_OPTIONS / DEPT_OPTIONS in src/components/settings/UsersRolesSection.jsx.
const ALLOWED_ROLES = ['om', 'coo', 'duty_manager', 'apron_supervisor', 'electrical_tech', 'sms', 'admin'];
const ALLOWED_DEPARTMENTS = ['Operations', 'Engineering', 'Maintenance'];

export async function buildCreateUser(body, { env }) {
  const url = env?.SUPABASE_URL || '';
  const serviceKey = env?.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceKey) {
    throw new HttpError(
      503,
      'User creation is not configured on the server (set it with `wrangler secret put SUPABASE_SERVICE_ROLE_KEY`)',
    );
  }

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const full_name = String(body.full_name || '').trim();
  const position = String(body.position || '').trim();
  const department = String(body.department || '').trim();
  const role = String(body.role || '').trim();
  const is_approver = Boolean(body.is_approver);

  if (!email || !email.includes('@')) throw new HttpError(400, 'A valid email is required');
  if (!password || password.length < 10) {
    throw new HttpError(400, 'Temporary password must be at least 10 characters');
  }
  if (!full_name) throw new HttpError(400, 'Full name is required');
  if (role && !ALLOWED_ROLES.includes(role)) throw new HttpError(400, 'Unknown role');
  if (department && !ALLOWED_DEPARTMENTS.includes(department)) throw new HttpError(400, 'Unknown department');

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, position, department },
  });
  if (error) {
    throw new HttpError(
      error.status && error.status < 500 ? error.status : 502,
      error.message || 'Could not create the account',
    );
  }

  const userId = data.user.id;
  const patch = { full_name, position, is_approver };
  if (department) patch.department = department;
  if (role) patch.role = role;

  const { error: profileError } = await admin.from('profiles').update(patch).eq('id', userId);
  if (profileError) {
    throw new HttpError(
      500,
      `Account created, but the profile could not be finished: ${profileError.message}. ` +
        'The login exists — finish setting their role from Users & roles.',
    );
  }

  return { id: userId, email };
}
```

- [ ] **Step 10: Confirm no Vercel or Node-filesystem code is left in `api/`**

Run: `Select-String -Path api\*.js -Pattern "node:fs|node:path|process\.env|export default|export const config|req\.|res\."`
Expected: no output.

- [ ] **Step 11: Run all tests**

Run: `npm test`
Expected: all suites pass, including `createUser.test.js` (2 tests), `formStore.test.js` (7), `dataUriToBytes.test.js` (4) and the existing three.

- [ ] **Step 12: Parity check through the new Node path**

Run: `node scripts/parity-exports.mjs tmp-pdf-diff/parity-node`
Then: `node scripts/parity-compare.mjs tmp-pdf-diff/parity-before tmp-pdf-diff/parity-node`
Expected: six `ok … 100% match` lines, exit 0. **Any FAIL blocks this task.**

- [ ] **Step 13: Run the existing PDF verification**

Run: `npm run verify:pdf` and `npm run verify:signoffs`
Expected: pass.

- [ ] **Step 14: Commit**

```powershell
git add api tests/createUser.test.js
git commit -m "refactor: make api builders pure (form store + HttpError), drop Vercel handlers"
```

> `vite.pdf-api.js` still imports the old builder names without a `ctx`, so `npm run dev` exports break between this commit and Task 6. That's expected on the feature branch. Task 6 deletes that file.

---

### Task 5: Worker HTTP wrapper

**Files:**
- Create: `worker/http.js`
- Test: `tests/workerHttp.test.js`

**Interfaces:**
- Consumes: `HttpError`, `LIMITS` and `rateLimit` from `api/_shared.js` (Task 4).
- Produces:
  - `SECURITY_HEADERS: Record<string, string>`
  - `createApiHandler({ routes, forms, authenticate })`, returning `(request: Request, env) => Promise<Response>`
    - `routes: Record<path, { kind: 'pdf' | 'json', build(body, ctx), auth?: { roles?: string[] }, limit?: number }>`
    - `authenticate(request, env, auth)` returns `{ user, profile, … }`, or throws `HttpError`
    - The `ctx` passed to `build` is `{ env, forms, user }`
    - When `env.DEV_SKIP_AUTH === '1'` **and** the request host is `localhost` or `127.0.0.1`, auth is skipped and the user is `{ user: { id: 'local-dev' }, profile: { id: 'local-dev', role: 'admin' } }`

- [ ] **Step 1: Write the failing test** in `tests/workerHttp.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApiHandler, SECURITY_HEADERS } from '../worker/http.js';
import { HttpError, LIMITS } from '../api/_shared.js';

const routes = {
  '/api/pdf': {
    kind: 'pdf',
    build: async () => ({ bytes: new Uint8Array([37, 80, 68, 70, 45]), filename: 'x.pdf' }),
  },
  '/api/json': {
    kind: 'json',
    auth: { roles: ['admin'] },
    build: async (body, ctx) => ({ echo: body, role: ctx.user.profile.role, hasForms: Boolean(ctx.forms) }),
  },
  '/api/boom': { kind: 'json', build: async () => { throw new Error('kaboom'); } },
  '/api/teapot': { kind: 'json', build: async () => { throw new HttpError(418, 'short and stout'); } },
  '/api/limited': { kind: 'json', limit: 2, build: async () => ({ ok: true }) },
};

const seenAuth = [];
async function authenticate(request, env, auth) {
  seenAuth.push(auth);
  if (!request.headers.get('authorization')) throw new HttpError(401, 'Missing Authorization bearer token');
  return { user: { id: 'u1' }, profile: { id: 'u1', role: 'admin' } };
}

const handle = createApiHandler({ routes, forms: { marker: true }, authenticate });

let ipSeq = 0;
function req(path, { method = 'POST', body = '{}', auth = true, host = 'bacc.visionforgestudio.app', ip } = {}) {
  const headers = new Headers({ 'cf-connecting-ip': ip ?? `10.0.0.${++ipSeq}` });
  if (auth) headers.set('authorization', 'Bearer t');
  return new Request(`https://${host}${path}`, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : body,
  });
}

test('404 JSON for an unknown /api path', async () => {
  const res = await handle(req('/api/nope'), {});
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'Not found' });
});

test('405 with Allow: POST for other methods', async () => {
  const res = await handle(req('/api/pdf', { method: 'GET' }), {});
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'POST');
  assert.equal(typeof (await res.json()).error, 'string');
});

test('413 when the body exceeds LIMITS.bodyBytes', async () => {
  const res = await handle(req('/api/json', { body: 'x'.repeat(LIMITS.bodyBytes + 1) }), {});
  assert.equal(res.status, 413);
});

test('401 without a bearer token', async () => {
  const res = await handle(req('/api/json', { auth: false }), {});
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'Missing Authorization bearer token' });
});

test('route auth options reach authenticate()', async () => {
  seenAuth.length = 0;
  await handle(req('/api/json'), {});
  assert.deepEqual(seenAuth.at(-1), { roles: ['admin'] });
  await handle(req('/api/pdf'), {});
  assert.deepEqual(seenAuth.at(-1), {});
});

test('400 on malformed JSON and on non-object bodies', async () => {
  assert.equal((await handle(req('/api/json', { body: '{not json' }), {})).status, 400);
  assert.equal((await handle(req('/api/json', { body: '[1,2]' }), {})).status, 400);
  assert.equal((await handle(req('/api/json', { body: 'null' }), {})).status, 400);
});

test('empty body is treated as {}', async () => {
  const res = await handle(req('/api/json', { body: '' }), {});
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).echo, {});
});

test('PDF route returns bytes as an attachment with security headers', async () => {
  const res = await handle(req('/api/pdf'), {});
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.equal(res.headers.get('content-disposition'), 'attachment; filename="x.pdf"');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) assert.equal(res.headers.get(k), v, k);
  assert.equal(new TextDecoder().decode(new Uint8Array(await res.arrayBuffer())), '%PDF-');
});

test('JSON route gets body, user and forms in ctx', async () => {
  const res = await handle(req('/api/json', { body: '{"a":1}' }), {});
  assert.deepEqual(await res.json(), { echo: { a: 1 }, role: 'admin', hasForms: true });
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
});

test('unexpected errors become 500 { error }', async () => {
  const res = await handle(req('/api/boom'), {});
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: 'kaboom' });
});

test('HttpError status passes through', async () => {
  const res = await handle(req('/api/teapot'), {});
  assert.equal(res.status, 418);
  assert.deepEqual(await res.json(), { error: 'short and stout' });
});

test('per-route rate limit returns 429 once exceeded for one IP', async () => {
  const ip = '10.9.9.9';
  assert.equal((await handle(req('/api/limited', { ip }), {})).status, 200);
  assert.equal((await handle(req('/api/limited', { ip }), {})).status, 200);
  assert.equal((await handle(req('/api/limited', { ip }), {})).status, 429);
  assert.equal((await handle(req('/api/limited', { ip: '10.9.9.10' }), {})).status, 200);
});

test('DEV_SKIP_AUTH only works on localhost', async () => {
  const env = { DEV_SKIP_AUTH: '1' };
  const local = await handle(req('/api/json', { auth: false, host: 'localhost:5173' }), env);
  assert.equal(local.status, 200);
  assert.equal((await local.json()).role, 'admin');
  const loopback = await handle(req('/api/json', { auth: false, host: '127.0.0.1:5173' }), env);
  assert.equal(loopback.status, 200);
  const prod = await handle(req('/api/json', { auth: false }), env);
  assert.equal(prod.status, 401);
  const offLocal = await handle(req('/api/json', { auth: false, host: 'localhost:5173' }), {});
  assert.equal(offLocal.status, 401);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test tests/workerHttp.test.js`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `worker/http.js`.

- [ ] **Step 3: Create `worker/http.js`**

```js
/**
 * Request/response wrapper for the /api routes inside the Worker.
 *
 * Replaces the per-file Vercel handler boilerplate. Order matters and matches
 * the old handlers: method → body size → rate limit → auth → parse → build.
 * Every response carries the same security headers as static assets
 * (public/_headers only applies to assets, not Worker responses).
 */
import { HttpError, LIMITS, rateLimit } from '../api/_shared.js';

export const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.tile.openstreetmap.org; frame-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(self)',
};

const LOCAL_DEV_USER = { user: { id: 'local-dev' }, profile: { id: 'local-dev', role: 'admin' } };

function json(status, payload, extra = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...extra,
    },
  });
}

/** Local `vite dev` in mock mode has no Supabase session to send. */
function isLocalDevBypass(request, env) {
  if (env?.DEV_SKIP_AUTH !== '1') return false;
  const host = new URL(request.url).hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

export function createApiHandler({ routes, forms, authenticate }) {
  return async function handleApi(request, env) {
    const { pathname } = new URL(request.url);
    const route = Object.prototype.hasOwnProperty.call(routes, pathname) ? routes[pathname] : null;
    if (!route) return json(404, { error: 'Not found' });
    if (request.method !== 'POST') return json(405, { error: 'Method not allowed' }, { Allow: 'POST' });

    try {
      const declared = Number(request.headers.get('content-length') || 0);
      if (declared > LIMITS.bodyBytes) throw new HttpError(413, 'Request body too large');

      const ip = request.headers.get('cf-connecting-ip') || 'unknown';
      rateLimit(`${ip}:${pathname}`, { limit: route.limit ?? 20 });

      const user = isLocalDevBypass(request, env)
        ? LOCAL_DEV_USER
        : await authenticate(request, env, route.auth ?? {});

      const text = await request.text();
      // Chunked uploads have no Content-Length; check what actually arrived.
      if (text.length > LIMITS.bodyBytes) throw new HttpError(413, 'Request body too large');
      let body;
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        throw new HttpError(400, 'Request body must be JSON');
      }
      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        throw new HttpError(400, 'Request body must be a JSON object');
      }

      const result = await route.build(body, { env, forms, user });

      if (route.kind === 'pdf') {
        return new Response(result.bytes, {
          status: 200,
          headers: {
            ...SECURITY_HEADERS,
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${result.filename}"`,
            'Cache-Control': 'no-store',
          },
        });
      }
      return json(200, result);
    } catch (err) {
      const status = Number.isInteger(err?.status) ? err.status : 500;
      if (status >= 500) {
        console.error(
          JSON.stringify({ level: 'error', path: pathname, msg: err?.message || String(err), stack: err?.stack }),
        );
      }
      return json(status, { error: err?.message || 'Request failed' });
    }
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/workerHttp.test.js`
Expected: 13 passing.

Run: `npm test`
Expected: everything passes.

- [ ] **Step 5: Commit**

```powershell
git add worker/http.js tests/workerHttp.test.js
git commit -m "feat: add Worker /api request wrapper with auth, limits and security headers"
```

---

### Task 6: Worker entry, form manifest, Wrangler and Vite wiring

**Files:**
- Create: `scripts/build-form-manifest.mjs`, `worker/index.js`, `wrangler.jsonc`, `public/_headers`, `.dev.vars` (local only, never committed)
- Modify: `vite.config.js`, `package.json`, `.gitignore`
- Delete: `vite.pdf-api.js`

**Interfaces:**
- Consumes: `createApiHandler` (Task 5). `requireUser` and the six `build*` functions (Task 4). `createFormStore` (Task 3). `listFormFiles` and `FORM_DIRS` (Task 3).
- Produces:
  - `worker/formAssets.js` (generated), exporting `formStore: FormStore`
  - `worker/index.js`, which default-exports `{ fetch(request, env) }` and exports `ROUTES`

- [ ] **Step 1: Install the Cloudflare tooling**

Run: `npm install --save-dev wrangler@^4 @cloudflare/vite-plugin@^1`
Expected: `package.json` devDependencies now list both. If npm can't find `@cloudflare/vite-plugin@^1`, run `npm view @cloudflare/vite-plugin version` and install that major instead, then note it in the commit message.

- [ ] **Step 2: Create `scripts/build-form-manifest.mjs`**

```js
/**
 * Generate worker/formAssets.js — the static manifest of approved forms the
 * Worker may read (Workers have no filesystem).
 *
 * Approved PDFs are copied to worker/generated/forms/<name>.pdf.bin because
 * @cloudflare/vite-plugin imports `.bin` as ArrayBuffer (it does not apply
 * Wrangler `rules`). Bytes are unchanged. Field maps and schemas are imported
 * as JSON. Both outputs are gitignored and rebuilt by predev/prebuild.
 */
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORM_DIRS, listFormFiles } from './lib/nodeFormStore.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const genDir = path.join(root, 'worker/generated/forms');

rmSync(path.join(root, 'worker/generated'), { recursive: true, force: true });
mkdirSync(genDir, { recursive: true });

const files = listFormFiles(root);
const stem = (f) => f.replace(/\.json$/i, '');
const lines = [
  '// GENERATED by scripts/build-form-manifest.mjs — do not edit; not committed.',
  "import { createFormStore } from '../api/_formStore.js';",
];

files.basePdfs.forEach((f, i) => {
  copyFileSync(path.join(root, FORM_DIRS.basePdfs, f), path.join(genDir, `${f}.bin`));
  lines.push(`import pdf${i} from './generated/forms/${f}.bin';`);
});
files.fieldMaps.forEach((f, i) => lines.push(`import map${i} from '../${FORM_DIRS.fieldMaps}/${f}';`));
files.schemas.forEach((f, i) => lines.push(`import schema${i} from '../${FORM_DIRS.schemas}/${f}';`));

lines.push('', 'export const formStore = createFormStore({', '  basePdfs: {');
files.basePdfs.forEach((f, i) => lines.push(`    ${JSON.stringify(f)}: pdf${i},`));
lines.push('  },', '  fieldMaps: {');
files.fieldMaps.forEach((f, i) => lines.push(`    ${JSON.stringify(stem(f))}: map${i},`));
lines.push('  },', '  schemas: {');
files.schemas.forEach((f, i) => lines.push(`    ${JSON.stringify(stem(f))}: schema${i},`));
lines.push('  },', '});', '');

writeFileSync(path.join(root, 'worker/formAssets.js'), lines.join('\n'));
console.log(
  `form manifest: ${files.basePdfs.length} PDFs, ${files.fieldMaps.length} field maps, ${files.schemas.length} schemas`,
);
```

- [ ] **Step 3: Run it**

Run: `node scripts/build-form-manifest.mjs`
Expected: `form manifest: 36 PDFs, 36 field maps, 35 schemas`. The exact counts may differ by one or two; what matters is that the PDF and field-map counts match the files in `src/assets/forms` and `src/data/field-maps`. Also check that `worker/formAssets.js` and `worker/generated/forms/annex-d-drainage-ed01.pdf.bin` exist.

- [ ] **Step 4: Create `worker/index.js`**

```js
/**
 * Cloudflare Worker entry for the BACC portal.
 *
 * Static assets (the SPA) are served by Workers static assets before this
 * code runs; wrangler.jsonc's run_worker_first sends only /api/* here.
 */
import { createApiHandler } from './http.js';
import { formStore } from './formAssets.js';
import { requireUser } from '../api/_shared.js';
import { buildExport } from '../api/export-checklist-pdf.js';
import { buildNocRegisterExport } from '../api/export-noc-register.js';
import { buildWorkOrderExport } from '../api/export-work-order.js';
import { buildReportExport } from '../api/export-report-pdf.js';
import { buildGenerateInstances } from '../api/generate-checklist-instances.js';
import { buildCreateUser } from '../api/create-user.js';

export const ROUTES = {
  '/api/export-checklist-pdf': { kind: 'pdf', build: buildExport },
  '/api/export-noc-register': { kind: 'pdf', build: buildNocRegisterExport },
  '/api/export-work-order': { kind: 'pdf', build: buildWorkOrderExport },
  '/api/export-report-pdf': { kind: 'pdf', build: buildReportExport },
  '/api/generate-checklist-instances': {
    kind: 'json',
    auth: { roles: ['om', 'coo', 'admin'] },
    limit: 10,
    build: buildGenerateInstances,
  },
  '/api/create-user': {
    kind: 'json',
    auth: { roles: ['admin', 'om'] },
    limit: 10,
    build: buildCreateUser,
  },
};

const handleApi = createApiHandler({ routes: ROUTES, forms: formStore, authenticate: requireUser });

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  },
};
```

- [ ] **Step 5: Create `wrangler.jsonc`**

Copy the two values from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in your local `.env.local` into `vars`. Both are public values that already ship in the browser bundle. **Do not** put the service-role key here.

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "bacc-portal",
  "main": "./worker/index.js",
  "compatibility_date": "2026-09-01",
  "compatibility_flags": ["nodejs_compat"],
  // Static assets come from the Vite client build (the Cloudflare Vite plugin
  // sets the directory). SPA mode replaces vercel.json's rewrite; only /api/*
  // reaches the Worker.
  "assets": {
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  },
  // Workers Paid: pdf-lib overlay needs far more than the free plan's 10 ms.
  "limits": { "cpu_ms": 30000 },
  "observability": { "enabled": true },
  "routes": [{ "pattern": "bacc.visionforgestudio.app", "custom_domain": true }],
  "vars": {
    "SUPABASE_URL": "<copy VITE_SUPABASE_URL from .env.local>",
    "SUPABASE_ANON_KEY": "<copy VITE_SUPABASE_ANON_KEY from .env.local>"
  }
  // Secret (never here): SUPABASE_SERVICE_ROLE_KEY → `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY`
}
```

- [ ] **Step 6: Create `public/_headers`**

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.tile.openstreetmap.org; frame-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
  Strict-Transport-Security: max-age=63072000; includeSubDomains
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(self), microphone=(), geolocation=(self)
```

- [ ] **Step 7: Update `vite.config.js`**

Replace:

```js
import { pdfExportApiPlugin } from './vite.pdf-api.js';

// Vercel is the only supported deploy target for this app (it serves the
// /api/* functions PDF export depends on, which a GitHub Pages deploy
// cannot run) — no GITHUB_PAGES base-path branching or Pages 404 fallback.
```

with:

```js
import { cloudflare } from '@cloudflare/vite-plugin';

// Cloudflare Workers is the deploy target (wrangler.jsonc). The Cloudflare
// plugin runs the real Worker — including /api/* PDF export — inside
// `vite dev`, so dev and production share one code path.
```

and in `plugins: [...]` replace `pdfExportApiPlugin(),` with `cloudflare(),`.

- [ ] **Step 8: Delete the Node dev shim**

Run: `git rm vite.pdf-api.js`

- [ ] **Step 9: Update `package.json` scripts**

Add these three entries to `"scripts"` and leave every existing script as it is:

```json
"predev": "node scripts/build-form-manifest.mjs",
"prebuild": "node scripts/build-form-manifest.mjs",
"deploy": "npm run build && wrangler deploy",
```

- [ ] **Step 10: Update `.gitignore`**

Append:

```
# Cloudflare
.wrangler
.dev.vars
worker/formAssets.js
worker/generated/
```

- [ ] **Step 11: Create `.dev.vars`** (local only; Step 10 gitignores it)

```
DEV_SKIP_AUTH=1
```

- [ ] **Step 12: Build and check the output**

Run: `npm run build`
Expected: `form manifest: …` printed first, then a client build and a Worker build with no errors.

Run: `Get-ChildItem dist -Recurse -Include sw.js,_headers,index.html | Select-Object FullName`
Expected: `sw.js`, `_headers` and `index.html` all present in the **same** client output folder (normally `dist\client\`).

**Fallback, only if `sw.js` is missing:** vite-plugin-pwa didn't emit into the Cloudflare client environment. Revert Step 7 so `vite build` produces a plain `dist/` again, and keep `cloudflare()` out of the config. In `wrangler.jsonc`, add `"directory": "./dist"` inside `"assets"`. Wrangler then bundles `worker/index.js` itself (its default Data rule already reads `**/*.bin`). Change `package.json` `"dev"` to `"wrangler dev --port 5173"`, and run `npm run build` once before the first `npm run dev`. Re-run this step, and record the fallback in the commit message.

- [ ] **Step 13: Confirm the custom Tailwind variant still reaches the CSS** (CLAUDE.md rule)

Run: `Select-String -Path dist\client\assets\*.css -Pattern 'pointer:\s*(fine|coarse)'`
Expected: at least one match. With the fallback, use `dist\assets\*.css`.

- [ ] **Step 14: Run the Worker locally and check every route's guard**

Run in terminal 1: `npm run dev`
Expected: Vite starts on `http://localhost:5173`, and the Cloudflare plugin logs that the Worker is running.

Run in terminal 2:

```powershell
curl.exe -s -o NUL -w "%{http_code}\n" http://localhost:5173/
curl.exe -s -o NUL -w "%{http_code}\n" http://localhost:5173/checklists/mine
curl.exe -s -w "\n%{http_code}\n" http://localhost:5173/api/export-report-pdf
curl.exe -s -w "\n%{http_code}\n" -X POST http://localhost:5173/api/nope
curl.exe -s -o tmp-pdf-diff\dev-report.pdf -w "%{http_code} %{content_type}\n" -X POST -H "Content-Type: application/json" -d "{}" http://localhost:5173/api/export-report-pdf
```

Expected, in order:
- `200`
- `200` (SPA deep link)
- `{"error":"Method not allowed"}` then `405`
- `{"error":"Not found"}` then `404`
- `200 application/pdf`. `tmp-pdf-diff\dev-report.pdf` opens as the house-style report. This works without a token because `.dev.vars` has `DEV_SKIP_AUTH=1` and the host is localhost.

- [ ] **Step 15: Parity through the real Worker runtime**

With `npm run dev` still running:

Run: `node scripts/parity-exports.mjs tmp-pdf-diff/parity-worker --url http://localhost:5173`
Then: `node scripts/parity-compare.mjs tmp-pdf-diff/parity-before tmp-pdf-diff/parity-worker`
Expected: six `ok … 100% match` lines, exit 0. **Any FAIL blocks this task.**

- [ ] **Step 16: Click-through in the browser**

In mock mode (`VITE_DATA_SOURCE=mock` in `.env.local`), open `http://localhost:5173`, sign in, open any submitted checklist, and press **Export PDF**. Then do the same for a work order and the NOC register.
Expected: each downloads and opens.

- [ ] **Step 17: Run every existing check plus the tests**

Run: `npm test`, `npm run verify:palette`, `npm run verify:content`, `npm run verify:signoffs`, `npm run verify:walkthrough`, `npm run verify:pdf`
Expected: all pass.

- [ ] **Step 18: Commit** (`.dev.vars`, `worker/formAssets.js` and `worker/generated/` must **not** appear in `git status`)

```powershell
git status
git add scripts/build-form-manifest.mjs worker/index.js wrangler.jsonc public/_headers vite.config.js package.json package-lock.json .gitignore
git commit -m "feat: serve app and /api from a Cloudflare Worker (vite plugin, form manifest, headers)"
```

---

### Task 7: CI runs tests and deploys to Cloudflare from `main`

**Files:**
- Modify: `.github/workflows/verify.yml`

- [ ] **Step 1: Replace `.github/workflows/verify.yml`** with the complete file:

```yaml
name: Verify

on:
  push:
    branches: [main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run verify:palette
      - run: npm run verify:content
      - run: npm run verify:signoffs
      - run: npm run verify:walkthrough
      - run: npm run verify:pdf
      - run: npm run build
        env:
          # Build must succeed without real secrets; mock is the default.
          VITE_DATA_SOURCE: mock

  deploy:
    # Only after every check above passes, and only from main.
    needs: verify
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    concurrency:
      group: deploy-production
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npm run build
        env:
          VITE_DATA_SOURCE: supabase
          VITE_SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ vars.VITE_SUPABASE_ANON_KEY }}
      - run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

- [ ] **Step 2: Lint the YAML**

Run: `npx --yes yaml-lint .github/workflows/verify.yml`
Expected: `✔ YAML Lint successful.`

- [ ] **Step 3: Commit**

```powershell
git add .github/workflows/verify.yml
git commit -m "ci: run unit tests and deploy to Cloudflare Workers from main"
```

---

### Task 8: Docs

**Files:**
- Modify: `CLAUDE.md`, `.env.example`

- [ ] **Step 1: Add a Hosting section to `CLAUDE.md`** directly after the `## Stack` section:

```markdown
## Hosting: one Cloudflare Worker

Production is the `bacc-portal` Worker on `bacc.visionforgestudio.app`
(`wrangler.jsonc`). Static assets serve the SPA; only `/api/*` runs Worker
code (`worker/index.js` → `worker/http.js` → pure `build*()` functions in
`api/`). `npm run dev` runs the same Worker through `@cloudflare/vite-plugin`.

Rules that are easy to break:

- **No `node:fs` in `api/` or `server/`.** Workers have no filesystem. Approved
  PDFs, field maps and schemas come from the form store (`api/_formStore.js`),
  built from the generated `worker/formAssets.js`. Add a form by dropping its
  files in `src/assets/forms`, `src/data/field-maps`, `src/data/checklists` —
  `predev`/`prebuild` regenerate the manifest.
- **No `Buffer`** in code the Worker runs — use `Uint8Array`/`atob`.
- **Secrets are Wrangler secrets** (`npx wrangler secret put …`), never `vars`
  or `VITE_*`. `SUPABASE_URL`/`SUPABASE_ANON_KEY` are public `vars`.
- **Workers Paid is required** (`limits.cpu_ms: 30000`) — PDF overlay exceeds
  the free plan's 10 ms CPU.
- Local mock-mode exports work because `.dev.vars` sets `DEV_SKIP_AUTH=1`,
  honoured only when the host is localhost/127.0.0.1.
- Any change to export code: `node scripts/parity-exports.mjs <dir>` before
  and after, then `node scripts/parity-compare.mjs <before> <after>` — zero
  visual difference is the bar.
```

- [ ] **Step 2: Fix the build-output path in `CLAUDE.md`'s "Verify custom Tailwind variants" section**

Replace `Select-String -Path dist/assets/*.css -Pattern 'pointer:\s*(fine|coarse)'` with `Select-String -Path dist/client/assets/*.css -Pattern 'pointer:\s*(fine|coarse)'`. If Task 6 used the fallback, leave it as `dist/assets`.

- [ ] **Step 3: Replace the last two comment lines of `.env.example`**

Replace:

```
# Use a staging/throwaway Supabase project for local and Vercel preview deploys.
# Preview must never write to production compliance records.
```

with:

```
# Use a staging/throwaway Supabase project for local development.
# The Worker reads SUPABASE_URL / SUPABASE_ANON_KEY from wrangler.jsonc vars;
# the service-role key is a Wrangler secret (npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY).
# Local-only Worker settings live in .dev.vars (gitignored), e.g. DEV_SKIP_AUTH=1.
```

- [ ] **Step 4: Commit**

```powershell
git add CLAUDE.md .env.example
git commit -m "docs: document Cloudflare Worker hosting rules"
```

---

### Task 9: Go-live and cutover (with the user)

These steps need the user's Cloudflare, GitHub and Vercel dashboards. The walkthrough document (`docs/CLOUDFLARE_GO_LIVE_WALKTHROUGH.md`) has the click-by-click version. Don't start until Tasks 0–8 are committed on the branch.

- [ ] **Step 1: Confirm the prerequisites with the user**
  - Cloudflare account has Workers **Paid**.
  - `visionforgestudio.app` is an active zone in that account.
  - The `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` GitHub **secrets**, and the `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` GitHub **variables**, exist.
  - The service-role secret is set: `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY`, run once by the user after `npx wrangler login`.
  - **Vercel Git auto-deploy is off.**

- [ ] **Step 2: Merge**

```powershell
git checkout main
git pull
git merge --no-ff feat/cloudflare-workers-hosting
git push
```

Expected: the GitHub Actions `verify` job passes, then `deploy` runs `wrangler deploy` and prints `https://bacc.visionforgestudio.app`.

- [ ] **Step 3: Live smoke test.** Every item must pass.

```powershell
curl.exe -s -o NUL -w "%{http_code}\n" https://bacc.visionforgestudio.app/
curl.exe -sI https://bacc.visionforgestudio.app/ | Select-String "content-security-policy|strict-transport-security"
curl.exe -s -w "\n%{http_code}\n" -X POST -H "Content-Type: application/json" -d "{}" https://bacc.visionforgestudio.app/api/export-report-pdf
curl.exe -s -D - -o NUL -X POST -H "Content-Type: application/json" -d "{}" https://bacc.visionforgestudio.app/api/export-report-pdf | Select-String "content-security-policy|strict-transport-security"
```

Expected:
- `200`
- Both headers present on `/`
- `{"error":"Missing Authorization bearer token"}` then `401`
- Both headers present on the `/api` response

Then do these in the browser:
1. Sign in with an existing Supabase account.
2. Export Annex D, VAES C-08, the NOC register, a work order and a report PDF. Each downloads and opens.
3. As admin: Settings → Users & roles → create a test user. It succeeds.
4. Sign in as an inspector and try the same. It's refused (403).
5. Refresh on a deep link, e.g. `/checklists/mine`. The SPA loads.
6. Install the PWA, switch to airplane mode, reopen it. The shell loads.
7. Cloudflare dashboard → Workers → bacc-portal → Observability: export requests show CPU time well under 30 s.

- [ ] **Step 4: Cut over**

```powershell
git rm vercel.json
git commit -m "chore: retire Vercel config after Cloudflare cutover"
git push
```

Keep the frozen Vercel deployment as the rollback until sub-project 4 goes live. Rollback means telling testers to use the Vercel URL again.
