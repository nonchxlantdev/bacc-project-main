import { tokens } from '../../lib/tokens.js';

/**
 * Horizontal bar chart. Color is passed per bar (entity-stable). Never dual-axis.
 */
export function HorizontalBarChart({ items, max, height = 180 }) {
  const peak = max ?? Math.max(1, ...items.map((i) => i.count));
  const rowH = Math.max(22, height / Math.max(items.length, 1));
  return (
    <svg viewBox={`0 0 400 ${rowH * items.length}`} className="w-full" role="img">
      {items.map((item, i) => {
        const y = i * rowH;
        const w = (item.count / peak) * 240;
        return (
          <g key={item.key}>
            <text x="0" y={y + rowH / 2 + 4} fill={tokens.navy} fontSize="11">
              {item.label}
            </text>
            <rect x="120" y={y + 4} width={240} height={rowH - 8} fill="#E8EEF5" rx="2" />
            <rect x="120" y={y + 4} width={Math.max(item.count ? 4 : 0, w)} height={rowH - 8} fill={item.color} rx="2">
              <title>{`${item.label}: ${item.count}`}</title>
            </rect>
            <text x="368" y={y + rowH / 2 + 4} fill={tokens.navy} fontSize="11" textAnchor="start">
              {item.count}
            </text>
          </g>
        );
      })}
    </svg>
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
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img">
      {[0, 0.5, 1].map((tick) => {
        const y = pad.t + innerH - tick * innerH;
        return (
          <g key={tick}>
            <line x1={pad.l} x2={w - pad.r} y1={y} y2={y} stroke="#D5DCE6" strokeWidth="1" />
            <text x={pad.l - 6} y={y + 3} textAnchor="end" fill={tokens.navy} fontSize="10">
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
          <text key={label} x={x} y={h - 8} textAnchor="middle" fill={tokens.navy} fontSize="9">
            {String(label).slice(5)}
          </text>
        );
      })}
      {series.length >= 2 &&
        series.map((s, i) => (
          <g key={s.templateCode} transform={`translate(${pad.l + i * 120}, 8)`}>
            <rect width="10" height="10" fill={s.color} />
            <text x="14" y="9" fill={tokens.navy} fontSize="10">
              {s.templateCode}
            </text>
          </g>
        ))}
    </svg>
  );
}
