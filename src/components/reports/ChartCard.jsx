import { useState } from 'react';

export default function ChartCard({ title, subtitle, table, children }) {
  const [mode, setMode] = useState('chart');
  return (
    <section className="rounded-lg border border-navy/10 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-navy">{title}</h2>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        <div className="flex rounded border border-navy/15 text-xs">
          <button
            type="button"
            className={`min-h-10 px-3 lg:min-h-0 lg:px-2 lg:py-1 ${mode === 'chart' ? 'bg-navy text-white' : 'text-navy'}`}
            onClick={() => setMode('chart')}
          >
            Chart
          </button>
          <button
            type="button"
            className={`min-h-10 px-3 lg:min-h-0 lg:px-2 lg:py-1 ${mode === 'table' ? 'bg-navy text-white' : 'text-navy'}`}
            onClick={() => setMode('table')}
          >
            Table
          </button>
        </div>
      </div>
      {mode === 'chart' ? children : table}
    </section>
  );
}

export function SimpleTable({ columns, rows }) {
  return (
    <div className="overflow-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-muted">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="px-2 py-1 font-semibold">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id || i} className={i % 2 === 0 ? 'bg-stripe' : ''}>
              {columns.map((col) => (
                <td key={col.key} className="px-2 py-1.5 text-ink">
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
