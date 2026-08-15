import { Download, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { getDeficiencyLevel } from '../config/deficiencyLevels.js';
import { incidentStatusLabel } from '../lib/incidentLifecycle.js';
import { listIncidents } from '../lib/incidents.js';

export default function IncidentListPage() {
  const navigate = useNavigate();
  const { online } = useOutletContext() ?? { online: navigator.onLine };
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    listIncidents().then((list) => {
      setRows(list);
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Incidents</h1>
          <p className="text-sm text-muted">
            Each incident is one NOC register row (Annex G). Work orders (Annex H) are raised against an incident.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!online || exporting}
            onClick={async () => {
              const now = new Date();
              const y = now.getFullYear();
              const m = String(now.getMonth() + 1).padStart(2, '0');
              const last = new Date(y, now.getMonth() + 1, 0).getDate();
              const from = `${y}-${m}-01`;
              const to = `${y}-${m}-${String(last).padStart(2, '0')}`;
              setExporting(true);
              try {
                const res = await fetch('/api/export-noc-register', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ incidents: rows, from, to }),
                });
                if (!res.ok) throw new Error('Register export failed');
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `PGIA-PMM-F07-NOC-${from}_to_${to}.pdf`;
                a.click();
                URL.revokeObjectURL(url);
              } finally {
                setExporting(false);
              }
            }}
            className="inline-flex items-center gap-2 rounded-md border border-navy/20 bg-white px-4 py-2 text-sm font-medium text-navy"
          >
            <Download className="h-4 w-4" />
            {exporting ? 'Exporting…' : 'Export NOC register'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/checklists/mine')}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            From a NO SAT item
          </button>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-navy/10 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-navy text-white">
            <tr>
              <th className="px-4 py-2 font-semibold">Incident ID</th>
              <th className="px-4 py-2 font-semibold">NOC No.</th>
              <th className="px-4 py-2 font-semibold">Title</th>
              <th className="px-4 py-2 font-semibold">Level</th>
              <th className="px-4 py-2 font-semibold">Status</th>
              <th className="px-4 py-2 font-semibold">Target</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  No incidents yet. Create one from a NO SAT checklist item.
                </td>
              </tr>
            )}
            {rows.map((row, i) => {
              const level = getDeficiencyLevel(row.deficiency_level);
              return (
                <tr key={row.id} className={i % 2 === 0 ? 'bg-stripe' : 'bg-white'}>
                  <td className="px-4 py-2">
                    <Link to={`/incidents/${row.id}`} className="font-medium text-primary hover:underline">
                      {row.incident_ref}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{row.noc_no}</td>
                  <td className="px-4 py-2">{row.title}</td>
                  <td className="px-4 py-2">
                    <span className="rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ background: level?.color }}>
                      {level?.label}
                    </span>
                  </td>
                  <td className="px-4 py-2">{incidentStatusLabel(row.status)}</td>
                  <td className="px-4 py-2">{row.target_date || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
