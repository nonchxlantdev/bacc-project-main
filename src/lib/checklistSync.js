import { amendItemResult, getSubmission } from './submissions.js';
import { hasSatVerification } from './incidentLifecycle.js';

/**
 * Set a cleared deficiency back to SAT on the checklist it came from.
 *
 * ── Why this is a flag ───────────────────────────────────────────────────────
 * The Technical Requirements say the opposite of this:
 *
 *   §5  "Creating an incident must not alter or remove the original checklist
 *        response."
 *   §11 "Do not overwrite the original submitted checklist record."
 *
 * BACC have asked for the NO SAT to read SAT once the incident is resolved, on
 * the basis that the requirements document is not final, and asked for it to
 * happen plainly — the checklist simply shows SAT, with no amendment notice on
 * screen. That is their call, so it is implemented, but as ONE named rule
 * rather than scattered through the incident screen. When the final
 * requirements land, flipping SYNC_SAT_ON_VERIFICATION back to false restores
 * the documented behaviour everywhere at once.
 *
 * The previous answer is still recorded against the submission, invisibly, for
 * one reason: withdrawing a verification has to put the inspector's original
 * response back, and something has to remember what it was.
 */
export const SYNC_SAT_ON_VERIFICATION = true;

/** Tag on the stored prior answer, so this rule only ever undoes its own writes. */
const REASON = 'incident_verified_sat';

/**
 * Bring the source checklist in line with the incident's current state.
 *
 * Idempotent and safe to call after any incident save: it works out what the
 * item SHOULD read, compares it with what is stored, and only writes when they
 * differ. Verifying, un-verifying and re-verifying all land correctly.
 *
 * Returns the updated submission, or null when nothing needed changing.
 */
export async function syncSourceChecklist(incident) {
  if (!SYNC_SAT_ON_VERIFICATION) return null;
  const code = incident?.source_item_code;
  const submissionId = incident?.submission_id;
  if (!code || !submissionId) return null;

  const record = await getSubmission(submissionId);
  if (!record?.items?.[code]) return null;

  const previous = (record.amendments ?? []).find(
    (a) => a.item_code === code && a.reason === REASON,
  );
  const shouldBeSat = hasSatVerification(incident);
  const current = record.items[code].result;

  if (shouldBeSat) {
    if (current === 'sat' && previous) return null;
    const from = previous?.from ?? current;
    // Only ever change a deficiency. If the item does not read NO SAT and was
    // never touched by this rule, something else set it — leave it alone.
    if (from !== 'no_sat') return null;
    return amendItemResult({
      id: record.id,
      code,
      result: 'sat',
      amendment: {
        item_code: code,
        from,
        to: 'sat',
        reason: REASON,
        incident_id: incident.id,
        incident_ref: incident.incident_ref ?? null,
        at: incident.verification?.verified_at ?? new Date().toISOString(),
        by: incident.verification?.verified_by ?? null,
        by_name: incident.verification?.verified_by_name ?? null,
        note: incident.verification?.note || null,
      },
    });
  }

  // Verification withdrawn or reversed — put the inspector's answer back.
  if (!previous) return null;
  return amendItemResult({
    id: record.id,
    code,
    result: previous.from,
    amendment: null,
    reason: REASON,
  });
}
