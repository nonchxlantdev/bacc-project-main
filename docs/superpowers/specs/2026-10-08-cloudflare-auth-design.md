# Cloudflare Login (Sub-project 2 of the Cloudflare migration): Design

**Date:** 2026-10-08
**Status:** Approved in brainstorming. Written spec awaiting review.
**Repo:** `bacc-project-main`
**Builds on:** `docs/superpowers/specs/2026-10-08-cloudflare-workers-hosting-design.md` (sub-project 1, live on `bacc.visionforgestudio.app`)

## Context

The portal now runs on the `bacc-portal` Cloudflare Worker but still uses Supabase for login and data. This sub-project builds a login system that runs entirely on Cloudflare (Worker + D1), replacing Supabase Auth.

**Why it ships switched off.** Supabase's row-level security checks `auth.uid()` about 83 times across the migrations, and the browser queries Supabase directly with the Supabase session token. Swapping login while the data is still in Supabase would leave Supabase unable to identify anyone. So the new login is **built and fully tested now, deployed to production, and switched on the same day as the D1 data move (sub-project 3)**. Until then, users see no change.

## Decisions

| Decision | Choice |
|---|---|
| Timing | Build now. Users start using it on D1 cutover day (sub-project 3) |
| Accounts | **Fresh start.** No users or password hashes are migrated from Supabase. Pilot users are created new |
| Existing data | **Fresh start.** The D1 database starts empty for the pilot. Supabase data is left untouched as an archive (this binds sub-project 3) |
| Email | No email sending. Admin/OM changes a user's email and resets passwords from Users & roles. No "Forgot password" |
| Session length | 30 days, renewed while in use |
| Approach | A small login built into the Worker: Web Crypto PBKDF2, sessions in D1, HttpOnly cookie. No auth library |
| Tightenings vs today | Only an admin can create or promote an admin. Changing your own password needs the current password. A temporary password must be replaced at first sign-in |

## 1. Data

**New D1 database `bacc-portal-db`**, bound to the Worker as `DB`. Migrations live in `d1/migrations/` and are applied with `wrangler d1 migrations apply`. This sub-project creates only migration `0001_auth.sql`; sub-project 3 adds the rest.

```sql
CREATE TABLE users (
  id                    TEXT PRIMARY KEY,                       -- crypto.randomUUID()
  email                 TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash         TEXT NOT NULL,                          -- pbkdf2$<iter>$<salt b64url>$<hash b64url>
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
  locked_until          TEXT,                                   -- ISO-8601 UTC, NULL = not locked
  last_login_at         TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,          -- hex SHA-256 of the raw token; the raw token is never stored
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

The role and department lists match today's `api/create-user.js` and `UsersRolesSection.jsx`, plus `inspector` as the default.

## 2. Security model

- **Password hashing:** PBKDF2-SHA256, 100,000 iterations (the Workers Web Crypto maximum), a 16-byte random salt and a 32-byte derived key. The stored format is `pbkdf2$100000$<salt>$<hash>` (base64url), so the iteration count can be raised later and older hashes still verify. Comparison is constant-time. Passwords must be 10–128 characters.
- **Session token:** 32 random bytes, base64url. The cookie is `__Host-bacc_session=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`. D1 stores only `sha256(token)`.
- **Sliding expiry:** a session expires 30 days after its last renewal. On an authenticated request where `last_seen_at` is more than 24 h old, `expires_at` moves to now + 30 days, `last_seen_at` is updated and the cookie is re-sent. Expired sessions are rejected and deleted when they're looked up. Each login also deletes up to 100 globally expired rows.
- **Every authenticated request** loads the user and rejects (401) if `is_active = 0` or `can_login = 0`.
- **Lockout:** 5 consecutive failed logins for an email set `locked_until = now + 15 min`. While locked, login returns 429 with the minutes remaining. A successful login resets the counter. There's also an in-memory per-IP limit of 20 login attempts per minute. That's high enough for the end-to-end smoke script, which makes about 12 logins. Wrong email and wrong password both return the same 401 message, "Email or password is incorrect", and a missing user still runs a dummy PBKDF2 so response timing doesn't reveal whether an email exists.
- **CSRF:** every non-GET `/api/auth/*` and `/api/users/*` request must have an `Origin` header equal to the request's own origin, and `Content-Type: application/json`. Otherwise it gets a 403. Combined with SameSite=Lax, this blocks cross-site form posts.
- **Session revocation:**
  - Logout deletes the current session.
  - Changing your own password deletes all of your *other* sessions.
  - An admin password reset or deactivation (`is_active` or `can_login` set to 0) deletes *all* of that user's sessions.

### Permission rules: `worker/auth/permissions.js`

Pure functions, unit-tested exhaustively:

| Action | Rule |
|---|---|
| List users | actor.role ∈ {admin, om} |
| Create user | actor.role ∈ {admin, om}. Creating role `admin` requires actor.role = admin |
| Update user | actor.role ∈ {admin, om}. Setting role to `admin`, or editing an existing admin, requires actor.role = admin. **An actor can't change their own `role`, `is_active` or `can_login`** |
| Reset password | actor.role ∈ {admin, om}. Resetting an admin's password requires actor.role = admin. Actors use change-password for themselves, not reset |
| Last-admin guard | Any update that would leave zero users with role = admin, is_active = 1 and can_login = 1 is rejected (409) |

`/api/users/update` is the admin/OM management route. An admin or OM calling it on their own row may change name, position, department and email, but not role, `is_active` or `can_login`. Self-edits by ordinary users (name, position, signature) belong to sub-project 3's profile API.

### Temporary passwords

- The **server** generates them: 14 characters from an unambiguous alphabet (no 0/O/1/l/I), via `crypto.getRandomValues`.
- They're returned **once** in the create or reset response and never stored in plain text.
- The account gets `must_change_password = 1`.
- While that flag is set, **every** authenticated route except `/api/auth/me`, `/api/auth/change-password` and `/api/auth/logout` returns 403 `{ "error": "Password change required", "code": "PASSWORD_CHANGE_REQUIRED" }`.

## 3. API

All routes are registered in `worker/index.js` and go through `worker/http.js`. The wrapper gains a per-route `methods` list (default `['POST']`) so `GET` routes work, and an auth mode per route: `public`, `session` (D1 cookie required) or `either` (D1 cookie first, Supabase bearer fallback).

| Method + path | Auth | Request | Success |
|---|---|---|---|
| `POST /api/auth/login` | public | `{ email, password }` | 200 `{ user }` + `Set-Cookie` |
| `POST /api/auth/logout` | session | `{}` | 204 + cookie cleared |
| `GET /api/auth/me` | session | | 200 `{ user }` |
| `POST /api/auth/change-password` | session | `{ current_password, new_password }` | 200 `{ user }`, with `must_change_password` cleared |
| `GET /api/users` | session, admin/om | | 200 `{ users: [...] }` |
| `POST /api/users/create` | session, admin/om | `{ email, full_name, position?, department?, role?, is_approver? }` | 201 `{ user, temporary_password }` |
| `POST /api/users/update` | session, admin/om | `{ id, email?, full_name?, position?, department?, role?, is_approver?, is_active?, can_login? }` | 200 `{ user }` |
| `POST /api/users/reset-password` | session, admin/om | `{ id }` | 200 `{ temporary_password }` |

The `user` object returned anywhere is `{ id, email, full_name, position, role, department, is_active, is_approver, can_login, must_change_password, last_login_at, created_at }`. It never includes the hash, lockout fields or sessions.

**Errors** keep the existing `{ "error": string }` shape (plus an optional `code`):

| Status | Meaning |
|---|---|
| 400 | Validation failed |
| 401 | Not signed in, or bad credentials |
| 403 | Not allowed, bad Origin, or password change required |
| 404 | No such user |
| 409 | Email already in use, or last-admin guard |
| 429 | Locked out or rate-limited |

**Existing routes during the transition:** the four PDF exports and `generate-checklist-instances` switch to auth mode `either`. A valid D1 session works, and so does today's Supabase bearer. `/api/create-user` (Supabase) is unchanged. Sub-project 3 removes the Supabase fallback and `/api/create-user`.

### Code layout

```
worker/auth/password.js     hashPassword, verifyPassword, generateTemporaryPassword
worker/auth/session.js      newSessionToken, hashToken, sessionCookie, clearedSessionCookie, readSessionCookie
worker/auth/permissions.js  canListUsers, canCreateUser, checkUserUpdate, canResetPassword (pure)
worker/auth/store.js        createD1AuthStore(db) — every SQL statement; createMemoryAuthStore() for tests
worker/auth/service.js      login, logout, authenticateSession, changePassword, createUser, updateUser, resetPassword
                            (business logic over the store interface; no SQL, no Request/Response)
worker/auth/routes.js       route table entries wiring service → worker/http.js
d1/migrations/0001_auth.sql
scripts/auth-create-admin.mjs
scripts/auth-smoke.mjs
```

The store interface is the only place that knows about D1. `service.js` is tested against `createMemoryAuthStore()`.

### First admin

`npm run auth:create-admin -- --email <email> --name "<full name>" [--remote]`

1. Prompts for the password twice, with no echo, so it never lands in shell history.
2. Validates its length.
3. Hashes it with the same `hashPassword`, run in Node 22's Web Crypto.
4. Writes a one-off SQL file to the OS temp folder and runs `wrangler d1 execute bacc-portal-db [--remote] --file <tmp>`.
5. Deletes the temp file.

The new admin gets `must_change_password = 0`, because they chose the password themselves. The script refuses to run if that email already exists.

## 4. Browser

Everything below applies **only when `VITE_DATA_SOURCE=d1`**. Mock and Supabase modes are unchanged. In this sub-project the D1 data adapter doesn't exist yet, so the browser work is built and unit-tested now and exercised end-to-end in sub-project 3.

- **`src/lib/authClient.js`:** `login(email, password)`, `logout()`, `me()`, `changePassword(current, next)`. These are same-origin `fetch` calls with JSON bodies, and each throws an `Error` that carries `status` and `code`.
- **`src/context/AuthContext.jsx`:** a third branch, `d1`. On load it calls `me()`; a 401 means signed out. `signIn`, `signOut` and `changePassword` map onto `authClient`. `changeEmail` throws "Ask an administrator to change your sign-in email". The context's public shape is unchanged, and it adds `mustChangePassword`.
- **`src/components/auth/ForcePasswordChange.jsx`:** a full-screen form (current, new, confirm). The app shell renders it instead of the routes while `mustChangePassword` is true.
- **`LoginPage.jsx`:** on a 429, shows the server's message ("Too many attempts. Try again in N minutes.").
- **Settings → Profile (`OtherSections.jsx`):**
  - In d1 mode, the email-change form is replaced by the line "To change your sign-in email, ask an administrator."
  - The password form adds a "Current password" field.
- **Settings → Users & roles (`UsersRolesSection.jsx`):**
  - In d1 mode, it uses `/api/users*`.
  - Create shows the returned temporary password once, with a Copy button. The admin's temp-password field is removed, because the server generates it.
  - Each row gets a **Reset password** action, which shows the new temporary password once.
  - Admins can edit email.
- **`src/lib/apiFetch.js`:** in d1 mode, doesn't attach a bearer token (the cookie is sent automatically).
- **Offline queue (`utils/offlineQueue.js`):** if a sync gets 401, keep the queued items, show the login screen, and resume syncing after sign-in. Nothing is dropped.

## 5. Testing

**Unit (`node --test`, in `tests/`):**
- `password`:
  - Correct and wrong password.
  - Stored-hash format.
  - A hash stored with a different iteration count still verifies.
  - Tampered salt or hash fails.
  - Length bounds.
  - The temporary-password alphabet and length.
- `session`: token entropy and length, `hashToken` stability, exact cookie attributes, cookie parsing (several cookies, missing, malformed).
- `permissions`: every row of the permissions table, including OM → admin denied, self role or active change denied, and the last-admin guard.
- `service` (memory store):
  - Login success and failure.
  - Generic error for an unknown email.
  - Lockout at 5 failures and unlock after 15 min (injected clock).
  - Sliding renewal at most once per 24 h.
  - Deactivation kills sessions.
  - Reset sets `must_change_password` and kills sessions.
  - Change-password clears the flag and kills other sessions only.
  - The password-change-required gate.
  - Duplicate email gives 409.

**HTTP (existing wrapper tests, extended):**
- GET routes and per-route `methods`.
- Origin mismatch → 403.
- Non-JSON content type → 403.
- Login response cookie attributes.
- An `either` route accepts a session cookie *and* still accepts the Supabase bearer path (stubbed).

**Local end-to-end (`scripts/auth-smoke.mjs` against `npm run dev` with local D1):**
1. Admin login and `/me`.
2. The admin creates an OM. The OM's first login has `must_change_password`, other routes return 403, and after the change they work.
3. The OM can't create an admin.
4. The OM creates an inspector.
5. Five wrong passwords lock out with 429.
6. The admin deactivates the inspector, and the inspector's session gets 401.
7. The admin resets the OM's password, and the OM's old session gets 401.
8. Logout clears the cookie, and `/me` gets 401.

**Regression:**
- All existing `npm test` and `verify:*` checks pass.
- 6-case PDF parity at 100%.
- In production, Supabase login and PDF export are unchanged.

## 6. Rollout (this sub-project)

1. Create D1 with `npx wrangler d1 create bacc-portal-db`. The binding (`DB`, its `database_id` and `migrations_dir`) is added to `wrangler.jsonc` on the feature branch.
2. Apply migrations locally during development: `npx wrangler d1 migrations apply bacc-portal-db --local`.
3. Merge and deploy through the existing GitHub Actions pipeline. No workflow change is needed. Deploying before the remote tables exist is safe, because nothing uses the new login yet.
4. On `main`, apply migrations to production: `npx wrangler d1 migrations apply bacc-portal-db --remote`.
5. Bootstrap the production admin: `npm run auth:create-admin -- --email … --name … --remote`.
6. Run `npm run auth:smoke -- --url https://bacc.visionforgestudio.app` with the admin credentials. Its test users get a `smoke-` email prefix and are deactivated at the end.
7. Confirm Supabase login and exports on the live site are unchanged.

Users see no change. The production `VITE_DATA_SOURCE` stays `supabase` until sub-project 3.

## Out of scope

- Stored signatures (`profile_signatures`), avatars, `has_ever_signed`, and all checklist, incident, approval and notification data. Those are sub-project 3, which adds them to `bacc-portal-db` and references `users.id`.
- Email sending, "Forgot password", and self-service email change.
- 2FA, SSO, Cloudflare Access.
- Migrating Supabase users, passwords or records (fresh start, decided above).
- Removing Supabase code paths (sub-project 3).

## Risks

- **PBKDF2 strength:** 100k iterations is below OWASP's 600k recommendation for PBKDF2-SHA256, and it's the Workers ceiling. The stored iteration count allows a later move to a WASM Argon2id without forcing resets. Lockout and rate limiting cover online guessing; offline guessing needs a D1 leak, and sessions are hashed too.
- **Cookie on a shared-zone subdomain:** the `__Host-` prefix pins the cookie to `bacc.visionforgestudio.app` exactly, so other `visionforgestudio.app` subdomains can't read or set it.
- **In-memory per-IP limit is per isolate:** it's best-effort. The D1-backed per-email lockout is the real control. Cloudflare's rate-limit binding is considered in sub-project 4.
