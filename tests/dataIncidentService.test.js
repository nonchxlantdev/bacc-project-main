import test from 'node:test';
import assert from 'node:assert/strict';
import { createSqliteD1, insertTestUser } from './helpers/sqliteD1.js';
import { createD1DataStore } from '../worker/data/store.js';
import { createDataService } from '../worker/data/service.js';

const TEMPLATE = 'annex-d-drainage';
const forms = { templateKeys: new Set([TEMPLATE]), loadSchema: () => ({ title: 'Drainage Inspection' }) };
const SIG = 'data:image/png;base64,iVBORw0KGgo=';
let uid = 0;
const uuid = () => `00000000-0000-4000-9000-${String(++uid).padStart(12, '0')}`;

async function setup() {
  const db = createSqliteD1();
  const users = {
    insp: await insertTestUser(db, { id: 'insp', full_name: 'Ivy Inspector', role: 'inspector', department: 'Maintenance' }),
    other: await insertTestUser(db, { id: 'other', full_name: 'Otto Other', role: 'inspector' }),
    tech: await insertTestUser(db, { id: 'tech', full_name: 'Tia Tech', role: 'electrical_tech' }),
    om: await insertTestUser(db, { id: 'om', full_name: 'Olga OM', role: 'om' }),
    coo: await insertTestUser(db, { id: 'coo', full_name: 'Cora COO', role: 'coo' }),
    admin: await insertTestUser(db, { id: 'admin', full_name: 'Ada Admin', role: 'admin' }),
  };
  let clock = Date.parse('2026-10-12T18:00:00.000Z');
  let seq = 0;
  const svc = createDataService({
    store: createD1DataStore(db),
    forms,
    now: () => clock,
    newId: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
  });
  const call = (op, actor, args = {}) => svc[op](actor, args);
  const checklist = await call('checklists.persist', users.insp, {
    record: {
      id: uuid(),
      template_id: TEMPLATE,
      status: 'draft',
      header: { date: '2026-10-12' },
      items: { 'DR-01': { result: 'no_sat', remarks: 'Blocked' }, 'DR-02': { result: 'sat', remarks: '' } },
    },
  });
  return { db, users, svc, call, checklist, tick: (ms = 1000) => (clock += ms), setClock: (iso) => (clock = Date.parse(iso)) };
}

const status = async (p) => {
  try {
    await p;
    return 200;
  } catch (err) {
    if (!err.status) throw err;
    return err.status;
  }
};

const incidentRecord = (checklist, over = {}) => ({
  id: uuid(),
  incident_ref: 'INC-2026-TEMP-abcd1234',
  seq: 99,
  year: 1999,
  submission_id: checklist.id,
  source_template_code: 'PGIA-PMM-F04',
  source_item_code: 'DR-01',
  title: 'DR-01 blocked',
  description: 'Silt at the outfall',
  deficiency_level: 2,
  category: 'drainage',
  location_label: 'Outfall 3',
  status: 'open',
  reported_by: 'admin',
  attachments: [],
  ...over,
});

test('numbers are allocated by the server, per year, ignoring the browser', async () => {
  const { users, call, checklist, setClock } = await setup();
  const a = await call('incidents.persist', users.insp, { record: incidentRecord(checklist) });
  const b = await call('incidents.persist', users.insp, { record: incidentRecord(checklist) });
  assert.deepEqual([a.incident_ref, a.noc_no, a.seq, a.year], ['INC-2026-0001', '0001', 1, 2026]);
  assert.equal(b.incident_ref, 'INC-2026-0002');
  assert.equal(a.reported_by, 'insp');
  assert.equal(a.reported_by_name, 'Ivy Inspector');
  // Belize new year: 2027-01-01 00:30 local is 06:30 UTC.
  setClock('2027-01-01T06:30:00.000Z');
  const c = await call('incidents.persist', users.insp, { record: incidentRecord(checklist) });
  assert.equal(c.incident_ref, 'INC-2027-0001');
  // An edit never changes the number.
  const edited = await call('incidents.persist', users.insp, { record: { ...a, title: 'Renamed', incident_ref: 'INC-2026-9999', seq: 50 } });
  assert.equal(edited.incident_ref, 'INC-2026-0001');
  assert.equal(edited.title, 'Renamed');
});

test('concurrent creates never share a number', async () => {
  const { users, call, checklist } = await setup();
  const made = await Promise.all(
    Array.from({ length: 8 }, () => call('incidents.persist', users.insp, { record: incidentRecord(checklist) })),
  );
  const refs = made.map((i) => i.incident_ref).sort();
  assert.equal(new Set(refs).size, 8);
  assert.equal(refs.at(-1), 'INC-2026-0008');
});

test('visibility: reporter, assignee, OM, COO, admin only', async () => {
  const { users, call, checklist } = await setup();
  const inc = await call('incidents.persist', users.insp, { record: incidentRecord(checklist) });
  assert.equal((await call('incidents.list', users.insp)).length, 1);
  assert.equal((await call('incidents.list', users.other)).length, 0);
  assert.equal(await call('incidents.get', users.other, { id: inc.id }), null);
  for (const r of ['om', 'coo', 'admin']) assert.equal((await call('incidents.list', users[r])).length, 1, r);
  assert.equal(await status(call('incidents.persist', users.other, { record: { ...inc, title: 'hijack' } })), 404);
  assert.equal(await status(call('incidents.addUpdate', users.other, { incidentId: inc.id, body: 'hi' })), 404);
  // Assigning a person makes it theirs to see and work.
  await call('incidents.persist', users.om, { record: { ...inc, assigned_to: 'tech' } });
  assert.equal((await call('incidents.list', users.tech)).length, 1);
});

test('status gates run on the server; closed is final', async () => {
  const { users, call, checklist } = await setup();
  const inc = await call('incidents.persist', users.insp, { record: incidentRecord(checklist) });
  assert.equal(await status(call('incidents.persist', users.insp, { record: { ...inc, status: 'assigned' } })), 409);
  const assigned = await call('incidents.persist', users.insp, {
    record: { ...inc, status: 'assigned', assigned_unit: 'grounds', target_date: '2026-10-20' },
  });
  assert.ok(assigned.assigned_at);
  const resolved = await call('incidents.persist', users.insp, { record: { ...assigned, status: 'resolved' } });
  assert.ok(resolved.resolved_at);
  assert.equal(await status(call('incidents.persist', users.insp, { record: { ...resolved, status: 'closed' } })), 409);
  const verified = await call('incidents.persist', users.insp, {
    record: { ...resolved, verification: { result: 'sat', note: 'Cleared', verified_by: 'admin', verified_by_name: 'Not me' } },
  });
  assert.equal(verified.verification.verified_by, 'insp');
  assert.equal(verified.verification.verified_by_name, 'Ivy Inspector');
  const closed = await call('incidents.persist', users.insp, { record: { ...verified, status: 'closed' } });
  assert.ok(closed.closed_at);
  assert.equal(await status(call('incidents.persist', users.om, { record: { ...closed, title: 'later' } })), 409);
  // Updates may still be added to a closed incident's trail.
  assert.equal(await status(call('incidents.addUpdate', users.om, { incidentId: closed.id, body: 'Filed.' })), 200);
});

test('an unchanged verification keeps who verified it', async () => {
  const { users, call, checklist, tick } = await setup();
  const inc = await call('incidents.persist', users.insp, { record: incidentRecord(checklist) });
  const v1 = await call('incidents.persist', users.insp, { record: { ...inc, verification: { result: 'sat', note: 'ok' } } });
  tick(60_000);
  const v2 = await call('incidents.persist', users.om, { record: { ...v1, title: 'Edited by OM' } });
  assert.deepEqual(v2.verification, v1.verification);
  const withdrawn = await call('incidents.persist', users.om, { record: { ...v2, verification: null } });
  assert.equal(withdrawn.verification, null);
});

test('photos are refused; source checks; reporter is forced', async () => {
  const { users, call, checklist } = await setup();
  assert.equal(await status(call('incidents.persist', users.insp, { record: incidentRecord(checklist, { attachments: [{ photo_url: 'x' }] }) })), 400);
  assert.equal(await status(call('incidents.persist', users.insp, { record: incidentRecord(checklist, { source_item_code: 'NOPE' }) })), 400);
  assert.equal(await status(call('incidents.persist', users.insp, { record: incidentRecord(checklist, { submission_id: uuid() }) })), 400);
  assert.equal(await status(call('incidents.persist', users.insp, { record: incidentRecord(checklist, { status: 'closed' }) })), 400);
  assert.equal(await status(call('incidents.persist', users.insp, { record: incidentRecord(checklist, { assigned_to: 'ghost' }) })), 400);
});

test('updates: author is the session user; the trail is newest first', async () => {
  const { users, call, checklist, tick } = await setup();
  const inc = await call('incidents.persist', users.insp, { record: incidentRecord(checklist) });
  await call('incidents.addUpdate', users.insp, { incidentId: inc.id, body: 'first', author_id: 'om', author_name: 'Fake' });
  tick();
  const second = await call('incidents.addUpdate', users.om, { incidentId: inc.id, body: 'second', status_from: 'open', status_to: 'assigned' });
  assert.equal(second.author_id, 'om');
  assert.equal(second.author_name, 'Olga OM');
  const got = await call('incidents.get', users.insp, { id: inc.id });
  assert.deepEqual(got.updates.map((u) => [u.body, u.author_name]), [['second', 'Olga OM'], ['first', 'Ivy Inspector']]);
  assert.equal(await status(call('incidents.addUpdate', users.insp, { incidentId: inc.id, body: '   ' })), 400);
  assert.equal(await status(call('incidents.addUpdate', users.insp, { incidentId: inc.id, body: 'x', status_to: 'weird' })), 400);
});

const woRecord = (incident, over = {}) => ({
  id: uuid(),
  incident_id: incident.id,
  work_order_number: 'WO-2026-TEMP-123456',
  assigned_to_name: 'Grounds',
  deficiency_level: 2,
  description_of_work: 'Clear the outfall',
  status: 'issued',
  notam_required: false,
  cec_clearance_required: false,
  signoffs: [{ role: 'om_coo_verification', name: 'Forged', signature_data_uri: SIG }],
  ...over,
});

test('work orders: numbered, completed → approval → verified and locked', async () => {
  const { users, call, checklist } = await setup();
  const inc = await call('incidents.persist', users.insp, { record: incidentRecord(checklist) });
  const wo = await call('workOrders.persist', users.insp, { record: woRecord(inc) });
  assert.equal(wo.work_order_number, 'WO-2026-0001');
  assert.equal(wo.noc_reference_no, '0001');
  assert.equal(wo.issued_by, 'insp');
  assert.deepEqual(wo.signoffs, [], 'sign-offs are never written by a save');
  assert.equal(await status(call('workOrders.persist', users.insp, { record: { ...wo, status: 'verified' } })), 409);
  assert.equal(await status(call('workOrders.persist', users.other, { record: wo })), 404);

  const done = await call('workOrders.persist', users.insp, {
    record: { ...wo, status: 'completed', area_cleared_for_operations: true, description_of_work_performed: 'Cleared' },
  });
  assert.equal(done.status, 'completed');
  const inbox = await call('approvals.listInbox', users.coo);
  const approval = inbox.find((a) => a.entity_type === 'work_order');
  assert.equal(approval.approval_role, 'om_coo_verification');
  assert.equal(approval.entity.title, 'WO-2026-0001');
  assert.equal(approval.entity.incident_ref, 'INC-2026-0001');
  assert.equal((await call('notifications.listForUser', users.om))[0].event_type, 'work_order_awaiting_verification');
  assert.equal((await call('approvals.listInbox', users.insp)).length, 0);

  assert.equal(await status(call('approvals.decide', users.insp, { id: approval.id, decision: 'approved' })), 403);
  const decided = await call('approvals.decide', users.coo, { id: approval.id, decision: 'approved', signature_data_uri: SIG });
  assert.equal(decided.status, 'approved');
  const verified = await call('workOrders.get', users.insp, { id: wo.id });
  assert.equal(verified.status, 'verified');
  assert.equal(verified.locked, true);
  assert.deepEqual(verified.signoffs.map((s) => [s.role, s.signed_by]), [['om_coo_verification', 'coo']]);
  assert.equal(await status(call('workOrders.persist', users.om, { record: { ...verified, status: 'completed' } })), 409);
  assert.equal((await call('workOrders.listByIncident', users.insp, { incidentId: inc.id })).length, 1);
  assert.equal((await call('workOrders.listVisible', users.other)).length, 0);
});

test('work-order verification is blocked until the area is cleared', async () => {
  const { users, call, checklist } = await setup();
  const inc = await call('incidents.persist', users.insp, { record: incidentRecord(checklist) });
  const wo = await call('workOrders.persist', users.insp, { record: woRecord(inc) });
  await call('workOrders.persist', users.insp, { record: { ...wo, status: 'completed', area_cleared_for_operations: false } });
  const [approval] = (await call('approvals.listInbox', users.om)).filter((a) => a.entity_type === 'work_order');
  assert.equal(await status(call('approvals.decide', users.om, { id: approval.id, decision: 'approved' })), 409);
  const rejected = await call('approvals.decide', users.om, { id: approval.id, decision: 'rejected', notes: 'Area not cleared' });
  assert.equal(rejected.status, 'rejected');
});

test('CEC clearance is decided by admin and marks clearance issued', async () => {
  const { db, users, call, checklist } = await setup();
  const inc = await call('incidents.persist', users.insp, { record: incidentRecord(checklist) });
  const wo = await call('workOrders.persist', users.insp, { record: woRecord(inc, { cec_clearance_required: true }) });
  await db
    .prepare(
      `INSERT INTO approvals (id, entity_type, entity_id, approval_role, status, created_at)
       VALUES ('cec1', 'work_order', ?1, 'cec_clearance', 'pending', '2026-10-12T00:00:00Z')`,
    )
    .bind(wo.id)
    .run();
  assert.equal(await status(call('approvals.decide', users.om, { id: 'cec1', decision: 'approved' })), 403);
  assert.equal(await status(call('approvals.get', users.om, { id: 'cec1' })), 403);
  await call('approvals.decide', users.admin, { id: 'cec1', decision: 'approved' });
  const after = await call('workOrders.get', users.admin, { id: wo.id });
  assert.equal(after.cec_clearance_issued, true);
  assert.equal(after.locked, true);
});

test('deleting a draft takes its incidents, updates and work orders with it', async () => {
  const { db, users, call, checklist } = await setup();
  const inc = await call('incidents.persist', users.insp, { record: incidentRecord(checklist) });
  await call('incidents.addUpdate', users.insp, { incidentId: inc.id, body: 'note' });
  const wo = await call('workOrders.persist', users.insp, { record: woRecord(inc) });
  await call('workOrders.persist', users.insp, { record: { ...wo, status: 'completed', area_cleared_for_operations: true } });
  await call('checklists.deleteDraft', users.om, { id: checklist.id });
  for (const table of ['incidents', 'incident_updates', 'work_orders']) {
    assert.equal((await db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).first()).c, 0, table);
  }
  assert.equal((await db.prepare("SELECT COUNT(*) AS c FROM approvals WHERE entity_type = 'work_order'").first()).c, 0);
});

test('a draft with a closed incident cannot be deleted', async () => {
  const { users, call, checklist } = await setup();
  const inc = await call('incidents.persist', users.insp, {
    record: incidentRecord(checklist, {}),
  });
  const ready = await call('incidents.persist', users.insp, {
    record: { ...inc, status: 'resolved', assigned_unit: 'grounds', target_date: '2026-10-20', verification: { result: 'sat' } },
  });
  await call('incidents.persist', users.insp, { record: { ...ready, status: 'closed' } });
  assert.equal(await status(call('checklists.deleteDraft', users.om, { id: checklist.id })), 409);
});
