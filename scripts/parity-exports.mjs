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
