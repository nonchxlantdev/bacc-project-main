import { Camera, Check, ImagePlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SYNC_SAT_ON_VERIFICATION } from '../../lib/checklistSync.js';
import { fmtDate, fmtDateTime } from '../../lib/airportFormat.js';
import { Card, RadioButton } from './detailUi.jsx';

/**
 * The deficiency that opened this incident, and the control that clears it.
 *
 * The line under the table states what the inspector originally recorded, who
 * verified it and when. Confirming SAT here also sets the item back to SAT on
 * the source checklist — see lib/checklistSync.js for that rule.
 */
export default function VerificationPanel({
  incident,
  verified,
  verifyDraft,
  busy,
  onStartVerify,
  onClearVerification,
  onDraftChange,
  onAttachPhoto,
  onConfirm,
}) {
  const code = incident.source_item_code;
  return (
    <Card title="Related Checklist Item">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-navy/10 text-left text-xs font-semibold text-muted">
              <th className="py-2 pr-3">Item</th>
              <th className="py-2 pr-3" />
              <th className="w-16 py-2 text-center">SAT</th>
              <th className="w-20 py-2 text-center">NO SAT</th>
              <th className="py-2 pr-3">Remarks / Location</th>
              <th className="w-28 py-2 text-center">View Checklist</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-3 pr-3 align-top font-medium text-navy">{code}</td>
              <td className="py-3 pr-3 align-top">{incident.source_item_description}</td>
              <td className="py-3 text-center align-top">
                <RadioButton
                  checked={verified}
                  tone="success"
                  label={`Mark ${code} verified SAT`}
                  onClick={() => !verified && onStartVerify()}
                />
              </td>
              <td className="py-3 text-center align-top">
                <RadioButton
                  checked={!verified}
                  tone="alert"
                  label={`Revert ${code} to NO SAT`}
                  onClick={() => verified && onClearVerification()}
                />
              </td>
              <td className="py-3 pr-3 align-top">{incident.source_item_remarks || incident.description}</td>
              <td className="py-3 text-center align-top">
                {incident.submission_id ? (
                  <Link
                    to={`/checklists/${incident.submission_id}`}
                    title="View checklist"
                    className="inline-flex min-h-9 min-w-9 items-center justify-center rounded border border-navy/20 text-navy hover:bg-stripe"
                  >
                    <Camera size={16} aria-hidden />
                    <span className="sr-only">View checklist</span>
                  </Link>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-3 border-t border-navy/10 pt-3 text-xs text-muted">
        Recorded <strong className="font-semibold text-alert">NO SAT</strong> on{' '}
        {fmtDate(incident.source_inspection_date)} in {incident.source_template_code}.
        {incident.verification?.result === 'sat' && (
          <>
            {' '}
            Verified <strong className="font-semibold text-success">SAT</strong> by{' '}
            {incident.verification.verified_by_name} on {fmtDateTime(incident.verification.verified_at)}.
            {incident.verification.note ? ` ${incident.verification.note}` : ''}
          </>
        )}
        {incident.reinspection_submission_id && ' Closure evidence: linked re-inspection.'}
        <br />
        {SYNC_SAT_ON_VERIFICATION
          ? 'Confirming SAT updates the item on the source checklist to SAT.'
          : 'The submitted checklist is a locked record and is never modified — verification is stored against the incident.'}
      </p>

      {incident.verification?.photo_url && (
        <img
          src={incident.verification.photo_url}
          alt="Verification evidence"
          className="mt-2 h-32 rounded border border-navy/15 object-cover"
        />
      )}

      {verifyDraft && (
        <div className="mt-3 rounded-md border border-success/40 bg-success-soft/60 p-3">
          <p className="text-sm font-semibold text-navy">Verify {code} back to SAT</p>
          <p className="mt-0.5 text-xs text-muted">
            Records that corrective action was completed and the item re-inspected.
            {SYNC_SAT_ON_VERIFICATION
              ? ' The item on the source checklist is updated to SAT.'
              : ' The original checklist stays untouched.'}
          </p>
          <textarea
            rows={2}
            value={verifyDraft.note}
            onChange={(e) => onDraftChange({ ...verifyDraft, note: e.target.value })}
            placeholder="What was done, and what was observed on re-inspection…"
            className="mt-2 w-full rounded border border-navy/20 px-3 py-2 text-sm"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-navy/20 bg-white px-3 text-xs font-semibold text-navy hover:bg-stripe">
              <ImagePlus size={14} aria-hidden /> Attach evidence
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onAttachPhoto(file);
                  e.target.value = '';
                }}
              />
            </label>
            {verifyDraft.photo && (
              <img src={verifyDraft.photo} alt="Evidence preview" className="h-9 w-14 rounded object-cover" />
            )}
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => onDraftChange(null)}
              className="min-h-9 rounded-md border border-navy/20 bg-white px-3 text-xs font-semibold text-navy hover:bg-stripe"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-success px-3 text-xs font-semibold text-white disabled:opacity-60"
            >
              <Check size={14} aria-hidden /> Confirm SAT
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
