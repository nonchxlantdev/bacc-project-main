export default function SignoffBlock({
  label,
  name,
  position,
  dateLabel = 'Date:',
  signedAt,
  readOnly,
  onChange,
}) {
  return (
    <div className="rounded-md border border-navy/20 bg-white p-4">
      <p className="mb-3 text-sm font-semibold text-navy">{label}</p>
      <label className="mb-2 block text-xs text-muted">Name</label>
      <input
        value={name ?? ''}
        readOnly={readOnly}
        onChange={(e) => onChange?.({ name: e.target.value })}
        className="mb-3 w-full rounded border border-navy/20 px-3 py-2 text-sm read-only:bg-stripe"
      />
      <label className="mb-2 block text-xs text-muted">Position</label>
      <input
        value={position ?? ''}
        readOnly={readOnly}
        onChange={(e) => onChange?.({ position: e.target.value })}
        className="mb-3 w-full rounded border border-navy/20 px-3 py-2 text-sm read-only:bg-stripe"
      />
      <p className="text-sm text-muted">
        {dateLabel} {signedAt ? new Date(signedAt).toLocaleString() : '—'}
      </p>
    </div>
  );
}
