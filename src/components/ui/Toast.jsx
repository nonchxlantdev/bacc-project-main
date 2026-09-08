/**
 * Bottom-center toast stack. Safe-area aware for phones with a home indicator.
 */
export default function ToastStack({ toasts, onDismiss }) {
  if (!toasts?.length) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-3"
      style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      role="status"
      aria-live="polite"
      aria-relevant="additions text"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-lg border bg-surface px-4 py-3 text-sm text-ink shadow-lg ${
            toast.tone === 'alert' ? 'border-alert/30' : 'border-line/15'
          }`}
        >
          <p className="min-w-0 flex-1 leading-snug">{toast.message}</p>
          {toast.actionLabel && (
            <button
              type="button"
              className="min-h-11 shrink-0 rounded-md px-2 text-sm font-semibold text-primary hover:bg-primary/5 desk:min-h-9"
              onClick={() => {
                toast.onAction?.();
                onDismiss(toast.id);
              }}
            >
              {toast.actionLabel}
            </button>
          )}
          <button
            type="button"
            aria-label="Dismiss"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink desk:h-8 desk:w-8"
            onClick={() => onDismiss(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
