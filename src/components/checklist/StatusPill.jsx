const STYLES = {
  sat: 'bg-success-soft text-success',
  no_sat: 'bg-alert-soft text-alert',
  draft: 'bg-stripe text-muted',
  submitted: 'bg-primary/10 text-primary',
  acknowledged: 'bg-teal/15 text-navy',
  pending_sync: 'bg-stripe text-muted',
  pending: 'bg-primary/10 text-primary',
  overdue: 'bg-alert-soft text-alert',
  missed: 'bg-stripe text-muted',
  open: 'bg-primary/10 text-primary',
  verified: 'bg-teal/15 text-navy',
};

const LABELS = {
  sat: 'SAT',
  no_sat: 'NO SAT',
  draft: 'Draft',
  submitted: 'Submitted',
  acknowledged: 'Acknowledged',
  pending_sync: 'Pending sync',
  pending: 'Pending',
  overdue: 'Overdue',
  missed: 'Missed',
  in_progress: 'In progress',
};

export default function StatusPill({ status }) {
  if (!status) return <span className="text-muted">—</span>;
  const cls = STYLES[status] ?? 'bg-stripe text-muted';
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {LABELS[status] ?? status.replaceAll('_', ' ')}
    </span>
  );
}
