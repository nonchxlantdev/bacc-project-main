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

/**
 * Annex D shipped first and named its OM slot `om_*` while calling the role
 * `om_acknowledgment`. Its submitted records are locked under §11, so the field
 * names cannot be renamed — the alias lives here instead.
 */
const FIELD_PREFIX = { om_acknowledgment: 'om' };

export function signoffFieldPrefix(role) {
  return FIELD_PREFIX[role] ?? role;
}

export function signatureFieldKey(role) {
  return `${signoffFieldPrefix(role)}_signature`;
}

export function signoffFieldKeys(role) {
  const prefix = signoffFieldPrefix(role);
  return {
    signature: `${prefix}_signature`,
    name: `${prefix}_name`,
    date: `${prefix}_date`,
  };
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
  const images = {};
  for (const signoff of record?.signoffs ?? []) {
    if (!signoff?.role || !signoff.signature_data_uri) continue;
    const key = signatureFieldKey(signoff.role);
    if (fields[key]?.type === 'image') images[key] = signoff.signature_data_uri;
  }
  return images;
}
