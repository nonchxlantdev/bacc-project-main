import { useEffect, useState } from 'react';
import { Link, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import LocationPicker from '../components/incidents/LocationPicker.jsx';
import WorkOrderForm from '../components/incidents/WorkOrderForm.jsx';
import { getDeficiencyLevel, slaState } from '../config/deficiencyLevels.js';
import { ASSIGNED_TEAMS, INCIDENT_CATEGORIES, INCIDENT_TYPES } from '../config/incidentLookups.js';
import { INSPECTION_TYPES } from '../lib/checklistSchema.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  INCIDENT_STATUSES,
  incidentStatusLabel,
  incidentStepIndex,
  incidentTransitionBlockers,
  workOrderVerifiedBlockers,
} from '../lib/incidentLifecycle.js';
import {
  addIncidentUpdate,
  getIncident,
  listQualifyingReinspections,
  persistIncident,
} from '../lib/incidents.js';
import {
  buildWorkOrderFromIncident,
  listWorkOrders,
  persistWorkOrder,
} from '../lib/workOrders.js';

const TABS = [
  { id: 'details', label: 'Incident Details' },
  { id: 'location', label: 'Location' },
  { id: 'photos', label: 'Photos & Attachments' },
  { id: 'updates', label: 'Actions & Updates' },
  { id: 'history', label: 'History' },
  { id: 'work-orders', label: 'Work Orders' },
];

export default function IncidentDetailPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { online } = useOutletContext() ?? { online: navigator.onLine };
  const { user, displayName, profile } = useAuth();
  const [incident, setIncident] = useState(null);
  const [workOrders, setWorkOrders] = useState([]);
  const [tab, setTab] = useState('details');
  const [activeWo, setActiveWo] = useState(null);
  const [banner, setBanner] = useState(null);
  const [updateBody, setUpdateBody] = useState('');
  const [reinspections, setReinspections] = useState([]);
  const [exporting, setExporting] = useState(false);

  async function reload() {
    const rec = await getIncident(id);
    setIncident(rec);
    const wos = await listWorkOrders(id);
    setWorkOrders(wos);
    if (rec) setReinspections(await listQualifyingReinspections(rec));
  }

  useEffect(() => {
    reload();
  }, [id]);

  useEffect(() => {
    const t = params.get('tab');
    if (t) setTab(t);
  }, [params]);

  useEffect(() => {
    const woId = params.get('wo');
    if (!woId || !workOrders.length) return;
    const hit = workOrders.find((w) => w.id === woId);
    if (hit) setActiveWo(hit);
  }, [params, workOrders]);

  const level = incident ? getDeficiencyLevel(incident.deficiency_level) : null;
  const sla = incident ? slaState(incident.target_date) : { kind: 'none' };
  const step = incident ? incidentStepIndex(incident.status) : 0;

  async function saveIncident(next) {
    const saved = await persistIncident(next);
    setIncident(saved);
    return saved;
  }

  async function changeStatus(toStatus) {
    const blockers = incidentTransitionBlockers(incident, toStatus, {
      workOrders,
      reinspection: incident.reinspection_submission_id,
    });
    if (blockers.length) {
      setBanner({ type: 'error', text: blockers.join(' ') });
      return;
    }
    const next = {
      ...incident,
      status: toStatus,
      assigned_at: toStatus === 'assigned' ? new Date().toISOString() : incident.assigned_at,
      closed_at: toStatus === 'closed' ? new Date().toISOString() : incident.closed_at,
    };
    await saveIncident(next);
    await addIncidentUpdate(next, {
      body: `Status changed to ${incidentStatusLabel(toStatus)}.`,
      status_from: incident.status,
      status_to: toStatus,
      authorId: user?.id,
      authorName: displayName,
    });
    setBanner({ type: 'ok', text: `Status is now ${incidentStatusLabel(toStatus)}.` });
    await reload();
  }

  async function issueWorkOrder() {
    const draft = buildWorkOrderFromIncident(incident, user, profile);
    const saved = await persistWorkOrder(draft);
    setWorkOrders(await listWorkOrders(incident.id));
    setActiveWo(saved);
    setTab('work-orders');
  }

  async function exportWorkOrder(wo) {
    if (!online) {
      setBanner({ type: 'error', text: 'Export requires connectivity.' });
      return;
    }
    setExporting(true);
    try {
      const images = {};
      for (const sign of wo.signoffs ?? []) {
        if (sign.role === 'om_coo_verification' && sign.signature_data_uri) images.om_signature = sign.signature_data_uri;
        if (sign.role === 'cec_clearance' && sign.signature_data_uri) images.cec_signature = sign.signature_data_uri;
      }
      const res = await fetch('/api/export-work-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workOrder: wo, images }),
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${wo.work_order_number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      await persistWorkOrder({ ...wo, exported_pdf_path: `${wo.work_order_number}.pdf` });
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    } finally {
      setExporting(false);
    }
  }

  async function verifyWorkOrder(wo) {
    const blockers = workOrderVerifiedBlockers(wo);
    if (blockers.length) {
      setBanner({ type: 'error', text: blockers.join(' ') });
      return;
    }
    const saved = await persistWorkOrder({ ...wo, status: 'verified', locked: true });
    setActiveWo(saved);
    setWorkOrders(await listWorkOrders(incident.id));
    setBanner({ type: 'ok', text: 'Work order verified and locked.' });
  }

  if (!incident) return <p className="text-muted">Loading incident…</p>;

  const inspectionLabel =
    INSPECTION_TYPES.find((opt) => opt.value === incident.source_inspection_type)?.label ||
    incident.source_inspection_type;

  return (
    <div className="space-y-4">
      <header className="rounded-md border border-navy/10 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-navy px-2.5 py-0.5 text-xs font-semibold text-white">
                {incidentStatusLabel(incident.status)}
              </span>
              <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white" style={{ background: level?.color }}>
                {level?.label}
              </span>
              <h1 className="text-xl font-bold text-navy">{incident.incident_ref}</h1>
            </div>
            <p className="mt-1 text-sm text-muted">
              Reported {String(incident.reported_at).slice(0, 10)} by {incident.reported_by_name || 'Inspector'}
              {incident.department ? ` · ${incident.department}` : ''}
              {incident.assigned_to_name || incident.assigned_team ? ` · Assigned ${incident.assigned_to_name || incident.assigned_team}` : ''}
              {incident.target_date ? ` · Due ${incident.target_date}` : ''}
            </p>
            <p className="mt-1 font-medium text-navy">{incident.title}</p>
          </div>
        </div>
      </header>

      {banner && (
        <p className={`rounded-md px-4 py-2 text-sm ${banner.type === 'error' ? 'border border-alert bg-alert-soft text-alert' : 'border border-success bg-success-soft text-success'}`}>
          {banner.text}
        </p>
      )}

      <div className="flex flex-wrap gap-1 border-b border-navy/10">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm ${tab === t.id ? 'border-b-2 border-primary font-semibold text-navy' : 'text-muted'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="space-y-4">
          {tab === 'details' && (
            <>
              <Card title="Source Information">
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <Item label="Form" value={incident.source_template_code} />
                  <Item label="Section" value={incident.source_section} />
                  <Item label="Item" value={incident.source_item_code} />
                  <Item label="Description" value={incident.source_item_description} />
                  <Item label="Inspection Type" value={inspectionLabel} />
                  <Item label="Inspection Date" value={incident.source_inspection_date} />
                </dl>
              </Card>
              <Card title="Incident Description">
                <p className="text-sm">{incident.description}</p>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <Item label="Level" value={level?.label} />
                  <Item label="Category" value={labelOf(INCIDENT_CATEGORIES, incident.category)} />
                  <Item label="Incident Type" value={labelOf(INCIDENT_TYPES, incident.incident_type)} />
                  <Item label="Potential Impact" value={incident.potential_impact || '—'} />
                  <Item label="Immediate Action Taken" value={incident.immediate_action_taken || '—'} />
                </dl>
                <div className="mt-3 grid gap-3">
                  <label className="block text-sm">
                    <span className="mb-1 block text-[11px] font-semibold uppercase text-muted">Potential Impact</span>
                    <textarea
                      rows={2}
                      value={incident.potential_impact}
                      onChange={(e) => setIncident({ ...incident, potential_impact: e.target.value })}
                      onBlur={(e) => saveIncident({ ...incident, potential_impact: e.target.value })}
                      className="w-full rounded border border-navy/20 px-3 py-2"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-[11px] font-semibold uppercase text-muted">Immediate Action Taken</span>
                    <textarea
                      rows={2}
                      value={incident.immediate_action_taken}
                      onChange={(e) => setIncident({ ...incident, immediate_action_taken: e.target.value })}
                      onBlur={(e) => saveIncident({ ...incident, immediate_action_taken: e.target.value })}
                      className="w-full rounded border border-navy/20 px-3 py-2"
                    />
                  </label>
                </div>
              </Card>
              <Card title="Incident Location">
                <p className="mb-2 text-sm">{incident.location_label}</p>
                <LocationPicker
                  latitude={incident.latitude}
                  longitude={incident.longitude}
                  height={280}
                  onChange={(geo) => {
                    const next = { ...incident, ...geo };
                    setIncident(next);
                    saveIncident(next);
                  }}
                />
                <p className="mt-2 text-xs text-muted">You can drag the pin to adjust the exact location.</p>
                <p className="mt-1 text-xs text-muted">
                  {incident.latitude}, {incident.longitude}
                  {incident.location_accuracy_m != null ? ` · ±${Math.round(incident.location_accuracy_m)} m` : ''}
                  {incident.location_captured_at ? ` · ${new Date(incident.location_captured_at).toLocaleString()}` : ''}
                  {incident.location_capture_method ? ` · ${incident.location_capture_method}` : ''}
                  {incident.location_user_adjusted ? ' · pin adjusted' : ''}
                </p>
              </Card>
              <Card title="Related Checklist Item">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted">
                      <th className="py-1">Item</th>
                      <th>Result</th>
                      <th>Submission</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-2">{incident.source_item_code}</td>
                      <td>NO SAT</td>
                      <td>
                        {incident.submission_id ? (
                          <Link to={`/checklists/${incident.submission_id}`} className="text-primary hover:underline">
                            View Checklist
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Card>
            </>
          )}

          {tab === 'location' && (
            <Card title="Incident Location">
              <p className="mb-2 text-sm">{incident.location_label}</p>
              <LocationPicker
                latitude={incident.latitude}
                longitude={incident.longitude}
                height={320}
                onChange={(geo) => {
                  const next = { ...incident, ...geo };
                  setIncident(next);
                  saveIncident(next);
                }}
              />
              <p className="mt-2 text-xs text-muted">You can drag the pin to adjust the exact location.</p>
              <p className="mt-1 text-xs text-muted">
                {incident.latitude}, {incident.longitude}
                {incident.location_accuracy_m != null ? ` · ±${Math.round(incident.location_accuracy_m)} m` : ''}
                {incident.location_captured_at ? ` · ${new Date(incident.location_captured_at).toLocaleString()}` : ''}
                {incident.location_capture_method ? ` · ${incident.location_capture_method}` : ''}
                {incident.location_user_adjusted ? ' · pin adjusted' : ''}
              </p>
            </Card>
          )}

          {tab === 'photos' && (
            <Card title="Photos & Attachments">
              {(incident.attachments ?? []).length === 0 && <p className="text-sm text-muted">No attachments yet.</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                {(incident.attachments ?? []).map((att, i) => (
                  <div key={i} className="rounded border border-navy/10 p-2">
                    {(att.previewUrl || att.photo_url) && (
                      <img src={att.previewUrl || att.photo_url} alt={att.caption || 'Attachment'} className="h-40 w-full object-cover" />
                    )}
                    <p className="mt-1 text-xs text-muted">{att.caption || 'Checklist photo'}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {tab === 'updates' && (
            <Card title="Actions & Updates">
              <textarea
                rows={3}
                value={updateBody}
                onChange={(e) => setUpdateBody(e.target.value)}
                className="w-full rounded border border-navy/20 px-3 py-2 text-sm"
                placeholder="Add an update…"
              />
              <button
                type="button"
                className="mt-2 rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white"
                onClick={async () => {
                  if (!updateBody.trim()) return;
                  await addIncidentUpdate(incident, {
                    body: updateBody.trim(),
                    authorId: user?.id,
                    authorName: displayName,
                  });
                  setUpdateBody('');
                  await reload();
                }}
              >
                Add Update
              </button>
              <ul className="mt-4 space-y-3">
                {(incident.updates ?? []).map((u) => (
                  <li key={u.id} className="border-t border-navy/10 pt-3 text-sm">
                    <p>{u.body}</p>
                    <p className="text-xs text-muted">
                      {u.author_name || 'User'} · {new Date(u.created_at).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {tab === 'history' && (
            <Card title="History">
              <ul className="space-y-2 text-sm">
                <li>Created {new Date(incident.reported_at).toLocaleString()}</li>
                {(incident.updates ?? [])
                  .filter((u) => u.status_to)
                  .map((u) => (
                    <li key={u.id}>
                      {incidentStatusLabel(u.status_from)} → {incidentStatusLabel(u.status_to)} ·{' '}
                      {new Date(u.created_at).toLocaleString()}
                    </li>
                  ))}
              </ul>
            </Card>
          )}

          {tab === 'work-orders' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-navy">Work Orders</h2>
                <button type="button" onClick={issueWorkOrder} className="rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white">
                  Issue Work Order
                </button>
              </div>
              {workOrders.length === 0 && <p className="text-sm text-muted">No work orders yet.</p>}
              <ul className="divide-y divide-navy/10 rounded-md border border-navy/10 bg-white">
                {workOrders.map((wo) => (
                  <li key={wo.id}>
                    <button type="button" onClick={() => setActiveWo(wo)} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-stripe">
                      <span className="font-medium text-navy">{wo.work_order_number}</span>
                      <span className="text-muted">
                        {wo.assigned_to_name || 'Unassigned'} · {wo.target_completion_date || 'no target'} · {wo.status}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {activeWo && (
                <WorkOrderForm
                  workOrder={activeWo}
                  onChange={setActiveWo}
                  onSave={async () => {
                    const saved = await persistWorkOrder(activeWo);
                    setActiveWo(saved);
                    setWorkOrders(await listWorkOrders(incident.id));
                  }}
                  onVerify={() => verifyWorkOrder(activeWo)}
                  onExport={() => exportWorkOrder(activeWo)}
                />
              )}
            </div>
          )}
        </div>

        <aside className="h-fit space-y-4 xl:sticky xl:top-4">
          <Card title="Status & Workflow">
            <ol className="space-y-2">
              {INCIDENT_STATUSES.map((s, i) => (
                <li key={s.value} className="flex items-center gap-2 text-sm">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      i <= step ? 'bg-navy text-white' : 'bg-stripe text-muted'
                    }`}
                  >
                    {i + 1}
                  </span>
                  {s.label}
                </li>
              ))}
            </ol>
          </Card>
          <Card title="Assignment">
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase text-muted">Assigned team</span>
              <select
                value={incident.assigned_team || ''}
                onChange={(e) => {
                  const team = ASSIGNED_TEAMS.find((t) => t.value === e.target.value);
                  const next = {
                    ...incident,
                    assigned_team: e.target.value,
                    assigned_to_name: team?.label || '',
                  };
                  setIncident(next);
                  saveIncident(next);
                }}
                className="min-h-10 w-full rounded border border-navy/20 px-2 py-2"
              >
                <option value="">Unassigned</option>
                {ASSIGNED_TEAMS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-2 text-xs text-muted">
              Assigned {incident.assigned_at ? new Date(incident.assigned_at).toLocaleDateString() : '—'}
            </p>
          </Card>
          <Card title="Target Resolution">
            <input
              type="date"
              value={incident.target_date || ''}
              onChange={(e) => {
                const next = { ...incident, target_date: e.target.value };
                setIncident(next);
                saveIncident(next);
              }}
              className="min-h-10 w-full rounded border border-navy/20 px-2 py-2 text-sm"
            />
            <p className={`mt-2 text-sm font-semibold ${sla.kind === 'overdue' ? 'text-alert' : sla.kind === 'warning' ? 'text-primary' : 'text-muted'}`}>
              {sla.kind === 'none' && 'No target date'}
              {sla.kind === 'ok' && `${sla.remainingDays} days remaining`}
              {sla.kind === 'warning' && `${sla.remainingDays} days remaining`}
              {sla.kind === 'overdue' && `${Math.abs(sla.remainingDays)} days overdue`}
            </p>
          </Card>
          <Card title="Quick Actions">
            <div className="flex flex-col gap-2">
              {incident.status !== 'closed' && (
                <select
                  className="min-h-10 rounded border border-navy/20 px-2 text-sm"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) changeStatus(e.target.value);
                  }}
                >
                  <option value="">Change status…</option>
                  {INCIDENT_STATUSES.filter((s) => s.value !== incident.status).map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              )}
              <label className="text-sm">
                <span className="mb-1 block text-[11px] font-semibold uppercase text-muted">Link re-inspection</span>
                <select
                  value={incident.reinspection_submission_id || ''}
                  onChange={(e) => {
                    const next = { ...incident, reinspection_submission_id: e.target.value || null };
                    setIncident(next);
                    saveIncident(next);
                  }}
                  className="min-h-10 w-full rounded border border-navy/20 px-2 py-2"
                >
                  <option value="">Select a SAT re-inspection…</option>
                  {reinspections.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.inspection_date || row.header?.date} · {row.template_code || 'checklist'}
                    </option>
                  ))}
                </select>
              </label>
              {reinspections.length === 0 && (
                <p className="text-xs text-muted">
                  Closure needs a later submitted inspection of {incident.source_template_code} where {incident.source_item_code} is SAT.
                </p>
              )}
              {incident.status !== 'closed' && (
                <button
                  type="button"
                  onClick={() => changeStatus('closed')}
                  className="rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white"
                >
                  Close Incident
                </button>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <section className="rounded-md border border-navy/15 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-navy">{title}</h2>
      {children}
    </section>
  );
}

function Item({ label, value }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase text-muted">{label}</dt>
      <dd>{value || '—'}</dd>
    </div>
  );
}

function labelOf(list, value) {
  return list.find((row) => row.value === value)?.label || value || '—';
}
