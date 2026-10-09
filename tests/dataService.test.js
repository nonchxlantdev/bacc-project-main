import test from 'node:test';
import assert from 'node:assert/strict';
import { createSqliteD1, insertTestUser } from './helpers/sqliteD1.js';
import { createD1DataStore } from '../worker/data/store.js';
import { createDataService } from '../worker/data/service.js';

const TEMPLATE = 'annex-d-drainage';
const forms = {
  templateKeys: new Set([TEMPLATE]),
  loadSchema: (key) => (key === TEMPLATE ? { title: 'Drainage Inspection' } : null),
};
const SIG = 'data:image/png;base64,iVBORw0KGgo=';
const IMG = (n = 10) => `data:image/jpeg;base64,${'A'.repeat(n)}`;

async function setup({ start = Date.parse('2026-10-09T18:00:00.000Z') } = {}) {
  const db = createSqliteD1();
  const users = {
    insp: await insertTestUser(db, { id: 'insp', full_name: 'Ivy Inspector', role: 'inspector', department: 'Maintenance' }),
    other: await insertTestUser(db, { id: 'other', full_name: 'Otto Other', role: 'inspector', department: 'Operations' }),
    om: await insertTestUser(db, { id: 'om', full_name: 'Olga OM', role: 'om', department: 'Operations' }),
    coo: await insertTestUser(db, { id: 'coo', full_name: 'Cora COO', role: 'coo' }),
    admin: await insertTestUser(db, { id: 'admin', full_name: 'Ada Admin', role: 'admin' }),
  };
  let clock = start;
  let seq = 0;
  const svc = createDataService({
    store: createD1DataStore(db),
    forms,
    now: () => clock,
    newId: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
  });
  const call = (op, actor, args = {}) => svc[op](actor, args);
  return { db, users, svc, call, tick: (ms = 1000) => (clock += ms) };
}

const draftRecord = (over = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  template_id: TEMPLATE,
  template_version: 'ed01',
  status: 'draft',
  header: { date: '2026-10-09', inspectionType: 'monthly_routine', conductedBy: 'Ivy' },
  items: {
    A1: { result: 'sat', remarks: '', photo_url: null, photo_local_id: null },
    A2: { result: 'no_sat', remarks: 'Blocked drain', photo_url: null, photo_local_id: null },
  },
  signoffs: [],
  summary: { note: 'kept in form_json' },
  schema: { title: 'never stored' },
  ...over,
});

const status = async (p) => {
  try {
    await p;
    return 200;
  } catch (err) {
    if (!err.status) throw err;
    return err.status;
  }
};

test('draft → submit → acknowledge: lock, approval, instance link, notifications', async () => {
  const { db, users, call, tick } = await setup();
  await db
    .prepare(
      `INSERT INTO assignment_rules (id, template_id, frequency, role, department, created_at, updated_at)
       VALUES ('rule1', ?1, 'monthly', 'inspector', 'Maintenance', 'x', 'x')`,
    )
    .bind(TEMPLATE)
    .run();
  assert.deepEqual(await call('instances.generate', users.om), { created: 5, total: 5 });

  const saved = await call('checklists.persist', users.insp, { record: draftRecord() });
  assert.equal(saved.status, 'draft');
  assert.equal(saved.inspector_name, 'Ivy Inspector');
  assert.deepEqual(saved.summary, { note: 'kept in form_json' });
  assert.equal(saved.schema, undefined);

  tick();
  const submitted = await call('checklists.persist', users.insp, {
    record: {
      ...saved,
      status: 'submitted',
      locked: true,
      signoffs: [{ role: 'inspector', name: 'Ivy Inspector', signature_data_uri: SIG }],
    },
  });
  assert.equal(submitted.status, 'submitted');
  assert.equal(submitted.locked, true);
  assert.ok(submitted.submitted_at);

  const inbox = await call('approvals.listInbox', users.om);
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].assigned_to, 'om');
  assert.equal(inbox[0].entity.filed_by, 'Ivy Inspector');
  assert.equal(inbox[0].entity.href, `/checklists/${saved.id}`);
  assert.equal(await call('notifications.unreadCount', users.om), 1);

  const october = (await call('instances.list', users.om)).find((i) => i.period_start === '2026-10-01');
  assert.equal(october.submission_id, saved.id);
  assert.equal(october.status, 'submitted');

  // Locked: an inspector edit now answers 409.
  assert.equal(await status(call('checklists.persist', users.insp, { record: { ...saved } })), 409);

  tick();
  const ack = await call('checklists.acknowledge', users.om, { id: saved.id, signature_data_uri: SIG });
  assert.equal(ack.status, 'acknowledged');
  const om = ack.signoffs.find((s) => s.role === 'om_acknowledgment');
  assert.equal(om.signed_by, 'om');
  assert.equal(om.name, 'Olga OM');
  assert.equal((await call('approvals.listInbox', users.om)).length, 0);
  const notes = await call('notifications.listForUser', users.insp);
  assert.equal(notes[0].event_type, 'checklist_acknowledged');
  assert.equal(await status(call('checklists.acknowledge', users.om, { id: saved.id })), 409);
});

test('sign-offs are always attributed to the session user', async () => {
  const { users, call } = await setup();
  const saved = await call('checklists.persist', users.insp, {
    record: draftRecord({ signoffs: [{ role: 'inspector', name: 'Ivy', signature_data_uri: SIG, signed_by: 'admin' }] }),
  });
  assert.equal(saved.signoffs[0].signed_by, 'insp');
  // An OM edits the draft without touching that block: attribution stays.
  const byOm = await call('checklists.persist', users.om, {
    record: {
      ...saved,
      signoffs: [...saved.signoffs, { role: 'supervisor', name: 'Olga', signature_data_uri: SIG }],
    },
  });
  const roles = Object.fromEntries(byOm.signoffs.map((s) => [s.role, s.signed_by]));
  assert.deepEqual(roles, { inspector: 'insp', supervisor: 'om' });
});

test('inspector cannot sign om_acknowledgment by any route', async () => {
  const { users, call } = await setup();
  const saved = await call('checklists.persist', users.insp, {
    record: draftRecord({ signoffs: [{ role: 'om_acknowledgment', name: 'Fake OM', signature_data_uri: SIG }] }),
  });
  assert.equal(saved.signoffs.length, 0);
  await call('checklists.persist', users.insp, { record: { ...saved, status: 'submitted' } });
  assert.equal(await status(call('checklists.acknowledge', users.insp, { id: saved.id })), 403);
  assert.equal(await status(call('checklists.acknowledge', users.coo, { id: saved.id })), 403);
  const [approval] = await call('approvals.listInbox', users.coo);
  assert.equal(await status(call('approvals.decide', users.coo, { id: approval.id, decision: 'approved' })), 403);
  const rejected = await call('approvals.decide', users.coo, { id: approval.id, decision: 'rejected', notes: 'no' });
  assert.equal(rejected.status, 'rejected');
  assert.equal((await call('checklists.get', users.insp, { id: saved.id })).status, 'submitted');
});

test('approvals.decide approved acknowledges the checklist', async () => {
  const { users, call } = await setup();
  const saved = await call('checklists.persist', users.insp, { record: draftRecord({ status: 'submitted' }) });
  const [approval] = await call('approvals.listInbox', users.admin);
  const decided = await call('approvals.decide', users.admin, {
    id: approval.id,
    decision: 'approved',
    signature_data_uri: SIG,
  });
  assert.equal(decided.status, 'approved');
  assert.equal(decided.decided_by, 'admin');
  assert.equal(decided.signed, true);
  assert.equal((await call('checklists.get', users.insp, { id: saved.id })).status, 'acknowledged');
});

test('only owner or managers edit a draft; only the owner submits', async () => {
  const { users, call } = await setup();
  const saved = await call('checklists.persist', users.insp, { record: draftRecord() });
  assert.equal(await status(call('checklists.persist', users.other, { record: saved })), 403);
  assert.equal(await status(call('checklists.persist', users.coo, { record: saved })), 403);
  assert.equal(await status(call('checklists.persist', users.om, { record: saved })), 200);
  assert.equal(await status(call('checklists.persist', users.om, { record: { ...saved, status: 'submitted' } })), 403);
  // A new draft always belongs to the caller, whatever inspector_id says.
  const mine = await call('checklists.persist', users.other, {
    record: draftRecord({ id: '22222222-2222-4222-8222-222222222222', inspector_id: 'insp' }),
  });
  assert.equal(mine.inspector_id, 'other');
});

test('unknown form and photo data are rejected', async () => {
  const { users, call } = await setup();
  assert.equal(await status(call('checklists.persist', users.insp, { record: draftRecord({ template_id: 'nope' }) })), 400);
  const withPhoto = draftRecord();
  withPhoto.items.A1.photo_local_id = 'local-1';
  await assert.rejects(call('checklists.persist', users.insp, { record: withPhoto }), /Photo uploads are disabled/);
});

test('inspector cannot delete drafts (403); the OM can; filed records stay', async () => {
  const { users, call } = await setup();
  const saved = await call('checklists.persist', users.insp, { record: draftRecord() });
  assert.equal(await status(call('checklists.deleteDraft', users.insp, { id: saved.id })), 403);
  assert.deepEqual(await call('checklists.deleteDraft', users.om, { id: saved.id }), { deleted: saved.id });
  assert.equal(await call('checklists.get', users.om, { id: saved.id }), null);
  const filed = await call('checklists.persist', users.insp, { record: draftRecord({ status: 'submitted' }) });
  assert.equal(await status(call('checklists.deleteDraft', users.om, { id: filed.id })), 409);
});

test('a correction is a new record; the original is untouched', async () => {
  const { users, call } = await setup();
  const original = await call('checklists.persist', users.insp, {
    record: draftRecord({ status: 'submitted', signoffs: [{ role: 'inspector', name: 'Ivy', signature_data_uri: SIG }] }),
  });
  await call('checklists.acknowledge', users.om, { id: original.id });
  const before = await call('checklists.get', users.insp, { id: original.id });
  // Exactly what createCorrection() sends: a deep copy with a new id.
  const correction = {
    ...structuredClone(before),
    id: '33333333-3333-4333-8333-333333333333',
    status: 'draft',
    locked: false,
    submitted_at: null,
    supersedes_id: original.id,
  };
  correction.items.A2.result = 'sat';
  const saved = await call('checklists.persist', users.insp, { record: correction });
  assert.equal(saved.supersedes_id, original.id);
  assert.equal(saved.signoffs.some((s) => s.role === 'om_acknowledgment'), false);
  const after = await call('checklists.get', users.insp, { id: original.id });
  assert.deepEqual(after, before);
});

test('amend changes one item, writes an audit row, and can be undone', async () => {
  const { db, users, call, tick } = await setup();
  const filed = await call('checklists.persist', users.insp, { record: draftRecord({ status: 'submitted' }) });
  assert.equal(await status(call('checklists.amendItemResult', users.insp, { id: filed.id, code: 'A2', result: 'sat', reason: 'r' })), 403);
  const amendment = { item_code: 'A2', from: 'no_sat', to: 'sat', reason: 'incident_verified_sat' };
  const amended = await call('checklists.amendItemResult', users.coo, { id: filed.id, code: 'A2', result: 'sat', amendment });
  assert.equal(amended.items.A2.result, 'sat');
  assert.equal(amended.items.A1.result, 'sat');
  assert.equal(amended.items.A2.remarks, 'Blocked drain');
  assert.deepEqual(amended.amendments, [amendment]);
  assert.equal(amended.reopened_by, 'coo');
  assert.deepEqual(amended.header, filed.header);
  const audit = await db.prepare("SELECT COUNT(*) AS c FROM audit_log WHERE action = 'amend_item'").first();
  assert.equal(audit.c, 1);
  tick();
  const undone = await call('checklists.amendItemResult', users.om, {
    id: filed.id,
    code: 'A2',
    result: 'no_sat',
    amendment: null,
    reason: 'incident_verified_sat',
  });
  assert.equal(undone.items.A2.result, 'no_sat');
  assert.deepEqual(undone.amendments, []);
  // Amend never applies to a draft.
  const draft = await call('checklists.persist', users.insp, { record: draftRecord({ id: '44444444-4444-4444-8444-444444444444' }) });
  assert.equal(await status(call('checklists.amendItemResult', users.om, { id: draft.id, code: 'A1', result: 'na', reason: 'r' })), 409);
});

test('drawings: kept unless changed, capped at 6, size-checked, never listed', async () => {
  const { users, call } = await setup();
  const d = (i) => ({ id: `d${i}`, label: `Plan ${i}`, contentType: 'image/jpeg', dataUri: IMG(), addedAt: 'x' });
  const saved = await call('checklists.persist', users.insp, {
    record: draftRecord({ attachments: { site: [d(1), d(2)] } }),
  });
  assert.deepEqual(saved.attachments.site.map((x) => x.id), ['d1', 'd2']);
  // Not flagged as changed: stored drawings stay even though none were sent.
  const kept = await call('checklists.persist', users.insp, { record: { ...saved, attachments: { site: [] } } });
  assert.equal(kept.attachments.site.length, 2);
  const changed = await call('checklists.persist', users.insp, {
    record: { ...saved, attachments: { site: [d(1)], phasing: [d(3)] }, drawings_changed: true },
  });
  assert.deepEqual(Object.keys(changed.attachments).sort(), ['phasing', 'site']);
  const seven = { a: [d(1), d(2), d(3), d(4)], b: [d(5), d(6), d(7)] };
  assert.equal(await status(call('checklists.persist', users.insp, { record: { ...saved, attachments: seven, drawings_changed: true } })), 400);
  const huge = { a: [{ ...d(1), dataUri: IMG(820_000) }] };
  assert.equal(await status(call('checklists.persist', users.insp, { record: { ...saved, attachments: huge, drawings_changed: true } })), 400);
  // Lists never carry drawing data.
  const [listed] = await call('checklists.listMine', users.insp);
  assert.equal(listed.attachments, undefined);
});

test('instance generation is idempotent and scoped on list', async () => {
  const { db, users, call } = await setup();
  await db
    .prepare(
      `INSERT INTO assignment_rules (id, template_id, frequency, role, department, created_at, updated_at)
       VALUES ('r1', ?1, 'weekly', 'inspector', 'Maintenance', 'x', 'x'),
              ('r2', ?1, 'on_demand', 'inspector', 'Maintenance', 'x', 'x')`,
    )
    .bind(TEMPLATE)
    .run();
  assert.equal(await status(call('instances.generate', users.insp)), 403);
  const first = await call('instances.generate', users.coo);
  assert.ok(first.created > 0);
  const again = await call('instances.generate', users.coo);
  assert.deepEqual(again, { created: 0, total: first.total });
  assert.equal((await call('instances.list', users.insp)).length, first.total);
  assert.equal((await call('instances.list', users.other)).length, 0);
  assert.equal((await call('instances.list', users.coo)).length, first.total);
});

test('notifications are scoped to their recipient whatever the browser sends', async () => {
  const { users, call } = await setup();
  await call('checklists.persist', users.insp, { record: draftRecord({ status: 'submitted' }) });
  const [note] = await call('notifications.listForUser', users.om, { userId: 'insp' });
  assert.equal(note.recipient_id, 'om');
  assert.equal((await call('notifications.listForUser', users.insp, { userId: 'om' })).length, 0);
  await call('notifications.markRead', users.insp, { id: note.id });
  assert.equal(await call('notifications.unreadCount', users.om), 1);
  await call('notifications.markAllRead', users.om, { userId: 'insp' });
  assert.equal(await call('notifications.unreadCount', users.om), 0);
});

test('settings: managers save and reset with an audit trail; others read', async () => {
  const { users, call, tick } = await setup();
  assert.deepEqual(await call('settings.get', users.insp), {});
  assert.equal(await status(call('settings.save', users.coo, { section: 'alerts', value: {} })), 403);
  await call('settings.save', users.om, { section: 'alerts', value: { a: 1 } });
  tick();
  assert.deepEqual(await call('settings.save', users.admin, { section: 'alerts', value: { a: 2 } }), { alerts: { a: 2 } });
  tick();
  assert.deepEqual(await call('settings.resetSection', users.om, { section: 'alerts' }), {});
  const audit = await call('settings.audit', users.om);
  assert.deepEqual(
    audit.map((a) => [a.action, a.from, a.to, a.by_name]),
    [
      ['reset', { a: 2 }, null, 'Olga OM'],
      ['save', { a: 1 }, { a: 2 }, 'Ada Admin'],
      ['save', null, { a: 1 }, 'Olga OM'],
    ],
  );
  assert.equal(await status(call('settings.audit', users.insp)), 403);
});

test('users: public fields, signature visibility, self-only update', async () => {
  const { users, call } = await setup();
  const updated = await call('users.update', users.insp, {
    id: 'insp',
    patch: { full_name: 'Ivy I.', stored_signature_data_uri: SIG, has_ever_signed: true },
  });
  assert.equal(updated.full_name, 'Ivy I.');
  assert.equal(updated.stored_signature_data_uri, SIG);
  assert.ok(updated.stored_signature_updated_at);
  assert.equal(updated.has_ever_signed, true);
  assert.equal(updated.password_hash, undefined);
  assert.equal(await status(call('users.update', users.insp, { id: 'om', patch: { full_name: 'x' } })), 403);
  assert.equal(await status(call('users.update', users.insp, { id: 'insp', patch: { role: 'admin' } })), 403);

  assert.equal((await call('users.getById', users.other, { id: 'insp' })).stored_signature_data_uri, undefined);
  assert.equal((await call('users.getById', users.coo, { id: 'insp' })).stored_signature_data_uri, SIG);
  const list = await call('users.list', users.other);
  assert.equal(list.length, 5);
  assert.ok(list.every((u) => u.password_hash === undefined && u.stored_signature_data_uri === undefined));
  assert.equal((await call('users.getByEmail', users.other, { email: 'nobody@x' })), null);
});
