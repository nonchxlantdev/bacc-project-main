/**
 * Every SQL statement for the login lives here. service.js talks only to the
 * interface below, so it can be tested against createMemoryAuthStore().
 */
const USER_COLUMNS = [
  'id', 'email', 'password_hash', 'full_name', 'position', 'role', 'department',
  'is_active', 'can_login', 'is_approver', 'must_change_password',
  'failed_login_count', 'locked_until', 'last_login_at', 'created_at', 'updated_at',
];
const UPDATABLE = new Set(USER_COLUMNS.filter((c) => c !== 'id' && c !== 'created_at'));
const BOOLEAN_COLUMNS = ['is_active', 'can_login', 'is_approver', 'must_change_password'];

export function isUniqueViolation(err) {
  return /UNIQUE constraint failed/i.test(String(err?.message ?? err));
}

/** booleans → 0/1, drop undefined (D1 can't bind undefined). */
function toRow(fields) {
  const row = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    row[key] = BOOLEAN_COLUMNS.includes(key) ? (value ? 1 : 0) : value;
  }
  return row;
}

function fromRow(row) {
  if (!row) return null;
  const user = { ...row };
  for (const key of BOOLEAN_COLUMNS) user[key] = Boolean(row[key]);
  user.failed_login_count = Number(row.failed_login_count || 0);
  return user;
}

export function createD1AuthStore(db) {
  return {
    async findUserByEmail(email) {
      return fromRow(await db.prepare('SELECT * FROM users WHERE email = ?1 COLLATE NOCASE').bind(email).first());
    },
    async findUserById(id) {
      return fromRow(await db.prepare('SELECT * FROM users WHERE id = ?1').bind(id).first());
    },
    async listUsers() {
      const { results } = await db.prepare('SELECT * FROM users ORDER BY full_name COLLATE NOCASE').all();
      return results.map(fromRow);
    },
    async countActiveAdmins() {
      const row = await db
        .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND is_active = 1 AND can_login = 1")
        .first();
      return Number(row?.n ?? 0);
    },
    async insertUser(user) {
      const row = toRow(user);
      const placeholders = USER_COLUMNS.map((_, i) => `?${i + 1}`).join(', ');
      await db
        .prepare(`INSERT INTO users (${USER_COLUMNS.join(', ')}) VALUES (${placeholders})`)
        .bind(...USER_COLUMNS.map((c) => row[c] ?? null))
        .run();
    },
    async updateUser(id, fields) {
      const row = toRow(fields);
      const cols = Object.keys(row).filter((c) => UPDATABLE.has(c));
      if (!cols.length) return;
      const sets = cols.map((c, i) => `${c} = ?${i + 1}`).join(', ');
      await db
        .prepare(`UPDATE users SET ${sets} WHERE id = ?${cols.length + 1}`)
        .bind(...cols.map((c) => row[c] ?? null), id)
        .run();
    },
    async insertSession(s) {
      await db
        .prepare(
          'INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, ip, user_agent) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)',
        )
        .bind(s.id, s.user_id, s.created_at, s.expires_at, s.last_seen_at, s.ip ?? null, s.user_agent ?? null)
        .run();
    },
    async findSession(id) {
      return db.prepare('SELECT * FROM sessions WHERE id = ?1').bind(id).first();
    },
    async touchSession(id, { expires_at, last_seen_at }) {
      await db.prepare('UPDATE sessions SET expires_at = ?1, last_seen_at = ?2 WHERE id = ?3').bind(expires_at, last_seen_at, id).run();
    },
    async deleteSession(id) {
      await db.prepare('DELETE FROM sessions WHERE id = ?1').bind(id).run();
    },
    async deleteUserSessions(userId, { exceptId = null } = {}) {
      if (exceptId) {
        await db.prepare('DELETE FROM sessions WHERE user_id = ?1 AND id <> ?2').bind(userId, exceptId).run();
      } else {
        await db.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(userId).run();
      }
    },
    async deleteExpiredSessions(nowIso, limit = 100) {
      await db
        .prepare('DELETE FROM sessions WHERE id IN (SELECT id FROM sessions WHERE expires_at < ?1 LIMIT ?2)')
        .bind(nowIso, limit)
        .run();
    },
  };
}

/** Same contract, in memory. For tests only. */
export function createMemoryAuthStore() {
  const users = new Map();
  const sessions = new Map();
  const copy = (x) => (x ? structuredClone(x) : null);
  const byEmail = (email) =>
    [...users.values()].find((u) => u.email.toLowerCase() === String(email).toLowerCase());

  return {
    _users: users,
    _sessions: sessions,
    async findUserByEmail(email) {
      return copy(byEmail(email));
    },
    async findUserById(id) {
      return copy(users.get(id));
    },
    async listUsers() {
      return [...users.values()].sort((a, b) => a.full_name.localeCompare(b.full_name)).map(copy);
    },
    async countActiveAdmins() {
      return [...users.values()].filter((u) => u.role === 'admin' && u.is_active && u.can_login).length;
    },
    async insertUser(user) {
      if (byEmail(user.email)) throw new Error('UNIQUE constraint failed: users.email');
      users.set(user.id, copy(user));
    },
    async updateUser(id, fields) {
      const user = users.get(id);
      if (!user) return;
      if (fields.email) {
        const other = byEmail(fields.email);
        if (other && other.id !== id) throw new Error('UNIQUE constraint failed: users.email');
      }
      for (const [key, value] of Object.entries(fields)) if (value !== undefined) user[key] = value;
    },
    async insertSession(s) {
      sessions.set(s.id, copy(s));
    },
    async findSession(id) {
      return copy(sessions.get(id));
    },
    async touchSession(id, { expires_at, last_seen_at }) {
      const s = sessions.get(id);
      if (s) Object.assign(s, { expires_at, last_seen_at });
    },
    async deleteSession(id) {
      sessions.delete(id);
    },
    async deleteUserSessions(userId, { exceptId = null } = {}) {
      for (const [id, s] of sessions) if (s.user_id === userId && id !== exceptId) sessions.delete(id);
    },
    async deleteExpiredSessions(nowIso, limit = 100) {
      let removed = 0;
      for (const [id, s] of sessions) {
        if (removed >= limit) break;
        if (s.expires_at < nowIso) {
          sessions.delete(id);
          removed += 1;
        }
      }
    },
  };
}
