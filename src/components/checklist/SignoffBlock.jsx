import { useState } from 'react';
import { airportYmd } from '../../lib/belizeTime.js';
import SignaturePad from './SignaturePad.jsx';

export default function SignoffBlock({
  role,
  label,
  name,
  position,
  dateLabel = 'Date:',
  signedAt,
  // The date the signer chose for this block (YYYY-MM-DD). The approved forms
  // print it beside the signature, so it is the signer's to pick — usually the
  // day the work was done, which is not always the day they sign.
  signDate,
  // What the picker starts on when nothing has been chosen yet: the
  // checklist's own date, so the bottom of the form matches the top unless
  // the signer changes it.
  defaultSignDate,
  storedSignatureUri,
  readOnly,
  // Set only for the form's own signer (see ChecklistForm's `isSelf`).
  // Name/Position are locked to the signed-in account there — nobody signs
  // this block as someone else — while the signature pad and "use my saved
  // signature" stay governed by `readOnly` alone, same as always.
  nameLocked = false,
  // A short line under the label (e.g. "Signed by the OM when they approve").
  hint = null,
  onChange,
  onApplyStored,
}) {
  const [confirmReplace, setConfirmReplace] = useState(false);
  // Which role (if any) gets this button is decided by the caller — see
  // ChecklistForm's `isSelf` check, which passes onApplyStored only for the
  // form's own signer, whatever that role is named on this annex. This
  // block doesn't need to know the role name at all.
  const canUseStored = !readOnly && storedSignatureUri && typeof onApplyStored === 'function';
  // While editing, an unchosen date shows the checklist's date (signed_at moves
  // on every keystroke, so it says nothing about the day being signed for).
  // A filed block with no chosen date predates the picker: show the
  // airport-time day it was signed, which is what its PDF prints.
  const signedDay = signedAt ? airportYmd(Date.parse(signedAt)) : '';
  const shownDate = signDate || (readOnly ? signedDay : defaultSignDate || signedDay || '');

  function handleApplyStored() {
    if (signatureDataUri && signatureDataUri !== storedSignatureUri && !confirmReplace) {
      setConfirmReplace(true);
      return;
    }
    setConfirmReplace(false);
    onApplyStored();
  }

  return (
    <div className="rounded-lg border border-line/20 bg-surface p-4">
      <p className={`text-[15px] font-bold text-ink ${hint ? 'mb-1' : 'mb-3'}`}>{label}</p>
      {hint && <p className="mb-3 text-xs text-muted">{hint}</p>}
      {/* Approved order: the shortcut comes first, so the field pair below is
          only for the person who isn't reusing a saved signature. */}
      {canUseStored && (
        <div className="mb-3">
          <button
            type="button"
            onClick={handleApplyStored}
            className="min-h-10 w-full rounded-md border border-primary bg-primary/5 px-3 text-sm font-semibold text-primary hover:bg-primary/10"
          >
            Use my saved signature
          </button>
          {confirmReplace && (
            <p className="mt-2 text-xs text-alert">
              This will replace the signature already on this block.{' '}
              <button type="button" onClick={handleApplyStored} className="font-semibold underline">
                Replace it
              </button>{' '}
              or{' '}
              <button type="button" onClick={() => setConfirmReplace(false)} className="underline">
                cancel
              </button>
            </p>
          )}
        </div>
      )}
      <label className="mb-1.5 block font-display text-[11px] font-semibold uppercase tracking-wide text-muted">
        Name
      </label>
      <input
        value={name ?? ''}
        readOnly={readOnly || nameLocked}
        onChange={nameLocked ? undefined : (e) => onChange?.({ name: e.target.value })}
        className="mb-3 min-h-11 w-full rounded border border-line/20 bg-surface px-3 py-2 text-sm text-ink read-only:bg-stripe"
      />
      <label className="mb-1.5 block font-display text-[11px] font-semibold uppercase tracking-wide text-muted">
        Position
      </label>
      <input
        value={position ?? ''}
        readOnly={readOnly || nameLocked}
        onChange={nameLocked ? undefined : (e) => onChange?.({ position: e.target.value })}
        className="mb-3 min-h-11 w-full rounded border border-line/20 bg-surface px-3 py-2 text-sm text-ink read-only:bg-stripe"
      />
      {nameLocked && !readOnly && (
        <p className="-mt-2 mb-3 text-[11px] text-muted">Locked to your account — nobody signs as someone else.</p>
      )}
      <p className="mb-2 font-display text-[11px] font-semibold uppercase tracking-wide text-muted">
        Drawn signature
      </p>
      <SignaturePad
        value={signatureDataUri}
        disabled={readOnly}
        onChange={(signature_data_uri) => {
          setConfirmReplace(false);
          // Signing pins the date shown in the picker, so what the person saw
          // is what prints — even if they never touched the picker.
          onChange?.(signDate ? { signature_data_uri } : { signature_data_uri, sign_date: shownDate || null });
        }}
      />
      {readOnly ? (
        <p className="mt-2 text-sm text-muted">
          {dateLabel} {shownDate || '—'}
        </p>
      ) : (
        <label className="mt-3 block">
          <span className="mb-1.5 block font-display text-[11px] font-semibold uppercase tracking-wide text-muted">
            {String(dateLabel).replace(/:\s*$/, '')}
          </span>
          <input
            type="date"
            value={shownDate}
            onChange={(e) => onChange?.({ sign_date: e.target.value || null })}
            className="min-h-11 w-full rounded border border-line/20 bg-surface px-3 py-2 text-sm text-ink sm:w-56"
          />
        </label>
      )}
    </div>
  );
}
