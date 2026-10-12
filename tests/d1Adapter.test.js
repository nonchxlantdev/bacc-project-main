import test from 'node:test';
import assert from 'node:assert/strict';
import { createD1Adapter, drawingsFingerprint } from '../src/data/repositories/d1/adapter.js';
import { callData } from '../src/data/repositories/d1/client.js';

const entry = {
  key: 'annex-d-drainage',
  code: 'PGIA-PMM-F04',
  version: 'ed01',
  title: 'Drainage',
  annexLabel: 'Annex D',
  family: 'PMM',
  group: 'Duty Manager',
  department: 'Maintenance',
  defaultFrequency: 'monthly',
  schema: { title: 'Drainage Inspection', sections: [] },
  fieldMap: { templateKey: 'annex-d-drainage', basePdf: 'annex-d.pdf' },
};
const registry = { entries: [entry], getEntry: (key) => (key === entry.key ? entry : null) };

function fakeCall(responses = {}) {
  const calls = [];
  const call = async (op, args = {}) => {
    calls.push({ op, args: structuredClone(args) });
    const r = responses[op];
    return typeof r === 'function' ? r(args) : r ?? null;
  };
  return { call, calls };
}

const drawing = (id, dataUri = 'data:image/jpeg;base64,AA') => ({ id, label: id, contentType: 'image/jpeg', dataUri, addedAt: 't' });

test('records are enriched from the registry and registry fields never go back', async () => {
  const stored = { id: 'r1', template_id: entry.key, status: 'draft', header: {}, items: {}, attachments: {} };
  const { call, calls } = fakeCall({ 'checklists.get': stored, 'checklists.persist': (a) => ({ ...a.record }) });
  const repos = createD1Adapter({ call, registry });
  const rec = await repos.checklists.get('r1');
  assert.equal(rec.template_code, 'PGIA-PMM-F04');
  assert.equal(rec.schema, entry.schema);
  assert.equal(rec.print_template_key, 'annex-d-drainage');
  await repos.checklists.persist(rec);
  const sent = calls.at(-1).args.record;
  assert.equal(sent.schema, undefined);
  assert.equal(sent.field_map, undefined);
});

test('drawings are only sent when they changed since the server last answered', async () => {
  const stored = { id: 'r1', template_id: entry.key, attachments: { site: [drawing('d1')] } };
  const { call, calls } = fakeCall({
    'checklists.get': stored,
    'checklists.persist': (a) => ({ ...stored, attachments: a.record.attachments ?? stored.attachments }),
  });
  const repos = createD1Adapter({ call, registry });
  const rec = await repos.checklists.get('r1');
  await repos.checklists.persist({ ...rec, header: { x: 1 }, attachments: { site: [drawing('d1')], empty: [] } });
  assert.equal(calls.at(-1).args.record.attachments, undefined);
  assert.equal(calls.at(-1).args.record.drawings_changed, undefined);
  await repos.checklists.persist({ ...rec, attachments: { site: [drawing('d1'), drawing('d2')] } });
  assert.equal(calls.at(-1).args.record.drawings_changed, true);
  assert.equal(calls.at(-1).args.record.attachments.site.length, 2);
  // The server's answer is now the baseline.
  await repos.checklists.persist({ ...rec, attachments: { site: [drawing('d1'), drawing('d2')] } });
  assert.equal(calls.at(-1).args.record.attachments, undefined);
});

test('a brand-new record sends its drawings', async () => {
  const { call, calls } = fakeCall({ 'checklists.persist': (a) => a.record });
  const repos = createD1Adapter({ call, registry });
  await repos.checklists.persist({ id: 'new', template_id: entry.key, attachments: {} });
  assert.equal(calls[0].args.record.drawings_changed, true);
});

test('fingerprint ignores section order and empty sections', () => {
  assert.equal(
    drawingsFingerprint({ b: [drawing('2')], a: [drawing('1')], c: [] }),
    drawingsFingerprint({ a: [drawing('1')], b: [drawing('2')] }),
  );
});

test('approvals get the form title and team from the registry', async () => {
  const { call } = fakeCall({
    'approvals.listInbox': [{ id: 'a1', entity: { template_id: entry.key, filed_by: 'Ivy', href: '/checklists/r1' } }],
  });
  const [row] = await createD1Adapter({ call, registry }).approvals.listInbox({ id: 'om' });
  assert.equal(row.entity.title, 'Drainage Inspection');
  assert.equal(row.entity.group, 'Duty Manager');
  assert.equal(row.entity.code, 'PGIA-PMM-F04');
});

test('templates come from the registry with D1 schedule rules attached', async () => {
  const { call } = fakeCall({ 'instances.rules': [{ id: 'r', template_id: entry.key, frequency: 'monthly' }] });
  const repos = createD1Adapter({ call, registry });
  const [tpl] = await repos.templates.list();
  assert.equal(tpl.id, 'annex-d-drainage');
  assert.equal(tpl.assignment_rules.length, 1);
  assert.equal((await repos.templates.get('PGIA-PMM-F04')).id, 'annex-d-drainage');
  assert.equal(await repos.templates.get('nope'), null);
});

test('incidents go through the API with the owning team added; server-owned fields stay home', async () => {
  const { call, calls } = fakeCall({
    'incidents.list': [{ id: 'i1', source_template_code: 'PGIA-PMM-F04' }],
    'incidents.persist': (a) => ({ ...a.record }),
    'incidents.addUpdate': (a) => ({ id: 'u1', body: a.body }),
  });
  const repos = createD1Adapter({ call, registry });
  const [inc] = await repos.incidents.list();
  assert.equal(inc.source_group, 'Duty Manager');
  await repos.incidents.persist({ ...inc, updates: [{ id: 'x' }], pending_sync: true });
  const sent = calls.at(-1).args.record;
  assert.equal(sent.updates, undefined);
  assert.equal(sent.source_group, undefined);
  assert.equal(sent.pending_sync, undefined);
  await repos.incidents.addUpdate(inc, { body: 'hi', author_id: 'someone-else', status_to: 'assigned' });
  assert.deepEqual(calls.at(-1), { op: 'incidents.addUpdate', args: { incidentId: 'i1', body: 'hi', status_from: null, status_to: 'assigned' } });
});

test('work-order approvals stay out of the inbox while the screens are off, and keep their own title', async () => {
  const { call } = fakeCall({
    'approvals.listInbox': [
      { id: 'a1', entity_type: 'checklist_submission', entity: { template_id: entry.key } },
      { id: 'a2', entity_type: 'work_order', entity: { title: 'WO-2026-0001' } },
    ],
    'approvals.get': { id: 'a2', entity_type: 'work_order', entity: { title: 'WO-2026-0001' } },
  });
  const repos = createD1Adapter({ call, registry });
  assert.deepEqual((await repos.approvals.listInbox()).map((r) => r.id), ['a1']);
  assert.equal((await repos.approvals.get('a2')).entity.title, 'WO-2026-0001');
});

test('settings audit is empty, not an error, for non-managers', async () => {
  const forbidden = Object.assign(new Error('nope'), { status: 403 });
  const repos = createD1Adapter({
    call: async () => {
      throw forbidden;
    },
    registry,
  });
  assert.deepEqual(await repos.settings.audit(), []);
});

test('reports run over the adapter lists', async () => {
  const { call } = fakeCall({
    'instances.list': [{ id: 'i', template_id: entry.key, status: 'pending' }],
    'approvals.list': [{ id: 'a', status: 'pending' }],
    'checklists.listAll': [],
    'users.list': [],
    'instances.rules': [],
    'incidents.list': [{ id: 'i1', status: 'open' }, { id: 'i2', status: 'closed' }],
    'workOrders.listVisible': [],
  });
  const kpis = await createD1Adapter({ call, registry }).reports.kpis();
  assert.equal(kpis.checklistsDue, 1);
  assert.equal(kpis.approvalsPending, 1);
  assert.equal(kpis.incidentsOpen, 1);
});

test('callData: GET with ?a= for reads, JSON POST for writes, errors carry status', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    if (url.includes('settings.save')) return new Response(JSON.stringify({ error: 'No', code: 'X' }), { status: 403 });
    return new Response(JSON.stringify({ data: { ok: true } }), { status: 200 });
  };
  assert.deepEqual(await callData('checklists.get', { id: 'r1' }, { fetchImpl }), { ok: true });
  assert.equal(seen[0].init.method, 'GET');
  assert.equal(seen[0].url, `/api/data/checklists.get?a=${encodeURIComponent('{"id":"r1"}')}`);
  await callData('checklists.listAll', {}, { fetchImpl });
  assert.equal(seen[1].url, '/api/data/checklists.listAll');
  await assert.rejects(callData('settings.save', { section: 's', value: 1 }, { fetchImpl }), (e) => e.status === 403 && e.code === 'X');
  assert.equal(seen[2].init.method, 'POST');
  assert.deepEqual(JSON.parse(seen[2].init.body), { args: { section: 's', value: 1 } });
});
