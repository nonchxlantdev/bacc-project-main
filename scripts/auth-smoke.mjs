/**
 * End-to-end check of the Cloudflare login against a running Worker.
 *
 *   $env:SMOKE_ADMIN_EMAIL="you@example.com"; $env:SMOKE_ADMIN_PASSWORD="..."
 *   npm run auth:smoke                                         # local (npm run dev)
 *   npm run auth:smoke -- --url https://bacc.visionforgestudio.app   # production
 *
 * Creates throwaway users named smoke-*@example.invalid and deactivates them
 * at the end. Exits 1 if any check fails.
 */
const args = process.argv.slice(2);
const urlArg = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://localhost:5173';
const base = new URL(urlArg);
const ORIGIN = base.origin;
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD first.');
  process.exit(1);
}

let failures = 0;
function check(condition, label, detail) {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${label}${!condition && detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  if (!condition) failures += 1;
}

async function call(path, { method = 'POST', body, cookie, origin = ORIGIN } = {}) {
  const headers = {};
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    if (origin) headers.Origin = origin;
  }
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(new URL(path, base), {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    redirect: 'manual',
  });
  const setCookies = res.headers.getSetCookie?.() ?? [];
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, data, setCookies };
}

const sessionPair = (setCookies) =>
  setCookies.find((c) => c.startsWith('__Host-bacc_session='))?.split(';')[0] ?? null;

async function login(email, password) {
  const r = await call('/api/auth/login', { body: { email, password } });
  return { ...r, cookie: sessionPair(r.setCookies) };
}

const stamp = Date.now();
const omEmail = `smoke-om-${stamp}@example.invalid`;
const inspEmail = `smoke-insp-${stamp}@example.invalid`;
const omNewPassword = `Smoke-${stamp}-Pw!`;

// 1. CSRF
check((await call('/api/auth/login', { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, origin: 'https://evil.example' })).status === 403, 'login from another origin is blocked (403)');

// 2. Admin login + cookie attributes
const admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
check(admin.status === 200 && admin.cookie, 'admin login 200 with session cookie', admin.status);
const rawCookie = admin.setCookies.find((c) => c.startsWith('__Host-bacc_session=')) ?? '';
for (const attr of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=2592000']) {
  check(rawCookie.includes(attr), `session cookie has ${attr}`);
}
check((await call('/api/auth/me', { method: 'GET', cookie: admin.cookie })).data?.user?.role === 'admin', '/me returns the admin');
check((await call('/api/users', { method: 'GET' })).status === 401, '/api/users without a cookie is 401');

// 3. Create an OM
const omCreate = await call('/api/users/create', { cookie: admin.cookie, body: { email: omEmail, full_name: 'Smoke OM', role: 'om', department: 'Operations' } });
check(omCreate.status === 201 && omCreate.data?.temporary_password?.length === 14, 'admin creates an OM (201 + 14-char temp password)', omCreate.status);
const omId = omCreate.data?.user?.id;

// 4. OM must change password first
let om = await login(omEmail, omCreate.data?.temporary_password);
check(om.status === 200 && om.data?.user?.must_change_password === true, 'OM temp login flags must_change_password');
const blocked = await call('/api/users', { method: 'GET', cookie: om.cookie });
check(blocked.status === 403 && blocked.data?.code === 'PASSWORD_CHANGE_REQUIRED', 'OM is blocked until the password changes');
check((await call('/api/auth/change-password', { cookie: om.cookie, body: { current_password: 'wrong-current-pw', new_password: omNewPassword } })).status === 400, 'wrong current password is rejected (400)');
const changed = await call('/api/auth/change-password', { cookie: om.cookie, body: { current_password: omCreate.data?.temporary_password, new_password: omNewPassword } });
check(changed.status === 200 && changed.data?.user?.must_change_password === false, 'OM changes password');
check((await call('/api/users', { method: 'GET', cookie: om.cookie })).status === 200, 'OM can now list users');

// 5. OM cannot create an admin, can create an inspector
check((await call('/api/users/create', { cookie: om.cookie, body: { email: `smoke-x-${stamp}@example.invalid`, full_name: 'Nope', role: 'admin' } })).status === 403, 'OM cannot create an admin (403)');
const inspCreate = await call('/api/users/create', { cookie: om.cookie, body: { email: inspEmail, full_name: 'Smoke Inspector', role: 'inspector' } });
check(inspCreate.status === 201, 'OM creates an inspector (201)', inspCreate.status);
const inspId = inspCreate.data?.user?.id;

// 6. Lockout
const wrong = [];
for (let i = 0; i < 5; i += 1) wrong.push((await login(inspEmail, 'definitely-wrong-pw')).status);
check(JSON.stringify(wrong) === JSON.stringify([401, 401, 401, 401, 429]), '5 wrong passwords: 401 x4 then 429', wrong);
check((await login(inspEmail, inspCreate.data?.temporary_password)).status === 429, 'locked account refuses even the right password');

// 7. Reset clears the lock; deactivation kills the session
const reset = await call('/api/users/reset-password', { cookie: admin.cookie, body: { id: inspId } });
check(reset.status === 200 && reset.data?.temporary_password, 'admin resets the inspector password');
const insp = await login(inspEmail, reset.data?.temporary_password);
check(insp.status === 200, 'inspector signs in with the new temp password (lock cleared)', insp.status);
check((await call('/api/users/update', { cookie: admin.cookie, body: { id: inspId, is_active: false } })).status === 200, 'admin deactivates the inspector');
check((await call('/api/auth/me', { method: 'GET', cookie: insp.cookie })).status === 401, "deactivated inspector's session is dead (401)");
check((await login(inspEmail, reset.data?.temporary_password)).status === 403, 'deactivated inspector cannot sign in (403)');

// 8. Reset kills the OM's existing session
check((await call('/api/users/reset-password', { cookie: admin.cookie, body: { id: omId } })).status === 200, 'admin resets the OM password');
check((await call('/api/auth/me', { method: 'GET', cookie: om.cookie })).status === 401, "OM's old session is dead after reset (401)");

// 9. Logout
const out = await call('/api/auth/logout', { cookie: admin.cookie });
check(out.status === 204 && out.setCookies.some((c) => c.includes('Max-Age=0')), 'logout 204 clears the cookie');
check((await call('/api/auth/me', { method: 'GET', cookie: admin.cookie })).status === 401, '/me after logout is 401');

// Cleanup: deactivate the smoke OM (inspector already deactivated)
const admin2 = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
check((await call('/api/users/update', { cookie: admin2.cookie, body: { id: omId, is_active: false } })).status === 200, 'cleanup: smoke OM deactivated');
await call('/api/auth/logout', { cookie: admin2.cookie });

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
