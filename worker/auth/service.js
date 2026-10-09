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
