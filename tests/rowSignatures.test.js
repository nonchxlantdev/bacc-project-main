import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSqliteD1, insertTestUser } from './helpers/sqliteD1.js';
import { createD1DataStore } from '../worker/data/store.js';
import { createDataService } from '../worker/data/service.js';
import { createD1Adapter } from '../src/data/repositories/d1/adapter.js';
import { signatureImages } from '../src/lib/signoffFields.js';

const KEY = 'attendance-list-wildlife-attractant-inspection';
const schema = JSON.parse(
  readFileSync(new URL(`../src/data/checklists/${KEY}.json`, import.meta.url), 'utf8'),
);
const fieldMap = JSON.parse(
  readFileSync(new URL(`../src/data/field-maps/${KEY}-ed01.json`, import.meta.url), 'utf8'),
);
const entry = {
  key: KEY,
  code: schema.code,
  version: 'ed01',
  title: schema.title,
  annexLabel: schema.annexLabel,
  family: 'AOM',
  schema,
  fieldMap,
};
const registry = { entries: [entry], getEntry: (key) => (key === KEY ? entry : null) };
const ID = '22222222-2222-4222-8222-222222222222';
const sig = (n) => `data:image/png;base64,${String(n).padStart(4, '0')}`;

function rows(count = 13) {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return {
      no: String(n),
      name: n === 2 ? '' : `Person ${n}`,
      e_mail: `p${n}@example.com`,
      phone: '600-0000',
      signature: sig(n),
    };
  });
}

function record(over = {}) {
  return {
    id: ID,
    template_id: KEY,
    template_version: 'ed01',
    status: 'draft',
    header: { date: '2026-10-24', timeStart: '08:00', timeEnd: '09:00' },
    items: {},
    signoffs: [],
    summary: { rows: rows() },
    schema,
    field_map: fieldMap,
    ...over,
  };
}

async function setup() {
  const db = createSqliteD1();
  const insp = await insertTestUser(db, {
    id: 'insp',
    full_name: 'Ivy Inspector',
    role: 'inspector',
    department: 'Operations',
  });
  const forms = {
    templateKeys: new Set([KEY]),
    loadSchema: (key) => (key === KEY ? schema : null),
  };
  let seq = 0;
  const svc = createDataService({
    store: createD1DataStore(db),
    forms,
    now: () => Date.parse('2026-10-24T06:00:00.000Z'),
    newId: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
  });
  const repos = createD1Adapter({
    call: (op, args) => svc[op](insp, args ?? {}),
    registry,
  });
  return { db, repos };
}

test('a 13-row attendance draft saves and signatureImages returns every row after the round trip', async () => {
  const { repos } = await setup();
  const draft = record();
  const saved = await repos.checklists.persist(draft);
  assert.equal(draft.summary.rows[0].signature, sig(1));
  assert.equal(saved.summary.rows.length, 13);
  assert.equal(saved.summary.rows[0].signature, sig(1));
  assert.equal(saved.summary.rows[1].signature, sig(2));
  const byRole = Object.fromEntries(saved.signoffs.map((s) => [s.role, s]));
  assert.equal(byRole['row:rows:1:signature'].name, 'Person 1');
  assert.equal(byRole['row:rows:1:signature'].signature_data_uri, sig(1));
  assert.equal(byRole['row:rows:2:signature'].name, 'Attendee 2');
  assert.equal(Object.keys(byRole).filter((role) => role.startsWith('row:')).length, 13);
  const images = signatureImages(saved, saved.field_map);
  for (let n = 1; n <= 13; n += 1) {
    const key = `row_${String(n).padStart(2, '0')}_signature`;
    assert.equal(images[key], sig(n), key);
  }
});

test('a list read carries has_signature and a resave keeps the stored row images', async () => {
  const { repos } = await setup();
  await repos.checklists.persist(record());
  const [listed] = await repos.checklists.listAll();
  assert.ok(listed.signoffs.length >= 13);
  assert.equal(listed.signoffs.every((s) => s.signature_data_uri === undefined), true);
  assert.equal(listed.signoffs.every((s) => s.has_signature === true), true);
  assert.equal(JSON.stringify(listed).includes('data:image'), false);
  assert.equal(listed.summary.rows[0].signature, true);
  const again = await repos.checklists.persist({ ...listed, header: { ...listed.header, timeEnd: '10:00' } });
  assert.equal(again.summary.rows[12].signature, sig(13));
  assert.equal(again.header.timeEnd, '10:00');
});

test('deleting attendance row 2 renumbers the row signatures and drops the old block', async () => {
  const { db, repos } = await setup();
  const saved = await repos.checklists.persist(record());
  const kept = saved.summary.rows.filter((_, i) => i !== 1);
  await repos.checklists.persist({ ...saved, summary: { rows: kept } });
  const after = await repos.checklists.get(ID);
  assert.equal(after.summary.rows.length, 12);
  assert.equal(after.summary.rows[0].signature, sig(1));
  assert.equal(after.summary.rows[1].name, 'Person 3');
  assert.equal(after.summary.rows[1].signature, sig(3));
  assert.equal(after.summary.rows[11].signature, sig(13));
  const roles = after.signoffs.map((s) => s.role);
  assert.equal(roles.includes('row:rows:13:signature'), false);
  assert.equal(after.signoffs.find((s) => s.role === 'row:rows:2:signature').signature_data_uri, sig(3));
  const stored = await db.prepare('SELECT role FROM checklist_signoffs WHERE submission_id = ?1').bind(ID).all();
  assert.equal(stored.results.some((row) => row.role === 'row:rows:13:signature'), false);
  assert.equal(stored.results.filter((row) => row.role.startsWith('row:')).length, 12);
});

test('submitting freezes attendance row signatures', async () => {
  const { db, repos } = await setup();
  const saved = await repos.checklists.persist(record());
  const submitted = await repos.checklists.persist({ ...saved, status: 'submitted' });
  assert.equal(submitted.locked, true);
  assert.equal(submitted.summary.rows[12].signature, sig(13));
  await assert.rejects(
    db
      .prepare(`UPDATE checklist_signoffs SET name = 'Hacked' WHERE submission_id = ?1 AND role = 'row:rows:1:signature'`)
      .bind(ID)
      .run(),
    /Sign-offs on a locked checklist cannot change/,
  );
});

test('an image smuggled in any other attendance field is still rejected', async () => {
  const { repos } = await setup();
  const img = 'data:image/png;base64,SMUGGLE';
  await assert.rejects(
    () => repos.checklists.persist(record({ summary: { rows: rows(), sneak: img } })),
    (err) => err.status === 400 && /Images can only be attached as drawings/.test(err.message),
  );
});
