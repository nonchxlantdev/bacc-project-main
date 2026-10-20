/**
 * Who may do what with portal data, and what a valid payload looks like.
 *
 * Pure functions only: no SQL, no Request. service.js calls these before it
 * touches the store, and tests/dataRules.test.js covers every rule in the
 * spec's tables (docs/superpowers/specs/2026-10-09-d1-core-checklists-design.md §3).
 */
import { HttpError } from '../../api/_shared.js';
import { ATTACHMENTS_UNAVAILABLE, PROFILE_PHOTOS_UNAVAILABLE } from '../../src/lib/unavailable.js';

export const MANAGERS = Object.freeze(['om', 'admin']);
export const SUPERVISORS = Object.freeze(['om', 'coo', 'admin']);

export const LIMITS = Object.freeze({
  drawingsPerChecklist: 6,
  drawingChars: 820_000,
  signatureChars: 200_000,
  signoffsPerChecklist: 40,
  itemsPerChecklist: 2000,
  remarksChars: 5000,
  recordJsonChars: 1_500_000,
  formJsonChars: 200_000,
  settingsValueChars: 200_000,
});

export const LOCKED_MESSAGE = 'Locked checklist submissions cannot be overwritten; create a correction instead';
export const PHOTO_MESSAGE = ATTACHMENTS_UNAVAILABLE;
export const IN_3B_MESSAGE = 'Available in 3b';

const RESULTS = new Set(['sat', 'no_sat', 'na']);
const ID_RE = /^[A-Za-z0-9-]{1,64}$/;

/** Keys owned by the server or the template registry — never stored in form_json. */
export const NON_FORM_KEYS = new Set([
  'id', 'template_id', 'template_version', 'inspector_id', 'status', 'locked', 'schema',
  'content_schema', 'field_map', 'print_template_key', 'template_code', 'inspector_name',
  'amendments', 'returned', 'pending_sync', 'updatedAt', 'updated_at', 'created_at', 'submitted_at',
  'reopened_at', 'reopened_by', 'supersedes_id', 'exported_pdf_path', 'header', 'items',
  'signoffs', 'attachments', 'drawings_changed', 'inspection_type', 'inspection_date',
  'deficiencies_summary', 'location_id', 'content_hash',
]);

const forbid = (message = 'Not allowed for your role') => new HttpError(403, message);
const conflict = (message) => new HttpError(409, message);
const bad = (message) => new HttpError(400, message);

export const isManager = (actor) => MANAGERS.includes(actor?.role);
export const isSupervisor = (actor) => SUPERVISORS.includes(actor?.role);
export const canSeeOthersSignatures = isSupervisor;

// ── Permission guards ──────────────────────────────────────────────────────

export function assertSelf(actor, id) {
  if (!actor?.id || actor.id !== id) throw forbid('You can only change your own profile');
}

export function assertCanEditDraft(actor, row) {
  if (row.locked || row.status !== 'draft') throw conflict(LOCKED_MESSAGE);
  if (row.inspector_id !== actor.id && !isManager(actor)) {
    throw forbid('Only the inspector who started this draft, or an OM, can edit it');
  }
}

export function assertCanSubmit(actor, row) {
  if (row.locked || row.status !== 'draft') throw conflict(LOCKED_MESSAGE);
  if (row.inspector_id !== actor.id) throw forbid('Only the inspector who started this checklist can submit it');
}

/** The inspector who started a draft can throw it away; so can the OM / an administrator. */
export function assertCanDeleteDraft(actor, row) {
  if (row.inspector_id !== actor?.id && !isManager(actor)) {
    throw forbid('Only the inspector who started this draft, or an OM, can delete it');
  }
  if (row.locked || row.status !== 'draft') {
    throw conflict('Only unlocked drafts can be deleted. Submitted records stay on file.');
  }
}

/**
 * The inspector takes back their own submission to keep editing it — only
 * while it waits for the OM. Once signed off it is a filed record (§11) and
 * changes go through an OM correction.
 */
export function assertCanRecall(actor, row) {
  if (row.inspector_id !== actor?.id) throw forbid('Only the inspector who submitted this checklist can recall it');
  if (row.status === 'acknowledged') {
    throw conflict('This checklist is already signed off. Ask the Operations Manager to start a correction.');
  }
  if (row.status !== 'submitted') throw conflict('Only a submitted checklist can be recalled');
}

export function assertCanAmend(actor) {
  if (!isSupervisor(actor)) throw forbid('Only an OM, the COO or an administrator can correct a filed item');
}

/** A correction of a signed-off record is started by the OM (or an administrator). */
export function assertCanCorrect(actor) {
  if (!isManager(actor)) throw forbid('Only the Operations Manager can start a correction of a filed checklist');
}

/** A draft is private to the person who started it, and to the OM / administrators. */
export function canSeeChecklist(actor, row) {
  if (!row) return false;
  if (row.status !== 'draft') return true;
  return row.inspector_id === actor?.id || isManager(actor);
}

/** Returning a checklist for changes needs a reason the inspector can act on. */
export function validateReturnNote(notes) {
  if (typeof notes !== 'string' || !notes.trim()) throw bad('Say what needs changing before returning the checklist');
  if (notes.length > 2000) throw bad('That note is too long');
  return notes.trim();
}

export function assertCanAcknowledge(actor) {
  if (!isManager(actor)) throw forbid('Only an OM or an administrator can acknowledge a checklist');
}

export function assertCanSeeApproval(actor, approval) {
  if (isSupervisor(actor) || (approval.assigned_to && approval.assigned_to === actor.id)) return;
  throw forbid('This approval is not assigned to you');
}

export function assertCanDecide(actor, approval, decision) {
  if (approval.entity_type !== 'checklist_submission') throw new HttpError(501, IN_3B_MESSAGE);
  if (approval.status !== 'pending') throw conflict('This approval has already been decided');
  if (decision === 'approved') {
    assertCanAcknowledge(actor);
    return;
  }
  if (decision === 'rejected') {
    // "Return for changes" — the OM's call, same as approving.
    assertCanAcknowledge(actor);
    return;
  }
  throw bad('decision must be "approved" or "rejected"');
}

export function assertCanGenerate(actor) {
  if (!isSupervisor(actor)) throw forbid('Only an OM, the COO or an administrator can generate the schedule');
}

export function assertCanWriteSettings(actor) {
  if (!isManager(actor)) throw forbid('Only an OM or an administrator can change settings');
}

// ── Payload validation ─────────────────────────────────────────────────────

export function validId(value, label = 'id') {
  const s = String(value ?? '');
  if (!ID_RE.test(s)) throw bad(`Invalid ${label}`);
  return s;
}

function plainObject(value, label) {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw bad(`${label} must be an object`);
  return value;
}

export function optionalText(value, label, max = 500) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number') throw bad(`${label} must be text`);
  const s = String(value);
  if (s.length > max) throw bad(`${label} is too long`);
  return s;
}

export function validateResult(value) {
  if (value === null || value === undefined) return null;
  if (!RESULTS.has(value)) throw bad('Item results must be sat, no_sat, na or empty');
  return value;
}

function validateItems(raw) {
  const items = plainObject(raw, 'items');
  const codes = Object.keys(items);
  if (codes.length > LIMITS.itemsPerChecklist) throw bad('Too many checklist items');
  const out = {};
  for (const code of codes) {
    const row = plainObject(items[code], `items.${code}`);
    if ((row.photo_url ?? null) !== null || (row.photo_local_id ?? null) !== null) throw bad(PHOTO_MESSAGE);
    const remarks = row.remarks == null ? '' : String(row.remarks);
    if (remarks.length > LIMITS.remarksChars) throw bad(`Remarks for ${code} are too long`);
    out[code] = { result: validateResult(row.result), remarks, photo_url: null };
  }
  return out;
}

/** A sign-off date the signer chose: YYYY-MM-DD, a real calendar day, or nothing. */
export function validateSignDate(value, label = 'Sign-off date') {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw bad(`${label} must be a date (YYYY-MM-DD)`);
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw bad(`${label} is not a real date`);
  return value;
}

export function validateSignature(value, label = 'Signature') {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !value.startsWith('data:image/')) throw bad(`${label} must be an image`);
  if (value.length > LIMITS.signatureChars) throw bad(`${label} is too large`);
  return value;
}

/**
 * Sign-off blocks a save may write. The OM acknowledgment block is never
 * written by a save — only acknowledge() writes it — so it is dropped here
 * (a correction legitimately carries the original's copy). Empty stubs (no
 * name and no signature) are skipped, as in the Supabase adapter.
 */
function validateSignoffs(raw) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw bad('signoffs must be a list');
  if (raw.length > LIMITS.signoffsPerChecklist) throw bad('Too many sign-off blocks');
  const byRole = new Map();
  for (const sg of raw) {
    if (!sg || typeof sg !== 'object') continue;
    const role = optionalText(sg.role, 'Sign-off role', 64);
    if (!role || role === 'om_acknowledgment') continue;
    const signature = validateSignature(sg.signature_data_uri ?? sg.signature_image_path, `Signature for ${role}`);
    const name = optionalText(sg.name, 'Sign-off name', 200);
    if (!signature && sg.has_signature !== true && !(name && name.trim())) continue;
    byRole.set(role, {
      role,
      name: name && name.trim() ? name : 'Signed',
      position: optionalText(sg.position, 'Sign-off position', 200),
      signature_data_uri: signature,
      sign_date: validateSignDate(sg.sign_date, `Date for ${role}`),
      // List reads omit signature images and flag them instead; a save built
      // from such a record keeps the stored image (service.js).
      has_signature: !signature && sg.has_signature === true,
    });
  }
  return [...byRole.values()];
}

/** `attachments` is `{ [fieldKey]: Drawing[] }`. Returns a flat ordered list. */
export function validateDrawings(raw) {
  const groups = plainObject(raw, 'attachments');
  const out = [];
  for (const [section_key, list] of Object.entries(groups)) {
    if (list === undefined || list === null) continue;
    if (!Array.isArray(list)) throw bad('Each attachments entry must be a list');
    if (section_key.length > 64) throw bad('Attachment section key is too long');
    list.forEach((d, position) => {
      if (!d || typeof d !== 'object') throw bad('Invalid drawing');
      const data_uri = d.dataUri ?? d.data_uri;
      if (typeof data_uri !== 'string' || !data_uri.startsWith('data:image/')) throw bad('Drawings must be images');
      if (data_uri.length > LIMITS.drawingChars) {
        throw bad('This drawing is too large even after compression. The limit is about 600 KB.');
      }
      out.push({
        id: d.id ? validId(d.id, 'drawing id') : null,
        section_key,
        position,
        label: optionalText(d.label, 'Drawing caption', 200) ?? '',
        content_type: optionalText(d.contentType ?? d.content_type, 'Drawing type', 64) ?? 'image/jpeg',
        data_uri,
        added_at: optionalText(d.addedAt ?? d.added_at, 'addedAt', 40),
      });
    });
  }
  if (out.length > LIMITS.drawingsPerChecklist) {
    throw bad(`A checklist can carry at most ${LIMITS.drawingsPerChecklist} drawings`);
  }
  return out;
}

/**
 * Header and free form fields hold text and choices only. Images belong in
 * the capped drawings table and photos are off, so neither may ride in here
 * under another name.
 */
export function assertPlainFormData(value, depth = 0) {
  if (depth > 20) throw bad('Form data is nested too deeply');
  if (typeof value === 'string') {
    if (/^\s*data:/i.test(value)) throw bad('Images can only be attached as drawings');
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, inner] of Object.entries(value)) {
    if ((key === 'photo_url' || key === 'photo_local_id') && inner != null) throw bad(PHOTO_MESSAGE);
    assertPlainFormData(inner, depth + 1);
  }
}

/**
 * Split a browser record into what each table stores. Throws 400 on anything
 * malformed, oversize, or carrying photo data.
 */
export function validateRecordPayload(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw bad('record must be an object');
  const id = validId(record.id, 'checklist id');
  const status = record.status ?? 'draft';
  if (status !== 'draft' && status !== 'submitted') throw bad('status must be draft or submitted');
  const header = plainObject(record.header, 'header');
  const items = validateItems(record.items);
  const signoffs = validateSignoffs(record.signoffs);
  const hasDrawings = record.attachments !== undefined;
  const drawings = hasDrawings ? validateDrawings(record.attachments) : null;

  const form = {};
  for (const [key, value] of Object.entries(record)) {
    if (NON_FORM_KEYS.has(key) || value === undefined) continue;
    form[key] = value;
  }
  assertPlainFormData(form);

  assertPlainFormData(header);
  const header_json = JSON.stringify(header);
  const items_json = JSON.stringify(items);
  const form_json = JSON.stringify(form);
  if (form_json.length > LIMITS.formJsonChars) throw bad('The free-text parts of this checklist are too long to save');
  if (header_json.length + items_json.length + form_json.length > LIMITS.recordJsonChars) {
    throw bad('This checklist is too large to save');
  }

  return {
    id,
    status,
    template_id: optionalText(record.template_id, 'template_id', 128),
    template_version: optionalText(record.template_version, 'template_version', 16) ?? 'ed01',
    supersedes_id: record.supersedes_id ? validId(record.supersedes_id, 'supersedes_id') : null,
    location_id: optionalText(record.location_id, 'location_id', 64),
    inspection_type: optionalText(record.inspection_type ?? header.inspectionType, 'inspection_type', 64),
    inspection_date: optionalText(record.inspection_date ?? header.date, 'inspection_date', 10),
    deficiencies_summary: optionalText(record.deficiencies_summary, 'Deficiencies summary', 20000),
    header_json,
    items_json,
    form_json,
    items,
    signoffs,
    drawings,
    drawings_changed: record.drawings_changed === true,
  };
}

const PROFILE_FORBIDDEN = new Set([
  'role', 'is_active', 'can_login', 'is_approver', 'email', 'department', 'must_change_password',
  'password_hash', 'failed_login_count', 'locked_until',
]);

/** Self-service profile fields. Role, access and email go through /api/users/update. */
export function validateProfilePatch(patch) {
  const p = plainObject(patch, 'patch');
  for (const key of Object.keys(p)) {
    if (PROFILE_FORBIDDEN.has(key)) throw forbid('Ask an administrator to change that');
  }
  if (p.avatar_url !== undefined) throw bad(PROFILE_PHOTOS_UNAVAILABLE);
  const profile = {};
  const signature = {};
  if (p.full_name !== undefined) {
    const name = String(p.full_name ?? '').trim();
    if (!name || name.length > 120) throw bad('Name must be 1–120 characters');
    profile.full_name = name;
  }
  if (p.position !== undefined) {
    const position = String(p.position ?? '');
    if (position.length > 120) throw bad('Position is too long');
    profile.position = position;
  }
  if (p.has_ever_signed !== undefined) profile.has_ever_signed = Boolean(p.has_ever_signed);
  if (p.tours_seen !== undefined) profile.tours_seen = JSON.stringify(validateToursSeen(p.tours_seen));
  if (p.stored_signature_data_uri !== undefined) {
    signature.stored_signature_data_uri = validateSignature(p.stored_signature_data_uri);
  }
  if (p.stored_signature_updated_at !== undefined) {
    signature.stored_signature_updated_at = optionalText(p.stored_signature_updated_at, 'stored_signature_updated_at', 40);
  }
  if (p.hide_signature_prompt !== undefined) signature.hide_signature_prompt = Boolean(p.hide_signature_prompt);
  return { profile, signature };
}

export const TOURS_SEEN_LIMITS = Object.freeze({ maxTours: 40, maxVersion: 1000 });
const TOUR_ID_RE = /^[a-z][a-z0-9-]{0,39}$/;

/**
 * Guided-tour progress: `{ "<tour id>": <version seen> }`. Small and boring on
 * purpose — ids are short slugs, versions whole numbers — so a profile field
 * anyone can write for themselves cannot be used to park arbitrary data.
 */
export function validateToursSeen(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw bad('tours_seen must be an object');
  const entries = Object.entries(value);
  if (entries.length > TOURS_SEEN_LIMITS.maxTours) throw bad('tours_seen has too many entries');
  const out = {};
  for (const [id, version] of entries) {
    if (!TOUR_ID_RE.test(id)) throw bad('tours_seen has an invalid tour id');
    if (!Number.isInteger(version) || version < 1 || version > TOURS_SEEN_LIMITS.maxVersion) {
      throw bad('tours_seen versions must be whole numbers from 1 to 1000');
    }
    out[id] = version;
  }
  return out;
}

export function validateSettingsSection(section) {
  const s = String(section ?? '');
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(s)) throw bad('Invalid settings section');
  return s;
}

export function validateSettingsValue(value) {
  if (value === undefined) throw bad('A settings value is required');
  const json = JSON.stringify(value);
  if (json.length > LIMITS.settingsValueChars) throw bad('Those settings are too large to save');
  return json;
}

/**
 * The visible amendments trail from the audit rows, oldest first.
 * Each row is `{ item_code, reason, amendment }`; `amendment: null` undoes the
 * earlier one with the same item and reason — same semantics as the mock and
 * Supabase adapters.
 */
export function foldAmendments(rows) {
  let trail = [];
  for (const row of rows) {
    if (!row || !row.item_code || !row.reason) continue;
    trail = trail.filter((a) => !(a.item_code === row.item_code && a.reason === row.reason));
    if (row.amendment) trail.push(row.amendment);
  }
  return trail;
}
