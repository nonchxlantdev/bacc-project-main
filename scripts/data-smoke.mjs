/**
 * End-to-end check of the D1 data API (sub-project 3a) against LOCAL dev.
 *
 *   npx wrangler d1 migrations apply bacc-portal-db --local
 *   npm run dev                                   # VITE_DATA_SOURCE=d1 in .env.local
 *   $env:SMOKE_ADMIN_EMAIL="admin@local.test"; $env:SMOKE_ADMIN_PASSWORD="..."
 *   npm run data:smoke
 *
 * Local only, on purpose: it files real checklists, and a filed checklist can
 * never be deleted (BACC §11). Creates smoke-*@example.invalid users and
 * deactivates them at the end. Exits 1 if any check fails.
 */
import { execFileSync } from 'node:child_process';
import { READ_OPS } from '../worker/data/ops.js';

const args = process.argv.slice(2);
const urlArg = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://localhost:5173';
const base = new URL(urlArg);
if (!['localhost', '127.0.0.1'].includes(base.hostname)) {
  console.error('data:smoke files checklists that can never be deleted, so it only runs against local dev.');
  process.exit(1);
}
const ORIGIN = base.origin;
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD first (the local admin from auth:create-admin).');
  process.exit(1);
}

let failures = 0;
function check(condition, label, detail) {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${label}${!condition && detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  if (!condition) failures += 1;
}

async function http(path, { method = 'POST', body, cookie, origin = ORIGIN } = {}) {
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

const READS = new Set(READ_OPS);

/** One data op as a signed-in user → { status, data } (data unwrapped). */
async function op(who, name, a = {}) {
  const read = READS.has(name);
  const qs = read && Object.keys(a).length ? `?a=${encodeURIComponent(JSON.stringify(a))}` : '';
  const r = await http(`/api/data/${name}${qs}`, read ? { method: 'GET', cookie: who.cookie } : { cookie: who.cookie, body: { args: a } });
  return { status: r.status, data: r.data?.data, error: r.data?.error };
}

async function login(email, password) {
  const r = await http('/api/auth/login', { body: { email, password } });
  const cookie = r.setCookies.find((c) => c.startsWith('__Host-bacc_session='))?.split(';')[0] ?? null;
  return { status: r.status, cookie, user: r.data?.user };
}

const stamp = Date.now();
const admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
check(admin.status === 200 && admin.cookie, 'admin signs in', admin.status);
if (!admin.cookie) process.exit(1);

async function makeUser(role, department) {
  const email = `smoke-${role}-${stamp}@example.invalid`;
  const created = await http('/api/users/create', {
    cookie: admin.cookie,
    body: { email, full_name: `Smoke ${role.toUpperCase()}`, role, department },
  });
  const temp = await login(email, created.data?.temporary_password);
  const password = `Smoke-${stamp}-${role}-Pw!`;
  await http('/api/auth/change-password', {
    cookie: temp.cookie,
    body: { current_password: created.data?.temporary_password, new_password: password },
  });
  const who = await login(email, password);
  check(created.status === 201 && who.status === 200, `${role} account ready`, [created.status, who.status]);
  return { ...who, id: created.data?.user?.id };
}

const om = await makeUser('om', 'Operations');
const coo = await makeUser('coo', 'Operations');
const insp = await makeUser('inspector', 'Maintenance');

const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const IMG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
const draft = (over = {}) => ({
  id: crypto.randomUUID(),
  template_id: 'annex-d-drainage',
  template_version: 'ed01',
  status: 'draft',
  header: { date: new Date().toISOString().slice(0, 10), inspectionType: 'monthly_routine' },
  items: { 'D-1.1': { result: 'sat', remarks: '' }, 'D-1.2': { result: 'no_sat', remarks: 'Smoke remark' } },
  signoffs: [],
  ...over,
});

// 1. Inspector creates, saves, edits and submits.
const rec = draft();
const saved = await op(insp, 'checklists.persist', { record: rec });
check(saved.status === 200 && saved.data?.status === 'draft' && saved.data?.inspector_id === insp.id, 'inspector saves a draft', saved);
const edited = await op(insp, 'checklists.persist', {
  record: { ...saved.data, items: { ...saved.data.items, 'D-1.1': { result: 'na', remarks: 'edited' } } },
});
check(edited.data?.items?.['D-1.1']?.result === 'na', 'inspector edits the draft');
const submitted = await op(insp, 'checklists.persist', {
  record: { ...edited.data, status: 'submitted', signoffs: [{ role: 'inspector', name: 'Smoke INSPECTOR', signature_data_uri: SIG }] },
});
check(submitted.status === 200 && submitted.data?.status === 'submitted' && submitted.data?.locked === true, 'inspector submits; record is locked', submitted.status);

// 2. Locked: an edit is refused.
check((await op(insp, 'checklists.persist', { record: { ...submitted.data, status: 'draft' } })).status === 409, 'edit after submit is 409');

// 3. OM sees it in the inbox and acknowledges; the inspector is notified.
const inbox = await op(om, 'approvals.listInbox');
const approval = inbox.data?.find((a) => a.entity_id === rec.id);
check(Boolean(approval) && approval.entity?.filed_by === 'Smoke INSPECTOR', 'OM sees the approval in the inbox');
const decided = await op(om, 'approvals.decide', { id: approval?.id, decision: 'approved', signature_data_uri: SIG });
check(decided.status === 200 && decided.data?.status === 'approved', 'OM approves (acknowledges)', decided);
const acked = await op(insp, 'checklists.get', { id: rec.id });
check(acked.data?.status === 'acknowledged' && acked.data?.signoffs?.some((s) => s.role === 'om_acknowledgment' && s.signed_by === om.id), 'checklist acknowledged with the OM block signed by the OM');
const inspNotes = await op(insp, 'notifications.listForUser');
check(inspNotes.data?.some((n) => n.entity_id === rec.id && n.event_type === 'checklist_acknowledged'), 'inspector is notified');

// 4. Drafts: the inspector cannot delete them, the OM can.
const d2 = await op(insp, 'checklists.persist', { record: draft() });
check((await op(insp, 'checklists.deleteDraft', { id: d2.data?.id })).status === 403, 'inspector cannot delete a draft (403)');
check((await op(om, 'checklists.deleteDraft', { id: d2.data?.id })).status === 200, 'OM deletes the draft');

// 5. Nobody but OM/admin signs the OM acknowledgment.
const d3 = await op(insp, 'checklists.persist', {
  record: draft({ signoffs: [{ role: 'om_acknowledgment', name: 'Not the OM', signature_data_uri: SIG }] }),
});
check(d3.data && !d3.data.signoffs.some((s) => s.role === 'om_acknowledgment'), 'a save never writes the OM block');
const d3s = await op(insp, 'checklists.persist', { record: { ...d3.data, status: 'submitted' } });
check((await op(insp, 'checklists.acknowledge', { id: d3s.data?.id })).status === 403, 'inspector cannot acknowledge (403)');
check((await op(coo, 'checklists.acknowledge', { id: d3s.data?.id })).status === 403, 'COO cannot acknowledge (403)');

// 6. COO-style correction of one item.
const amended = await op(coo, 'checklists.amendItemResult', {
  id: rec.id,
  code: 'D-1.2',
  result: 'sat',
  amendment: { item_code: 'D-1.2', from: 'no_sat', to: 'sat', reason: 'smoke' },
});
check(amended.status === 200 && amended.data?.items?.['D-1.2']?.result === 'sat' && amended.data?.amendments?.length === 1, 'COO amends one item; it shows in amendments', amended.status);

// 7. A correction leaves the original untouched.
const before = (await op(insp, 'checklists.get', { id: rec.id })).data;
const correction = { ...structuredClone(before), id: crypto.randomUUID(), status: 'draft', locked: false, submitted_at: null, supersedes_id: rec.id };
correction.items['D-1.1'] = { result: 'sat', remarks: 'corrected' };
check((await op(insp, 'checklists.persist', { record: correction })).status === 200, 'inspector starts a correction');
const after = (await op(insp, 'checklists.get', { id: rec.id })).data;
check(JSON.stringify(after) === JSON.stringify(before), 'original is unchanged by the correction');

// 8. Photos and a 7th drawing are refused.
const photo = draft();
photo.items['D-1.1'].photo_local_id = 'local-photo';
const photoRes = await op(insp, 'checklists.persist', { record: photo });
check(photoRes.status === 400 && /Attachments unavailable at this time/.test(photoRes.error ?? ''), 'photo data is rejected (400)');
const seven = Array.from({ length: 7 }, (_, i) => ({ id: `smoke-${i}`, label: `D${i}`, contentType: 'image/jpeg', dataUri: IMG }));
check((await op(insp, 'checklists.persist', { record: draft({ attachments: { site: seven } }) })).status === 400, 'a 7th drawing is rejected (400)');
const six = await op(insp, 'checklists.persist', { record: draft({ attachments: { site: seven.slice(0, 6) } }) });
check(six.status === 200 && six.data?.attachments?.site?.length === 6, 'six drawings are accepted');

// 9. Schedule generation is idempotent (uses a throwaway local rule).
const ruleId = `smoke-rule-${stamp}`;
// On Windows, `shell: true` + npx.cmd splits an unquoted --command value on
// spaces, so quote it for cmd.exe (same fix as scripts/d1-trigger-check.mjs).
const d1 = (sql) => {
  const flat = sql.replace(/\s+/g, ' ').trim();
  const command = process.platform === 'win32' ? `"${flat.replace(/"/g, '""')}"` : flat;
  return execFileSync('npx', ['wrangler', 'd1', 'execute', 'bacc-portal-db', '--local', '--command', command], {
    stdio: 'pipe',
    shell: process.platform === 'win32',
    env: { ...process.env, CI: '1' },
  });
};
d1(`INSERT INTO assignment_rules (id, template_id, frequency, role, department, active, created_at, updated_at) VALUES ('${ruleId}', 'annex-d-drainage', 'weekly', 'inspector', 'Maintenance', 1, datetime('now'), datetime('now'))`);
const g1 = await op(om, 'instances.generate');
const g2 = await op(om, 'instances.generate');
check(g1.data?.created > 0 && g2.data?.created === 0 && g2.data?.total === g1.data?.total, 'generate twice creates no duplicates', [g1.data, g2.data]);
check((await op(insp, 'instances.generate')).status === 403, 'inspector cannot generate the schedule (403)');
d1(`DELETE FROM checklist_instances WHERE assignment_rule_id = '${ruleId}'; DELETE FROM assignment_rules WHERE id = '${ruleId}'`);

// 10. Settings.
const section = `smoke_${stamp}`;
check((await op(insp, 'settings.save', { section, value: { a: 1 } })).status === 403, 'inspector cannot save settings (403)');
check((await op(om, 'settings.save', { section, value: { a: 1 } })).data?.[section]?.a === 1, 'OM saves a settings section');
check((await op(insp, 'settings.get')).data?.[section]?.a === 1, 'everyone reads settings');
check((await op(om, 'settings.resetSection', { section })).data?.[section] === undefined, 'OM resets the section');
const audit = (await op(om, 'settings.audit')).data ?? [];
check(audit.filter((a) => a.section === section).map((a) => a.action).join(',') === 'reset,save', 'settings audit records save and reset');

// 11. Notifications are scoped to their recipient.
const omNotes = await op(om, 'notifications.listForUser', { userId: insp.id });
check(omNotes.data?.every((n) => n.recipient_id === om.id), "the OM's list holds only the OM's notifications");
const inspUnread = (await op(insp, 'notifications.unreadCount')).data;
await op(om, 'notifications.markAllRead', { userId: insp.id });
check((await op(insp, 'notifications.unreadCount')).data === inspUnread, "marking all read never touches someone else's");

// 12. Profiles.
check((await op(insp, 'users.update', { id: insp.id, patch: { position: 'Smoke tester', stored_signature_data_uri: SIG } })).data?.stored_signature_data_uri === SIG, 'inspector saves their own signature');
check((await op(insp, 'users.update', { id: om.id, patch: { position: 'x' } })).status === 403, "inspector cannot edit someone else's profile (403)");
check((await op(insp, 'users.getById', { id: om.id })).data?.stored_signature_data_uri === undefined, "other people's signatures stay hidden from inspectors");

// 13. Incidents (3b).
const nosat = await op(insp, 'checklists.persist', { record: draft() });
const incRecord = (over = {}) => ({
  id: crypto.randomUUID(),
  incident_ref: 'INC-TEMP',
  submission_id: nosat.data?.id,
  source_template_code: 'PGIA-PMM-F04',
  source_item_code: 'D-1.2',
  title: 'Smoke incident',
  description: 'Raised by data:smoke',
  deficiency_level: 2,
  location_label: 'Smoke outfall',
  status: 'open',
  attachments: [],
  ...over,
});
const inc1 = await op(insp, 'incidents.persist', { record: incRecord() });
const inc2 = await op(insp, 'incidents.persist', { record: incRecord() });
const n1 = Number(inc1.data?.seq);
check(inc1.status === 200 && /^INC-\d{4}-\d{4}$/.test(inc1.data?.incident_ref ?? '') && inc2.data?.seq === n1 + 1, 'incidents get server numbers in sequence', [inc1.data?.incident_ref, inc2.data?.incident_ref]);
check(inc1.data?.reported_by === insp.id, 'the reporter is the session user');
check((await op(insp, 'incidents.persist', { record: incRecord({ attachments: [{ photo_url: 'x' }] }) })).status === 400, 'incident photos are rejected (400)');
check((await op(coo, 'incidents.get', { id: inc1.data?.id })).data?.id === inc1.data?.id, 'the COO can see the incident');
check((await op(insp, 'incidents.persist', { record: { ...inc1.data, status: 'assigned' } })).status === 409, 'leaving Open without a unit and target date is refused (409)');
const assigned = await op(insp, 'incidents.persist', { record: { ...inc1.data, status: 'assigned', assigned_unit: 'grounds', target_date: '2030-01-01' } });
check(assigned.data?.status === 'assigned', 'incident assigned to a unit');
const upd = await op(insp, 'incidents.addUpdate', { incidentId: inc1.data?.id, body: 'Smoke update', status_from: 'open', status_to: 'assigned' });
check(upd.data?.author_id === insp.id, 'updates are written as the session user');
check((await op(insp, 'incidents.persist', { record: { ...assigned.data, status: 'closed' } })).status === 409, 'closing without SAT verification is refused (409)');
const verified = await op(om, 'incidents.persist', { record: { ...assigned.data, verification: { result: 'sat', note: 'Smoke cleared' } } });
check(verified.data?.verification?.verified_by === om.id, 'verification is attributed to whoever recorded it');
const closed = await op(om, 'incidents.persist', { record: { ...verified.data, status: 'closed' } });
check(closed.data?.status === 'closed' && closed.data?.closed_at, 'incident closed');
check((await op(om, 'incidents.persist', { record: { ...closed.data, title: 'changed' } })).status === 409, 'a closed incident cannot be changed (409)');

// 14. Work orders on the second incident.
const woRec = { id: crypto.randomUUID(), incident_id: inc2.data?.id, assigned_to_name: 'Grounds', deficiency_level: 2, description_of_work: 'Smoke work', status: 'issued' };
const wo = await op(insp, 'workOrders.persist', { record: woRec });
check(wo.status === 200 && /^WO-\d{4}-\d{4}$/.test(wo.data?.work_order_number ?? ''), 'work order gets a server number', wo.data?.work_order_number);
check((await op(insp, 'workOrders.persist', { record: { ...wo.data, status: 'verified' } })).status === 409, 'a work order cannot be verified by saving it (409)');
await op(insp, 'workOrders.persist', { record: { ...wo.data, status: 'completed', area_cleared_for_operations: true } });
const woApproval = (await op(om, 'approvals.listInbox')).data?.find((a) => a.entity_id === wo.data?.id);
check(Boolean(woApproval), 'completing a work order creates its verification approval');
check((await op(insp, 'approvals.decide', { id: woApproval?.id, decision: 'approved' })).status === 403, 'an inspector cannot verify a work order (403)');
check((await op(coo, 'approvals.decide', { id: woApproval?.id, decision: 'approved', signature_data_uri: SIG })).status === 200, 'the COO verifies the work order');
const lockedWo = await op(insp, 'workOrders.get', { id: wo.data?.id });
check(lockedWo.data?.status === 'verified' && lockedWo.data?.locked === true, 'the verified work order is locked');

// Cleanup: deactivate the smoke accounts.
for (const who of [om, coo, insp]) {
  await http('/api/users/update', { cookie: admin.cookie, body: { id: who.id, is_active: false } });
}
await http('/api/auth/logout', { cookie: admin.cookie });

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
