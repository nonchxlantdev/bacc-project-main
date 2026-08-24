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
  return { ...images, ...tableSignatureImages(record, fieldMap) };
}

/**
 * Signatures drawn inside a log sheet's grid.
 *
 * The Attendance List asks every attendee to sign their own row, which is a
 * signature like any other and is captured the same way — drawn, not typed. It
 * simply does not arrive through `signoffs`, because it belongs to a row rather
 * than to the sheet.
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
