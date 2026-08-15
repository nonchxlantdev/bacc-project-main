export function StatTile({ label, value, delta, href, note }) {
  const deltaText =
    delta == null ? null : delta > 0 ? `+${delta} vs prior period` : delta < 0 ? `${delta} vs prior period` : 'No change vs prior period';
  const inner = (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-3xl font-bold text-navy">{value}</p>
      {deltaText && <p className="mt-1 text-xs text-muted">{deltaText}</p>}
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </>
  );
  const cls = 'rounded-lg border border-navy/10 bg-white p-4 shadow-sm';
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
    none: { cls: 'border-navy/20 text-muted', icon: '–' },
  };
  const spec = map[kind] || map.none;
  return (
    <div className={`rounded-lg border-2 bg-white p-4 ${spec.cls}`}>
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
