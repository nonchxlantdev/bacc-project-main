/**
 * Apron Supervisor forms are signed with Edair de la Cruz's saved signature,
 * and his name sits beside the person filling the form.
 *
 * The email and the name live here so the checklist page and the worker
 * permission rule cannot drift apart.
 */

export const EDAIR_EMAIL = 'edelacruz@pgiabelize.com';
export const EDAIR_NAME = 'Edair de la Cruz';

export const APRON_COUNTERSIGN_CODES = Object.freeze([
  'PGIA-PMM-F02',
  'PGIA-PMM-F05',
  'PGIA-PMM-F06',
  'PGIA-PMM-F10',
]);

export const COUNTERSIGN_MESSAGES = Object.freeze({
  missingSignature:
    'Edair de la Cruz has not saved a signature yet. He can save one under Settings → My profile.',
  missingAccount: 'Edair de la Cruz is not on the directory, so his signature cannot be inserted.',
  loadFailed: "Could not load Edair de la Cruz's signature.",
  submitEmpty: "Insert Edair de la Cruz's signature before submitting.",
});

const CODE_SET = new Set(APRON_COUNTERSIGN_CODES);

function normName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function apronCountersignApplies(role, templateCode) {
  return role === 'apron_supervisor' && CODE_SET.has(templateCode);
}

export function conductedByName({ role, templateCode, displayName }) {
  const name = String(displayName ?? '').trim();
  if (!apronCountersignApplies(role, templateCode)) return name;
  return name ? `${name} / ${EDAIR_NAME}` : EDAIR_NAME;
}

/** Active account that is Edair by email or by exact full name. */
export function isEdairUser(user) {
  if (!user || user.is_active === false) return false;
  const email = String(user.email ?? '').trim().toLowerCase();
  if (email === EDAIR_EMAIL) return true;
  return normName(user.full_name) === normName(EDAIR_NAME);
}

function emailIsEdair(user) {
  return Boolean(user) && user.is_active !== false && String(user.email ?? '').trim().toLowerCase() === EDAIR_EMAIL;
}

/**
 * Resolve Edair and his saved signature.
 *
 * `getByEmail` on the mock store falls back to some other login when the
 * address is missing. That result is kept only when the email actually matches.
 */
export async function loadEdair({ getByEmail, list, getById }) {
  try {
    const byEmail = await getByEmail(EDAIR_EMAIL);
    let identified = emailIsEdair(byEmail) ? byEmail : null;
    if (!identified) {
      const named = (await list()).filter(
        (row) => row && row.is_active !== false && normName(row.full_name) === normName(EDAIR_NAME),
      );
      if (named.length !== 1) return { state: 'missing-account', user: null, signatureUri: null };
      identified = named[0];
    }
    // Signature is attached on getById (and on the worker's getByEmail). The
    // directory list, which getByEmail uses on some adapters, does not carry it.
    const user = await getById(identified.id);
    const matchedByEmail = emailIsEdair(identified);
    const stillEdair = matchedByEmail
      ? emailIsEdair(user)
      : Boolean(user) && user.is_active !== false && normName(user.full_name) === normName(EDAIR_NAME);
    if (!stillEdair) return { state: 'missing-account', user: null, signatureUri: null };
    const signatureUri = user.stored_signature_data_uri || null;
    if (!signatureUri) return { state: 'missing-signature', user, signatureUri: null };
    return { state: 'ready', user, signatureUri };
  } catch {
    return { state: 'error', user: null, signatureUri: null };
  }
}

export function countersignerSubmitMessage({ applies, signatureDataUri, loadState }) {
  if (!applies || signatureDataUri) return null;
  if (loadState === 'missing-signature') return COUNTERSIGN_MESSAGES.missingSignature;
  if (loadState === 'missing-account') return COUNTERSIGN_MESSAGES.missingAccount;
  if (loadState === 'error') return COUNTERSIGN_MESSAGES.loadFailed;
  return COUNTERSIGN_MESSAGES.submitEmpty;
}

/** Copy Edair's saved signature onto the form's own sign-off. Other blocks stay. */
export function applyCountersignerSignature({ record, signatureDataUri, name, position }) {
  const role = record?.schema?.signoffs?.[0]?.role ?? null;
  if (!role || !signatureDataUri) return record;
  const existing = (record.signoffs ?? []).find((s) => s.role === role) ?? {};
  const self = {
    ...existing,
    role,
    name: name ?? existing.name ?? '',
    position: position ?? existing.position ?? '',
    signature_data_uri: signatureDataUri,
    signed_at: new Date().toISOString(),
    sign_date: existing.sign_date || record.header?.date || null,
  };
  const rest = (record.signoffs ?? []).filter((s) => s.role !== role);
  return { ...record, signoffs: [...rest, self] };
}
