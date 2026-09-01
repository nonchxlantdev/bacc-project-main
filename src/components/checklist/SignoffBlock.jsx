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
    <div className="rounded-md border border-navy/20 bg-white p-4">
      <p className="mb-3 text-sm font-semibold text-navy">{label}</p>
      <label className="mb-2 block text-xs text-muted">Name</label>
      <input
        value={name ?? ''}
        readOnly={readOnly}
        onChange={(e) => onChange?.({ name: e.target.value })}
        className="mb-3 min-h-11 w-full rounded border border-navy/20 px-3 py-2 text-sm read-only:bg-stripe"
      />
      <label className="mb-2 block text-xs text-muted">Position</label>
      <input
        value={position ?? ''}
        readOnly={readOnly}
        onChange={(e) => onChange?.({ position: e.target.value })}
        className="mb-3 min-h-11 w-full rounded border border-navy/20 px-3 py-2 text-sm read-only:bg-stripe"
      />
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
      <p className="mb-2 text-xs text-muted">Drawn signature</p>
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
