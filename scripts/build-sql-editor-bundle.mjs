import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'supabase', 'migrations');
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

const parts = [
  '-- Combined migrations for Supabase SQL Editor',
  '-- Project: ecrgipyebbgrvmkntxqe',
  '-- Paste into Dashboard → SQL → New query → Run',
  '',
];

for (const file of files) {
  parts.push('', `-- ========== ${file} ==========`, '');
  parts.push(readFileSync(path.join(dir, file), 'utf8').trimEnd(), '');
}

parts.push('', "notify pgrst, 'reload schema';", '');

const outPath = path.join(root, 'scripts', 'all-migrations-for-sql-editor.sql');
writeFileSync(outPath, parts.join('\n'));
console.log(`Wrote ${outPath}`);
console.log(`Migrations: ${files.join(', ')}`);
console.log(`Bytes: ${parts.join('\n').length}`);
