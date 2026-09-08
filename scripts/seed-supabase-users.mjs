/**
 * Provision Auth users + profile roles for the Supabase test run.
 *
 * Usage (PowerShell):
 *   $env:SUPABASE_URL="https://….supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="eyJ…"
 *   $env:SEED_PASSWORD="TempPass-ChangeMe1!"
 *   node scripts/seed-supabase-users.mjs
 *
 * Optional:
 *   $env:SEED_EMAILS="you@company.com,teammate@company.com"  # subset only
 *
 * Creates/updates accounts from src/data/seed/directory.js PEOPLE.
 * Role is written on profiles AFTER signup (handle_new_user always starts as inspector).
 * Never commit SEED_PASSWORD or the service_role key.
 */
import { createClient } from '@supabase/supabase-js';
import { PEOPLE } from '../src/data/seed/directory.js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const password = process.env.SEED_PASSWORD || '';
const only = String(process.env.SEED_EMAILS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

if (!url || !serviceKey) {
  console.error('Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!password || password.length < 10) {
  console.error('Need SEED_PASSWORD (min 10 chars)');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const targets = PEOPLE.filter((p) => !only.length || only.includes(p.email.toLowerCase()));

console.log(`Provisioning ${targets.length} account(s)…`);

for (const person of targets) {
  const email = person.email.toLowerCase();
  const meta = {
    full_name: person.full_name,
    position: person.position,
    department: person.department,
  };

  // Find existing auth user by listing (small roster).
  const { data: listed, error: listError } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (listError) {
    console.error('listUsers failed:', listError.message);
    process.exit(1);
  }
  const existing = (listed?.users || []).find((u) => u.email?.toLowerCase() === email);

  let userId = existing?.id;
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: meta,
    });
    if (error) {
      console.error(`update ${email}:`, error.message);
      continue;
    }
    console.log(`updated auth  ${email}`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: meta,
    });
    if (error) {
      console.error(`create ${email}:`, error.message);
      continue;
    }
    userId = data.user.id;
    console.log(`created auth  ${email}`);
  }

  const { error: profileError } = await admin
    .from('profiles')
    .upsert(
      {
        id: userId,
        email,
        full_name: person.full_name,
        position: person.position,
        role: person.role,
        department: person.department,
        is_approver: Boolean(person.is_approver),
        is_active: true,
        can_login: true,
      },
      { onConflict: 'id' },
    );

  if (profileError) {
    console.error(`profile ${email}:`, profileError.message);
    continue;
  }
  console.log(`profile ok   ${email} → ${person.role}`);
}

console.log('Done. Team can sign in with email + SEED_PASSWORD.');
console.log('Flip VITE_DATA_SOURCE=supabase and restart the Vite dev server.');
