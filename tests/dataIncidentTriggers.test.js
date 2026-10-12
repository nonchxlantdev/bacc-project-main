import test from 'node:test';
import assert from 'node:assert/strict';
import { createSqliteD1, insertTestUser } from './helpers/sqliteD1.js';

const T = '2026-10-12T12:00:00.000Z';

async function setup() {
  const db = createSqliteD1();
  await insertTestUser(db, { id: 'u1' });
  await db
    .prepare(
      `INSERT INTO incidents (id, year, seq, incident_ref, noc_no, title, description, deficiency_level, location_label,
         status, reported_by, reported_at, created_at, updated_at)
       VALUES ('i1', 2026, 1, 'INC-2026-0001', '0001', 'T', 'D', 2, 'L', 'open', 'u1', ?1, ?1, ?1)`,
    )
    .bind(T)
    .run();
  await db
    .prepare(`INSERT INTO incident_updates (id, incident_id, author_id, body, created_at) VALUES ('up1', 'i1', 'u1', 'hello', ?1)`)
    .bind(T)
    .run();
  await db
    .prepare(
      `INSERT INTO work_orders (id, incident_id, year, seq, work_order_number, date_issued, issued_by_name, assigned_to_name,
         noc_reference_no, deficiency_level, description_of_work, created_at, updated_at)
       VALUES ('w1', 'i1', 2026, 1, 'WO-2026-0001', '2026-10-12', 'U', 'Grounds', '0001', 2, 'Fix', ?1, ?1)`,
    )
    .bind(T)
    .run();
  return db;
}

const run = (db, sql) => db.prepare(sql).run();

test('a closed incident cannot be updated or deleted', async () => {
  const db = await setup();
  await run(db, "UPDATE incidents SET status = 'closed' WHERE id = 'i1'");
  await assert.rejects(run(db, "UPDATE incidents SET title = 'x' WHERE id = 'i1'"), /closed incident cannot be changed/);
  await assert.rejects(run(db, "DELETE FROM incidents WHERE id = 'i1'"), /closed incident cannot be deleted/);
});

test('incident numbers and reporter never change', async () => {
  const db = await setup();
  await assert.rejects(run(db, "UPDATE incidents SET seq = 9 WHERE id = 'i1'"), /cannot change/);
  await assert.rejects(run(db, "UPDATE incidents SET incident_ref = 'INC-2026-0009' WHERE id = 'i1'"), /cannot change/);
  await run(db, "UPDATE incidents SET title = 'ok' WHERE id = 'i1'");
});

test('the updates trail is append-only, but goes with its incident', async () => {
  const db = await setup();
  await assert.rejects(run(db, "UPDATE incident_updates SET body = 'x' WHERE id = 'up1'"), /cannot be edited/);
  await assert.rejects(run(db, "DELETE FROM incident_updates WHERE id = 'up1'"), /cannot be deleted/);
  await run(db, "DELETE FROM work_orders WHERE id = 'w1'");
  await run(db, "DELETE FROM incidents WHERE id = 'i1'");
  assert.equal(await db.prepare('SELECT id FROM incident_updates').first(), null);
});

test('a locked work order and its sign-offs are frozen', async () => {
  const db = await setup();
  await db.batch([
    db
      .prepare(
        `INSERT INTO work_order_signoffs (work_order_id, role, name, signed_at, signed_by) VALUES ('w1', 'om_coo_verification', 'OM', ?1, 'u1')`,
      )
      .bind(T),
    db.prepare("UPDATE work_orders SET status = 'verified', locked = 1 WHERE id = 'w1'"),
  ]);
  await assert.rejects(run(db, "UPDATE work_orders SET materials_used = 'x' WHERE id = 'w1'"), /Locked work orders/);
  await assert.rejects(run(db, "DELETE FROM work_orders WHERE id = 'w1'"), /Locked work orders/);
  await assert.rejects(run(db, "DELETE FROM work_order_signoffs WHERE work_order_id = 'w1'"), /locked work order/);
  await assert.rejects(
    db
      .prepare(`INSERT INTO work_order_signoffs (work_order_id, role, name, signed_at, signed_by) VALUES ('w1', 'cec_clearance', 'X', ?1, 'u1')`)
      .bind(T)
      .run(),
    /locked work order/,
  );
});

test('work order numbers are unique per year and fixed', async () => {
  const db = await setup();
  await assert.rejects(run(db, "UPDATE work_orders SET work_order_number = 'WO-2026-0009' WHERE id = 'w1'"), /cannot change/);
  await assert.rejects(
    db
      .prepare(
        `INSERT INTO work_orders (id, incident_id, year, seq, work_order_number, date_issued, issued_by_name, assigned_to_name,
           noc_reference_no, deficiency_level, description_of_work, created_at, updated_at)
         VALUES ('w2', 'i1', 2026, 1, 'WO-2026-0001b', '2026-10-12', 'U', 'G', '0001', 2, 'Fix', ?1, ?1)`,
      )
      .bind(T)
      .run(),
    /UNIQUE/,
  );
});
