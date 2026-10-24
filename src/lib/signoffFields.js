/**
 * How a sign-off role becomes field-map keys.
 *
 * One rule, imported by both the browser (which collects the signature images)
 * and the export handler (which fills in the names and dates). They were
 * separate before: the value mapper handled every role generically while the
 * image collector hardcoded two, so `coo_signature`, `ceo_signature`,
 * `responsible_signature` and every other slot silently received nothing. Only
 * Annex D exported a complete signature block.
 *
 * The keys are derived, never listed — a form that declares a new role gets its
 * slots filled without a code change, provided its field map declares them.
 */

import { OM_SIGNOFF_ROLE, approverRole } from '../config/approverRoles.js';

/**
 * Annex D shipped first and named its OM slot `om_*` while calling the role
 * `om_acknowledgment`. Its submitted records are locked under §11, so the field
 * names cannot be renamed — the alias lives here instead.
 */
const FIELD_PREFIX = { om_acknowledgment: 'om' };

/**
 * The OM's approval is always stored as `om_acknowledgment`, but each form names
 * the OM's box differently (see config/approverRoles.js) — `om` on Annexes A–I,
 * `supervisor` on the lighting forms, `received_by` on the Wildlife Findings
 * Report. Given the form, the approval is stamped in that form's OM box.
 */
export function signoffFieldPrefix(role, schemaOrCode = null) {
  if (role === OM_SIGNOFF_ROLE) {
    const box = approverRole(schemaOrCode);
    if (box && box !== OM_SIGNOFF_ROLE) return FIELD_PREFIX[box] ?? box;
  }
  return FIELD_PREFIX[role] ?? role;
}

export function signatureFieldKey(role, schemaOrCode = null) {
  return `${signoffFieldPrefix(role, schemaOrCode)}_signature`;
}

export function signoffFieldKeys(role, schemaOrCode = null) {
  const prefix = signoffFieldPrefix(role, schemaOrCode);
  return {
    signature: `${prefix}_signature`,
    name: `${prefix}_name`,
    date: `${prefix}_date`,
  };
}

/**
 * Sign-offs with the OM's approval last, so it wins its slot over anything an
 * older draft may have put in the same box.
 */
export function signoffsOmLast(signoffs) {
  const list = Array.isArray(signoffs) ? signoffs : [];
  return [...list.filter((s) => s?.role !== OM_SIGNOFF_ROLE), ...list.filter((s) => s?.role === OM_SIGNOFF_ROLE)];
}

/**
 * Signature images for one submission, keyed by field-map key.
 *
 * Only slots the field map actually declares as an image are included, so a
 * signature captured against a role the approved form has no space for is kept
 * on the record but never stamped.
 */
export function signatureImages(record, fieldMap) {
  const fields = fieldMap?.fields ?? {};
  const schema = record?.schema ?? record?.content_schema ?? null;
  const images = {};
  for (const signoff of signoffsOmLast(record?.signoffs)) {
    if (!signoff?.role || !signoff.signature_data_uri) continue;
    const key = signatureFieldKey(signoff.role, schema);
    if (fields[key]?.type === 'image') images[key] = signoff.signature_data_uri;
  }
  return { ...images, ...tableSignatureImages(record, fieldMap) };
}

/**
 * Signatures drawn inside a log sheet's grid.
 *
 * The Attendance List asks every attendee to sign their own row. Those marks
 * are stored as `row:*` sign-offs; the D1 adapter copies each one back onto
 * its cell before this runs, so the field-map key still comes from the cell.
 *
 * Only cells the field map declares as an image are returned, so a signature
 * captured against a column the approved form has no space for is kept on the
 * record and never stamped.
 */
export function tableSignatureImages(record, fieldMap) {
  const fields = fieldMap?.fields ?? {};
  const schema = record?.schema ?? record?.content_schema ?? null;
  const summary = record?.summary ?? {};
  const images = {};

  for (const field of schema?.summaryFields ?? []) {
    if (field.type !== 'table') continue;
    const rows = summary[field.key];
    if (!Array.isArray(rows)) continue;
    const prefix = field.mapKey ?? field.key;
    const signatureColumns = (field.columns ?? []).filter((col) => col.type === 'signature');

    rows.slice(0, field.printedRows ?? rows.length).forEach((row, i) => {
      for (const col of signatureColumns) {
        const uri = row?.[col.key];
        if (!uri || typeof uri !== 'string' || !uri.startsWith('data:image')) continue;
        const key = `${prefix}_${String(i + 1).padStart(2, '0')}_${col.key}`;
        if (fields[key]?.type === 'image') images[key] = uri;
      }
    });
  }
  return images;
}
