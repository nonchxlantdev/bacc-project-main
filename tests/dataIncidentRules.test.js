import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCanDecideWorkOrder,
  assertCanEditIncident,
  assertIncidentTransition,
  canSeeIncident,
  canSeeWorkOrderApproval,
  validateIncidentPayload,
  validateUpdateBody,
  validateWorkOrderPayload,
  workOrderVerifyBlockers,
} from '../worker/data/incidentRules.js';

const who = (role, id = role) => ({ id, role });
const insp = who('inspector', 'insp');
const other = who('inspector', 'other');
const status = (fn) => {
  try {
    fn();
    return 200;
  } catch (err) {
    return err.status;
  }
};

test('visibility: reporter, assignee, OM, COO, admin', () => {
  const row = { reported_by: 'insp', assigned_to: 'tech', status: 'open' };
  assert.equal(canSeeIncident(insp, row), true);
  assert.equal(canSeeIncident(who('electrical_tech', 'tech'), row), true);
  for (const r of ['om', 'coo', 'admin']) assert.equal(canSeeIncident(who(r), row), true, r);
  assert.equal(canSeeIncident(other, row), false);
  assert.equal(canSeeIncident(who('duty_manager'), row), false);
  assert.equal(canSeeIncident(other, { ...row, assigned_to: null }), false);
});

test('editing: visible and not closed; strangers get 404, not 403', () => {
  const row = { reported_by: 'insp', status: 'open' };
  assert.equal(status(() => assertCanEditIncident(insp, row)), 200);
  assert.equal(status(() => assertCanEditIncident(other, row)), 404);
  assert.equal(status(() => assertCanEditIncident(who('om'), { ...row, status: 'closed' })), 409);
});

test('work-order approvals: OM/COO verification by supervisors, CEC by admin or assignee', () => {
  const omcoo = { approval_role: 'om_coo_verification', status: 'pending', assigned_to: 'om' };
  const cec = { approval_role: 'cec_clearance', status: 'pending', assigned_to: 'tech' };
  assert.equal(status(() => assertCanDecideWorkOrder(who('coo'), omcoo, 'approved')), 200);
  assert.equal(status(() => assertCanDecideWorkOrder(insp, omcoo, 'approved')), 403);
  assert.equal(status(() => assertCanDecideWorkOrder(who('om'), cec, 'approved')), 403);
  assert.equal(status(() => assertCanDecideWorkOrder(who('admin'), cec, 'approved')), 200);
  assert.equal(status(() => assertCanDecideWorkOrder(who('electrical_tech', 'tech'), cec, 'rejected')), 200);
  assert.equal(status(() => assertCanDecideWorkOrder(who('om'), { ...omcoo, status: 'approved' }, 'approved')), 409);
  assert.equal(canSeeWorkOrderApproval(who('coo'), omcoo), true);
  assert.equal(canSeeWorkOrderApproval(who('coo'), cec), false);
  assert.equal(canSeeWorkOrderApproval(insp, omcoo), false);
});

const incident = (over = {}) => ({
  id: '77777777-7777-4777-8777-777777777777',
  status: 'open',
  title: 'Blocked drain',
  description: 'Silt at outfall',
  deficiency_level: 2,
  location_label: 'Outfall 3',
  attachments: [],
  ...over,
});

test('incident payload: required fields, ranges and photos', () => {
  const v = validateIncidentPayload(incident({ assigned_unit: 'grounds', latitude: '17.5', location_user_adjusted: true }));
  assert.equal(v.assigned_team, 'grounds');
  assert.equal(v.latitude, 17.5);
  assert.equal(v.location_user_adjusted, 1);
  assert.equal(v.reported_by, undefined, 'reporter is server-owned');
  assert.equal(status(() => validateIncidentPayload(incident({ title: '' }))), 400);
  assert.equal(status(() => validateIncidentPayload(incident({ deficiency_level: 7 }))), 400);
  assert.equal(status(() => validateIncidentPayload(incident({ latitude: 200 }))), 400);
  assert.equal(status(() => validateIncidentPayload(incident({ description: 'x'.repeat(501) }))), 400);
  assert.equal(status(() => validateIncidentPayload(incident({ attachments: [{ photo_url: 'data:image/png;base64,AA' }] }))), 400);
  assert.equal(status(() => validateIncidentPayload(incident({ verification: { result: 'sat', photo_url: 'data:x' } }))), 400);
  assert.equal(status(() => validateIncidentPayload(incident({ closure_notes: 'data:image/png;base64,AA' }))), 400);
  assert.equal(status(() => validateIncidentPayload(incident({ status: 'done' }))), 400);
  assert.deepEqual(validateIncidentPayload(incident({ verification: { result: 'sat', note: 'ok', verified_by: 'admin' } })).verification, {
    result: 'sat',
    note: 'ok',
  });
});

test('transitions use the shared blockers', () => {
  const open = { status: 'open', assigned_team: null, target_date: null };
  assert.equal(status(() => assertIncidentTransition(null, { status: 'closed' })), 400);
  assert.equal(status(() => assertIncidentTransition(open, { ...open, status: 'assigned' })), 409);
  assert.equal(
    status(() => assertIncidentTransition(open, { ...open, status: 'assigned', assigned_team: 'grounds', target_date: '2026-10-20' })),
    200,
  );
  const resolved = { status: 'resolved', assigned_team: 'grounds', target_date: '2026-10-20' };
  assert.equal(status(() => assertIncidentTransition(resolved, { ...resolved, status: 'closed', verification: null })), 409);
  assert.equal(status(() => assertIncidentTransition(resolved, { ...resolved, status: 'closed', verification: { result: 'sat' } })), 200);
  assert.equal(
    status(() => assertIncidentTransition(resolved, { ...resolved, status: 'closed', reinspection_submission_id: 'x' })),
    200,
  );
});

test('update bodies and work-order payloads', () => {
  assert.equal(validateUpdateBody('  hi  '), 'hi');
  assert.equal(status(() => validateUpdateBody('   ')), 400);
  assert.equal(status(() => validateUpdateBody('x'.repeat(2001))), 400);
  const wo = {
    id: '88888888-8888-4888-8888-888888888888',
    incident_id: '77777777-7777-4777-8777-777777777777',
    assigned_to_name: 'Grounds',
    deficiency_level: 2,
    description_of_work: 'Clear silt',
    notam_required: false,
  };
  const v = validateWorkOrderPayload(wo);
  assert.equal(v.notam_required, 0);
  assert.equal(v.status, 'issued');
  assert.equal(status(() => validateWorkOrderPayload({ ...wo, status: 'verified' })), 409);
  assert.equal(status(() => validateWorkOrderPayload({ ...wo, description_of_work: '' })), 400);
});

test('verify blockers: area, NOTAM, CEC', () => {
  assert.equal(workOrderVerifyBlockers({ area_cleared_for_operations: 0 }, 'om_coo_verification').length, 1);
  assert.equal(workOrderVerifyBlockers({ notam_required: 1, notam_ref: '' }, 'om_coo_verification').length, 1);
  assert.equal(workOrderVerifyBlockers({ cec_clearance_required: 1, cec_clearance_issued: null }, 'om_coo_verification').length, 1);
  assert.equal(workOrderVerifyBlockers({ cec_clearance_required: 1, cec_clearance_issued: null }, 'cec_clearance').length, 0);
  assert.equal(workOrderVerifyBlockers({ area_cleared_for_operations: 1 }, 'om_coo_verification').length, 0);
});
