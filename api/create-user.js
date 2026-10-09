/**
 * POST /api/create-user — admin/OM only (enforced by the route's auth.roles
 * in worker/index.js): create a real Supabase Auth login for a staff member.
 *
 * Creating an auth user needs the service_role key, which must never reach
 * the browser. It lives only as a Wrangler secret (SUPABASE_SERVICE_ROLE_KEY).
 *
 * `handle_new_user()` (migration 010) always inserts the new profile with
 * role='inspector', ignoring metadata — intentional and kept. The real
 * role/department/position/approver flag is set in a second step with the
 * service-role client.
 */
import { createClient } from '@supabase/supabase-js';
import { HttpError } from './_shared.js';

// Mirrors ROLE_OPTIONS / DEPT_OPTIONS in src/components/settings/UsersRolesSection.jsx.
const ALLOWED_ROLES = ['om', 'coo', 'duty_manager', 'apron_supervisor', 'electrical_tech', 'sms', 'admin'];
const ALLOWED_DEPARTMENTS = ['Operations', 'Engineering', 'Maintenance'];

export async function buildCreateUser(body, { env }) {
  const url = env?.SUPABASE_URL || '';
  const serviceKey = env?.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceKey) {
    throw new HttpError(
      503,
      'User creation is not configured on the server (set it with `wrangler secret put SUPABASE_SERVICE_ROLE_KEY`)',
    );
  }

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const full_name = String(body.full_name || '').trim();
  const position = String(body.position || '').trim();
  const department = String(body.department || '').trim();
  const role = String(body.role || '').trim();
  const is_approver = Boolean(body.is_approver);

  if (!email || !email.includes('@')) throw new HttpError(400, 'A valid email is required');
  if (!password || password.length < 10) {
    throw new HttpError(400, 'Temporary password must be at least 10 characters');
  }
  if (!full_name) throw new HttpError(400, 'Full name is required');
  if (role && !ALLOWED_ROLES.includes(role)) throw new HttpError(400, 'Unknown role');
  if (department && !ALLOWED_DEPARTMENTS.includes(department)) throw new HttpError(400, 'Unknown department');

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
    throw new HttpError(
      error.status && error.status < 500 ? error.status : 502,
      error.message || 'Could not create the account',
    );
  }

  const userId = data.user.id;
  const patch = { full_name, position, is_approver };
  if (department) patch.department = department;
  if (role) patch.role = role;

  const { error: profileError } = await admin.from('profiles').update(patch).eq('id', userId);
  if (profileError) {
    throw new HttpError(
      500,
      `Account created, but the profile could not be finished: ${profileError.message}. ` +
        'The login exists — finish setting their role from Users & roles.',
    );
  }

  return { id: userId, email };
}
