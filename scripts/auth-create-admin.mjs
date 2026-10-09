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
