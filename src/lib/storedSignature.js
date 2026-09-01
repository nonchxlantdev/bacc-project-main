/**
 * Saved inspector signature — profile convenience copied onto draft sign-offs.
 */

export function schemaHasInspectorSignoff(schema) {
  return (schema?.signoffs ?? []).some((def) => def.role === 'inspector');
}

export function shouldShowSignaturePrompt({ record, profile, schema, readOnly }) {
  if (readOnly) return false;
  if (!record || record.status !== 'draft') return false;
  if (!schemaHasInspectorSignoff(schema)) return false;
  if (profile?.hide_signature_prompt) return false;
  return true;
}

/**
 * Copy the user's stored signature into the inspector sign-off block only.
 */
export function applyStoredSignature({ record, profile, displayName, position }) {
  if (!record?.schema && !record) return record;
  const schema = record.schema;
  if (!schemaHasInspectorSignoff(schema)) return record;
  const stored = profile?.stored_signature_data_uri;
  if (!stored) return record;

  const signedAt = new Date().toISOString();
  const inspector = {
    role: 'inspector',
    name: displayName || profile?.full_name || '',
    position: position || profile?.position || '',
    signature_data_uri: stored,
    signed_at: signedAt,
  };

  const rest = (record.signoffs ?? []).filter((s) => s.role !== 'inspector');
  return {
    ...record,
    signoffs: [...rest, inspector],
  };
}
