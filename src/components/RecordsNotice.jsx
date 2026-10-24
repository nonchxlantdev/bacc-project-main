/** Shown when a records read failed. The forms already on screen stay up. */
export default function RecordsNotice({ onRetry }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-alert bg-alert-soft px-4 py-2 text-sm text-alert">
      <p>Couldn't reach the records — retrying…</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-11 items-center rounded-md border border-alert/40 bg-surface px-3 text-sm font-semibold text-alert desk:min-h-10"
      >
        Retry
      </button>
    </div>
  );
}
