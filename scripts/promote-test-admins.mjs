/**
 * Promote Shamira Young + Glenrick Spain to admin on the live Supabase project.
 * Updates profiles only — does not change passwords.
 *
 * Usage:
 *   node scripts/promote-test-admins.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvLocal() {
  const file = path.join(root, '.env.local');
  if (!existsSync(file)) return {};
  const raw = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1)];
      }),
  );
}

const env = { ...loadEnvLocal(), ...process.env };
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || '';
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!url || !serviceKey) {
  console.error('Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TARGETS = [
  {
    email: 'shamira.young@pgia.local',
    full_name: 'Shamira Young',
    position: 'Administrator',
    role: 'admin',
    department: 'Operations',
  },
  {
    email: 'glenrick.spain@pgia.local',
    full_name: 'Glenrick Spain',
    position: 'Administrator',
    role: 'admin',
    department: 'Engineering',
  },
];

for (const person of TARGETS) {
  const email = person.email.toLowerCase();
  const { data: rows, error: findError } = await admin
    .from('profiles')
    .select('id, email, role, position')
    .ilike('email', email);

  if (findError) {
    console.error(`lookup ${email}:`, findError.message);
    continue;
  }
  if (!rows?.length) {
    console.error(`missing profile for ${email} — run seed-supabase-users.mjs first`);
    continue;
  }

  const { data, error } = await admin
    .from('profiles')
    .update({
      role: person.role,
      position: person.position,
      department: person.department,
      full_name: person.full_name,
      is_approver: true,
      can_login: true,
      is_active: true,
    })
    .eq('id', rows[0].id)
    .select('id, email, role, position')
    .single();

  if (error) {
    console.error(`update ${email}:`, error.message);
    continue;
  }
  console.log(`ok  ${data.email}  ${rows[0].role} → ${data.role}  (${data.position})`);
}

console.log('Done. Sign out and back in so the session picks up the new role.');
