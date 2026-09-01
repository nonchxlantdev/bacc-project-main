const BEACON = {
  ok: 'bg-teal shadow-glow-teal',
  caution: 'bg-caution shadow-glow-caution',
  alert: 'bg-alert shadow-glow-alert',
};

export function StatTile({ label, value, delta, href, note, tone = 'ok' }) {
  const deltaText =
    delta == null ? null : delta > 0 ? `+${delta} vs prior period` : delta < 0 ? `${delta} vs prior period` : 'No change vs prior period';
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${BEACON[tone] ?? BEACON.ok}`} />
      </div>
      <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-ink">{value}</p>
      {deltaText && <p className="mt-1 text-xs text-muted">{deltaText}</p>}
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </>
  );
  const cls = 'rounded-lg border border-line/12 bg-surface p-4 shadow-card';
  if (href) {
    return (
      <a href={href} className={`${cls} block hover:border-primary`}>
        {inner}
      </a>
    );
  }
  return <div className={cls}>{inner}</div>;
}

export function StatusStateTile({ kind, label, value }) {
  const map = {
    ok: { cls: 'border-success text-success', icon: '✓' },
    warning: { cls: 'border-primary text-primary', icon: '!' },
    overdue: { cls: 'border-alert text-alert', icon: '!' },
    none: { cls: 'border-line/25 text-muted', icon: '–' },
  };
  const spec = map[kind] || map.none;
  return (
    <div className={`rounded-lg border-2 bg-surface p-4 ${spec.cls}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide">
        <span className="mr-1" aria-hidden>
          {spec.icon}
        </span>
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  );
}
