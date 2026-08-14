const STYLES = {
  sat: 'bg-success-soft text-success',
  no_sat: 'bg-alert-soft text-alert',
  draft: 'bg-stripe text-muted',
  submitted: 'bg-success-soft text-success',
  pending_sync: 'bg-teal/15 text-navy',
};

const LABELS = {
  sat: 'SAT',
  no_sat: 'NO-SAT',
  draft: 'Draft',
  submitted: 'Submitted',
  pending_sync: 'Pending sync',
};

export default function StatusPill({ status }) {
  if (!status) return <span className="text-muted">—</span>;
  const cls = STYLES[status] ?? 'bg-stripe text-muted';
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {LABELS[status] ?? status}
    </span>
  );
}
