import test from 'node:test';
import assert from 'node:assert/strict';
import { createSqliteD1, insertTestUser } from './helpers/sqliteD1.js';

const T = '2026-10-09T12:00:00.000Z';

async function setup() {
  const db = createSqliteD1();
  await insertTestUser(db, { id: 'u1', role: 'inspector' });
  await insertTestUser(db, { id: 'om1', role: 'om' });
  return db;
}

function insertSubmission(db, id, { locked = 0, status = 'draft' } = {}) {
  return db
    .prepare(
      `INSERT INTO checklist_submissions (id, template_id, template_version, inspector_id, status, locked,
        header_json, items_json, created_at, updated_at)
       VALUES (?1, 'annex-d-drainage', 'ed01', 'u1', ?2, ?3, '{}', '{"A1":{"result":"sat"}}', ?4, ?4)`,
    )
    .bind(id, status, locked, T);
}

const signoff = (db, sub, role) =>
  db
    .prepare(
      `INSERT INTO checklist_signoffs (submission_id, role, name, signed_at, signed_by) VALUES (?1, ?2, 'N', ?3, 'u1')
       ON CONFLICT(submission_id, role) DO UPDATE SET name = excluded.name`,
    )
    .bind(sub, role, T);

const drawing = (db, sub, id) =>
  db
    .prepare(
      `INSERT INTO checklist_drawings (id, submission_id, section_key, data_uri, added_by, added_at)
       VALUES (?1, ?2, 'c', 'data:image/jpeg;base64,AA', 'u1', ?3)`,
    )
    .bind(id, sub, T);

async function lockedSubmission() {
  const db = await setup();
  // The submit order: content and children first, the lock last.
  await db.batch([
    insertSubmission(db, 's1'),
    signoff(db, 's1', 'inspector'),
    drawing(db, 's1', 'd1'),
    db
      .prepare("UPDATE checklist_submissions SET status = 'submitted', locked = 1, submitted_at = ?1 WHERE id = 's1'")
      .bind(T),
  ]);
  return db;
}

test('submit batch (children before lock) succeeds', async () => {
  const db = await lockedSubmission();
  const row = await db.prepare("SELECT status, locked FROM checklist_submissions WHERE id = 's1'").first();
  assert.deepEqual(row, { status: 'submitted', locked: 1 });
});

test('locked header cannot change', async () => {
  const db = await lockedSubmission();
  await assert.rejects(
    db.prepare(`UPDATE checklist_submissions SET header_json = '{"x":1}' WHERE id = 's1'`).run(),
    /cannot be overwritten/,
  );
});

test('locked row cannot be deleted', async () => {
  const db = await lockedSubmission();
  await assert.rejects(db.prepare("DELETE FROM checklist_submissions WHERE id = 's1'").run(), /cannot be deleted/);
});

test('locked row cannot be unlocked', async () => {
  const db = await lockedSubmission();
  await assert.rejects(
    db.prepare("UPDATE checklist_submissions SET locked = 0, status = 'draft' WHERE id = 's1'").run(),
    /cannot be overwritten/,
  );
});

test('items change without a new reopened_at aborts; with one it succeeds', async () => {
  const db = await lockedSubmission();
  await assert.rejects(
    db.prepare(`UPDATE checklist_submissions SET items_json = '{"A1":{"result":"no_sat"}}' WHERE id = 's1'`).run(),
    /cannot be overwritten/,
  );
  await db
    .prepare(
      `UPDATE checklist_submissions SET items_json = '{"A1":{"result":"no_sat"}}', reopened_at = ?1, reopened_by = 'om1' WHERE id = 's1'`,
    )
    .bind(T)
    .run();
});

test('status may go submitted -> acknowledged, never back', async () => {
  const db = await lockedSubmission();
  await db.prepare("UPDATE checklist_submissions SET status = 'acknowledged' WHERE id = 's1'").run();
  await assert.rejects(
    db.prepare("UPDATE checklist_submissions SET status = 'submitted' WHERE id = 's1'").run(),
    /cannot be overwritten/,
  );
});

test('non-OM sign-offs are frozen on a locked row; the OM block is not', async () => {
  const db = await lockedSubmission();
  await assert.rejects(signoff(db, 's1', 'supervisor').run(), /Sign-offs on a locked checklist/);
  await assert.rejects(signoff(db, 's1', 'inspector').run(), /Sign-offs on a locked checklist/);
  await assert.rejects(
    db.prepare("DELETE FROM checklist_signoffs WHERE submission_id = 's1' AND role = 'inspector'").run(),
    /Sign-offs on a locked checklist/,
  );
  await signoff(db, 's1', 'om_acknowledgment').run();
  await signoff(db, 's1', 'om_acknowledgment').run();
});

test('drawings are frozen on a locked row', async () => {
  const db = await lockedSubmission();
  await assert.rejects(drawing(db, 's1', 'd2').run(), /Drawings on a locked checklist/);
  await assert.rejects(db.prepare("DELETE FROM checklist_drawings WHERE id = 'd1'").run(), /Drawings on a locked/);
});

test('a failed batch leaves nothing behind', async () => {
  const db = await lockedSubmission();
  await assert.rejects(
    db.batch([insertSubmission(db, 's2'), db.prepare("DELETE FROM checklist_submissions WHERE id = 's1'")]),
  );
  assert.equal(await db.prepare("SELECT id FROM checklist_submissions WHERE id = 's2'").first(), null);
});

test('only one pending approval per entity and role', async () => {
  const db = await setup();
  const ins = (id, status = 'pending') =>
    db
      .prepare(
        `INSERT INTO approvals (id, entity_type, entity_id, approval_role, status, created_at)
         VALUES (?1, 'checklist_submission', 's1', 'om_acknowledgment', ?2, ?3)`,
      )
      .bind(id, status, T);
  await ins('a1').run();
  await assert.rejects(ins('a2').run(), /UNIQUE/);
  await ins('a3', 'approved').run();
});

test('drawing and signature size caps hold in the database too', async () => {
  const db = await setup();
  await insertSubmission(db, 's1').run();
  await assert.rejects(
    db
      .prepare(
        `INSERT INTO checklist_drawings (id, submission_id, data_uri, added_at) VALUES ('d9', 's1', ?1, ?2)`,
      )
      .bind('x'.repeat(820001), T)
      .run(),
    /CHECK/,
  );
  await assert.rejects(
    db
      .prepare(
        `INSERT INTO checklist_signoffs (submission_id, role, name, signature_data_uri, signed_at, signed_by)
         VALUES ('s1', 'inspector', 'N', ?1, ?2, 'u1')`,
      )
      .bind('x'.repeat(200001), T)
      .run(),
    /CHECK/,
  );
});
