/**
 * Who may see and change incidents and work orders, and what a valid payload
 * looks like (sub-project 3b). Pure functions; tests/dataIncidentRules.test.js.
 *
 * Status rules are NOT re-written here: the server runs the same
 * incidentTransitionBlockers / workOrderVerifiedBlockers the screens use, so
 * the two can never disagree.
 */
import { HttpError } from '../../api/_shared.js';
import { WORK_ORDERS_ENABLED, incidentTransitionBlockers, workOrderVerifiedBlockers } from '../../src/lib/incidentLifecycle.js';
import { PHOTO_MESSAGE, assertPlainFormData, isSupervisor, optionalText, validId } from './rules.js';

export const INCIDENT_STATUSES = ['open', 'assigned', 'in_progress', 'resolved', 'closed'];
export const WO_PERSIST_STATUSES = ['issued', 'in_progress', 'completed'];
export const DESCRIPTION_MAX = 500;
export const UPDATE_BODY_MAX = 2000;

const bad = (message) => new HttpError(400, message);
const forbid = (message) => new HttpError(403, message);
const conflict = (message) => new HttpError(409, message);
export const incidentNotFound = () => new HttpError(404, 'Incident not found');

// ── Visibility and permission ──────────────────────────────────────────────

/** Reporter, assigned person, OM, COO, admin (spec 3b §2). */
export function canSeeIncident(actor, row) {
  if (!actor || !row) return false;
  return isSupervisor(actor) || row.reported_by === actor.id || (row.assigned_to != null && row.assigned_to === actor.id);
}

export function assertCanSeeIncident(actor, row) {
  if (!canSeeIncident(actor, row)) throw incidentNotFound();
}

export function assertCanEditIncident(actor, row) {
  assertCanSeeIncident(actor, row);
  if (row.status === 'closed') throw conflict('A closed incident cannot be changed');
}

/** Approvals on a work order: OM/COO verification by supervisors; CEC by admin (no CEC role yet). */
export function canSeeWorkOrderApproval(actor, approval) {
  if (approval.assigned_to && approval.assigned_to === actor.id) return true;
  if (approval.approval_role === 'om_coo_verification') return isSupervisor(actor);
  if (approval.approval_role === 'cec_clearance') return actor.role === 'admin';
  return false;
}

export function assertCanDecideWorkOrder(actor, approval, decision) {
  if (approval.status !== 'pending') throw conflict('This approval has already been decided');
  if (decision !== 'approved' && decision !== 'rejected') throw bad('decision must be "approved" or "rejected"');
  const allowed =
    approval.approval_role === 'om_coo_verification'
      ? isSupervisor(actor)
      : approval.approval_role === 'cec_clearance'
        ? actor.role === 'admin' || (approval.assigned_to && approval.assigned_to === actor.id)
        : false;
  if (!allowed) throw forbid('This approval is not yours to decide');
}

// ── Payload validation ─────────────────────────────────────────────────────

function text(value, label, max = 2000) {
  return optionalText(value, label, max);
}

function requiredText(value, label, max) {
  const s = text(value, label, max);
  if (!s || !s.trim()) throw bad(`${label} is required`);
  return s;
}

function number(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw bad(`${label} must be a number`);
  return n;
}

function bool01(value) {
  if (value === undefined || value === null) return null;
  return value ? 1 : 0;
}

function ymd(value, label) {
  const s = text(value, label, 40);
  if (s === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) throw bad(`${label} must be a date`);
  return s.slice(0, 10);
}

function level(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 4) throw bad('Deficiency level must be 1 to 4');
  return n;
}

function optionalId(value, label) {
  if (value === undefined || value === null || value === '' || value === 'local') return null;
  return validId(value, label);
}

/** The in-app SAT verification. Photos are off, so photo_url must be empty. */
function validateVerification(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw bad('verification must be an object');
  if ((raw.photo_url ?? null) !== null) throw bad(PHOTO_MESSAGE);
  if (raw.result !== 'sat') throw bad('verification.result must be "sat"');
  return { result: 'sat', note: text(raw.note, 'Verification note', 2000) ?? '' };
}

/**
 * Everything an incident save may set. Server-owned fields (numbers,
 * reporter, timestamps) are not read from the browser at all.
 */
export function validateIncidentPayload(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw bad('record must be an object');
  if (Array.isArray(record.attachments) && record.attachments.length) throw bad(PHOTO_MESSAGE);
  if ((record.photo_url ?? null) !== null || (record.photo_local_id ?? null) !== null) throw bad(PHOTO_MESSAGE);
  const status = record.status ?? 'open';
  if (!INCIDENT_STATUSES.includes(status)) throw bad('Unknown incident status');
  const method = text(record.location_capture_method, 'location_capture_method', 20);
  if (method && !['gps', 'map_pin', 'manual'].includes(method)) throw bad('Unknown location capture method');

  const fields = {
    id: validId(record.id, 'incident id'),
    status,
    submission_id: optionalId(record.submission_id, 'submission_id'),
    source_template_code: text(record.source_template_code, 'source_template_code', 64),
    source_section: text(record.source_section, 'source_section', 300),
    source_item_code: text(record.source_item_code, 'source_item_code', 64),
    source_item_description: text(record.source_item_description, 'source_item_description', 1000),
    source_inspection_type: text(record.source_inspection_type, 'source_inspection_type', 64),
    source_inspection_date: ymd(record.source_inspection_date, 'source_inspection_date'),
    inspector_name: text(record.inspector_name, 'inspector_name', 200),
    title: requiredText(record.title, 'Title', 180),
    description: requiredText(record.description, 'Description', DESCRIPTION_MAX),
    deficiency_level: level(record.deficiency_level),
    category: text(record.category, 'category', 64),
    incident_type: text(record.incident_type, 'incident_type', 64),
    potential_impact: text(record.potential_impact, 'potential_impact'),
    immediate_action_taken: text(record.immediate_action_taken, 'immediate_action_taken'),
    location_label: requiredText(record.location_label, 'Location', 300),
    location_id: text(record.location_id, 'location_id', 64),
    latitude: number(record.latitude, 'latitude'),
    longitude: number(record.longitude, 'longitude'),
    location_accuracy_m: number(record.location_accuracy_m, 'location_accuracy_m'),
    location_captured_at: text(record.location_captured_at, 'location_captured_at', 40),
    location_capture_method: method,
    location_user_adjusted: record.location_user_adjusted ? 1 : 0,
    department: text(record.department, 'department', 64),
    assigned_to: optionalId(record.assigned_to, 'assigned_to'),
    assigned_team: text(record.assigned_unit ?? record.assigned_team, 'assigned unit', 64),
    assigned_at: text(record.assigned_at, 'assigned_at', 40),
    target_date: ymd(record.target_date, 'target_date'),
    closure_notes: text(record.closure_notes, 'closure_notes'),
    reinspection_submission_id: optionalId(record.reinspection_submission_id, 'reinspection_submission_id'),
    verification: validateVerification(record.verification),
  };
  for (const key of ['latitude', 'longitude']) {
    const v = fields[key];
    if (v !== null && Math.abs(v) > (key === 'latitude' ? 90 : 180)) throw bad(`${key} is out of range`);
  }
  assertPlainFormData(fields);
  return fields;
}

/** Server-side status gate — the same blockers the screen shows. */
export function assertIncidentTransition(current, next, { workOrders = [] } = {}) {
  if (!current) {
    if (next.status !== 'open') throw bad('A new incident starts Open');
    return;
  }
  if (current.status === next.status) return;
  const merged = { ...current, ...next, assigned_unit: next.assigned_team, verification: next.verification };
  const blockers = incidentTransitionBlockers(merged, next.status, {
    workOrders,
    reinspection: merged.reinspection_submission_id,
    requireWorkOrder: WORK_ORDERS_ENABLED,
  });
  if (blockers.length) throw conflict(blockers.join(' '));
}

export function validateUpdateBody(body) {
  const s = String(body ?? '').trim();
  if (!s) throw bad('An update needs some text');
  if (s.length > UPDATE_BODY_MAX) throw bad('That update is too long');
  return s;
}

/** Work-order fields a save may set. Number, issuer, status `verified`, lock and sign-offs are server-owned. */
export function validateWorkOrderPayload(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw bad('record must be an object');
  const status = record.status ?? 'issued';
  if (status === 'verified') throw conflict('A work order is verified through its approval, not by saving it');
  if (!WO_PERSIST_STATUSES.includes(status)) throw bad('Unknown work order status');
  const fields = {
    id: validId(record.id, 'work order id'),
    incident_id: validId(record.incident_id, 'incident_id'),
    status,
    date_issued: ymd(record.date_issued, 'date_issued'),
    assigned_to_name: requiredText(record.assigned_to_name, 'Assigned to', 200),
    assigned_to_user: optionalId(record.assigned_to_user, 'assigned_to_user'),
    deficiency_level: level(record.deficiency_level),
    description_of_work: requiredText(record.description_of_work, 'Description of work', 2000),
    location_text: text(record.location_text, 'location_text', 300),
    target_completion_date: ymd(record.target_completion_date, 'target_completion_date'),
    notam_required: bool01(record.notam_required),
    notam_ref: text(record.notam_ref, 'notam_ref', 100),
    cec_clearance_required: record.cec_clearance_required ? 1 : 0,
    date_works_completed: ymd(record.date_works_completed, 'date_works_completed'),
    completed_by: text(record.completed_by, 'completed_by', 200),
    description_of_work_performed: text(record.description_of_work_performed, 'description_of_work_performed'),
    materials_used: text(record.materials_used, 'materials_used'),
    test_verification_results: text(record.test_verification_results, 'test_verification_results'),
    area_cleared_for_operations: bool01(record.area_cleared_for_operations),
    area_not_cleared_explanation: text(record.area_not_cleared_explanation, 'area_not_cleared_explanation'),
    cec_clearance_date: ymd(record.cec_clearance_date, 'cec_clearance_date'),
  };
  assertPlainFormData(fields);
  return fields;
}

/** The same gate the screen uses before a work order can be verified. */
export function workOrderVerifyBlockers(wo, approvalRole) {
  const asBool = (v) => (v === null || v === undefined ? v : Boolean(v));
  return workOrderVerifiedBlockers({
    ...wo,
    status: 'verified',
    area_cleared_for_operations: asBool(wo.area_cleared_for_operations),
    notam_required: asBool(wo.notam_required),
    cec_clearance_required: Boolean(wo.cec_clearance_required),
    cec_clearance_issued: approvalRole === 'cec_clearance' ? true : asBool(wo.cec_clearance_issued),
  });
}
