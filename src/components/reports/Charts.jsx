/**
 * Horizontal bar chart, matching the approved mockup's bar treatment: a
 * teal-to-primary gradient fill on a recessed track, the value in tabular
 * mono at the end of each row, and a dashed axis of evenly-spaced ticks
 * underneath rather than leaving the reader to guess each bar's scale.
 *
 * Every bar shares one gradient rather than a per-item `color` — this chart
 * has exactly one caller (the dashboard's single-series department
 * breakdown), so there is no second series to distinguish by hue.
 */
export function HorizontalBarChart({ items, max }) {
  const highest = max ?? Math.max(1, ...items.map((i) => i.count));
  const tickCount = Math.min(4, highest);
  // Round the axis ceiling up to a step the tick count divides evenly —
  // ticking a raw peak like 5 across 4 marks lands on 0/1/3/4/5 (uneven
  // gaps), where stepping by ceil(5/4)=2 gives the plainly-readable 0/2/4/6.
  const step = Math.max(1, Math.ceil(highest / tickCount));
  const peak = step * tickCount;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => step * i);
  return (
    <div>
      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <div
            key={item.key}
            className="grid grid-cols-[5.5rem_1fr_2.25rem] items-center gap-2.5 sm:grid-cols-[7.25rem_1fr_2.25rem]"
          >
            <span className="truncate text-sm font-medium text-muted">{item.label}</span>
            <span className="relative h-[11px] overflow-hidden rounded-md bg-surface-2">
              <span
                className="absolute inset-y-0 left-0 rounded-md bg-gradient-to-r from-teal to-primary"
                style={{ width: `${Math.max(item.count ? 4 : 0, (item.count / peak) * 100)}%` }}
                title={`${item.label}: ${item.count}`}
              />
            </span>
            <span className="text-right font-mono text-sm tabular-nums text-ink">{item.count}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-between border-t border-dashed border-line/25 pt-2">
        {ticks.map((t, i) => (
          <span key={i} className="font-mono text-[11px] text-muted">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

export function LineChart({ series, points, xKey = 'period', yKey = 'rate' }) {
  const w = 420;
  const h = 180;
  const pad = { l: 36, r: 12, t: 12, b: 28 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const xs = points.map((p) => p[xKey]);
  const grouped = {};
  for (const s of series) grouped[s.templateCode] = points.filter((p) => p.templateCode === s.templateCode);
  const maxY = 1;

  function xy(i, y, n) {
    const x = pad.l + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const yy = pad.t + innerH - (y / maxY) * innerH;
    return [x, yy];
  }

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full text-ink" role="img">
      {[0, 0.5, 1].map((tick) => {
        const y = pad.t + innerH - tick * innerH;
        return (
          <g key={tick}>
            <line x1={pad.l} x2={w - pad.r} y1={y} y2={y} stroke="var(--color-line)" strokeOpacity="0.2" strokeWidth="1" />
            <text x={pad.l - 6} y={y + 3} textAnchor="end" fill="currentColor" fontSize="10">
              {Math.round(tick * 100)}%
            </text>
          </g>
        );
      })}
      {series.map((s) => {
        const rows = grouped[s.templateCode] || points;
        const n = rows.length;
        const d = rows
          .map((p, i) => {
            const [x, y] = xy(i, p[yKey], n);
            return `${i === 0 ? 'M' : 'L'}${x} ${y}`;
          })
          .join(' ');
        return (
          <g key={s.templateCode}>
            <path d={d} fill="none" stroke={s.color} strokeWidth="2" />
            {rows.map((p, i) => {
              const [x, y] = xy(i, p[yKey], n);
              return (
                <circle key={p.period} cx={x} cy={y} r="3.5" fill={s.color}>
                  <title>{`${p.period}: ${Math.round(p[yKey] * 100)}% (${p.submitted}/${p.due})`}</title>
                </circle>
              );
            })}
          </g>
        );
      })}
      {xs.map((label, i) => {
        const [x] = xy(i, 0, xs.length);
        return (
          <text key={label} x={x} y={h - 8} textAnchor="middle" fill="currentColor" fontSize="9">
            {String(label).slice(5)}
          </text>
        );
      })}
      {series.length >= 2 &&
        series.map((s, i) => (
          <g key={s.templateCode} transform={`translate(${pad.l + i * 120}, 8)`}>
            <rect width="10" height="10" fill={s.color} />
            <text x="14" y="9" fill="currentColor" fontSize="10">
              {s.templateCode}
            </text>
          </g>
        ))}
    </svg>
  );
}
