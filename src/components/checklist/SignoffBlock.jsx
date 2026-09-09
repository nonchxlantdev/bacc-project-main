import { useState } from 'react';
import SignaturePad from './SignaturePad.jsx';

export default function SignoffBlock({
  role,
  label,
  name,
  position,
  dateLabel = 'Date:',
  signedAt,
  signatureDataUri,
  storedSignatureUri,
  readOnly,
  // Set only for the form's own signer (see ChecklistForm's `isSelf`).
  // Name/Position are locked to the signed-in account there — nobody signs
  // this block as someone else — while the signature pad and "use my saved
  // signature" stay governed by `readOnly` alone, same as always.
  nameLocked = false,
  onChange,
  onApplyStored,
}) {
  const [confirmReplace, setConfirmReplace] = useState(false);
  // Which role (if any) gets this button is decided by the caller — see
  // ChecklistForm's `isSelf` check, which passes onApplyStored only for the
  // form's own signer, whatever that role is named on this annex. This
  // block doesn't need to know the role name at all.
  const canUseStored = !readOnly && storedSignatureUri && typeof onApplyStored === 'function';

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
      <p className="mb-3 text-[15px] font-bold text-ink">{label}</p>
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
          onChange?.({ signature_data_uri });
        }}
      />
      <p className="mt-2 text-sm text-muted">
        {dateLabel} {signedAt ? new Date(signedAt).toLocaleString() : '—'}
      </p>
    </div>
  );
}
