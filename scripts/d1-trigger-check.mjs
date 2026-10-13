/**
 * Proves the locked-checklist triggers (migration 0002) hold in the real
 * LOCAL D1 — the same SQLite the Worker uses — by trying to break them with
 * direct SQL, bypassing the API entirely.
 *
 *   npx wrangler d1 migrations apply bacc-portal-db --local
 *   node scripts/d1-trigger-check.mjs
 *
 * Local only. It leaves one locked row named trigger-check-<time> behind,
 * because a locked checklist cannot be deleted — that is what it tests.
 * (npm test runs the same checks against Node's SQLite on every commit.)
 */
import { execFileSync } from 'node:child_process';

/** On Windows, `shell: true` + npx.cmd splits an unquoted --command value on spaces. */
function runWrangler(sql) {
  // Collapse newlines so cmd.exe quoting stays a single argument; wrangler
  // accepts multiple statements separated by semicolons in one --command.
  const flat = sql.replace(/\s+/g, ' ').trim();
  const command = process.platform === 'win32' ? `"${flat.replace(/"/g, '""')}"` : flat;
  return execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'bacc-portal-db', '--local', '--json', '--command', command],
    {
      stdio: 'pipe',
      shell: process.platform === 'win32',
      env: { ...process.env, CI: '1' },
    },
  );
}

function d1(sql) {
  try {
    runWrangler(sql);
    return { ok: true, output: '' };
  } catch (err) {
    return { ok: false, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

function query(sql) {
  const out = runWrangler(sql);
  return JSON.parse(String(out))[0]?.results ?? [];
}

let failures = 0;
function expectBlocked(label, sql, pattern) {
  const r = d1(sql);
  const ok = !r.ok && pattern.test(r.output);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) {
    failures += 1;
    console.log(r.ok ? '     (the statement succeeded)' : r.output.slice(0, 400));
  }
}
function expectAllowed(label, sql) {
  const r = d1(sql);
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!r.ok) {
    failures += 1;
    console.log(r.output.slice(0, 400));
  }
}

const [user] = query('SELECT id FROM users ORDER BY created_at LIMIT 1');
if (!user) {
  console.error('No users in local D1. Run npm run auth:create-admin first.');
  process.exit(1);
}
const id = `trigger-check-${Date.now()}`;
const now = new Date().toISOString();

expectAllowed(
  'set up: insert a draft, sign it, then lock it (submit order)',
  `INSERT INTO checklist_submissions (id, template_id, template_version, inspector_id, status, locked, header_json, items_json, created_at, updated_at)
     VALUES ('${id}', 'annex-d-drainage', 'ed01', '${user.id}', 'draft', 0, '{}', '{"A1":{"result":"sat"}}', '${now}', '${now}');
   INSERT INTO checklist_signoffs (submission_id, role, name, signed_at, signed_by) VALUES ('${id}', 'inspector', 'T', '${now}', '${user.id}');
   UPDATE checklist_submissions SET status = 'submitted', locked = 1, submitted_at = '${now}' WHERE id = '${id}';`,
);
expectBlocked(
  "direct UPDATE of a locked row's header aborts",
  `UPDATE checklist_submissions SET header_json = '{"x":1}' WHERE id = '${id}'`,
  /cannot be overwritten/,
);
expectBlocked('DELETE of a locked row aborts', `DELETE FROM checklist_submissions WHERE id = '${id}'`, /cannot be deleted/);
expectBlocked(
  'a non-OM sign-off insert on a locked row aborts',
  `INSERT INTO checklist_signoffs (submission_id, role, name, signed_at, signed_by) VALUES ('${id}', 'supervisor', 'X', '${now}', '${user.id}')`,
  /Sign-offs on a locked checklist/,
);
expectBlocked(
  'an items change without a new reopened_at aborts',
  `UPDATE checklist_submissions SET items_json = '{"A1":{"result":"no_sat"}}' WHERE id = '${id}'`,
  /cannot be overwritten/,
);
expectAllowed(
  'an items change WITH a new reopened_at is allowed (approver correction)',
  `UPDATE checklist_submissions SET items_json = '{"A1":{"result":"no_sat"}}', reopened_at = '${new Date(Date.now() + 1).toISOString()}' WHERE id = '${id}'`,
);
expectAllowed(
  'the OM acknowledgment block can still be written',
  `INSERT INTO checklist_signoffs (submission_id, role, name, signed_at, signed_by) VALUES ('${id}', 'om_acknowledgment', 'OM', '${now}', '${user.id}')`,
);

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll trigger checks passed');
process.exit(failures ? 1 : 0);
