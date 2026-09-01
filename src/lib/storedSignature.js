/**
 * Saved signature — profile convenience copied onto draft sign-offs.
 */

/**
 * The sign-off that represents the person filling out the form itself, as
 * opposed to a later reviewer or approver (OM, COO, a supervisor, and so
 * on). Every schema's `signoffs` array is authored with that person's block
 * listed first — "inspector" on the annexes that use that title, but "cec",
 * "responsible", "reporter", "apron_supervisor", "prepared_by" and others
 * elsewhere (verified across all 36 checklist schemas: wherever a
 * literal "inspector" role exists, it is always first). Reading the first
 * entry, rather than matching one hardcoded role name, is what makes the
 * saved-signature prompt and button apply to every annex that has any
 * signature at all, not only the ones that happen to call it "inspector".
 */
export function selfSignoffRole(schema) {
  return schema?.signoffs?.[0]?.role ?? null;
}

export function shouldShowSignaturePrompt({ record, profile, schema, readOnly }) {
  if (readOnly) return false;
  if (!record || record.status !== 'draft') return false;
  if (!selfSignoffRole(schema)) return false;
  if (profile?.hide_signature_prompt) return false;
  return true;
}

/**
 * Copy the user's stored signature into the self sign-off block only —
 * never onto a colleague's or approver's block.
 */
export function applyStoredSignature({ record, profile, displayName, position }) {
  if (!record?.schema && !record) return record;
  const schema = record.schema;
  const role = selfSignoffRole(schema);
  if (!role) return record;
  const stored = profile?.stored_signature_data_uri;
  if (!stored) return record;

  const signedAt = new Date().toISOString();
  const self = {
    role,
    name: displayName || profile?.full_name || '',
    position: position || profile?.position || '',
    signature_data_uri: stored,
    signed_at: signedAt,
  };

  const rest = (record.signoffs ?? []).filter((s) => s.role !== role);
  return {
    ...record,
    signoffs: [...rest, self],
  };
}
