import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useApprovals } from '../hooks/useRepos.js';
import SignaturePad from '../components/checklist/SignaturePad.jsx';
import StatusPill from '../components/checklist/StatusPill.jsx';
import { workOrderVerifiedBlockers } from '../lib/incidentLifecycle.js';
import { getRepos } from '../data/repositories/index.js';

const ROLE_LABEL = {
  om_acknowledgment: 'OM acknowledgment',
  om_coo_verification: 'OM/COO verification',
  cec_clearance: 'CEC clearance',
};

export default function ApprovalsPage() {
  const { user, profile, displayName, position } = useAuth();
  const { rows, loading, decide, reload } = useApprovals({ ...user, ...profile, id: user?.id, role: profile?.role });
  const [active, setActive] = useState(null);
  const [signature, setSignature] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState(null);
  const [woGates, setWoGates] = useState([]);

  const grouped = useMemo(() => {
    const map = {};
    for (const row of rows) {
      (map[row.approval_role] ??= []).push(row);
    }
    return map;
  }, [rows]);

  useEffect(() => {
    if (!active || active.entity_type !== 'work_order') {
      setWoGates([]);
      return;
    }
    getRepos()
      .workOrders.get(active.entity_id)
      .then((wo) => setWoGates(wo ? workOrderVerifiedBlockers(wo) : []));
  }, [active]);

  async function onDecide(decision) {
    setError(null);
    try {
      await decide({
        id: active.id,
        decision,
        notes,
        signature_data_uri: signature,
        actor: { id: user.id, full_name: displayName, position, role: profile?.role },
        name: displayName,
        position,
      });
      setActive(null);
      setSignature('');
      setNotes('');
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-navy">Approvals</h1>
        <p className="text-sm text-muted">
          Items waiting on {displayName}. Acknowledgment appends a signature; it does not edit the submitted record.
        </p>
      </div>
      {loading && <p className="text-muted">Loading…</p>}
      {!loading && rows.length === 0 && (
        <p className="rounded-md border border-navy/10 bg-white p-6 text-sm text-muted">Nothing in your inbox.</p>
      )}
      {Object.entries(grouped).map(([role, list]) => (
        <section key={role} className="overflow-hidden rounded-lg border border-navy/10 bg-white shadow-sm">
          <h2 className="border-b border-navy/10 bg-stripe px-4 py-2 text-sm font-semibold text-navy">
            {ROLE_LABEL[role] || role} · {list.length}
          </h2>
          <ul>
            {list.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-navy/5 px-4 py-3 last:border-0">
                <div>
                  <p className="font-medium text-navy">{row.entity?.title || row.entity_id}</p>
                  <p className="text-xs text-muted">
                    Age {ageDays(row.created_at)}d · {row.entity?.date || String(row.created_at).slice(0, 10)}
                    {row.entity?.incident_ref ? ` · ${row.entity.incident_ref}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {row.entity?.href && (
                    <Link to={row.entity.href} className="text-sm text-primary hover:underline">
                      Open
                    </Link>
                  )}
                  <button
                    type="button"
                    className="rounded-md bg-navy px-3 py-1.5 text-sm font-semibold text-white"
                    onClick={() => {
                      setActive(row);
                      setError(null);
                    }}
                  >
                    Review
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {active && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-navy/50 p-4 pt-10">
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
            <h3 className="text-lg font-bold text-navy">Review approval</h3>
            <p className="mt-1 text-sm text-muted">{active.entity?.title}</p>
            <p className="mt-2 text-sm">
              Status <StatusPill status={active.entity?.status} />
            </p>
            {woGates.length > 0 && (
              <ul className="mt-3 list-disc pl-5 text-sm text-alert">
                {woGates.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted">
              Rejection of a submitted regulatory record is pending BACC confirmation. Notes are stored either way.
            </p>
            <label className="mt-3 block text-sm">
              Notes
              <textarea className="mt-1 w-full rounded border border-navy/20 px-3 py-2" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <p className="mt-3 text-xs font-semibold uppercase text-muted">Drawn signature</p>
            <SignaturePad value={signature} onChange={setSignature} />
            {error && <p className="mt-2 text-sm text-alert">{error}</p>}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => setActive(null)}>
                Cancel
              </button>
              <button type="button" className="rounded-md border border-alert px-3 py-2 text-sm text-alert" onClick={() => onDecide('rejected')}>
                Reject
              </button>
              <button
                type="button"
                disabled={woGates.length > 0}
                className="rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => onDecide('approved')}
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ageDays(iso) {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86400000));
}
