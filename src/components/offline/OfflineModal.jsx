import { WifiOff, X } from 'lucide-react';
import { useEffect } from 'react';

/**
 * Explains what still works offline vs what needs a connection.
 * Visual convention matches SignaturePromptModal (bg-black/55, modal-pop).
 *
 * Copy is a first draft — flag for a once-over against BACC's wording.
 */
export default function OfflineModal({ open, onDismiss }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onDismiss?.();
    };
    document.addEventListener('keydown', onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 backdrop-blur-[1px] motion-safe:animate-[fade-in_180ms_ease-out] sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-labelledby="offline-modal-title"
        className="flex max-h-[min(92dvh,560px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-surface shadow-2xl motion-safe:animate-[modal-pop_240ms_cubic-bezier(0.16,1,0.3,1)] sm:rounded-2xl"
      >
        <div className="relative shrink-0 px-5 pb-2 pt-5 sm:px-6 sm:pt-6">
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close"
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 desk:h-10 desk:w-10"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-start gap-3 pr-10">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-alert/10 text-alert">
              <WifiOff className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <h2 id="offline-modal-title" className="text-xl font-bold text-ink">
                You&apos;re offline
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Keep working — changes are saved on this device and will sync when you reconnect.
              </p>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-3 sm:px-6">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Still works</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink">
              <li>Fill and submit checklists</li>
              <li>Capture signatures</li>
              <li>Raise and update incidents</li>
              <li>Create and update work orders</li>
            </ul>
            <p className="mt-2 text-xs text-muted">All of the above queue locally until sync.</p>
          </section>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Needs a connection</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink">
              <li>Reports CSV and PDF export</li>
              <li>Anything that needs a fresh server read</li>
            </ul>
          </section>
        </div>

        <div className="shrink-0 border-t border-line/15 px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={onDismiss}
            className="flex min-h-11 w-full items-center justify-center rounded-lg bg-navy px-4 text-sm font-semibold text-white hover:bg-navy-mid"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
