import test from 'node:test';
import assert from 'node:assert/strict';
import { createSqliteD1, insertTestUser } from './helpers/sqliteD1.js';
import { createD1DataStore } from '../worker/data/store.js';
import { createDataService } from '../worker/data/service.js';

const TEMPLATE = 'annex-d-drainage';
const forms = { templateKeys: new Set([TEMPLATE]), loadSchema: () => ({ title: 'Drainage Inspection', code: 'PGIA-PMM-F04' }) };
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
  const second = await call('incidents.addUpdate', users.om, { incidentId: inc.id, body: 'second', status_to: 'open' });
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

// ── Independent review fixes (2026-10-12) ─────────────────────────────────

async function filedChecklist(call, actor, over = {}) {
  return call('checklists.persist', actor, {
    record: {
      id: uuid(),
      template_id: TEMPLATE,
      status: 'submitted',
      header: { date: '2026-10-12' },
      items: { 'DR-01': { result: 'no_sat', remarks: 'Blocked' }, 'DR-02': { result: 'sat', remarks: '' } },
      ...over,
    },
  });
}

test('a re-inspection link must really be a SAT re-inspection of that item', async () => {
  const { users, call, checklist } = await setup();
  const inc = await call('incidents.persist', users.insp, { record: incidentRecord(checklist) });
  const ready = { ...inc, status: 'resolved', assigned_unit: 'grounds', target_date: '2026-10-20' };
  // A draft, and a filed checklist where DR-01 is still NO SAT, do not qualify.
  const unrelated = await filedChecklist(call, users.other);
  for (const link of [checklist.id, unrelated.id]) {
    assert.equal(await status(call('incidents.persist', users.insp, { record: { ...ready, reinspection_submission_id: link } })), 400, link);
  }
  const reinspection = await filedChecklist(call, users.other, { items: { 'DR-01': { result: 'sat', remarks: '' } } });
  const linked = await call('incidents.persist', users.insp, { record: { ...ready, reinspection_submission_id: reinspection.id } });
  assert.equal((await call('incidents.persist', users.insp, { record: { ...linked, status: 'closed' } })).status, 'closed');
});

test('CEC clearance: its approval is created, it records clearance without locking, then OM/COO verify locks', async () => {
  const { users, call, checklist } = await setup();
  const inc = await call('incidents.persist', users.insp, { record: incidentRecord(checklist) });
  const wo = await call('workOrders.persist', users.insp, { record: woRecord(inc, { cec_clearance_required: true }) });
  await call('workOrders.persist', users.insp, { record: { ...wo, status: 'completed', area_cleared_for_operations: true } });
  const inbox = (await call('approvals.listInbox', users.admin)).filter((a) => a.entity_type === 'work_order');
  const cec = inbox.find((a) => a.approval_role === 'cec_clearance');
  const omcoo = inbox.find((a) => a.approval_role === 'om_coo_verification');
  assert.ok(cec && omcoo);
  assert.equal(await status(call('approvals.decide', users.om, { id: omcoo.id, decision: 'approved' })), 409, 'blocked until CEC clears');
  await call('approvals.decide', users.admin, { id: cec.id, decision: 'approved', signature_data_uri: SIG });
  const cleared = await call('workOrders.get', users.admin, { id: wo.id });
  assert.equal(cleared.cec_clearance_issued, true);
  assert.equal(cleared.locked, false, 'CEC clearance alone does not verify');
  await call('approvals.decide', users.om, { id: omcoo.id, decision: 'approved', signature_data_uri: SIG });
  const done = await call('workOrders.get', users.admin, { id: wo.id });
  assert.equal(done.locked, true);
  assert.deepEqual(done.signoffs.map((s) => s.role).sort(), ['cec_clearance', 'om_coo_verification']);
});

test('work-order numbers use the server year; dates must be real; date issued is fixed', async () => {
  const { users, call, checklist } = await setup();
  const inc = await call('incidents.persist', users.insp, { record: incidentRecord(checklist) });
  assert.equal(await status(call('workOrders.persist', users.insp, { record: woRecord(inc, { date_issued: '1999-02-30' }) })), 400);
  const wo = await call('workOrders.persist', users.insp, { record: woRecord(inc, { date_issued: '1999-02-01' }) });
  assert.equal(wo.work_order_number, 'WO-2026-0001');
  const edited = await call('workOrders.persist', users.insp, { record: { ...wo, date_issued: '2001-01-01' } });
  assert.equal(edited.date_issued, wo.date_issued);
});

test('numbers are never reused, even after a draft and its incidents are deleted', async () => {
  const { users, call, checklist } = await setup();
  await call('incidents.persist', users.insp, { record: incidentRecord(checklist) });
  const second = await call('incidents.persist', users.insp, { record: incidentRecord(checklist) });
  assert.equal(second.incident_ref, 'INC-2026-0002');
  await call('checklists.deleteDraft', users.om, { id: checklist.id });
  const other = await call('checklists.persist', users.insp, {
    record: { id: uuid(), template_id: TEMPLATE, status: 'draft', header: {}, items: { 'DR-01': { result: 'no_sat', remarks: 'x' } } },
  });
  const third = await call('incidents.persist', users.insp, { record: incidentRecord(other) });
  assert.equal(third.incident_ref, 'INC-2026-0003');
});

test("incidents can only be raised from a checklist you filed (or as a supervisor)", async () => {
  const { users, call, checklist } = await setup();
  assert.equal(await status(call('incidents.persist', users.other, { record: incidentRecord(checklist) })), 403);
  assert.equal(await status(call('incidents.persist', users.om, { record: incidentRecord(checklist) })), 200);
});

test('a draft still deletes cleanly when it is linked somewhere, and its notifications go too', async () => {
  const { db, users, call, checklist } = await setup();
  const inc = await call('incidents.persist', users.insp, { record: incidentRecord(checklist) });
  const wo = await call('workOrders.persist', users.insp, { record: woRecord(inc) });
  await call('workOrders.persist', users.insp, { record: { ...wo, status: 'completed', area_cleared_for_operations: true } });
  await call('checklists.deleteDraft', users.om, { id: checklist.id });
  const left = await db.prepare("SELECT COUNT(*) AS c FROM notifications WHERE entity_type = 'work_order'").first();
  assert.equal(left.c, 0);
});

test('clearing the assigned unit clears it', async () => {
  const { users, call, checklist } = await setup();
  const inc = await call('incidents.persist', users.insp, { record: incidentRecord(checklist, { assigned_unit: 'grounds' }) });
  assert.equal(inc.assigned_unit, 'grounds');
  const cleared = await call('incidents.persist', users.insp, { record: { ...inc, assigned_unit: null, assigned_at: null } });
  assert.equal(cleared.assigned_unit, null);
  assert.equal(cleared.assigned_at, null);
});

test('approvals.list hides work-order approvals from people who cannot see them', async () => {
  const { users, call, checklist } = await setup();
  const inc = await call('incidents.persist', users.insp, { record: incidentRecord(checklist) });
  const wo = await call('workOrders.persist', users.insp, { record: woRecord(inc) });
  await call('workOrders.persist', users.insp, { record: { ...wo, status: 'completed', area_cleared_for_operations: true } });
  assert.equal((await call('approvals.list', users.other)).filter((a) => a.entity_type === 'work_order').length, 0);
  assert.equal((await call('approvals.list', users.om)).filter((a) => a.entity_type === 'work_order').length, 1);
});

test('reopening a completed work order withdraws its approval; only a completed one can be verified', async () => {
  const { users, call, checklist } = await setup();
  const inc = await call('incidents.persist', users.insp, { record: incidentRecord(checklist) });
  const wo = await call('workOrders.persist', users.insp, { record: woRecord(inc) });
  const done = await call('workOrders.persist', users.insp, { record: { ...wo, status: 'completed', area_cleared_for_operations: true } });
  const [approval] = (await call('approvals.listInbox', users.om)).filter((a) => a.entity_type === 'work_order');
  await call('workOrders.persist', users.insp, { record: { ...done, status: 'in_progress' } });
  assert.equal((await call('approvals.listInbox', users.om)).filter((a) => a.entity_type === 'work_order').length, 0);
  assert.ok([404, 409].includes(await status(call('approvals.decide', users.om, { id: approval.id, decision: 'approved' }))));
  assert.equal((await call('workOrders.get', users.om, { id: wo.id })).locked, false);
});

test('verifying an incident updates the filed checklist on the server, for the reporter too', async () => {
  const { users, call } = await setup();
  const filed = await filedChecklist(call, users.insp);
  const inc = await call('incidents.persist', users.insp, { record: incidentRecord(filed) });
  const verified = await call('incidents.persist', users.insp, { record: { ...inc, verification: { result: 'sat', note: 'Cleared' } } });
  let sub = await call('checklists.get', users.insp, { id: filed.id });
  assert.equal(sub.items['DR-01'].result, 'sat');
  assert.equal(sub.amendments[0].reason, 'incident_verified_sat');
  assert.equal(sub.amendments[0].from, 'no_sat');
  assert.equal(sub.amendments[0].incident_ref, verified.incident_ref);
  // Re-saving with the same verification changes nothing; withdrawing puts NO SAT back.
  await call('incidents.persist', users.insp, { record: { ...verified, title: 'Same verification' } });
  sub = await call('checklists.get', users.insp, { id: filed.id });
  assert.equal(sub.amendments.length, 1);
  await call('incidents.persist', users.insp, { record: { ...verified, verification: null } });
  sub = await call('checklists.get', users.insp, { id: filed.id });
  assert.equal(sub.items['DR-01'].result, 'no_sat');
  assert.deepEqual(sub.amendments, []);
});

test('update history cannot claim a status the incident is not in', async () => {
  const { users, call, checklist } = await setup();
  const inc = await call('incidents.persist', users.insp, { record: incidentRecord(checklist) });
  assert.equal(await status(call('incidents.addUpdate', users.insp, { incidentId: inc.id, body: 'Closed!', status_from: 'open', status_to: 'closed' })), 400);
  assert.equal(await status(call('incidents.addUpdate', users.insp, { incidentId: inc.id, body: 'Note' })), 200);
});
