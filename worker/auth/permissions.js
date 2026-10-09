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
