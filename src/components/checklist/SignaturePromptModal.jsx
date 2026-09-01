import { useEffect, useState } from 'react';
import { CheckCircle2, PenLine, UserRound, X } from 'lucide-react';
import SignaturePad from './SignaturePad.jsx';

/**
 * Offer a saved signature or setup when opening a draft checklist.
 */
export default function SignaturePromptModal({
  open,
  storedPreviewUri,
  onUseSaved,
  onManual,
  onSaveToProfile,
}) {
  const hasStored = Boolean(storedPreviewUri);
  const [draftUri, setDraftUri] = useState(null);
  const [dismissForever, setDismissForever] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraftUri(null);
    setDismissForever(false);
  }, [open, storedPreviewUri]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onManual?.(false);
    };
    document.addEventListener('keydown', onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open, onManual]);

  if (!open) return null;

  function finishManual() {
    onManual?.(dismissForever);
  }

  function finishUseSaved() {
    onUseSaved?.(dismissForever);
  }

  const title = hasStored ? 'Use your saved signature?' : 'Set up your signature?';
  const description = hasStored
    ? 'Apply the signature saved in Settings to this checklist, or sign manually on the form below.'
    : 'Save your signature once and reuse it on checklists. You can still sign manually on any form, or manage your signature later in Settings.';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 backdrop-blur-[1px] motion-safe:animate-[fade-in_180ms_ease-out] sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-labelledby="signature-prompt-title"
        className="flex max-h-[min(92dvh,720px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl motion-safe:animate-[modal-pop_240ms_cubic-bezier(0.16,1,0.3,1)] sm:rounded-2xl"
      >
        <div className="relative shrink-0 px-5 pb-2 pt-5 sm:px-6 sm:pt-6">
          <button
            type="button"
            onClick={finishManual}
            aria-label="Close"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full text-muted transition-colors duration-150 hover:bg-stripe hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:right-5 sm:top-5"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-start gap-3 pr-10">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <PenLine className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <h2 id="signature-prompt-title" className="text-xl font-bold text-navy">
                {title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2 sm:px-6">
          {hasStored ? (
            <>
              <div className="rounded-lg border-2 border-dashed border-navy/20 bg-white px-4 py-6">
                <img
                  src={storedPreviewUri}
                  alt="Your saved signature"
                  className="mx-auto h-28 max-w-full object-contain"
                />
              </div>
              <label className="mt-4 flex items-center gap-2.5 text-sm text-navy">
                <input
                  type="checkbox"
                  checked={dismissForever}
                  onChange={(e) => setDismissForever(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Don&apos;t show this again
              </label>
            </>
          ) : (
            <SignaturePad
              label="Draw signature to save"
              value={draftUri}
              onChange={setDraftUri}
              variant="prompt"
            />
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-navy/10 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:px-6">
          {hasStored ? (
            <>
              <button
                type="button"
                onClick={finishUseSaved}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-navy-mid hover:shadow active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
              >
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                Use my signature
              </button>
              <button
                type="button"
                onClick={finishManual}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-navy/15 bg-white px-4 py-2 text-sm font-semibold text-primary transition-all duration-150 hover:border-primary/30 hover:bg-stripe active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
              >
                <PenLine className="h-3.5 w-3.5 shrink-0" />
                Sign manually
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={!draftUri}
                onClick={() => draftUri && onSaveToProfile?.({ signature_data_uri: draftUri, apply: true })}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-navy px-3 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-navy-mid hover:shadow active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
              >
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span className="text-center">Save and apply to this checklist</span>
              </button>
              <button
                type="button"
                disabled={!draftUri}
                onClick={() => draftUri && onSaveToProfile?.({ signature_data_uri: draftUri, apply: false })}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-navy/15 bg-white px-3 py-2 text-sm font-semibold text-primary transition-all duration-150 hover:border-primary/30 hover:bg-stripe active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
              >
                <UserRound className="h-3.5 w-3.5 shrink-0" />
                <span className="text-center">Save to my profile only</span>
              </button>
              <button
                type="button"
                onClick={finishManual}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-navy/15 bg-white px-3 py-2 text-sm font-semibold text-primary transition-all duration-150 hover:border-primary/30 hover:bg-stripe active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
              >
                <PenLine className="h-3.5 w-3.5 shrink-0" />
                <span className="text-center">Sign manually on this form</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
