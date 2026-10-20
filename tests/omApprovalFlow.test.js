import test from 'node:test';
import assert from 'node:assert/strict';
import { createSqliteD1, insertTestUser } from './helpers/sqliteD1.js';
import { createD1DataStore } from '../worker/data/store.js';
import { createDataService } from '../worker/data/service.js';
import { signatureImages, signoffFieldKeys } from '../src/lib/signoffFields.js';

const TEMPLATE = 'appendix-c08-wind-cone';
const forms = {
  templateKeys: new Set([TEMPLATE]),
  loadSchema: (key) => (key === TEMPLATE ? { title: 'Wind Cone', code: 'PGIA-CL-VAES-08' } : null),
};
const SIG = 'data:image/png;base64,iVBORw0KGgo=';
const ID = '44444444-4444-4444-8444-444444444444';

async function setup() {
  const db = createSqliteD1();
  const users = {
    insp: await insertTestUser(db, { id: 'insp', full_name: 'Ivy Inspector', role: 'inspector' }),
    other: await insertTestUser(db, { id: 'other', full_name: 'Otto Other', role: 'inspector' }),
    om: await insertTestUser(db, { id: 'om', full_name: 'Kegan OM', role: 'om' }),
  };
  let clock = Date.parse('2026-10-14T18:00:00.000Z');
  let seq = 0;
  const svc = createDataService({
    store: createD1DataStore(db),
    forms,
    now: () => (clock += 1000),
    newId: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
  });
  const call = (op, actor, args = {}) => svc[op](actor, args);
  return { db, users, call };
}

const record = (over = {}) => ({
  id: ID,
  template_id: TEMPLATE,
  status: 'draft',
  header: { date: '2026-10-14' },
  items: { W1: { result: 'sat', remarks: '' } },
  signoffs: [{ role: 'responsible', name: 'Ivy', signature_data_uri: SIG }],
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

test('drafts are private to their author and the OM', async () => {
  const { users, call } = await setup();
  await call('checklists.persist', users.insp, { record: record() });
  assert.equal(await call('checklists.get', users.other, { id: ID }), null);
  assert.equal((await call('checklists.listAll', users.other)).length, 0);
  assert.equal((await call('checklists.get', users.om, { id: ID })).id, ID);
  assert.equal((await call('checklists.listAll', users.om)).length, 1);
  await call('checklists.persist', users.insp, { record: record({ status: 'submitted' }) });
  assert.equal((await call('checklists.get', users.other, { id: ID })).status, 'submitted');
});

test("an inspector cannot fill the OM's box (Supervisor on the lighting forms)", async () => {
  const { users, call } = await setup();
  const saved = await call('checklists.persist', users.insp, {
    record: record({
      signoffs: [
        { role: 'responsible', name: 'Ivy', signature_data_uri: SIG },
        { role: 'supervisor', name: 'Not the OM', signature_data_uri: SIG },
      ],
    }),
  });
  assert.deepEqual(saved.signoffs.map((s) => s.role), ['responsible']);
});

test('return for changes: back to a draft with the note, resubmit, then approve', async () => {
  const { db, users, call } = await setup();
  await call('checklists.persist', users.insp, { record: record({ status: 'submitted' }) });
  let [approval] = await call('approvals.listInbox', users.om);
  assert.equal(await status(call('approvals.decide', users.om, { id: approval.id, decision: 'rejected' })), 400);
  await call('approvals.decide', users.om, { id: approval.id, decision: 'rejected', notes: 'Remarks missing on W1' });

  const back = await call('checklists.get', users.insp, { id: ID });
  assert.equal(back.status, 'draft');
  assert.equal(back.locked, false);
  assert.equal(back.returned.note, 'Remarks missing on W1');
  assert.equal(back.returned.by_name, 'Kegan OM');
  const note = await db.prepare(`SELECT * FROM notifications WHERE recipient_id = 'insp' AND event_type = 'checklist_returned'`).first();
  assert.ok(note);

  // The inspector fixes it and resubmits; a fresh approval lands with the OM.
  await call('checklists.persist', users.insp, { record: { ...back, items: { W1: { result: 'sat', remarks: 'ok' } } } });
  await call('checklists.persist', users.insp, { record: { ...back, items: { W1: { result: 'sat', remarks: 'ok' } }, status: 'submitted' } });
  [approval] = await call('approvals.listInbox', users.om);
  assert.equal(approval.status, 'pending');
  await call('approvals.decide', users.om, { id: approval.id, decision: 'approved', signature_data_uri: SIG });
  const done = await call('checklists.get', users.insp, { id: ID });
  assert.equal(done.status, 'acknowledged');
  assert.equal(done.returned, undefined);
});

test('a signed-off checklist can never be unlocked, even directly in the database', async () => {
  const { db, users, call } = await setup();
  await call('checklists.persist', users.insp, { record: record({ status: 'submitted' }) });
  await call('checklists.acknowledge', users.om, { id: ID });
  await assert.rejects(
    db.prepare(`UPDATE checklist_submissions SET status = 'draft', locked = 0, submitted_at = NULL WHERE id = ?1`).bind(ID).run(),
    /cannot be overwritten/,
  );
  // And a return can't change content on the way out.
  await call('checklists.persist', users.insp, { record: record({ id: '55555555-5555-4555-8555-555555555555', status: 'submitted' }) });
  await assert.rejects(
    db
      .prepare(`UPDATE checklist_submissions SET status = 'draft', locked = 0, submitted_at = NULL, header_json = '{}' WHERE id = ?1`)
      .bind('55555555-5555-4555-8555-555555555555')
      .run(),
    /cannot be overwritten/,
  );
});

test("the OM's approval is stamped in each form's OM box", () => {
  const vaes = { code: 'PGIA-CL-VAES-08' };
  assert.equal(signoffFieldKeys('om_acknowledgment', vaes).signature, 'supervisor_signature');
  assert.equal(signoffFieldKeys('om_acknowledgment', { code: 'PGIA-PMM-F02' }).name, 'om_name');
  assert.equal(signoffFieldKeys('om_acknowledgment', { code: 'PGIA-PMM-F04' }).date, 'om_date');
  assert.equal(signoffFieldKeys('om_acknowledgment', { code: 'PGIA-AOM-A5-06' }).signature, 'received_by_signature');
  const images = signatureImages(
    {
      schema: vaes,
      signoffs: [
        { role: 'om_acknowledgment', signature_data_uri: 'data:image/png;base64,OM' },
        { role: 'supervisor', signature_data_uri: 'data:image/png;base64,OLD' },
      ],
    },
    { fields: { supervisor_signature: { type: 'image' } } },
  );
  assert.equal(images.supervisor_signature, 'data:image/png;base64,OM');
});

test('sign-off dates are the signer\'s choice, kept through submit and approval', async () => {
  const { users, call } = await setup();
  const dated = record({
    header: { date: '2026-10-15' },
    signoffs: [{ role: 'responsible', name: 'Ivy', signature_data_uri: SIG, sign_date: '2026-10-15' }],
  });
  assert.equal(
    await status(call('checklists.persist', users.insp, {
      record: { ...dated, signoffs: [{ ...dated.signoffs[0], sign_date: '2026-02-30' }] },
    })),
    400,
  );
  await call('checklists.persist', users.insp, { record: { ...dated, status: 'submitted' } });
  await call('checklists.acknowledge', users.om, { id: ID, name: 'Kegan OM', signature_data_uri: SIG, sign_date: '2026-10-16' });
  const got = await call('checklists.get', users.om, { id: ID });
  const by = Object.fromEntries(got.signoffs.map((s) => [s.role, s.sign_date]));
  assert.equal(by.responsible, '2026-10-15');
  assert.equal(by.om_acknowledgment, '2026-10-16');
});

test('the inspector can recall their own submission until the OM signs it', async () => {
  const { users, call } = await setup();
  await call('checklists.persist', users.insp, { record: record({ status: 'submitted' }) });
  assert.equal(await status(call('checklists.recall', users.other, { id: ID })), 403);
  assert.equal(await status(call('checklists.recall', users.om, { id: ID })), 403);
  const back = await call('checklists.recall', users.insp, { id: ID });
  assert.equal(back.status, 'draft');
  assert.equal(back.locked, false);
  assert.equal(back.returned, undefined, 'a recall is not a return for changes');
  assert.equal((await call('approvals.listInbox', users.om)).filter((a) => a.status === 'pending').length, 0);
  // Editable again, and can be resubmitted and signed off.
  await call('checklists.persist', users.insp, { record: record({ header: { date: '2026-10-13' } }) });
  await call('checklists.persist', users.insp, { record: record({ status: 'submitted' }) });
  await call('checklists.acknowledge', users.om, { id: ID, name: 'Kegan OM', signature_data_uri: SIG });
  assert.equal(await status(call('checklists.recall', users.insp, { id: ID })), 409);
});
