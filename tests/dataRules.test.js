import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITS,
  assertCanAcknowledge,
  assertCanAmend,
  assertCanDecide,
  assertCanDeleteDraft,
  assertCanEditDraft,
  assertCanGenerate,
  assertCanSeeApproval,
  assertCanSubmit,
  assertCanWriteSettings,
  assertSelf,
  canSeeOthersSignatures,
  foldAmendments,
  validateDrawings,
  validateProfilePatch,
  validateRecordPayload,
} from '../worker/data/rules.js';

const who = (role, id = role) => ({ id, role });
const inspector = who('inspector', 'insp');
const other = who('inspector', 'other');
const om = who('om');
const coo = who('coo');
const admin = who('admin');
const draft = { inspector_id: 'insp', status: 'draft', locked: 0 };
const filed = { inspector_id: 'insp', status: 'submitted', locked: 1 };
const status = (fn) => {
  try {
    fn();
    return 200;
  } catch (err) {
    return err.status;
  }
};

test('draft edit: owner or managers, never once locked', () => {
  assert.equal(status(() => assertCanEditDraft(inspector, draft)), 200);
  assert.equal(status(() => assertCanEditDraft(om, draft)), 200);
  assert.equal(status(() => assertCanEditDraft(admin, draft)), 200);
  assert.equal(status(() => assertCanEditDraft(other, draft)), 403);
  assert.equal(status(() => assertCanEditDraft(coo, draft)), 403);
  assert.equal(status(() => assertCanEditDraft(inspector, filed)), 409);
  assert.equal(status(() => assertCanEditDraft(om, filed)), 409);
});

test('submit: owner only', () => {
  assert.equal(status(() => assertCanSubmit(inspector, draft)), 200);
  assert.equal(status(() => assertCanSubmit(om, draft)), 403);
  assert.equal(status(() => assertCanSubmit(other, draft)), 403);
  assert.equal(status(() => assertCanSubmit(inspector, filed)), 409);
});

test('inspector cannot delete a draft; managers can, never a filed record', () => {
  assert.equal(status(() => assertCanDeleteDraft(inspector, draft)), 403);
  assert.equal(status(() => assertCanDeleteDraft(coo, draft)), 403);
  assert.equal(status(() => assertCanDeleteDraft(om, draft)), 200);
  assert.equal(status(() => assertCanDeleteDraft(admin, draft)), 200);
  assert.equal(status(() => assertCanDeleteDraft(om, filed)), 409);
});

test('amend: supervisors; acknowledge: managers', () => {
  assert.equal(status(() => assertCanAmend(coo)), 200);
  assert.equal(status(() => assertCanAmend(om)), 200);
  assert.equal(status(() => assertCanAmend(inspector)), 403);
  assert.equal(status(() => assertCanAcknowledge(om)), 200);
  assert.equal(status(() => assertCanAcknowledge(admin)), 200);
  assert.equal(status(() => assertCanAcknowledge(coo)), 403);
  assert.equal(status(() => assertCanAcknowledge(inspector)), 403);
});

test('COO can amend and reject, but cannot acknowledge by either route', () => {
  const approval = { entity_type: 'checklist_submission', status: 'pending', assigned_to: 'om' };
  assert.equal(status(() => assertCanAmend(coo)), 200);
  assert.equal(status(() => assertCanDecide(coo, approval, 'rejected')), 200);
  assert.equal(status(() => assertCanDecide(coo, approval, 'approved')), 403);
  assert.equal(status(() => assertCanAcknowledge(coo)), 403);
});

test('decide: approved needs a manager, rejected needs assignee or supervisor', () => {
  const assignedToInspector = { entity_type: 'checklist_submission', status: 'pending', assigned_to: 'insp' };
  assert.equal(status(() => assertCanDecide(inspector, assignedToInspector, 'rejected')), 200);
  assert.equal(status(() => assertCanDecide(inspector, assignedToInspector, 'approved')), 403);
  assert.equal(status(() => assertCanDecide(other, assignedToInspector, 'rejected')), 403);
  assert.equal(status(() => assertCanDecide(om, assignedToInspector, 'approved')), 200);
  assert.equal(status(() => assertCanDecide(om, assignedToInspector, 'maybe')), 400);
  assert.equal(status(() => assertCanDecide(om, { ...assignedToInspector, status: 'approved' }, 'approved')), 409);
  assert.equal(status(() => assertCanDecide(om, { ...assignedToInspector, entity_type: 'work_order' }, 'approved')), 501);
});

test('approval visibility: assignee or supervisors', () => {
  const a = { assigned_to: 'insp' };
  assert.equal(status(() => assertCanSeeApproval(inspector, a)), 200);
  assert.equal(status(() => assertCanSeeApproval(other, a)), 403);
  assert.equal(status(() => assertCanSeeApproval(coo, a)), 200);
});

test('generate: supervisors; settings writes: managers; profile: self', () => {
  assert.equal(status(() => assertCanGenerate(coo)), 200);
  assert.equal(status(() => assertCanGenerate(inspector)), 403);
  assert.equal(status(() => assertCanWriteSettings(om)), 200);
  assert.equal(status(() => assertCanWriteSettings(coo)), 403);
  assert.equal(status(() => assertSelf(inspector, 'insp')), 200);
  assert.equal(status(() => assertSelf(inspector, 'other')), 403);
  assert.equal(canSeeOthersSignatures(coo), true);
  assert.equal(canSeeOthersSignatures(inspector), false);
});

const baseRecord = () => ({
  id: '11111111-1111-4111-8111-111111111111',
  template_id: 'annex-d-drainage',
  status: 'draft',
  header: { date: '2026-10-09', inspectionType: 'monthly_routine' },
  items: { A1: { result: 'sat', remarks: '', photo_url: null, photo_local_id: null } },
  signoffs: [],
  summary: { notes: 'hi' },
  schema: { huge: true },
  rainfall_mm: 3,
});

test('payload: items keep result/remarks only; registry keys never reach form_json', () => {
  const v = validateRecordPayload(baseRecord());
  assert.deepEqual(v.items, { A1: { result: 'sat', remarks: '', photo_url: null } });
  assert.deepEqual(JSON.parse(v.form_json), { summary: { notes: 'hi' }, rainfall_mm: 3 });
  assert.equal(v.inspection_date, '2026-10-09');
  assert.equal(v.drawings, null);
});

test('payload: photo data is rejected with 400', () => {
  const r = baseRecord();
  r.items.A1.photo_local_id = 'abc';
  assert.throws(() => validateRecordPayload(r), (e) => e.status === 400 && /Attachments unavailable at this time/.test(e.message));
  const r2 = baseRecord();
  r2.items.A1.photo_url = 'u/x.jpg';
  assert.throws(() => validateRecordPayload(r2), (e) => e.status === 400);
});

test('payload: bad result, status and id are rejected', () => {
  assert.throws(() => validateRecordPayload({ ...baseRecord(), items: { A1: { result: 'yes' } } }), (e) => e.status === 400);
  assert.throws(() => validateRecordPayload({ ...baseRecord(), status: 'acknowledged' }), (e) => e.status === 400);
  assert.throws(() => validateRecordPayload({ ...baseRecord(), id: '../x' }), (e) => e.status === 400);
});

test('payload: om_acknowledgment and empty stubs are never written by a save', () => {
  const r = baseRecord();
  r.signoffs = [
    { role: 'om_acknowledgment', name: 'Boss', signature_data_uri: 'data:image/png;base64,AA' },
    { role: 'supervisor', name: '', signature_data_uri: null },
    { role: 'inspector', name: 'Ana', signature_data_uri: 'data:image/png;base64,AA' },
  ];
  assert.deepEqual(
    validateRecordPayload(r).signoffs.map((s) => s.role),
    ['inspector'],
  );
});

test('payload: oversize signature is rejected', () => {
  const r = baseRecord();
  r.signoffs = [{ role: 'inspector', name: 'A', signature_data_uri: `data:image/png;base64,${'A'.repeat(LIMITS.signatureChars)}` }];
  assert.throws(() => validateRecordPayload(r), (e) => e.status === 400 && /too large/.test(e.message));
});

test('drawings: at most 6, each under the size cap, images only', () => {
  const d = (n) => ({ id: `d${n}`, label: `L${n}`, dataUri: 'data:image/jpeg;base64,AA' });
  assert.equal(validateDrawings({ c: [d(1), d(2), d(3)], e: [d(4), d(5), d(6)] }).length, 6);
  assert.throws(() => validateDrawings({ c: [d(1), d(2), d(3), d(4)], e: [d(5), d(6), d(7)] }), (e) => e.status === 400);
  assert.throws(
    () => validateDrawings({ c: [{ ...d(1), dataUri: `data:image/jpeg;base64,${'A'.repeat(LIMITS.drawingChars)}` }] }),
    (e) => e.status === 400 && /too large/.test(e.message),
  );
  assert.throws(() => validateDrawings({ c: [{ ...d(1), dataUri: 'javascript:alert(1)' }] }), (e) => e.status === 400);
  const flat = validateDrawings({ c: [d(1), d(2)] });
  assert.deepEqual(flat.map((x) => [x.section_key, x.position]), [['c', 0], ['c', 1]]);
});

test('profile patch: self fields only', () => {
  assert.deepEqual(validateProfilePatch({ full_name: ' Ana ', hide_signature_prompt: 1 }), {
    profile: { full_name: 'Ana' },
    signature: { hide_signature_prompt: true },
  });
  assert.throws(() => validateProfilePatch({ role: 'admin' }), (e) => e.status === 403);
  assert.throws(() => validateProfilePatch({ is_approver: true }), (e) => e.status === 403);
  assert.throws(() => validateProfilePatch({ avatar_url: 'x' }), (e) => e.status === 400 && /Profile photos unavailable at this time/.test(e.message));
  assert.throws(() => validateProfilePatch({ stored_signature_data_uri: 'not-an-image' }), (e) => e.status === 400);
});

test('profile patch: tours_seen is a small map of tour ids to versions', () => {
  assert.deepEqual(validateProfilePatch({ tours_seen: { intro: 1, 'checklists-mine': 2 } }), {
    profile: { tours_seen: '{"intro":1,"checklists-mine":2}' },
    signature: {},
  });
  assert.deepEqual(validateProfilePatch({ tours_seen: {} }).profile, { tours_seen: '{}' });
  const rejects = [
    null,
    [],
    'intro',
    { intro: 0 },
    { intro: 1.5 },
    { intro: '1' },
    { intro: 1001 },
    { Intro: 1 },
    { ['x'.repeat(41)]: 1 },
    { '<script>': 1 },
    Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`t${i}`, 1])),
  ];
  for (const value of rejects) {
    assert.throws(() => validateProfilePatch({ tours_seen: value }), (e) => e.status === 400, JSON.stringify(value));
  }
});

test('amendments fold: later entries replace, null undoes', () => {
  const a1 = { item_code: 'A1', reason: 'r', to: 'sat' };
  const a2 = { item_code: 'A2', reason: 'r', to: 'sat' };
  assert.deepEqual(
    foldAmendments([
      { item_code: 'A1', reason: 'r', amendment: a1 },
      { item_code: 'A2', reason: 'r', amendment: a2 },
      { item_code: 'A1', reason: 'r', amendment: null },
    ]),
    [a2],
  );
});
