/**
 * Admin/OM-only: create a real Supabase Auth login for a new staff member.
 *
 * The browser can never do this itself — creating an auth user needs the
 * service_role key, which must never reach the client. This is the one place
 * that key is used, and only after `requireUser` confirms the caller is
 * already an admin or operations manager.
 *
 * `handle_new_user()` (migration 010) always inserts the new profile with
 * role='inspector', ignoring any metadata — that guard is intentional and
 * stays intact. This handler sets the real role/department/position/approver
 * flag in a second step, using the service-role client, which bypasses RLS
 * the same way the profile insert itself does.
 */
import { createClient } from '@supabase/supabase-js';
import { enforceBodySize, rateLimit, requireUser, sendError } from './_shared.js';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Mirrors ROLE_OPTIONS / DEPT_OPTIONS in src/components/settings/UsersRolesSection.jsx.
const ALLOWED_ROLES = ['om', 'coo', 'duty_manager', 'apron_supervisor', 'electrical_tech', 'sms', 'admin'];
const ALLOWED_DEPARTMENTS = ['Operations', 'Engineering', 'Maintenance'];

export const config = {
  maxDuration: 15,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    enforceBodySize(req);
    rateLimit(req, { limit: 10 });
    await requireUser(req, { roles: ['admin', 'om'] });

    if (!url || !serviceKey) {
      const err = new Error(
        'User creation is not configured on the server (SUPABASE_SERVICE_ROLE_KEY is missing from the Vercel environment)',
      );
      err.status = 503;
      throw err;
    }

    const body = req.body ?? {};
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const full_name = String(body.full_name || '').trim();
    const position = String(body.position || '').trim();
    const department = String(body.department || '').trim();
    const role = String(body.role || '').trim();
    const is_approver = Boolean(body.is_approver);

    if (!email || !email.includes('@')) {
      const err = new Error('A valid email is required');
      err.status = 400;
      throw err;
    }
    if (!password || password.length < 10) {
      const err = new Error('Temporary password must be at least 10 characters');
      err.status = 400;
      throw err;
    }
    if (!full_name) {
      const err = new Error('Full name is required');
      err.status = 400;
      throw err;
    }
    if (role && !ALLOWED_ROLES.includes(role)) {
      const err = new Error('Unknown role');
      err.status = 400;
      throw err;
    }
    if (department && !ALLOWED_DEPARTMENTS.includes(department)) {
      const err = new Error('Unknown department');
      err.status = 400;
      throw err;
    }

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, position, department },
    });
    if (error) {
      const err = new Error(error.message || 'Could not create the account');
      err.status = error.status && error.status < 500 ? error.status : 502;
      throw err;
    }

    const userId = data.user.id;
    const patch = { full_name, position, is_approver };
    if (department) patch.department = department;
    if (role) patch.role = role;

    const { error: profileError } = await admin.from('profiles').update(patch).eq('id', userId);
    if (profileError) {
      const err = new Error(
        `Account created, but the profile could not be finished: ${profileError.message}. ` +
          'The login exists — finish setting their role from Users & roles.',
      );
      err.status = 500;
      throw err;
    }

    res.status(200).json({ id: userId, email });
  } catch (err) {
    sendError(res, err);
  }
}
