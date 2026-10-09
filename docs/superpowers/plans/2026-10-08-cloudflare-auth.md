# Cloudflare Login (Sub-project 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build email/password login, sessions and admin user management on Cloudflare (Worker + D1). Deploy it to production switched off, so that sub-project 3 can turn it on with the D1 data move.

**Architecture:** Pure modules under `worker/auth/` handle the work:
- `password` (PBKDF2), `session` (token and cookie), `permissions` (rules)
- `store` (all D1 SQL, plus an in-memory twin for tests)
- `service` (business logic)
- `routes` + `authenticate` (HTTP wiring through the existing `worker/http.js`)

The browser gets a third auth mode, `d1`, selected by `VITE_DATA_SOURCE=d1`. Production stays on Supabase.

**Tech Stack:** Cloudflare Workers, D1 (SQLite), Web Crypto (PBKDF2-SHA256, SHA-256), Wrangler 4, `@cloudflare/vite-plugin`, React 19, Node 22 `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-08-cloudflare-auth-design.md`. It outranks this plan.

## Global Constraints

- D1 database name `bacc-portal-db`, Worker binding `DB`, migrations directory `d1/migrations`.
- Password hash format `pbkdf2$<iterations>$<salt b64url>$<hash b64url>`. Iterations `100000`, salt 16 bytes, key 32 bytes. Passwords are 10–128 characters.
- Session cookie is exactly `__Host-bacc_session=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`. The token is 32 random bytes as base64url (43 characters). D1 stores only its hex SHA-256.
- Sessions slide: renewal at most once per 24 h, to now + 30 days.
- Lockout: 5 consecutive failures lock the account for 15 minutes (429). There's also an in-memory per-IP limit of 20 logins per minute.
- Generic login error is exactly `Email or password is incorrect`.
- Roles are exactly `inspector, om, coo, duty_manager, apron_supervisor, electrical_tech, sms, admin`. Departments are exactly `Operations, Engineering, Maintenance`.
- Only `admin` can create, edit, promote or reset an admin. Nobody changes their own role, `is_active` or `can_login`. At least one active admin must always remain.
- Temporary passwords are server-generated, 14 characters, from an unambiguous alphabet. They're returned once, and `must_change_password = 1` is set.
- Error body is `{ "error": string }`, plus an optional `"code"`.
- **Production keeps running on Supabase.** The PDF exports and `generate-checklist-instances` accept either a D1 session or the Supabase bearer token. `/api/create-user` stays Supabase-only. Don't remove any Supabase code.
- 6-case PDF parity must remain at 100%, and every existing `npm test` and `verify:*` check must pass.
- The user is on Windows PowerShell. Use `curl.exe`, and quote paths.
- Work on branch `feat/cloudflare-auth`. **Never merge or push to `main`.** The user does that.

## File map

| File | Status | Responsibility |
|---|---|---|
| `d1/migrations/0001_auth.sql` | create | `users` and `sessions` tables |
| `wrangler.jsonc` | modify | `d1_databases` binding |
| `api/_shared.js` | modify | `HttpError` gains an optional `code` |
| `worker/auth/password.js` | create | hash, verify, temp passwords, base64url |
| `worker/auth/session.js` | create | token, token hash, cookie build and parse, TTL constants |
| `worker/auth/permissions.js` | create | role and department lists, permission checks |
| `worker/auth/store.js` | create | `createD1AuthStore(db)`, `createMemoryAuthStore()`, `isUniqueViolation` |
| `worker/auth/service.js` | create | `createAuthService({ store, now })`, `publicUser` |
| `worker/auth/authenticate.js` | create | `createAuthenticator({ serviceFor, supabaseAuth })` |
| `worker/auth/routes.js` | create | `AUTH_ROUTES`, `authServiceFor(env)` |
| `worker/http.js` | modify | per-route methods, GET, CSRF, `kind: 'response'`, renewal cookie, `request` in ctx, error `code` |
| `worker/index.js` | modify | register `AUTH_ROUTES`, use the new authenticator |
| `scripts/auth-create-admin.mjs` | create | bootstrap the first admin |
| `scripts/auth-smoke.mjs` | create | end-to-end check against local or production |
| `src/lib/authMode.js` | create | `isD1Auth()` |
| `src/lib/authClient.js` | create | `authClient`, `usersAdminClient` |
| `src/hooks/useD1Users.js` | create | Users & roles data in d1 mode |
| `src/components/auth/ForcePasswordChange.jsx` | create | full-screen "choose your password" form |
| `src/context/AuthContext.jsx` | modify | `d1` branch |
| `src/components/layout/AppShell.jsx` | modify | forced-change gate |
| `src/components/settings/OtherSections.jsx` | modify | email row and current-password field in d1 mode |
| `src/components/settings/UsersRolesSection.jsx` | modify | d1 create, edit, reset-password |
| `src/lib/apiFetch.js` | modify | no Supabase bearer token in d1 mode |
| `package.json` | modify | `auth:create-admin`, `auth:smoke` scripts |
| `tests/authPassword.test.js`, `tests/authSession.test.js`, `tests/authPermissions.test.js`, `tests/authService.test.js`, `tests/authAuthenticate.test.js`, `tests/authClient.test.js` | create | unit tests |
| `tests/workerHttp.test.js` | modify | new wrapper behaviour |
| `CLAUDE.md`, `.env.example` | modify | docs |

> **Spec clarification:** the spec says the offline queue should keep queued work on a 401. `flushQueue` in `src/utils/offlineQueue.js` already keeps every failed job (`bumpQueueAttempt`) and never drops it, and the D1 queue handlers only arrive in sub-project 3. **No queue change is needed in this sub-project.** Sub-project 3 must keep that behaviour.

> **Local-mode note:** `getDataSource()` in `src/data/repositories/index.js` treats any value other than `supabase` as `mock`. So `VITE_DATA_SOURCE=d1` in this sub-project means **D1 login with mock data**. That's exactly the combination needed to test the login screens locally. Don't change `getDataSource()` here; sub-project 3 adds the real `d1` adapter.

---

### Task 0: Branch, D1 binding, migration

**Files:**
- Create: `d1/migrations/0001_auth.sql`
- Modify: `wrangler.jsonc`

**Interfaces:**
- Produces: D1 binding `env.DB` with tables `users` and `sessions`, exactly as in Step 3.

- [ ] **Step 1: Branch**

```powershell
git checkout main
git pull
git checkout -b feat/cloudflare-auth
```

- [ ] **Step 2: Add the D1 binding to `wrangler.jsonc`**

The user created the database before starting (walkthrough Part A). Their `database_id` is in the Cursor chat, or `npx wrangler d1 list` shows it. **If you can't find it, stop and ask. Don't create a second database.**

Add this top-level property after `"observability"`:

```jsonc
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "bacc-portal-db",
      "database_id": "<paste the database_id the user gave you>",
      "migrations_dir": "d1/migrations"
    }
  ],
```

- [ ] **Step 3: Create `d1/migrations/0001_auth.sql`**

```sql
-- Sub-project 2: Cloudflare login. See docs/superpowers/specs/2026-10-08-cloudflare-auth-design.md
CREATE TABLE users (
  id                    TEXT PRIMARY KEY,
  email                 TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash         TEXT NOT NULL,
  full_name             TEXT NOT NULL,
  position              TEXT NOT NULL DEFAULT '',
  role                  TEXT NOT NULL DEFAULT 'inspector'
                        CHECK (role IN ('inspector','om','coo','duty_manager','apron_supervisor','electrical_tech','sms','admin')),
  department            TEXT CHECK (department IS NULL OR department IN ('Operations','Engineering','Maintenance')),
  is_active             INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  can_login             INTEGER NOT NULL DEFAULT 1 CHECK (can_login IN (0,1)),
  is_approver           INTEGER NOT NULL DEFAULT 0 CHECK (is_approver IN (0,1)),
  must_change_password  INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0,1)),
  failed_login_count    INTEGER NOT NULL DEFAULT 0,
  locked_until          TEXT,
  last_login_at         TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL,
  ip            TEXT,
  user_agent    TEXT
);
CREATE INDEX sessions_user_id ON sessions(user_id);
CREATE INDEX sessions_expires_at ON sessions(expires_at);
```

- [ ] **Step 4: Apply locally and check**

Run: `npx wrangler d1 migrations apply bacc-portal-db --local`
Expected: `0001_auth.sql` is listed as applied.

Run: `npx wrangler d1 execute bacc-portal-db --local --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"`
Expected: rows include `sessions` and `users`.

**Do not run with `--remote`.** The user applies the migration to production in the walkthrough.

- [ ] **Step 5: Commit**

```powershell
git add wrangler.jsonc d1/migrations/0001_auth.sql
git commit -m "feat(auth): add D1 binding and users/sessions migration"
```

---

### Task 1: `HttpError` code and password hashing

**Files:**
- Modify: `api/_shared.js` (the `HttpError` class)
- Create: `worker/auth/password.js`
- Test: `tests/authPassword.test.js`

**Interfaces:**
- Produces:
  - `new HttpError(status, message, code?)`, which sets `err.code` only when `code` is given
  - `PBKDF2_ITERATIONS = 100000`, `PASSWORD_MIN = 10`, `PASSWORD_MAX = 128`, `TEMP_PASSWORD_ALPHABET`
  - `toBase64Url(Uint8Array): string`, `fromBase64Url(string): Uint8Array`
  - `assertPasswordLength(pw)`, which throws `HttpError(400)`
  - `hashPassword(pw, { iterations? }): Promise<string>`
  - `verifyPassword(pw, stored): Promise<boolean>`
  - `timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean`
  - `generateTemporaryPassword(length = 14): string`
  - `burnPasswordCheck(pw): Promise<void>`

- [ ] **Step 1: Write the failing test** in `tests/authPassword.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PBKDF2_ITERATIONS,
  TEMP_PASSWORD_ALPHABET,
  assertPasswordLength,
  fromBase64Url,
  generateTemporaryPassword,
  hashPassword,
  toBase64Url,
  verifyPassword,
} from '../worker/auth/password.js';
import { HttpError } from '../api/_shared.js';

test('HttpError carries an optional code', () => {
  assert.equal(new HttpError(403, 'x', 'PASSWORD_CHANGE_REQUIRED').code, 'PASSWORD_CHANGE_REQUIRED');
  assert.equal('code' in new HttpError(400, 'y'), false);
});

test('base64url round-trips arbitrary bytes', () => {
  const bytes = new Uint8Array([0, 1, 62, 63, 250, 251, 252, 253, 254, 255]);
  const text = toBase64Url(bytes);
  assert.match(text, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual([...fromBase64Url(text)], [...bytes]);
});

test('hash format is pbkdf2$100000$salt$hash', async () => {
  const stored = await hashPassword('correct horse battery');
  const [scheme, iterations, salt, hash] = stored.split('$');
  assert.equal(scheme, 'pbkdf2');
  assert.equal(Number(iterations), PBKDF2_ITERATIONS);
  assert.equal(fromBase64Url(salt).length, 16);
  assert.equal(fromBase64Url(hash).length, 32);
});

test('same password hashes differently each time (random salt)', async () => {
  assert.notEqual(await hashPassword('same-password-1'), await hashPassword('same-password-1'));
});

test('verify accepts the right password and rejects a wrong one', async () => {
  const stored = await hashPassword('correct horse battery');
  assert.equal(await verifyPassword('correct horse battery', stored), true);
  assert.equal(await verifyPassword('correct horse batterz', stored), false);
});

test('a hash stored with fewer iterations still verifies (upgrade path)', async () => {
  const stored = await hashPassword('older-hash-pass', { iterations: 1000 });
  assert.equal(stored.split('$')[1], '1000');
  assert.equal(await verifyPassword('older-hash-pass', stored), true);
});

test('tampered or malformed hashes never verify', async () => {
  const stored = await hashPassword('tamper-test-pw');
  const [s, i, salt, hash] = stored.split('$');
  const flip = (t) => (t[0] === 'A' ? 'B' : 'A') + t.slice(1);
  for (const bad of [
    `${s}$${i}$${flip(salt)}$${hash}`,
    `${s}$${i}$${salt}$${flip(hash)}`,
    `bcrypt$${i}$${salt}$${hash}`,
    `${s}$999999$${salt}$${hash}`,
    `${s}$${i}$${salt}`,
    `${s}$${i}$@@@$${hash}`,
    '',
  ]) {
    assert.equal(await verifyPassword('tamper-test-pw', bad), false, bad);
  }
  assert.equal(await verifyPassword(undefined, stored), false);
});

test('password length bounds are 10..128', () => {
  assert.throws(() => assertPasswordLength('123456789'), (e) => e.status === 400);
  assert.throws(() => assertPasswordLength('x'.repeat(129)), (e) => e.status === 400);
  assert.throws(() => assertPasswordLength(undefined), (e) => e.status === 400);
  assertPasswordLength('1234567890');
  assertPasswordLength('x'.repeat(128));
});

test('temporary passwords: 14 chars from the unambiguous alphabet, all different', () => {
  for (const ch of '0O1lIio') assert.equal(TEMP_PASSWORD_ALPHABET.includes(ch), false, ch);
  const seen = new Set();
  for (let n = 0; n < 200; n += 1) {
    const pw = generateTemporaryPassword();
    assert.equal(pw.length, 14);
    for (const ch of pw) assert.ok(TEMP_PASSWORD_ALPHABET.includes(ch), ch);
    seen.add(pw);
  }
  assert.equal(seen.size, 200);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test tests/authPassword.test.js`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `worker/auth/password.js`.

- [ ] **Step 3: Give `HttpError` an optional code**

In `api/_shared.js`, replace the class with:

```js
/** An error that carries the HTTP status the API should answer with, and an
 * optional machine-readable code the browser can branch on. */
export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    if (code) this.code = code;
  }
}
```

- [ ] **Step 4: Create `worker/auth/password.js`**

```js
/**
 * Password hashing for the Cloudflare login (sub-project 2).
 *
 * PBKDF2-SHA256 via Web Crypto — available in Workers, browsers and Node 22.
 * 100,000 iterations is the Workers ceiling. The iteration count is stored in
 * each hash, so it can be raised (or the scheme swapped) later without
 * forcing anyone to reset a password.
 */
import { HttpError } from '../../api/_shared.js';

export const PBKDF2_ITERATIONS = 100_000;
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const encoder = new TextEncoder();

/** No 0/O/o, 1/l/I/i — temporary passwords get read aloud and typed by hand. */
export const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

export function toBase64Url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text) {
  const normal = String(text).replace(/-/g, '+').replace(/_/g, '/');
  const padded = normal + '='.repeat((4 - (normal.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export function assertPasswordLength(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    throw new HttpError(400, `Password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters`);
  }
}

export async function hashPassword(password, { iterations = PBKDF2_ITERATIONS } = {}) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, iterations);
  return `pbkdf2$${iterations}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > PBKDF2_ITERATIONS) return false;
  let salt;
  let expected;
  try {
    salt = fromBase64Url(parts[2]);
    expected = fromBase64Url(parts[3]);
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length !== KEY_BYTES) return false;
  return timingSafeEqual(await derive(password, salt, iterations), expected);
}

/** Uniform pick via rejection sampling (no modulo bias). */
export function generateTemporaryPassword(length = 14) {
  const size = TEMP_PASSWORD_ALPHABET.length;
  const limit = 256 - (256 % size);
  const out = [];
  while (out.length < length) {
    for (const b of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (b < limit && out.length < length) out.push(TEMP_PASSWORD_ALPHABET[b % size]);
    }
  }
  return out.join('');
}

/** Spend the same PBKDF2 time when the email doesn't exist, so response
 * timing can't be used to discover which emails have accounts. */
let dummyHash = null;
export async function burnPasswordCheck(password) {
  dummyHash ??= hashPassword('timing-equaliser-not-a-real-password');
  await verifyPassword(String(password ?? ''), await dummyHash);
}
```

- [ ] **Step 5: Run the tests**

Run: `node --test tests/authPassword.test.js`
Expected: 9 passing.

- [ ] **Step 6: Commit**

```powershell
git add api/_shared.js worker/auth/password.js tests/authPassword.test.js
git commit -m "feat(auth): PBKDF2 password hashing and temporary passwords"
```

---

### Task 2: Session tokens and cookies

**Files:**
- Create: `worker/auth/session.js`
- Test: `tests/authSession.test.js`

**Interfaces:**
- Consumes: `toBase64Url` (Task 1).
- Produces:
  - `SESSION_COOKIE = '__Host-bacc_session'`, `SESSION_TTL_MS = 2592000000`, `RENEW_AFTER_MS = 86400000`
  - `newSessionToken(): string` (43 characters)
  - `hashToken(token): Promise<string>` (64 hex characters)
  - `sessionCookie(token): string`, `clearedSessionCookie(): string`
  - `readSessionCookie(request): string | null`

- [ ] **Step 1: Write the failing test** in `tests/authSession.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RENEW_AFTER_MS,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  clearedSessionCookie,
  hashToken,
  newSessionToken,
  readSessionCookie,
  sessionCookie,
} from '../worker/auth/session.js';

const req = (cookie) => new Request('https://bacc.visionforgestudio.app/api/auth/me', cookie ? { headers: { cookie } } : {});

test('constants match the spec', () => {
  assert.equal(SESSION_COOKIE, '__Host-bacc_session');
  assert.equal(SESSION_TTL_MS, 30 * 24 * 60 * 60 * 1000);
  assert.equal(RENEW_AFTER_MS, 24 * 60 * 60 * 1000);
});

test('tokens are 43-char base64url and unique', () => {
  const seen = new Set();
  for (let i = 0; i < 100; i += 1) {
    const t = newSessionToken();
    assert.match(t, /^[A-Za-z0-9_-]{43}$/);
    seen.add(t);
  }
  assert.equal(seen.size, 100);
});

test('hashToken is stable 64-char hex and differs per token', async () => {
  const t = newSessionToken();
  assert.match(await hashToken(t), /^[0-9a-f]{64}$/);
  assert.equal(await hashToken(t), await hashToken(t));
  assert.notEqual(await hashToken(t), await hashToken(newSessionToken()));
});

test('session cookie has exactly the spec attributes', () => {
  assert.equal(
    sessionCookie('abc'),
    '__Host-bacc_session=abc; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000',
  );
  assert.equal(
    clearedSessionCookie(),
    '__Host-bacc_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
  );
});

test('readSessionCookie finds the token among other cookies', () => {
  const t = newSessionToken();
  assert.equal(readSessionCookie(req(`a=1; __Host-bacc_session=${t}; b=2`)), t);
  assert.equal(readSessionCookie(req(`__Host-bacc_session=${t}`)), t);
});

test('readSessionCookie returns null for missing or malformed values', () => {
  assert.equal(readSessionCookie(req()), null);
  assert.equal(readSessionCookie(req('other=1')), null);
  assert.equal(readSessionCookie(req('__Host-bacc_session=')), null);
  assert.equal(readSessionCookie(req('__Host-bacc_session=short')), null);
  assert.equal(readSessionCookie(req(`__Host-bacc_session=${'a'.repeat(42)}!`)), null);
  assert.equal(readSessionCookie(req(`bacc_session=${newSessionToken()}`)), null);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test tests/authSession.test.js`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Create `worker/auth/session.js`**

```js
/**
 * Session tokens and the session cookie.
 *
 * The browser holds a random 256-bit token in an HttpOnly cookie; D1 holds
 * only its SHA-256, so a database leak yields no usable sessions. The
 * __Host- prefix pins the cookie to this exact host (no Domain attribute,
 * Secure, Path=/), so other visionforgestudio.app subdomains can't read or
 * plant it.
 */
import { toBase64Url } from './password.js';

export const SESSION_COOKIE = '__Host-bacc_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function newSessionToken() {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashToken(token) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`;
}

export function clearedSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function readSessionCookie(request) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== SESSION_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    return TOKEN_RE.test(value) ? value : null;
  }
  return null;
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/authSession.test.js`
Expected: 6 passing.

- [ ] **Step 5: Commit**

```powershell
git add worker/auth/session.js tests/authSession.test.js
git commit -m "feat(auth): session tokens and __Host- cookie"
```

---

### Task 3: Permission rules

**Files:**
- Create: `worker/auth/permissions.js`
- Test: `tests/authPermissions.test.js`

**Interfaces:**
- Produces:
  - `ROLES: string[]`, `DEPARTMENTS: string[]`
  - `canListUsers(actor): boolean`
  - `checkCreateUser(actor, { role })`, which throws `HttpError` 403
  - `checkUserUpdate(actor, target, patch, { activeAdminCount })`, which throws 403 or 409
  - `checkResetPassword(actor, target)`, which throws 400 or 403
  - `actor` and `target` are user objects with at least `{ id, role, is_active, can_login }` (booleans)

- [ ] **Step 1: Write the failing test** in `tests/authPermissions.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEPARTMENTS,
  ROLES,
  canListUsers,
  checkCreateUser,
  checkResetPassword,
  checkUserUpdate,
} from '../worker/auth/permissions.js';

const u = (id, role, extra = {}) => ({ id, role, is_active: true, can_login: true, ...extra });
const admin = u('a1', 'admin');
const admin2 = u('a2', 'admin');
const om = u('o1', 'om');
const inspector = u('i1', 'inspector');
const coo = u('c1', 'coo');
const is = (status) => (e) => e.status === status;

test('role and department lists match the spec', () => {
  assert.deepEqual(ROLES, ['inspector', 'om', 'coo', 'duty_manager', 'apron_supervisor', 'electrical_tech', 'sms', 'admin']);
  assert.deepEqual(DEPARTMENTS, ['Operations', 'Engineering', 'Maintenance']);
});

test('only admin and om can list users', () => {
  assert.equal(canListUsers(admin), true);
  assert.equal(canListUsers(om), true);
  assert.equal(canListUsers(coo), false);
  assert.equal(canListUsers(inspector), false);
  assert.equal(canListUsers(null), false);
});

test('create: admin/om may create non-admins; only admin may create admin', () => {
  checkCreateUser(admin, { role: 'inspector' });
  checkCreateUser(admin, { role: 'admin' });
  checkCreateUser(om, { role: 'duty_manager' });
  assert.throws(() => checkCreateUser(om, { role: 'admin' }), is(403));
  assert.throws(() => checkCreateUser(coo, { role: 'inspector' }), is(403));
  assert.throws(() => checkCreateUser(inspector, { role: 'inspector' }), is(403));
});

test('update: managers edit ordinary users', () => {
  checkUserUpdate(om, inspector, { role: 'duty_manager', is_active: false }, { activeAdminCount: 1 });
  checkUserUpdate(admin, om, { position: 'Ops lead' }, { activeAdminCount: 1 });
});

test('update: non-managers are refused', () => {
  assert.throws(() => checkUserUpdate(coo, inspector, { position: 'x' }, { activeAdminCount: 1 }), is(403));
});

test('update: om cannot touch an admin or promote to admin', () => {
  assert.throws(() => checkUserUpdate(om, admin, { position: 'x' }, { activeAdminCount: 2 }), is(403));
  assert.throws(() => checkUserUpdate(om, inspector, { role: 'admin' }, { activeAdminCount: 1 }), is(403));
  checkUserUpdate(admin, inspector, { role: 'admin' }, { activeAdminCount: 1 });
});

test('update: nobody changes their own role or access', () => {
  assert.throws(() => checkUserUpdate(admin, admin, { role: 'om' }, { activeAdminCount: 2 }), is(403));
  assert.throws(() => checkUserUpdate(om, om, { is_active: false }, { activeAdminCount: 1 }), is(403));
  assert.throws(() => checkUserUpdate(om, om, { can_login: false }, { activeAdminCount: 1 }), is(403));
  // Same values are not a change:
  checkUserUpdate(om, om, { role: 'om', is_active: true, full_name: 'New Name' }, { activeAdminCount: 1 });
});

test('update: the last active admin cannot be removed', () => {
  assert.throws(() => checkUserUpdate(admin, admin2, { is_active: false }, { activeAdminCount: 1 }), is(409));
  assert.throws(() => checkUserUpdate(admin, admin2, { role: 'om' }, { activeAdminCount: 1 }), is(409));
  assert.throws(() => checkUserUpdate(admin, admin2, { can_login: false }, { activeAdminCount: 1 }), is(409));
  checkUserUpdate(admin, admin2, { is_active: false }, { activeAdminCount: 2 });
});

test('reset password: managers only, never self, only admin resets an admin', () => {
  checkResetPassword(admin, om);
  checkResetPassword(om, inspector);
  checkResetPassword(admin, admin2);
  assert.throws(() => checkResetPassword(om, admin), is(403));
  assert.throws(() => checkResetPassword(coo, inspector), is(403));
  assert.throws(() => checkResetPassword(om, om), is(400));
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test tests/authPermissions.test.js`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Create `worker/auth/permissions.js`**

```js
/**
 * Who may manage whom. These replace the Supabase RLS policies and the
 * protect_profile_privileged_columns trigger for user management, as pure
 * functions so every rule is unit-tested in one place.
 */
import { HttpError } from '../../api/_shared.js';

export const ROLES = ['inspector', 'om', 'coo', 'duty_manager', 'apron_supervisor', 'electrical_tech', 'sms', 'admin'];
export const DEPARTMENTS = ['Operations', 'Engineering', 'Maintenance'];
const MANAGERS = new Set(['admin', 'om']);

function requireManager(actor) {
  if (!MANAGERS.has(actor?.role)) {
    throw new HttpError(403, 'Only an administrator or operations manager can manage users');
  }
}

const isActiveAdmin = (u) => u.role === 'admin' && Boolean(u.is_active) && Boolean(u.can_login);

export function canListUsers(actor) {
  return MANAGERS.has(actor?.role);
}

export function checkCreateUser(actor, { role }) {
  requireManager(actor);
  if (role === 'admin' && actor.role !== 'admin') {
    throw new HttpError(403, 'Only an administrator can create an administrator account');
  }
}

export function checkUserUpdate(actor, target, patch, { activeAdminCount }) {
  requireManager(actor);
  const changes = (key) => key in patch && patch[key] !== target[key];
  if (actor.id === target.id && (changes('role') || changes('is_active') || changes('can_login'))) {
    throw new HttpError(403, 'You cannot change your own role or access');
  }
  if (actor.role !== 'admin' && (target.role === 'admin' || patch.role === 'admin')) {
    throw new HttpError(403, 'Only an administrator can manage administrator accounts');
  }
  const after = { ...target, ...patch };
  if (isActiveAdmin(target) && !isActiveAdmin(after) && activeAdminCount <= 1) {
    throw new HttpError(409, 'At least one active administrator is required');
  }
}

export function checkResetPassword(actor, target) {
  requireManager(actor);
  if (actor.id === target.id) {
    throw new HttpError(400, 'Use Change password for your own account');
  }
  if (target.role === 'admin' && actor.role !== 'admin') {
    throw new HttpError(403, 'Only an administrator can reset an administrator password');
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/authPermissions.test.js`
Expected: 9 passing.

- [ ] **Step 5: Commit**

```powershell
git add worker/auth/permissions.js tests/authPermissions.test.js
git commit -m "feat(auth): user-management permission rules"
```

---

### Task 4: Auth store (D1 plus in-memory twin)

**Files:**
- Create: `worker/auth/store.js`

**Interfaces:**
- Produces: `createD1AuthStore(db)` and `createMemoryAuthStore()`. Both return the same interface (user objects use **booleans** for `is_active`, `can_login`, `is_approver` and `must_change_password`):
  - `findUserByEmail(email)`, `findUserById(id)`: user or `null`
  - `listUsers()`: users sorted by `full_name`
  - `countActiveAdmins()`: number
  - `insertUser(user)`, `updateUser(id, fields)`. Both throw an error whose message contains `UNIQUE constraint failed` on a duplicate email.
  - `insertSession(s)`, `findSession(id)`, `touchSession(id, { expires_at, last_seen_at })`, `deleteSession(id)`
  - `deleteUserSessions(userId, { exceptId? })`, `deleteExpiredSessions(nowIso, limit)`
- Produces: `isUniqueViolation(err): boolean`.

The memory store is exercised by Task 5's tests. The D1 store is exercised end-to-end in Task 8 against local D1.

- [ ] **Step 1: Create `worker/auth/store.js`**

```js
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
```

- [ ] **Step 2: Syntax check**

Run: `node -e "import('./worker/auth/store.js').then(m => console.log(Object.keys(m).join(',')))"`
Expected: `createD1AuthStore,createMemoryAuthStore,isUniqueViolation`. The order may differ.

- [ ] **Step 3: Commit**

```powershell
git add worker/auth/store.js
git commit -m "feat(auth): D1 auth store and in-memory test twin"
```

---

### Task 5: Auth service

**Files:**
- Create: `worker/auth/service.js`
- Test: `tests/authService.test.js`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `MAX_FAILED_LOGINS = 5`, `LOCKOUT_MS = 900000`, `GENERIC_LOGIN_ERROR`
  - `publicUser(u)`, which returns `{ id, email, full_name, position, role, department, is_active, is_approver, can_login, must_change_password, last_login_at, created_at }`
  - `createAuthService({ store, now = () => Date.now() })`, returning:
    - `login({ email, password, ip?, userAgent? })` → `{ user, token }`
    - `authenticateSession(token)` → `{ user, sessionId, renewed }`
    - `logout(sessionId)`
    - `changePassword({ userId, sessionId, current_password, new_password })` → `user`
    - `listUsers(actor)` → `user[]`
    - `createUser(actor, input)` → `{ user, temporary_password }`
    - `updateUser(actor, input)` → `user`
    - `resetPassword(actor, { id })` → `{ temporary_password }`

- [ ] **Step 1: Write the failing test** in `tests/authService.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GENERIC_LOGIN_ERROR, LOCKOUT_MS, createAuthService } from '../worker/auth/service.js';
import { createMemoryAuthStore } from '../worker/auth/store.js';
import { hashPassword } from '../worker/auth/password.js';
import { RENEW_AFTER_MS, SESSION_TTL_MS, hashToken } from '../worker/auth/session.js';

const T0 = Date.parse('2026-10-08T12:00:00Z');
const is = (status) => (e) => e.status === status;

async function setup() {
  const store = createMemoryAuthStore();
  let clock = T0;
  const svc = createAuthService({ store, now: () => clock });
  const advance = (ms) => { clock += ms; };
  const iso = new Date(T0).toISOString();
  await store.insertUser({
    id: 'admin-1', email: 'admin@bacc.bz', password_hash: await hashPassword('admin-password-1'),
    full_name: 'Ada Admin', position: 'Administrator', role: 'admin', department: null,
    is_active: true, can_login: true, is_approver: true, must_change_password: false,
    failed_login_count: 0, locked_until: null, last_login_at: null, created_at: iso, updated_at: iso,
  });
  const admin = (await svc.login({ email: 'admin@bacc.bz', password: 'admin-password-1' })).user;
  return { store, svc, advance, admin };
}

test('login succeeds case-insensitively and returns a public user + token', async () => {
  const { svc } = await setup();
  const { user, token } = await svc.login({ email: '  ADMIN@bacc.bz ', password: 'admin-password-1' });
  assert.equal(user.email, 'admin@bacc.bz');
  assert.equal('password_hash' in user, false);
  assert.equal('failed_login_count' in user, false);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
});

test('wrong password and unknown email give the same generic 401', async () => {
  const { svc } = await setup();
  await assert.rejects(svc.login({ email: 'admin@bacc.bz', password: 'nope-nope-nope' }), (e) => e.status === 401 && e.message === GENERIC_LOGIN_ERROR);
  await assert.rejects(svc.login({ email: 'ghost@bacc.bz', password: 'nope-nope-nope' }), (e) => e.status === 401 && e.message === GENERIC_LOGIN_ERROR);
  await assert.rejects(svc.login({ email: '', password: '' }), is(400));
});

test('5 failures lock for 15 minutes, even the right password; unlocks after', async () => {
  const { svc, advance } = await setup();
  for (let i = 0; i < 4; i += 1) {
    await assert.rejects(svc.login({ email: 'admin@bacc.bz', password: 'wrong-wrong-1' }), is(401));
  }
  await assert.rejects(svc.login({ email: 'admin@bacc.bz', password: 'wrong-wrong-1' }), (e) => e.status === 429 && /15 minutes/.test(e.message));
  await assert.rejects(svc.login({ email: 'admin@bacc.bz', password: 'admin-password-1' }), is(429));
  advance(LOCKOUT_MS + 1000);
  const ok = await svc.login({ email: 'admin@bacc.bz', password: 'admin-password-1' });
  assert.equal(ok.user.id, 'admin-1');
});

test('a success resets the failure counter', async () => {
  const { svc, store } = await setup();
  await assert.rejects(svc.login({ email: 'admin@bacc.bz', password: 'wrong-wrong-1' }), is(401));
  await svc.login({ email: 'admin@bacc.bz', password: 'admin-password-1' });
  assert.equal((await store.findUserById('admin-1')).failed_login_count, 0);
});

test('sessions authenticate, slide at most once per 24h, and expire', async () => {
  const { svc, store, advance } = await setup();
  const { token } = await svc.login({ email: 'admin@bacc.bz', password: 'admin-password-1' });
  const first = await svc.authenticateSession(token);
  assert.equal(first.user.id, 'admin-1');
  assert.equal(first.renewed, false);
  advance(RENEW_AFTER_MS - 1000);
  assert.equal((await svc.authenticateSession(token)).renewed, false);
  advance(2000);
  const renewed = await svc.authenticateSession(token);
  assert.equal(renewed.renewed, true);
  const row = await store.findSession(await hashToken(token));
  assert.equal(Date.parse(row.expires_at), T0 + RENEW_AFTER_MS + 1000 + SESSION_TTL_MS);
  advance(SESSION_TTL_MS + 1);
  await assert.rejects(svc.authenticateSession(token), is(401));
  assert.equal(await store.findSession(await hashToken(token)), null);
});

test('missing or unknown tokens are 401', async () => {
  const { svc } = await setup();
  await assert.rejects(svc.authenticateSession(null), is(401));
  await assert.rejects(svc.authenticateSession('A'.repeat(43)), is(401));
});

test('logout deletes the session', async () => {
  const { svc } = await setup();
  const { token } = await svc.login({ email: 'admin@bacc.bz', password: 'admin-password-1' });
  const { sessionId } = await svc.authenticateSession(token);
  await svc.logout(sessionId);
  await assert.rejects(svc.authenticateSession(token), is(401));
});

test('createUser: temp password, must_change flag, duplicate email 409', async () => {
  const { svc, admin } = await setup();
  const { user, temporary_password } = await svc.createUser(admin, { email: 'Om@Bacc.bz', full_name: 'Olu Ops', role: 'om', department: 'Operations' });
  assert.equal(user.email, 'om@bacc.bz');
  assert.equal(user.must_change_password, true);
  assert.equal(temporary_password.length, 14);
  const loggedIn = await svc.login({ email: 'om@bacc.bz', password: temporary_password });
  assert.equal(loggedIn.user.must_change_password, true);
  await assert.rejects(svc.createUser(admin, { email: 'om@bacc.bz', full_name: 'Dup' }), is(409));
  await assert.rejects(svc.createUser(admin, { email: 'bad', full_name: 'X' }), is(400));
  await assert.rejects(svc.createUser(admin, { email: 'x@bacc.bz', full_name: ' ' }), is(400));
  await assert.rejects(svc.createUser(admin, { email: 'x@bacc.bz', full_name: 'X', role: 'king' }), is(400));
  await assert.rejects(svc.createUser(admin, { email: 'x@bacc.bz', full_name: 'X', department: 'Finance' }), is(400));
});

test('om cannot create an admin', async () => {
  const { svc, admin } = await setup();
  const { temporary_password } = await svc.createUser(admin, { email: 'om@bacc.bz', full_name: 'Olu Ops', role: 'om' });
  const om = (await svc.login({ email: 'om@bacc.bz', password: temporary_password })).user;
  await assert.rejects(svc.createUser(om, { email: 'new@bacc.bz', full_name: 'New', role: 'admin' }), is(403));
});

test('changePassword: needs current, clears flag, keeps this session, kills others', async () => {
  const { svc, admin } = await setup();
  const { temporary_password } = await svc.createUser(admin, { email: 'om@bacc.bz', full_name: 'Olu Ops', role: 'om' });
  const a = await svc.login({ email: 'om@bacc.bz', password: temporary_password });
  const b = await svc.login({ email: 'om@bacc.bz', password: temporary_password });
  const sa = await svc.authenticateSession(a.token);
  await assert.rejects(svc.changePassword({ userId: a.user.id, sessionId: sa.sessionId, current_password: 'wrong-current', new_password: 'brand-new-pass-1' }), is(400));
  await assert.rejects(svc.changePassword({ userId: a.user.id, sessionId: sa.sessionId, current_password: temporary_password, new_password: 'short' }), is(400));
  await assert.rejects(svc.changePassword({ userId: a.user.id, sessionId: sa.sessionId, current_password: temporary_password, new_password: temporary_password }), is(400));
  const updated = await svc.changePassword({ userId: a.user.id, sessionId: sa.sessionId, current_password: temporary_password, new_password: 'brand-new-pass-1' });
  assert.equal(updated.must_change_password, false);
  assert.equal((await svc.authenticateSession(a.token)).user.id, a.user.id);
  await assert.rejects(svc.authenticateSession(b.token), is(401));
  await svc.login({ email: 'om@bacc.bz', password: 'brand-new-pass-1' });
});

test('deactivation kills sessions and blocks login', async () => {
  const { svc, admin } = await setup();
  const { user, temporary_password } = await svc.createUser(admin, { email: 'i@bacc.bz', full_name: 'Ivy Insp' });
  const s = await svc.login({ email: 'i@bacc.bz', password: temporary_password });
  await svc.updateUser(admin, { id: user.id, is_active: false });
  await assert.rejects(svc.authenticateSession(s.token), is(401));
  await assert.rejects(svc.login({ email: 'i@bacc.bz', password: temporary_password }), is(403));
});

test('resetPassword: new temp, flag set, lock cleared, sessions killed', async () => {
  const { svc, admin } = await setup();
  const { user, temporary_password } = await svc.createUser(admin, { email: 'i@bacc.bz', full_name: 'Ivy Insp' });
  const s = await svc.login({ email: 'i@bacc.bz', password: temporary_password });
  for (let i = 0; i < 5; i += 1) await svc.login({ email: 'i@bacc.bz', password: 'wrong-wrong-1' }).catch(() => {});
  const { temporary_password: next } = await svc.resetPassword(admin, { id: user.id });
  assert.notEqual(next, temporary_password);
  await assert.rejects(svc.authenticateSession(s.token), is(401));
  const again = await svc.login({ email: 'i@bacc.bz', password: next });
  assert.equal(again.user.must_change_password, true);
  await assert.rejects(svc.resetPassword(admin, { id: 'nope' }), is(404));
});

test('updateUser validates, 404s, and maps duplicate email to 409', async () => {
  const { svc, admin } = await setup();
  const one = (await svc.createUser(admin, { email: 'one@bacc.bz', full_name: 'One' })).user;
  await svc.createUser(admin, { email: 'two@bacc.bz', full_name: 'Two' });
  const renamed = await svc.updateUser(admin, { id: one.id, full_name: 'Uno', email: 'UNO@bacc.bz', department: 'Engineering' });
  assert.equal(renamed.full_name, 'Uno');
  assert.equal(renamed.email, 'uno@bacc.bz');
  await assert.rejects(svc.updateUser(admin, { id: one.id, email: 'two@bacc.bz' }), is(409));
  await assert.rejects(svc.updateUser(admin, { id: 'missing', full_name: 'X' }), is(404));
  await assert.rejects(svc.updateUser(admin, { id: one.id, role: 'king' }), is(400));
});

test('listUsers is managers-only and never leaks hashes', async () => {
  const { svc, admin } = await setup();
  const list = await svc.listUsers(admin);
  assert.equal(list.length, 1);
  assert.equal('password_hash' in list[0], false);
  await assert.rejects(svc.listUsers({ id: 'x', role: 'inspector' }), is(403));
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test tests/authService.test.js`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `worker/auth/service.js`.

- [ ] **Step 3: Create `worker/auth/service.js`**

```js
/**
 * Login business logic. No SQL (see store.js), no Request/Response (see
 * routes.js). `now` is injectable so lockout and sliding expiry are testable.
 */
import { HttpError } from '../../api/_shared.js';
import {
  assertPasswordLength,
  burnPasswordCheck,
  generateTemporaryPassword,
  hashPassword,
  verifyPassword,
} from './password.js';
import { RENEW_AFTER_MS, SESSION_TTL_MS, hashToken, newSessionToken } from './session.js';
import { DEPARTMENTS, ROLES, canListUsers, checkCreateUser, checkResetPassword, checkUserUpdate } from './permissions.js';
import { isUniqueViolation } from './store.js';

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;
export const GENERIC_LOGIN_ERROR = 'Email or password is incorrect';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    full_name: u.full_name,
    position: u.position ?? '',
    role: u.role,
    department: u.department ?? null,
    is_active: Boolean(u.is_active),
    is_approver: Boolean(u.is_approver),
    can_login: Boolean(u.can_login),
    must_change_password: Boolean(u.must_change_password),
    last_login_at: u.last_login_at ?? null,
    created_at: u.created_at,
  };
}

const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase();
const iso = (ms) => new Date(ms).toISOString();

function lockedError(remainingMs) {
  const minutes = Math.max(1, Math.ceil(remainingMs / 60000));
  return new HttpError(429, `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`, 'LOCKED');
}

function validEmail(value) {
  const email = normalizeEmail(value);
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'A valid email is required');
  return email;
}

function validDepartment(value) {
  const department = value ? String(value) : null;
  if (department !== null && !DEPARTMENTS.includes(department)) throw new HttpError(400, 'Unknown department');
  return department;
}

function validRole(value) {
  if (!ROLES.includes(value)) throw new HttpError(400, 'Unknown role');
  return value;
}

export function createAuthService({ store, now = () => Date.now() }) {
  async function requireUserById(id) {
    const user = await store.findUserById(String(id ?? ''));
    if (!user) throw new HttpError(404, 'No such user');
    return user;
  }

  return {
    async login({ email, password, ip = null, userAgent = null }) {
      const address = normalizeEmail(email);
      if (!address || typeof password !== 'string' || !password) {
        throw new HttpError(400, 'Email and password are required');
      }
      const user = await store.findUserByEmail(address);
      if (!user) {
        await burnPasswordCheck(password);
        throw new HttpError(401, GENERIC_LOGIN_ERROR);
      }
      const t = now();
      if (user.locked_until && Date.parse(user.locked_until) > t) {
        throw lockedError(Date.parse(user.locked_until) - t);
      }
      if (!(await verifyPassword(password, user.password_hash))) {
        const failures = (user.failed_login_count ?? 0) + 1;
        if (failures >= MAX_FAILED_LOGINS) {
          await store.updateUser(user.id, { failed_login_count: 0, locked_until: iso(t + LOCKOUT_MS), updated_at: iso(t) });
          throw lockedError(LOCKOUT_MS);
        }
        await store.updateUser(user.id, { failed_login_count: failures, updated_at: iso(t) });
        throw new HttpError(401, GENERIC_LOGIN_ERROR);
      }
      if (!user.is_active || !user.can_login) {
        throw new HttpError(403, 'This account is disabled. Contact an administrator.');
      }
      await store.updateUser(user.id, { failed_login_count: 0, locked_until: null, last_login_at: iso(t), updated_at: iso(t) });
      await store.deleteExpiredSessions(iso(t), 100);
      const token = newSessionToken();
      await store.insertSession({
        id: await hashToken(token),
        user_id: user.id,
        created_at: iso(t),
        expires_at: iso(t + SESSION_TTL_MS),
        last_seen_at: iso(t),
        ip,
        user_agent: userAgent ? String(userAgent).slice(0, 300) : null,
      });
      return { user: publicUser({ ...user, last_login_at: iso(t) }), token };
    },

    async authenticateSession(token) {
      if (!token) throw new HttpError(401, 'Not signed in');
      const id = await hashToken(token);
      const session = await store.findSession(id);
      if (!session) throw new HttpError(401, 'Not signed in');
      const t = now();
      if (Date.parse(session.expires_at) <= t) {
        await store.deleteSession(id);
        throw new HttpError(401, 'Session expired. Please sign in again.');
      }
      const user = await store.findUserById(session.user_id);
      if (!user || !user.is_active || !user.can_login) {
        await store.deleteSession(id);
        throw new HttpError(401, 'Not signed in');
      }
      let renewed = false;
      if (t - Date.parse(session.last_seen_at) >= RENEW_AFTER_MS) {
        await store.touchSession(id, { expires_at: iso(t + SESSION_TTL_MS), last_seen_at: iso(t) });
        renewed = true;
      }
      return { user: publicUser(user), sessionId: id, renewed };
    },

    async logout(sessionId) {
      if (sessionId) await store.deleteSession(sessionId);
    },

    async changePassword({ userId, sessionId, current_password, new_password }) {
      const user = await store.findUserById(String(userId ?? ''));
      if (!user) throw new HttpError(401, 'Not signed in');
      if (!(await verifyPassword(String(current_password ?? ''), user.password_hash))) {
        throw new HttpError(400, 'Current password is incorrect');
      }
      assertPasswordLength(new_password);
      if (new_password === current_password) {
        throw new HttpError(400, 'Choose a password different from your current one');
      }
      const t = now();
      await store.updateUser(user.id, {
        password_hash: await hashPassword(new_password),
        must_change_password: false,
        updated_at: iso(t),
      });
      await store.deleteUserSessions(user.id, { exceptId: sessionId });
      return publicUser({ ...user, must_change_password: false });
    },

    async listUsers(actor) {
      if (!canListUsers(actor)) throw new HttpError(403, 'Only an administrator or operations manager can manage users');
      return (await store.listUsers()).map(publicUser);
    },

    async createUser(actor, input = {}) {
      const email = validEmail(input.email);
      const full_name = String(input.full_name ?? '').trim();
      if (!full_name) throw new HttpError(400, 'Full name is required');
      const role = validRole(input.role ?? 'inspector');
      const department = validDepartment(input.department);
      checkCreateUser(actor, { role });
      const temporary_password = generateTemporaryPassword();
      const t = now();
      const user = {
        id: crypto.randomUUID(),
        email,
        password_hash: await hashPassword(temporary_password),
        full_name,
        position: String(input.position ?? '').trim(),
        role,
        department,
        is_active: true,
        can_login: true,
        is_approver: Boolean(input.is_approver),
        must_change_password: true,
        failed_login_count: 0,
        locked_until: null,
        last_login_at: null,
        created_at: iso(t),
        updated_at: iso(t),
      };
      try {
        await store.insertUser(user);
      } catch (err) {
        if (isUniqueViolation(err)) throw new HttpError(409, 'An account with that email already exists');
        throw err;
      }
      return { user: publicUser(user), temporary_password };
    },

    async updateUser(actor, input = {}) {
      const target = await requireUserById(input.id);
      const patch = {};
      if ('email' in input) patch.email = validEmail(input.email);
      if ('full_name' in input) {
        patch.full_name = String(input.full_name ?? '').trim();
        if (!patch.full_name) throw new HttpError(400, 'Full name is required');
      }
      if ('position' in input) patch.position = String(input.position ?? '').trim();
      if ('department' in input) patch.department = validDepartment(input.department);
      if ('role' in input) patch.role = validRole(input.role);
      for (const key of ['is_approver', 'is_active', 'can_login']) {
        if (key in input) patch[key] = Boolean(input[key]);
      }
      checkUserUpdate(actor, target, patch, { activeAdminCount: await store.countActiveAdmins() });
      try {
        await store.updateUser(target.id, { ...patch, updated_at: iso(now()) });
      } catch (err) {
        if (isUniqueViolation(err)) throw new HttpError(409, 'An account with that email already exists');
        throw err;
      }
      if (patch.is_active === false || patch.can_login === false) await store.deleteUserSessions(target.id);
      return publicUser({ ...target, ...patch });
    },

    async resetPassword(actor, { id } = {}) {
      const target = await requireUserById(id);
      checkResetPassword(actor, target);
      const temporary_password = generateTemporaryPassword();
      await store.updateUser(target.id, {
        password_hash: await hashPassword(temporary_password),
        must_change_password: true,
        failed_login_count: 0,
        locked_until: null,
        updated_at: iso(now()),
      });
      await store.deleteUserSessions(target.id);
      return { temporary_password };
    },
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/authService.test.js`
Expected: 14 passing. PBKDF2 makes this suite take several seconds.

- [ ] **Step 5: Commit**

```powershell
git add worker/auth/service.js tests/authService.test.js
git commit -m "feat(auth): login, sessions, lockout and user management service"
```

---

### Task 6: Extend the Worker HTTP wrapper

**Files:**
- Modify: `worker/http.js` (complete replacement below)
- Modify: `tests/workerHttp.test.js` (append the new tests)

**Interfaces:**
- Consumes: `HttpError` with `code` (Task 1).
- Produces: `createApiHandler({ routes, forms, authenticate })`. Route fields:
  - `methods?: string[]` (default `['POST']`)
  - `kind: 'pdf' | 'json' | 'response'`. A `response` build returns a `Response`.
  - `csrf?: boolean`, which makes non-GET requests require `Origin === request origin` and a JSON content type, else 403
  - `auth?: { mode?: 'public' | 'session' | 'either' | 'supabase', roles?, allowPasswordChangePending? }`. `public` skips `authenticate` (`ctx.user` is `null`). `DEV_SKIP_AUTH` never applies to `public` or `session`.
  - `limit?: number`
  - `build(body, { env, forms, user, request })`. GET gets `body = {}`.

  If the authenticate result has a `setCookie` string, it's appended as `Set-Cookie` to every response. Errors respond `{ error, code? }`. Security headers go on every response.

- [ ] **Step 1: Append the failing tests** to the end of `tests/workerHttp.test.js`

```js
// ── Sub-project 2 additions ────────────────────────────────────────────────
const extRoutes = {
  '/api/get-only': { kind: 'json', methods: ['GET'], build: async (body, ctx) => ({ body, hasRequest: ctx.request instanceof Request }) },
  '/api/public': { kind: 'json', auth: { mode: 'public' }, build: async (_b, ctx) => ({ user: ctx.user }) },
  '/api/session-only': { kind: 'json', auth: { mode: 'session' }, build: async (_b, ctx) => ({ role: ctx.user.profile.role }) },
  '/api/csrf': { kind: 'json', csrf: true, auth: { mode: 'public' }, build: async () => ({ ok: true }) },
  '/api/raw': {
    kind: 'response',
    auth: { mode: 'public' },
    build: async () => new Response(null, { status: 204, headers: { 'Set-Cookie': 'x=1' } }),
  },
  '/api/renew': { kind: 'json', build: async () => ({ ok: true }) },
  '/api/coded': { kind: 'json', build: async () => { throw new HttpError(403, 'Password change required', 'PASSWORD_CHANGE_REQUIRED'); } },
};
let extAuthCalls = 0;
const extHandle = createApiHandler({
  routes: extRoutes,
  forms: {},
  authenticate: async (request) => {
    extAuthCalls += 1;
    if (!request.headers.get('authorization')) throw new HttpError(401, 'Not signed in');
    return { user: { id: 'u1' }, profile: { id: 'u1', role: 'om' }, setCookie: 'renewed=1' };
  },
});
function extReq(path, { method = 'POST', body = '{}', auth = true, host = 'bacc.visionforgestudio.app', origin, contentType = 'application/json' } = {}) {
  const headers = new Headers({ 'cf-connecting-ip': `10.1.0.${++ipSeq}` });
  if (auth) headers.set('authorization', 'Bearer t');
  if (origin !== undefined) headers.set('origin', origin);
  if (contentType && method !== 'GET') headers.set('content-type', contentType);
  return new Request(`https://${host}${path}`, { method, headers, body: method === 'GET' ? undefined : body });
}

test('GET routes work, get an empty body and the request in ctx', async () => {
  const res = await extHandle(extReq('/api/get-only', { method: 'GET' }), {});
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { body: {}, hasRequest: true });
});

test('405 lists the route methods in Allow', async () => {
  const res = await extHandle(extReq('/api/get-only', { method: 'POST' }), {});
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'GET');
});

test('public routes never call authenticate', async () => {
  const before = extAuthCalls;
  const res = await extHandle(extReq('/api/public', { auth: false }), {});
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { user: null });
  assert.equal(extAuthCalls, before);
});

test('DEV_SKIP_AUTH does not bypass session-mode routes', async () => {
  const res = await extHandle(extReq('/api/session-only', { auth: false, host: 'localhost:5173' }), { DEV_SKIP_AUTH: '1' });
  assert.equal(res.status, 401);
});

test('csrf routes require same Origin and JSON', async () => {
  const origin = 'https://bacc.visionforgestudio.app';
  assert.equal((await extHandle(extReq('/api/csrf', { origin }), {})).status, 200);
  assert.equal((await extHandle(extReq('/api/csrf', { origin: 'https://evil.example' }), {})).status, 403);
  assert.equal((await extHandle(extReq('/api/csrf'), {})).status, 403);
  assert.equal((await extHandle(extReq('/api/csrf', { origin, contentType: 'text/plain' }), {})).status, 403);
});

test('response-kind routes keep status/headers and gain security headers', async () => {
  const res = await extHandle(extReq('/api/raw', { auth: false }), {});
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('set-cookie'), 'x=1');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
});

test('a renewal cookie from authenticate is appended to the response', async () => {
  const res = await extHandle(extReq('/api/renew'), {});
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('set-cookie'), 'renewed=1');
});

test('error codes are passed through to the body', async () => {
  const res = await extHandle(extReq('/api/coded'), {});
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: 'Password change required', code: 'PASSWORD_CHANGE_REQUIRED' });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `node --test tests/workerHttp.test.js`
Expected: the original 13 still pass, and the new tests FAIL. For example, "GET routes work" gets 405.

- [ ] **Step 3: Replace `worker/http.js`** with the complete file:

```js
/**
 * Request/response wrapper for the /api routes inside the Worker.
 *
 * Order: route → method → CSRF → body size → rate limit → auth → parse →
 * build. Every response carries the security headers (public/_headers only
 * covers static assets), and any session-renewal cookie from authenticate().
 */
import { HttpError, LIMITS, rateLimit } from '../api/_shared.js';

export const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.tile.openstreetmap.org; frame-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(self)',
};

const LOCAL_DEV_USER = { user: { id: 'local-dev' }, profile: { id: 'local-dev', role: 'admin' } };

function json(status, payload, extra = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });
}

function finalize(response, authCtx) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  if (authCtx?.setCookie) headers.append('Set-Cookie', authCtx.setCookie);
  return new Response(response.body, { status: response.status, headers });
}

/** Local `vite dev` in mock mode has no session to send. Never applies to
 * the D1 login routes (public/session), which must behave exactly as in prod. */
function isLocalDevBypass(request, env, route) {
  const mode = route.auth?.mode;
  if (mode === 'public' || mode === 'session') return false;
  if (env?.DEV_SKIP_AUTH !== '1') return false;
  const host = new URL(request.url).hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

export function createApiHandler({ routes, forms, authenticate }) {
  return async function handleApi(request, env) {
    const { pathname, origin } = new URL(request.url);
    const route = Object.prototype.hasOwnProperty.call(routes, pathname) ? routes[pathname] : null;
    if (!route) return finalize(json(404, { error: 'Not found' }));
    const methods = route.methods ?? ['POST'];
    if (!methods.includes(request.method)) {
      return finalize(json(405, { error: 'Method not allowed' }, { Allow: methods.join(', ') }));
    }

    let authCtx = null;
    try {
      if (route.csrf && request.method !== 'GET') {
        if (request.headers.get('origin') !== origin) throw new HttpError(403, 'Cross-site request blocked');
        const type = (request.headers.get('content-type') || '').toLowerCase();
        if (!type.includes('application/json')) throw new HttpError(403, 'Requests must be sent as JSON');
      }

      const declared = Number(request.headers.get('content-length') || 0);
      if (declared > LIMITS.bodyBytes) throw new HttpError(413, 'Request body too large');

      const ip = request.headers.get('cf-connecting-ip') || 'unknown';
      rateLimit(`${ip}:${pathname}`, { limit: route.limit ?? 20 });

      if (route.auth?.mode === 'public') authCtx = null;
      else if (isLocalDevBypass(request, env, route)) authCtx = LOCAL_DEV_USER;
      else authCtx = await authenticate(request, env, route.auth ?? {});

      let body = {};
      if (request.method !== 'GET') {
        const text = await request.text();
        // Chunked uploads have no Content-Length; check what actually arrived.
        if (text.length > LIMITS.bodyBytes) throw new HttpError(413, 'Request body too large');
        try {
          body = text ? JSON.parse(text) : {};
        } catch {
          throw new HttpError(400, 'Request body must be JSON');
        }
        if (body === null || typeof body !== 'object' || Array.isArray(body)) {
          throw new HttpError(400, 'Request body must be a JSON object');
        }
      }

      const result = await route.build(body, { env, forms, user: authCtx, request });

      if (route.kind === 'pdf') {
        return finalize(
          new Response(result.bytes, {
            status: 200,
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `attachment; filename="${result.filename}"`,
              'Cache-Control': 'no-store',
            },
          }),
          authCtx,
        );
      }
      if (route.kind === 'response') return finalize(result, authCtx);
      return finalize(json(200, result), authCtx);
    } catch (err) {
      const status = Number.isInteger(err?.status) ? err.status : 500;
      if (status >= 500) {
        console.error(
          JSON.stringify({ level: 'error', path: pathname, msg: err?.message || String(err), stack: err?.stack }),
        );
      }
      const payload = { error: err?.message || 'Request failed' };
      if (err?.code && typeof err.code === 'string') payload.code = err.code;
      return finalize(json(status, payload), authCtx);
    }
  };
}
```

- [ ] **Step 4: Run all tests**

Run: `node --test tests/workerHttp.test.js`
Expected: all of the original 13 plus the 8 new tests pass.

Run: `npm test`
Expected: 0 failed.

- [ ] **Step 5: Commit**

```powershell
git add worker/http.js tests/workerHttp.test.js
git commit -m "feat(worker): GET routes, CSRF guard, response routes, renewal cookie, error codes"
```

---

### Task 7: Authenticator, auth routes, Worker wiring

**Files:**
- Create: `worker/auth/authenticate.js`, `worker/auth/routes.js`
- Modify: `worker/index.js`
- Test: `tests/authAuthenticate.test.js`

**Interfaces:**
- Consumes: `createAuthService` (Task 5), `createD1AuthStore` (Task 4), `readSessionCookie` and `sessionCookie` (Task 2), `requireUser` (existing, Supabase).
- Produces:
  - `createAuthenticator({ serviceFor, supabaseAuth })`, which returns `authenticate(request, env, auth)`:
    - `public` → `null`
    - `session` → D1 session required
    - `either` (the default) → D1 when a session cookie is present, otherwise `supabaseAuth`
    - `supabase` → `supabaseAuth`
    - A D1 result is `{ user, profile, sessionId, setCookie? }`. It enforces `auth.roles`, and enforces `must_change_password` (403 `PASSWORD_CHANGE_REQUIRED`) unless `auth.allowPasswordChangePending`.
  - `authServiceFor(env)`, which throws 503 when `env.DB` is missing
  - `AUTH_ROUTES` for the 8 endpoints in the spec

- [ ] **Step 1: Write the failing test** in `tests/authAuthenticate.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthenticator } from '../worker/auth/authenticate.js';
import { createAuthService } from '../worker/auth/service.js';
import { createMemoryAuthStore } from '../worker/auth/store.js';
import { hashPassword } from '../worker/auth/password.js';
import { RENEW_AFTER_MS } from '../worker/auth/session.js';

const T0 = Date.parse('2026-10-08T12:00:00Z');
const is = (status) => (e) => e.status === status;

async function setup() {
  const store = createMemoryAuthStore();
  let clock = T0;
  const svc = createAuthService({ store, now: () => clock });
  const iso = new Date(T0).toISOString();
  for (const [id, email, role, mustChange] of [
    ['a1', 'admin@bacc.bz', 'admin', false],
    ['i1', 'insp@bacc.bz', 'inspector', false],
    ['n1', 'new@bacc.bz', 'inspector', true],
  ]) {
    await store.insertUser({
      id, email, password_hash: await hashPassword('password-1234'), full_name: id, position: '', role,
      department: null, is_active: true, can_login: true, is_approver: false, must_change_password: mustChange,
      failed_login_count: 0, locked_until: null, last_login_at: null, created_at: iso, updated_at: iso,
    });
  }
  const supabaseCalls = [];
  const authenticate = createAuthenticator({
    serviceFor: () => svc,
    supabaseAuth: async (_req, _env, auth) => {
      supabaseCalls.push(auth);
      return { user: { id: 'sb' }, profile: { id: 'sb', role: 'om' } };
    },
  });
  const cookieFor = async (email) => `__Host-bacc_session=${(await svc.login({ email, password: 'password-1234' })).token}`;
  const req = (cookie) => new Request('https://bacc.visionforgestudio.app/api/x', cookie ? { headers: { cookie } } : {});
  return { authenticate, cookieFor, req, supabaseCalls, advance: (ms) => { clock += ms; } };
}

test('public returns null', async () => {
  const { authenticate, req } = await setup();
  assert.equal(await authenticate(req(), {}, { mode: 'public' }), null);
});

test('session mode needs a valid cookie', async () => {
  const { authenticate, req, cookieFor } = await setup();
  await assert.rejects(authenticate(req(), {}, { mode: 'session' }), is(401));
  const ctx = await authenticate(req(await cookieFor('admin@bacc.bz')), {}, { mode: 'session' });
  assert.equal(ctx.user.role, 'admin');
  assert.equal(ctx.profile.role, 'admin');
  assert.match(ctx.sessionId, /^[0-9a-f]{64}$/);
  assert.equal(ctx.setCookie, undefined);
});

test('either mode uses D1 with a cookie, Supabase without', async () => {
  const { authenticate, req, cookieFor, supabaseCalls } = await setup();
  const viaD1 = await authenticate(req(await cookieFor('insp@bacc.bz')), {}, { roles: undefined });
  assert.equal(viaD1.user.id, 'i1');
  assert.equal(supabaseCalls.length, 0);
  const viaSupabase = await authenticate(req(), {}, { roles: ['om'] });
  assert.equal(viaSupabase.user.id, 'sb');
  assert.deepEqual(supabaseCalls, [{ roles: ['om'] }]);
});

test('supabase mode ignores a D1 cookie', async () => {
  const { authenticate, req, cookieFor, supabaseCalls } = await setup();
  const ctx = await authenticate(req(await cookieFor('admin@bacc.bz')), {}, { mode: 'supabase', roles: ['admin'] });
  assert.equal(ctx.user.id, 'sb');
  assert.equal(supabaseCalls.length, 1);
});

test('roles are enforced for D1 sessions', async () => {
  const { authenticate, req, cookieFor } = await setup();
  await assert.rejects(authenticate(req(await cookieFor('insp@bacc.bz')), {}, { mode: 'session', roles: ['admin', 'om'] }), is(403));
});

test('must_change_password blocks everything except allowed routes', async () => {
  const { authenticate, req, cookieFor } = await setup();
  const cookie = await cookieFor('new@bacc.bz');
  await assert.rejects(authenticate(req(cookie), {}, { mode: 'session' }), (e) => e.status === 403 && e.code === 'PASSWORD_CHANGE_REQUIRED');
  await assert.rejects(authenticate(req(cookie), {}, {}), (e) => e.code === 'PASSWORD_CHANGE_REQUIRED');
  const ok = await authenticate(req(cookie), {}, { mode: 'session', allowPasswordChangePending: true });
  assert.equal(ok.user.id, 'n1');
});

test('a sliding renewal returns a fresh cookie to send back', async () => {
  const { authenticate, req, cookieFor, advance } = await setup();
  const cookie = await cookieFor('admin@bacc.bz');
  advance(RENEW_AFTER_MS + 1);
  const ctx = await authenticate(req(cookie), {}, { mode: 'session' });
  assert.equal(ctx.setCookie, `${cookie}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test tests/authAuthenticate.test.js`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `worker/auth/authenticate.js`.

- [ ] **Step 3: Create `worker/auth/routes.js`**

```js
/**
 * The /api/auth/* and /api/users/* endpoints. Thin: validation and rules
 * live in service.js and permissions.js.
 */
import { HttpError } from '../../api/_shared.js';
import { clearedSessionCookie, sessionCookie } from './session.js';
import { createAuthService } from './service.js';
import { createD1AuthStore } from './store.js';

export function authServiceFor(env) {
  if (!env?.DB) throw new HttpError(503, 'Login database is not configured');
  return createAuthService({ store: createD1AuthStore(env.DB) });
}

function jsonResponse(status, payload, { setCookie } = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  if (setCookie) headers.append('Set-Cookie', setCookie);
  return new Response(status === 204 ? null : JSON.stringify(payload), { status, headers });
}

const SESSION_PENDING_OK = { mode: 'session', allowPasswordChangePending: true };
const MANAGERS_ONLY = { mode: 'session', roles: ['admin', 'om'] };

export const AUTH_ROUTES = {
  '/api/auth/login': {
    kind: 'response',
    csrf: true,
    auth: { mode: 'public' },
    limit: 20,
    build: async (body, { env, request }) => {
      const { user, token } = await authServiceFor(env).login({
        email: body.email,
        password: body.password,
        ip: request.headers.get('cf-connecting-ip'),
        userAgent: request.headers.get('user-agent'),
      });
      return jsonResponse(200, { user }, { setCookie: sessionCookie(token) });
    },
  },
  '/api/auth/logout': {
    kind: 'response',
    csrf: true,
    auth: SESSION_PENDING_OK,
    build: async (_body, { env, user: auth }) => {
      await authServiceFor(env).logout(auth.sessionId);
      return jsonResponse(204, null, { setCookie: clearedSessionCookie() });
    },
  },
  '/api/auth/me': {
    kind: 'json',
    methods: ['GET'],
    auth: SESSION_PENDING_OK,
    build: async (_body, { user: auth }) => ({ user: auth.user }),
  },
  '/api/auth/change-password': {
    kind: 'json',
    csrf: true,
    auth: SESSION_PENDING_OK,
    limit: 10,
    build: async (body, { env, user: auth }) => ({
      user: await authServiceFor(env).changePassword({
        userId: auth.user.id,
        sessionId: auth.sessionId,
        current_password: body.current_password,
        new_password: body.new_password,
      }),
    }),
  },
  '/api/users': {
    kind: 'json',
    methods: ['GET'],
    auth: MANAGERS_ONLY,
    build: async (_body, { env, user: auth }) => ({ users: await authServiceFor(env).listUsers(auth.user) }),
  },
  '/api/users/create': {
    kind: 'response',
    csrf: true,
    auth: MANAGERS_ONLY,
    limit: 30,
    build: async (body, { env, user: auth }) => jsonResponse(201, await authServiceFor(env).createUser(auth.user, body)),
  },
  '/api/users/update': {
    kind: 'json',
    csrf: true,
    auth: MANAGERS_ONLY,
    limit: 60,
    build: async (body, { env, user: auth }) => ({ user: await authServiceFor(env).updateUser(auth.user, body) }),
  },
  '/api/users/reset-password': {
    kind: 'json',
    csrf: true,
    auth: MANAGERS_ONLY,
    limit: 30,
    build: async (body, { env, user: auth }) => authServiceFor(env).resetPassword(auth.user, { id: body.id }),
  },
};
```

- [ ] **Step 4: Create `worker/auth/authenticate.js`**

```js
/**
 * One authenticate() for every /api route.
 *
 * Until sub-project 3, production users still hold Supabase sessions, so the
 * existing export/instance routes run in mode 'either': a D1 session cookie
 * wins when present, otherwise the Supabase bearer token is checked exactly
 * as before. Sub-project 3 removes the Supabase branch.
 */
import { HttpError, requireUser } from '../../api/_shared.js';
import { authServiceFor } from './routes.js';
import { readSessionCookie, sessionCookie } from './session.js';

export function createAuthenticator({ serviceFor = authServiceFor, supabaseAuth = requireUser } = {}) {
  return async function authenticate(request, env, auth = {}) {
    const mode = auth.mode ?? 'either';
    if (mode === 'public') return null;
    if (mode === 'supabase') return supabaseAuth(request, env, auth);

    const token = readSessionCookie(request);
    if (mode === 'session' || token) {
      const { user, sessionId, renewed } = await serviceFor(env).authenticateSession(token);
      if (auth.roles?.length && !auth.roles.includes(user.role)) {
        throw new HttpError(403, 'Forbidden for this role');
      }
      if (user.must_change_password && !auth.allowPasswordChangePending) {
        throw new HttpError(403, 'Password change required', 'PASSWORD_CHANGE_REQUIRED');
      }
      return { user, profile: user, sessionId, setCookie: renewed ? sessionCookie(token) : undefined };
    }
    return supabaseAuth(request, env, auth);
  };
}
```

- [ ] **Step 5: Wire it into `worker/index.js`**

Replace the import line

```js
import { requireUser } from '../api/_shared.js';
```

with

```js
import { createAuthenticator } from './auth/authenticate.js';
import { AUTH_ROUTES } from './auth/routes.js';
```

In `ROUTES`, change the `/api/create-user` entry's `auth` so it stays Supabase-only:

```js
    auth: { mode: 'supabase', roles: ['admin', 'om'] },
```

After the closing `};` of `ROUTES`, add:

```js
Object.assign(ROUTES, AUTH_ROUTES);
```

and replace

```js
const handleApi = createApiHandler({ routes: ROUTES, forms: formStore, authenticate: requireUser });
```

with

```js
const handleApi = createApiHandler({ routes: ROUTES, forms: formStore, authenticate: createAuthenticator() });
```

The export routes and `generate-checklist-instances` keep their existing `auth` (no `mode`), so they default to `either`.

- [ ] **Step 6: Run the tests**

Run: `node --test tests/authAuthenticate.test.js`
Expected: 7 passing.

Run: `npm test`
Expected: 0 failed.

- [ ] **Step 7: Commit**

```powershell
git add worker/auth/authenticate.js worker/auth/routes.js worker/index.js tests/authAuthenticate.test.js
git commit -m "feat(auth): auth endpoints and D1-or-Supabase authenticator"
```

---

### Task 8: Admin bootstrap and end-to-end smoke (local D1)

**Files:**
- Create: `scripts/auth-create-admin.mjs`, `scripts/auth-smoke.mjs`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: `hashPassword` and `assertPasswordLength` (Task 1). All endpoints (Task 7).
- Produces: `npm run auth:create-admin -- --email <e> --name "<n>" [--position "<p>"] [--remote]`, and `npm run auth:smoke -- [--url <base>]`. The smoke script needs `SMOKE_ADMIN_EMAIL` and `SMOKE_ADMIN_PASSWORD` in the environment.

- [ ] **Step 1: Create `scripts/auth-create-admin.mjs`**

```js
/**
 * Bootstrap the first administrator in D1.
 *
 *   npm run auth:create-admin -- --email you@example.com --name "Your Name" [--position "Administrator"] [--remote]
 *
 * Prompts for the password (hidden, twice) so it never lands in shell
 * history. Hashes locally with the same code the Worker uses, writes a
 * one-off SQL file to the OS temp folder, runs `wrangler d1 execute`, then
 * deletes the file. Without --remote it targets the local dev database.
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assertPasswordLength, hashPassword } from '../worker/auth/password.js';

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const email = String(arg('--email') ?? '').trim().toLowerCase();
const name = String(arg('--name') ?? '').trim();
const position = String(arg('--position') ?? 'Administrator').trim();
const remote = args.includes('--remote');

if (!/^[^\s@'"]+@[^\s@'"]+\.[^\s@'"]+$/.test(email) || !name) {
  console.error('Usage: npm run auth:create-admin -- --email you@example.com --name "Your Name" [--remote]');
  process.exit(1);
}

/** Read a line with echo off (prints * per character). Raw-mode stdin, so it
 * works the same in PowerShell, cmd and bash, without readline internals. */
function askHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      console.error('Run this in an interactive terminal (it needs to read the password privately).');
      process.exit(1);
    }
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    let value = '';
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          stdin.setRawMode(false);
          process.stdout.write('\n');
          process.exit(130);
        }
        if (ch === '\u007f' || ch === '\b') {
          if (value.length) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        value += ch;
        process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

const password = await askHidden(`Password for ${email}: `);
const again = await askHidden('Repeat password: ');
if (password !== again) {
  console.error('Passwords do not match.');
  process.exit(1);
}
try {
  assertPasswordLength(password);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const q = (value) => `'${String(value).replace(/'/g, "''")}'`;
const now = new Date().toISOString();
const sql =
  'INSERT INTO users (id, email, password_hash, full_name, position, role, department, is_active, can_login, ' +
  'is_approver, must_change_password, failed_login_count, locked_until, last_login_at, created_at, updated_at) VALUES (' +
  [q(crypto.randomUUID()), q(email), q(await hashPassword(password)), q(name), q(position), "'admin'", 'NULL',
    '1', '1', '1', '0', '0', 'NULL', 'NULL', q(now), q(now)].join(', ') +
  ');\n';

const dir = mkdtempSync(path.join(tmpdir(), 'bacc-admin-'));
const file = path.join(dir, 'create-admin.sql');
try {
  writeFileSync(file, sql);
  execSync(`npx wrangler d1 execute bacc-portal-db ${remote ? '--remote' : '--local'} --file "${file}"`, { stdio: 'inherit' });
  console.log(`\nAdmin ${email} created in ${remote ? 'PRODUCTION' : 'local'} D1.`);
} catch {
  console.error(`\nCould not create the admin. If the error says UNIQUE constraint failed, ${email} already exists.`);
  process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
```

- [ ] **Step 2: Create `scripts/auth-smoke.mjs`**

```js
/**
 * End-to-end check of the Cloudflare login against a running Worker.
 *
 *   $env:SMOKE_ADMIN_EMAIL="you@example.com"; $env:SMOKE_ADMIN_PASSWORD="..."
 *   npm run auth:smoke                                         # local (npm run dev)
 *   npm run auth:smoke -- --url https://bacc.visionforgestudio.app   # production
 *
 * Creates throwaway users named smoke-*@example.invalid and deactivates them
 * at the end. Exits 1 if any check fails.
 */
const args = process.argv.slice(2);
const urlArg = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://localhost:5173';
const base = new URL(urlArg);
const ORIGIN = base.origin;
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD first.');
  process.exit(1);
}

let failures = 0;
function check(condition, label, detail) {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${label}${!condition && detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  if (!condition) failures += 1;
}

async function call(path, { method = 'POST', body, cookie, origin = ORIGIN } = {}) {
  const headers = {};
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    if (origin) headers.Origin = origin;
  }
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(new URL(path, base), {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    redirect: 'manual',
  });
  const setCookies = res.headers.getSetCookie?.() ?? [];
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, data, setCookies };
}

const sessionPair = (setCookies) =>
  setCookies.find((c) => c.startsWith('__Host-bacc_session='))?.split(';')[0] ?? null;

async function login(email, password) {
  const r = await call('/api/auth/login', { body: { email, password } });
  return { ...r, cookie: sessionPair(r.setCookies) };
}

const stamp = Date.now();
const omEmail = `smoke-om-${stamp}@example.invalid`;
const inspEmail = `smoke-insp-${stamp}@example.invalid`;
const omNewPassword = `Smoke-${stamp}-Pw!`;

// 1. CSRF
check((await call('/api/auth/login', { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, origin: 'https://evil.example' })).status === 403, 'login from another origin is blocked (403)');

// 2. Admin login + cookie attributes
const admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
check(admin.status === 200 && admin.cookie, 'admin login 200 with session cookie', admin.status);
const rawCookie = admin.setCookies.find((c) => c.startsWith('__Host-bacc_session=')) ?? '';
for (const attr of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=2592000']) {
  check(rawCookie.includes(attr), `session cookie has ${attr}`);
}
check((await call('/api/auth/me', { method: 'GET', cookie: admin.cookie })).data?.user?.role === 'admin', '/me returns the admin');
check((await call('/api/users', { method: 'GET' })).status === 401, '/api/users without a cookie is 401');

// 3. Create an OM
const omCreate = await call('/api/users/create', { cookie: admin.cookie, body: { email: omEmail, full_name: 'Smoke OM', role: 'om', department: 'Operations' } });
check(omCreate.status === 201 && omCreate.data?.temporary_password?.length === 14, 'admin creates an OM (201 + 14-char temp password)', omCreate.status);
const omId = omCreate.data?.user?.id;

// 4. OM must change password first
let om = await login(omEmail, omCreate.data?.temporary_password);
check(om.status === 200 && om.data?.user?.must_change_password === true, 'OM temp login flags must_change_password');
const blocked = await call('/api/users', { method: 'GET', cookie: om.cookie });
check(blocked.status === 403 && blocked.data?.code === 'PASSWORD_CHANGE_REQUIRED', 'OM is blocked until the password changes');
check((await call('/api/auth/change-password', { cookie: om.cookie, body: { current_password: 'wrong-current-pw', new_password: omNewPassword } })).status === 400, 'wrong current password is rejected (400)');
const changed = await call('/api/auth/change-password', { cookie: om.cookie, body: { current_password: omCreate.data?.temporary_password, new_password: omNewPassword } });
check(changed.status === 200 && changed.data?.user?.must_change_password === false, 'OM changes password');
check((await call('/api/users', { method: 'GET', cookie: om.cookie })).status === 200, 'OM can now list users');

// 5. OM cannot create an admin, can create an inspector
check((await call('/api/users/create', { cookie: om.cookie, body: { email: `smoke-x-${stamp}@example.invalid`, full_name: 'Nope', role: 'admin' } })).status === 403, 'OM cannot create an admin (403)');
const inspCreate = await call('/api/users/create', { cookie: om.cookie, body: { email: inspEmail, full_name: 'Smoke Inspector', role: 'inspector' } });
check(inspCreate.status === 201, 'OM creates an inspector (201)', inspCreate.status);
const inspId = inspCreate.data?.user?.id;

// 6. Lockout
const wrong = [];
for (let i = 0; i < 5; i += 1) wrong.push((await login(inspEmail, 'definitely-wrong-pw')).status);
check(JSON.stringify(wrong) === JSON.stringify([401, 401, 401, 401, 429]), '5 wrong passwords: 401 x4 then 429', wrong);
check((await login(inspEmail, inspCreate.data?.temporary_password)).status === 429, 'locked account refuses even the right password');

// 7. Reset clears the lock; deactivation kills the session
const reset = await call('/api/users/reset-password', { cookie: admin.cookie, body: { id: inspId } });
check(reset.status === 200 && reset.data?.temporary_password, 'admin resets the inspector password');
const insp = await login(inspEmail, reset.data?.temporary_password);
check(insp.status === 200, 'inspector signs in with the new temp password (lock cleared)', insp.status);
check((await call('/api/users/update', { cookie: admin.cookie, body: { id: inspId, is_active: false } })).status === 200, 'admin deactivates the inspector');
check((await call('/api/auth/me', { method: 'GET', cookie: insp.cookie })).status === 401, "deactivated inspector's session is dead (401)");
check((await login(inspEmail, reset.data?.temporary_password)).status === 403, 'deactivated inspector cannot sign in (403)');

// 8. Reset kills the OM's existing session
check((await call('/api/users/reset-password', { cookie: admin.cookie, body: { id: omId } })).status === 200, 'admin resets the OM password');
check((await call('/api/auth/me', { method: 'GET', cookie: om.cookie })).status === 401, "OM's old session is dead after reset (401)");

// 9. Logout
const out = await call('/api/auth/logout', { cookie: admin.cookie });
check(out.status === 204 && out.setCookies.some((c) => c.includes('Max-Age=0')), 'logout 204 clears the cookie');
check((await call('/api/auth/me', { method: 'GET', cookie: admin.cookie })).status === 401, '/me after logout is 401');

// Cleanup: deactivate the smoke OM (inspector already deactivated)
const admin2 = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
check((await call('/api/users/update', { cookie: admin2.cookie, body: { id: omId, is_active: false } })).status === 200, 'cleanup: smoke OM deactivated');
await call('/api/auth/logout', { cookie: admin2.cookie });

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 3: Add the npm scripts**

In `package.json` `"scripts"`, add:

```json
    "auth:create-admin": "node scripts/auth-create-admin.mjs",
    "auth:smoke": "node scripts/auth-smoke.mjs",
```

- [ ] **Step 4: Bootstrap a LOCAL admin**

**This needs the user at the keyboard,** because the password prompt is interactive. Ask them to run:

```powershell
npm run auth:create-admin -- --email admin@local.test --name "Local Admin"
```

Expected: Wrangler reports 1 row written, then `Admin admin@local.test created in local D1.`

- [ ] **Step 5: Run the smoke against local**

Terminal 1: `npm run dev`. Wait for Vite to report it's ready.

Terminal 2 (the user types the password they just chose):

```powershell
$env:SMOKE_ADMIN_EMAIL="admin@local.test"; $env:SMOKE_ADMIN_PASSWORD="<the local admin password>"
npm run auth:smoke
```

Expected: every line is `ok`, ending with `All checks passed`, exit code 0.

**Any FAIL blocks this task. Fix it before going on.** Note: Chrome treats `http://localhost` as secure, so `__Host-`/`Secure` cookies work in the browser locally. The Node smoke sends cookies manually, so it doesn't depend on that.

- [ ] **Step 6: Commit**

```powershell
git add scripts/auth-create-admin.mjs scripts/auth-smoke.mjs package.json
git commit -m "feat(auth): admin bootstrap script and end-to-end smoke test"
```

---

### Task 9: Browser: d1 auth mode

**Files:**
- Create: `src/lib/authMode.js`, `src/lib/authClient.js`, `src/hooks/useD1Users.js`, `src/components/auth/ForcePasswordChange.jsx`
- Modify: `src/context/AuthContext.jsx`, `src/components/layout/AppShell.jsx`, `src/components/settings/OtherSections.jsx`, `src/components/settings/UsersRolesSection.jsx`, `src/lib/apiFetch.js`
- Test: `tests/authClient.test.js`

**Interfaces:**
- Consumes: the endpoints from Task 7.
- Produces:
  - `isD1Auth(): boolean`, true when `import.meta.env.VITE_DATA_SOURCE === 'd1'`
  - `authClient`:
    - `login(email, password)` → user
    - `logout()`
    - `me()` → user, or `null` on 401
    - `changePassword(current, next)` → user
  - `usersAdminClient`:
    - `list()` → users
    - `create(input)` → `{ user, temporary_password }`
    - `update(input)` → user
    - `resetPassword(id)` → temp password string
  - Errors from both clients are `Error` objects with `.status` and `.code`.
  - `useAuth()` gains `mustChangePassword: boolean` and `authMode: 'mock' | 'supabase' | 'd1'`. `changePassword(newPassword, currentPassword?)` takes a second argument, which is required in d1 mode.

- [ ] **Step 1: Write the failing test** in `tests/authClient.test.js`

```js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { authClient, usersAdminClient } from '../src/lib/authClient.js';

let calls;
function mockFetch(responses) {
  calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, ...init });
    const { status = 200, body } = responses.shift();
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
}
beforeEach(() => { calls = []; });

test('login posts JSON same-origin and returns the user', async () => {
  mockFetch([{ body: { user: { id: 'u1' } } }]);
  assert.deepEqual(await authClient.login('a@b.bz', 'pw-1234567'), { id: 'u1' });
  assert.equal(calls[0].url, '/api/auth/login');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].credentials, 'same-origin');
  assert.equal(calls[0].headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].body), { email: 'a@b.bz', password: 'pw-1234567' });
});

test('errors carry status, code and the server message', async () => {
  mockFetch([{ status: 429, body: { error: 'Too many attempts. Try again in 15 minutes.', code: 'LOCKED' } }]);
  await assert.rejects(authClient.login('a@b.bz', 'x'), (e) => e.status === 429 && e.code === 'LOCKED' && e.message.startsWith('Too many'));
});

test('me returns null on 401 and the user otherwise', async () => {
  mockFetch([{ status: 401, body: { error: 'Not signed in' } }, { body: { user: { id: 'u2' } } }]);
  assert.equal(await authClient.me(), null);
  assert.deepEqual(await authClient.me(), { id: 'u2' });
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].body, undefined);
});

test('logout tolerates 204', async () => {
  mockFetch([{ status: 204 }]);
  await authClient.logout();
  assert.equal(calls[0].url, '/api/auth/logout');
});

test('changePassword sends current and new', async () => {
  mockFetch([{ body: { user: { id: 'u1', must_change_password: false } } }]);
  const user = await authClient.changePassword('old-password-1', 'new-password-1');
  assert.equal(user.must_change_password, false);
  assert.deepEqual(JSON.parse(calls[0].body), { current_password: 'old-password-1', new_password: 'new-password-1' });
});

test('users admin client hits the right endpoints', async () => {
  mockFetch([
    { body: { users: [{ id: 'a' }] } },
    { status: 201, body: { user: { id: 'n' }, temporary_password: 'Temp' } },
    { body: { user: { id: 'n', role: 'om' } } },
    { body: { temporary_password: 'Next' } },
  ]);
  assert.deepEqual(await usersAdminClient.list(), [{ id: 'a' }]);
  assert.deepEqual(await usersAdminClient.create({ email: 'n@b.bz' }), { user: { id: 'n' }, temporary_password: 'Temp' });
  assert.deepEqual(await usersAdminClient.update({ id: 'n', role: 'om' }), { id: 'n', role: 'om' });
  assert.equal(await usersAdminClient.resetPassword('n'), 'Next');
  assert.deepEqual(calls.map((c) => [c.method, c.url]), [
    ['GET', '/api/users'],
    ['POST', '/api/users/create'],
    ['POST', '/api/users/update'],
    ['POST', '/api/users/reset-password'],
  ]);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test tests/authClient.test.js`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Create `src/lib/authClient.js`**

```js
/**
 * Browser client for the Cloudflare login (VITE_DATA_SOURCE=d1).
 * Same-origin fetch: the HttpOnly session cookie travels automatically and
 * is never visible to page scripts.
 */
async function call(path, { method = 'POST', body } = {}) {
  const init = { method, credentials: 'same-origin' };
  if (method !== 'GET') {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body ?? {});
  }
  const res = await fetch(path, init);
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data?.code;
    throw err;
  }
  return data;
}

export const authClient = {
  login: async (email, password) => (await call('/api/auth/login', { body: { email, password } })).user,
  logout: async () => {
    await call('/api/auth/logout');
  },
  me: async () => {
    try {
      return (await call('/api/auth/me', { method: 'GET' })).user;
    } catch (err) {
      if (err.status === 401) return null;
      throw err;
    }
  },
  changePassword: async (current_password, new_password) =>
    (await call('/api/auth/change-password', { body: { current_password, new_password } })).user,
};

export const usersAdminClient = {
  list: async () => (await call('/api/users', { method: 'GET' })).users,
  create: async (input) => call('/api/users/create', { body: input }),
  update: async (input) => (await call('/api/users/update', { body: input })).user,
  resetPassword: async (id) => (await call('/api/users/reset-password', { body: { id } })).temporary_password,
};
```

- [ ] **Step 4: Run the client tests**

Run: `node --test tests/authClient.test.js`
Expected: 6 passing.

- [ ] **Step 5: Create `src/lib/authMode.js`**

```js
/**
 * True when the portal uses the Cloudflare (D1) login.
 * In sub-project 2 this pairs D1 login with mock data — getDataSource()
 * still maps anything but 'supabase' to the mock repositories.
 */
export function isD1Auth() {
  return (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DATA_SOURCE) === 'd1';
}
```

- [ ] **Step 6: Create `src/hooks/useD1Users.js`**

```js
import { useCallback, useEffect, useState } from 'react';
import { usersAdminClient } from '../lib/authClient.js';

/** Users & roles data in d1 mode — same shape as useUsers() where it overlaps. */
export function useD1Users() {
  const [rows, setRows] = useState([]);
  const reload = useCallback(async () => {
    setRows(await usersAdminClient.list());
  }, []);
  useEffect(() => {
    reload().catch(() => setRows([]));
  }, [reload]);
  return {
    rows,
    reload,
    persist: (patch) => usersAdminClient.update(patch),
    setActive: (id, active) => usersAdminClient.update({ id, is_active: active, can_login: active }),
  };
}
```

- [ ] **Step 7: Create `src/components/auth/ForcePasswordChange.jsx`**

```jsx
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';

/**
 * Shown instead of the whole app after signing in with a temporary password.
 * The server refuses every other route until this succeeds.
 */
export default function ForcePasswordChange() {
  const { changePassword, signOut, displayName } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setError(null);
    if (next.length < 10) return setError('Use at least 10 characters.');
    if (next !== confirm) return setError("Those two don't match.");
    setBusy(true);
    try {
      await changePassword(next, current);
    } catch (err) {
      setError(err.message || 'Could not change your password.');
    } finally {
      setBusy(false);
    }
  }

  const input =
    'min-h-11 w-full rounded border border-line/20 bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary desk:min-h-10';

  return (
    <div className="flex min-h-dvh items-center justify-center bg-stripe px-4 py-10">
      <form onSubmit={submit} className="w-full max-w-sm space-y-3 rounded-lg border border-line/12 bg-surface p-6 shadow-card">
        <h1 className="text-lg font-bold text-ink">Choose your password</h1>
        <p className="text-sm text-muted">
          Welcome, {displayName}. You signed in with a temporary password. Set your own before continuing.
        </p>
        <input type="password" autoComplete="current-password" placeholder="Temporary password" value={current} onChange={(e) => setCurrent(e.target.value)} className={input} required />
        <input type="password" autoComplete="new-password" placeholder="New password (10+ characters)" value={next} onChange={(e) => setNext(e.target.value)} className={input} required />
        <input type="password" autoComplete="new-password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} required />
        {error && <p className="text-sm text-alert">{error}</p>}
        <button type="submit" disabled={busy} className="min-h-11 w-full rounded-md bg-navy px-3 text-sm font-semibold text-white disabled:opacity-50 desk:min-h-10">
          {busy ? 'Saving…' : 'Set password and continue'}
        </button>
        <button type="button" onClick={() => signOut()} className="min-h-11 w-full rounded-md border border-line/20 px-3 text-sm font-medium text-muted desk:min-h-10">
          Sign out
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 8: Add the d1 branch to `src/context/AuthContext.jsx`.** Make these exact edits.

(a) Below the existing imports, add:

```js
import { authClient } from '../lib/authClient.js';
import { isD1Auth } from '../lib/authMode.js';
```

(b) Replace `  const live = isLiveSupabase();` with:

```js
  const live = isLiveSupabase();
  const d1 = isD1Auth();
```

(c) In `load()`, directly after `    async function load() {`, insert:

```js
      if (d1) {
        // Cloudflare login: the HttpOnly cookie is the session; ask who we are.
        const me = await authClient.me().catch(() => null);
        if (cancelled) return;
        setDemoUsers([]);
        if (me) {
          setSession({ user: toSessionUser(me) });
          setProfile(me);
        }
        setLoading(false);
        return;
      }
```

(d) Change the effect dependency array `  }, [live]);` (the one closing the `useEffect` that defines `load`) to `  }, [live, d1]);`.

(e) In `signIn`, directly after `      setError(null);`, insert:

```js
      if (d1) {
        try {
          const me = await authClient.login(email, password);
          setSession({ user: toSessionUser(me) });
          setProfile(me);
          return { user: toSessionUser(me) };
        } catch (err) {
          setError(err.message);
          throw err;
        }
      }
```

(f) In `signOut`, directly after `    async function signOut() {`, insert:

```js
      if (d1) {
        await authClient.logout().catch(() => {});
        setSession(null);
        setProfile(null);
        return;
      }
```

(g) In `updateProfile`, directly after `      if (!user) return;`, insert:

```js
      if (d1) {
        // Self-service profile saving moves to D1 with the data API (sub-project 3).
        throw new Error('Saving your profile is not available yet on the new login.');
      }
```

(h) Replace the whole `changePassword` function with:

```js
    async function changePassword(newPassword, currentPassword) {
      if (d1) {
        const me = await authClient.changePassword(currentPassword ?? '', newPassword);
        setProfile(me);
        setSession({ user: toSessionUser(me) });
        return;
      }
      if (!live || !supabase) {
        throw new Error('Password changes need the portal connected to Supabase.');
      }
      const { error: pwError } = await supabase.auth.updateUser({ password: newPassword });
      if (pwError) throw pwError;
    }
```

(i) In `changeEmail`, directly after `    async function changeEmail(newEmail) {`, insert:

```js
      if (d1) {
        throw new Error('To change your sign-in email, ask an administrator.');
      }
```

(j) In the returned object, replace `      configured: live,` with:

```js
      configured: live || d1,
      authMode: d1 ? 'd1' : live ? 'supabase' : 'mock',
      mustChangePassword: Boolean(d1 && profile?.must_change_password),
```

(k) Change the `useMemo` dependency array `  }, [session, profile, loading, error, demoUsers, live]);` to `  }, [session, profile, loading, error, demoUsers, live, d1]);`.

- [ ] **Step 9: Gate the app shell.** In `src/components/layout/AppShell.jsx`:

Add the import:

```js
import ForcePasswordChange from '../auth/ForcePasswordChange.jsx';
```

Change `  const { user, loading } = useAuth();` to `  const { user, loading, mustChangePassword } = useAuth();`

Directly after the existing block

```jsx
  if (!user) {
    return <Navigate to="/login" replace />;
  }
```

insert:

```jsx
  if (mustChangePassword) {
    return <ForcePasswordChange />;
  }
```

- [ ] **Step 10: Profile settings.** In `src/components/settings/OtherSections.jsx`:

Add the import:

```js
import { isD1Auth } from '../../lib/authMode.js';
```

Replace

```jsx
      <Row label="New email" effect="You'll get a confirmation link at this address before it takes effect.">
        <EmailChangeForm />
      </Row>
```

with

```jsx
      <Row label="New email" effect="You'll get a confirmation link at this address before it takes effect.">
        {isD1Auth() ? (
          <p className="min-h-11 text-sm text-muted desk:min-h-10">To change your sign-in email, ask an administrator.</p>
        ) : (
          <EmailChangeForm />
        )}
      </Row>
```

Replace

```jsx
      description="Change your own sign-in password. You are never asked for the current one here — you're already signed in as you."
```

with

```jsx
      description={
        isD1Auth()
          ? 'Change your own sign-in password. Enter your current password to confirm it is you; your other devices will be signed out.'
          : "Change your own sign-in password. You are never asked for the current one here — you're already signed in as you."
      }
```

In `PasswordChangeForm`:
- After `  const [confirm, setConfirm] = useState('');` add `  const [current, setCurrent] = useState('');`
- At the start of `submit()` add:

  ```js
      if (isD1Auth() && !current) {
        setMessage({ tone: 'error', text: 'Enter your current password.' });
        return;
      }
  ```

- Change `      await changePassword(value);` to `      await changePassword(value, current);`
- After `      setConfirm('');` add `      setCurrent('');`
- Directly after `    <div className="space-y-2">` (inside `PasswordChangeForm`'s return) insert:

  ```jsx
        {isD1Auth() && (
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="Current password"
            autoComplete="current-password"
            className="min-h-11 w-full rounded border border-line/20 bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary desk:min-h-10"
          />
        )}
  ```

- Change the button's `disabled={busy || !value || !confirm}` to `disabled={busy || !value || !confirm || (isD1Auth() && !current)}`.

- [ ] **Step 11: Users & roles.** In `src/components/settings/UsersRolesSection.jsx`:

Add imports:

```js
import { isD1Auth } from '../../lib/authMode.js';
import { usersAdminClient } from '../../lib/authClient.js';
import { useD1Users } from '../../hooks/useD1Users.js';
```

After the `ROLE_OPTIONS` array, add:

```js
const D1 = isD1Auth();
// Build-time constant, so the hook choice never changes between renders.
const useUserRows = D1 ? useD1Users : useUsers;
const ROLE_CHOICES = D1 ? [{ value: 'inspector', label: 'Inspector' }, ...ROLE_OPTIONS] : ROLE_OPTIONS;
```

Change `  const { rows, persist, setActive, reload } = useUsers();` to `  const { rows, persist, setActive, reload } = useUserRows();`

In `startCreate`, change `setDraft({ ...EMPTY, temp_password: generateTempPassword() });` to `setDraft({ ...EMPTY, temp_password: D1 ? '' : generateTempPassword() });`

In `save()`, change `    if (editing === 'new' && draft.temp_password.trim().length < 10) {` to `    if (!D1 && editing === 'new' && draft.temp_password.trim().length < 10) {`

In `save()`, replace the line `      if (editing === 'new') {` with:

```js
      if (D1 && editing === 'new') {
        const { temporary_password } = await usersAdminClient.create({
          full_name: draft.full_name.trim(),
          email: draft.email.trim().toLowerCase(),
          position: draft.position.trim(),
          department: draft.department,
          role: draft.role,
          is_approver: Boolean(draft.is_approver),
        });
        setCreatedNotice({ email: draft.email.trim().toLowerCase(), password: temporary_password });
      } else if (D1) {
        await persist({
          id: editing,
          full_name: draft.full_name.trim(),
          email: draft.email.trim().toLowerCase(),
          position: draft.position.trim(),
          department: draft.department,
          role: draft.role,
          is_approver: Boolean(draft.is_approver),
        });
      } else if (editing === 'new') {
```

After the `toggleActive` function, add:

```js
  async function resetPassword(user) {
    if (!window.confirm(`Reset the password for ${user.full_name}? They will be signed out everywhere and must choose a new password at next sign-in.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const temporary = await usersAdminClient.resetPassword(user.id);
      setCreatedNotice({ email: user.email, password: temporary, reset: true });
    } catch (err) {
      setError(err.message || 'Could not reset that password.');
    } finally {
      setBusy(false);
    }
  }
```

Replace the `createdNotice` block contents. Everything inside `{createdNotice && ( ... )}` becomes:

```jsx
          <div className="mb-3 rounded-md border border-success/30 bg-success-soft p-3 text-sm text-success">
            <p className="font-semibold">
              {createdNotice.reset ? `Password reset for ${createdNotice.email}.` : `Account created for ${createdNotice.email}.`}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-2">
              Temporary password: <code className="rounded bg-white/60 px-1.5 py-0.5 font-mono">{createdNotice.password}</code>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(createdNotice.password)}
                className="min-h-9 rounded border border-success/40 px-2 text-xs font-semibold"
              >
                Copy
              </button>
            </p>
            <p className="mt-1 text-xs">
              {D1
                ? 'Shown once — share it with them directly. They will be asked to choose their own password the first time they sign in.'
                : 'There is no invite email — share this with them directly. They can change it themselves from Settings → My profile once signed in.'}
            </p>
          </div>
```

In the edit form:
- Change the Email `TextInput`'s `disabled={editing !== 'new'}` to `disabled={editing !== 'new' && !D1}`.
- Change the Role `Select`'s `options={ROLE_OPTIONS}` to `options={ROLE_CHOICES}`.
- Change `{editing === 'new' && (` (the Temporary password field) to `{editing === 'new' && !D1 && (`.

In the row actions, after the Deactivate/Reactivate `<button>`, add:

```jsx
                        {D1 && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => resetPassword(user)}
                            className="min-h-11 rounded border border-line/20 px-3 text-xs font-semibold text-muted hover:border-primary hover:text-primary desk:min-h-9"
                          >
                            Reset password
                          </button>
                        )}
```

- [ ] **Step 12: `src/lib/apiFetch.js`.** Replace the file with:

```js
import { supabase, isSupabaseConfigured } from './supabase.js';
import { isD1Auth } from './authMode.js';

/**
 * Authenticated fetch for the Worker /api routes.
 * d1 mode: the HttpOnly session cookie is sent automatically (same-origin).
 * supabase mode: attach the Supabase session JWT.
 */
export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  if (!isD1Auth() && isSupabaseConfigured && supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(path, { credentials: 'same-origin', ...options, headers });
}
```

- [ ] **Step 13: Build and test**

Run: `npm test`
Expected: 0 failed.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 14: Manual browser check in d1 mode (local)**

1. In `.env.local`, temporarily set `VITE_DATA_SOURCE=d1`, keeping the original value noted. Then run `npm run dev`.
2. Open `http://localhost:5173`. The **login form** shows (no demo picker). A wrong password shows "Email or password is incorrect".
3. Sign in as `admin@local.test`. The dashboard loads with mock data.
4. Settings → Users & roles:
   - The list shows the D1 users, including the smoke users from Task 8.
   - **Add user** (role Inspector) shows the temporary password once, with **Copy**.
   - **Reset password** on that user works.
5. Sign out, then sign in as the new inspector with the temporary password. The **Choose your password** screen shows. Set a password, and the app loads.
6. Settings → My profile:
   - The email row says "ask an administrator".
   - The password form asks for the current password.
   - Changing it works.
7. **Restore `.env.local`** to its original `VITE_DATA_SOURCE`.

Expected: every step behaves as described. Then confirm `git status` doesn't list `.env.local`.

- [ ] **Step 15: Commit**

```powershell
git add src/lib/authMode.js src/lib/authClient.js src/hooks/useD1Users.js src/components/auth/ForcePasswordChange.jsx src/context/AuthContext.jsx src/components/layout/AppShell.jsx src/components/settings/OtherSections.jsx src/components/settings/UsersRolesSection.jsx src/lib/apiFetch.js tests/authClient.test.js
git commit -m "feat(auth): d1 login mode in the browser (login, forced change, users admin)"
```

---

### Task 10: Regression and docs

**Files:**
- Modify: `CLAUDE.md`, `.env.example`

- [ ] **Step 1: Full regression**

Run each command, and every one must pass: `npm test`, `npm run verify:palette`, `npm run verify:content`, `npm run verify:signoffs`, `npm run verify:pdf`, `npm run build`.

With `npm run dev` running in **supabase mode** (the normal `.env.local`), run:

```powershell
node scripts/parity-exports.mjs tmp-pdf-diff/parity-auth --url http://localhost:5173
node scripts/parity-compare.mjs tmp-pdf-diff/parity-before tmp-pdf-diff/parity-auth
```

Expected: six `ok … 100% match` lines. `tmp-pdf-diff/parity-before` is from sub-project 1. If it's gone, regenerate the baseline with `git stash; git checkout main; node scripts/parity-exports.mjs tmp-pdf-diff/parity-before; git checkout feat/cloudflare-auth; git stash pop` first.

- [ ] **Step 2: Add a section to `CLAUDE.md`** directly after the "Hosting: one Cloudflare Worker" section. If that section isn't there, put it after `## Stack`:

```markdown
## Login: Cloudflare (D1) — built, switched on with the D1 data move

`worker/auth/` holds the whole login: `password.js` (PBKDF2, 100k — the
Workers max; the count is stored per hash), `session.js` (`__Host-bacc_session`
HttpOnly cookie; D1 stores only the token's SHA-256), `permissions.js` (who may
manage whom — the single source of truth, unit-tested), `store.js` (ALL login
SQL; `createMemoryAuthStore()` is its test twin), `service.js` (logic, injectable
clock), `routes.js` + `authenticate.js` (HTTP wiring).

- Route `auth.mode`: `public` | `session` (D1 cookie required) | `either`
  (D1 cookie if present, else Supabase bearer — the export routes, until
  sub-project 3) | `supabase` (`/api/create-user`, until sub-project 3).
- `must_change_password` blocks every route except `/api/auth/me`,
  `/change-password`, `/logout` (403 `PASSWORD_CHANGE_REQUIRED`).
- Non-GET auth/users routes require same-origin `Origin` + JSON (`csrf: true`).
- `VITE_DATA_SOURCE=d1` = D1 login with mock data in this phase.
- First admin: `npm run auth:create-admin -- --email … --name "…" [--remote]`.
- Check end to end: `npm run auth:smoke [-- --url https://bacc.visionforgestudio.app]`.
- Migrations: `d1/migrations/`, applied by hand with
  `npx wrangler d1 migrations apply bacc-portal-db --local|--remote`
  (the CI token has no D1 permission, by design).
```

- [ ] **Step 3: Update `.env.example`**

Replace the line `# mock | supabase — use supabase for the shared team test run.` with:

```
# mock | supabase | d1 — d1 = Cloudflare login (with mock data until sub-project 3).
```

- [ ] **Step 4: Commit**

```powershell
git add CLAUDE.md .env.example
git commit -m "docs: Cloudflare login conventions"
```

**Stop here and hand back to the user.** Report:
- `git log --oneline main..HEAD`
- the smoke output from Task 8
- the parity result from Task 10
- anything you had to stop and ask about

Task 11 is the user's.

---

### Task 11: Production rollout (user, with the walkthrough)

These steps need the user's Cloudflare login. The click-by-click version is in `docs/CLOUDFLARE_LOGIN_WALKTHROUGH.md`.

- [ ] **Step 1:** Merge `feat/cloudflare-auth` into `main` and push. GitHub Actions verifies and deploys. That's safe before the tables exist, because nothing uses the new login yet.
- [ ] **Step 2:** On `main`, apply the migration to production: `npx wrangler d1 migrations apply bacc-portal-db --remote`. This needs the binding that is now in `wrangler.jsonc`.
- [ ] **Step 3:** Bootstrap the production admin: `npm run auth:create-admin -- --email <real email> --name "<real name>" --remote`
- [ ] **Step 4:** Run the production smoke:

```powershell
$env:SMOKE_ADMIN_EMAIL="<real email>"; $env:SMOKE_ADMIN_PASSWORD="<password>"
npm run auth:smoke -- --url https://bacc.visionforgestudio.app
```

Expected: `All checks passed`.

- [ ] **Step 5:** Confirm that live Supabase login and a PDF export on `https://bacc.visionforgestudio.app` are unchanged.
