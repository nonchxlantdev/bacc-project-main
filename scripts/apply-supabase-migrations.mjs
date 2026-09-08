/**
 * Apply supabase/migrations/*.sql in order via direct Postgres.
 *
 * Usage:
 *   $env:NODE_OPTIONS='--use-system-ca'
 *   $env:SUPABASE_DB_PASSWORD='your-db-password'
 *   node scripts/apply-supabase-migrations.mjs
 *
 * Optional override:
 *   $env:DATABASE_URL='postgresql://postgres.xxxxx:PASSWORD@aws-0-….pooler.supabase.com:6543/postgres'
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ref = 'ecrgipyebbgrvmkntxqe';
const password = process.env.SUPABASE_DB_PASSWORD || process.env.POSTGRES_PASSWORD || '';
const region = process.env.SUPABASE_REGION || 'us-west-2';
const databaseUrl =
  process.env.DATABASE_URL ||
  (password
    ? `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-${region}.pooler.supabase.com:6543/postgres`
    : '');

if (!databaseUrl) {
  console.error('Set SUPABASE_DB_PASSWORD (Database settings password) or DATABASE_URL');
  process.exit(1);
}

const dir = path.join(root, 'supabase', 'migrations');
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log(`Connected. Applying ${files.length} migration(s)…`);

await client.query(`
  create table if not exists public.schema_migrations (
    version text primary key,
    applied_at timestamptz not null default now()
  );
`);

for (const file of files) {
  const version = file.replace(/\.sql$/, '');
  const { rows } = await client.query('select 1 from public.schema_migrations where version = $1', [
    version,
  ]);
  if (rows.length) {
    console.log(`skip  ${file}`);
    continue;
  }
  const sql = readFileSync(path.join(dir, file), 'utf8');
  process.stdout.write(`apply ${file} … `);
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('insert into public.schema_migrations (version) values ($1)', [version]);
    await client.query('commit');
    console.log('ok');
  } catch (err) {
    await client.query('rollback');
    console.log('FAIL');
    console.error(err.message);
    await client.end();
    process.exit(1);
  }
}

// Refresh PostgREST schema cache so new tables appear immediately.
try {
  await client.query(`notify pgrst, 'reload schema'`);
  console.log('PostgREST schema reload notified');
} catch {
  console.log('Could not notify PostgREST reload (non-fatal)');
}

await client.end();
console.log('Migrations complete. Re-run: node scripts/seed-supabase-users.mjs');
