/**
 * A D1-compatible database over Node's built-in SQLite, for tests.
 *
 * D1 is SQLite, so running the real migrations here means the tests exercise
 * the real SQL and the real triggers rather than a hand-written twin. Only the
 * slice of the D1 API that worker/ uses is implemented: prepare/bind,
 * first/all/run, batch (one transaction, all-or-nothing) and exec.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATIONS_DIR = path.join(root, 'd1', 'migrations');

// node:sqlite prints an ExperimentalWarning on first load; it is noise here.
const originalEmit = process.emitWarning;
process.emitWarning = (warning, ...rest) => {
  if (String(warning?.message ?? warning).includes('SQLite')) return;
  return originalEmit.call(process, warning, ...rest);
};
const { DatabaseSync } = await import('node:sqlite');
process.emitWarning = originalEmit;

class Statement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    for (const p of params) {
      if (p === undefined) throw new Error('D1_TYPE_ERROR: Type undefined is not supported');
    }
    return new Statement(this.db, this.sql, params);
  }

  _stmt() {
    return this.db.prepare(this.sql);
  }

  async first(column) {
    const row = this._stmt().get(...this.params);
    if (!row) return null;
    const plain = { ...row };
    return column ? plain[column] : plain;
  }

  async all() {
    return { results: this._stmt().all(...this.params).map((row) => ({ ...row })), success: true };
  }

  async run() {
    const info = this._stmt().run(...this.params);
    return { success: true, meta: { changes: Number(info.changes) } };
  }

  _runSync() {
    const stmt = this._stmt();
    if (/^\s*(SELECT|WITH)/i.test(this.sql)) {
      return { results: stmt.all(...this.params).map((row) => ({ ...row })), success: true };
    }
    const info = stmt.run(...this.params);
    return { success: true, meta: { changes: Number(info.changes) } };
  }
}

export function createSqliteD1({ migrate = true } = {}) {
  const db = new DatabaseSync(':memory:');
  // D1 enforces foreign keys.
  db.exec('PRAGMA foreign_keys = ON;');
  if (migrate) {
    for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
      db.exec(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
    }
  }
  return {
    _raw: db,
    prepare(sql) {
      return new Statement(db, sql);
    },
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const results = statements.map((s) => s._runSync());
        db.exec('COMMIT');
        return results;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    async exec(sql) {
      db.exec(sql);
      return { count: 1 };
    },
  };
}

/** Insert a login user directly (the auth tables come from migration 0001). */
export async function insertTestUser(d1, { id, email, full_name, role = 'inspector', department = null, position = '' }) {
  const now = new Date(0).toISOString();
  await d1
    .prepare(
      `INSERT INTO users (id, email, password_hash, full_name, position, role, department,
        is_active, can_login, is_approver, must_change_password, failed_login_count, created_at, updated_at)
       VALUES (?1, ?2, 'x', ?3, ?4, ?5, ?6, 1, 1, 0, 0, 0, ?7, ?7)`,
    )
    .bind(id, email ?? `${id}@example.test`, full_name ?? id, position, role, department, now)
    .run();
  return { id, email: email ?? `${id}@example.test`, full_name: full_name ?? id, role, department, position };
}
