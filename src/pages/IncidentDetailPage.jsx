import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Camera,
  Check,
  ChevronDown,
  Clock,
  History as HistoryIcon,
  ImagePlus,
  LocateFixed,
  Lock,
  MapPin,
  MessageSquarePlus,
  Paperclip,
  Pencil,
  RefreshCw,
  X,
} from 'lucide-react';
import LocationPicker, { captureGps } from '../components/incidents/LocationPicker.jsx';
import { DEFICIENCY_LEVELS, getDeficiencyLevel, slaState } from '../config/deficiencyLevels.js';
import { ASSIGNED_TEAMS, INCIDENT_CATEGORIES, INCIDENT_TYPES } from '../config/incidentLookups.js';
import { INSPECTION_TYPES } from '../lib/checklistSchema.js';
import { useAuth } from '../context/AuthContext.jsx';
import { getRepos } from '../data/repositories/index.js';
import { AIRPORT_TZ } from '../lib/belizeTime.js';
import { compressImage } from '../lib/imageCompress.js';
import {
  INCIDENT_STATUSES,
  hasSatVerification,
  incidentStatusLabel,
  incidentStepIndex,
  incidentTransitionBlockers,
} from '../lib/incidentLifecycle.js';
import {
  DESCRIPTION_MAX,
  addIncidentUpdate,
  getIncident,
  listQualifyingReinspections,
  persistIncident,
} from '../lib/incidents.js';

const TABS = [
  { id: 'details', label: 'Incident Details', icon: AlertTriangle },
  { id: 'location', label: 'Location', icon: MapPin },
  { id: 'photos', label: 'Photos & Attachments', icon: Paperclip },
  { id: 'updates', label: 'Actions & Updates', icon: Clock },
  { id: 'history', label: 'History', icon: HistoryIcon },
];

const STEP_LABELS = ['Reported', 'Assigned', 'In Progress', 'Resolved', 'Closed'];

const dateTimeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: AIRPORT_TZ,
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const dateFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: AIRPORT_TZ,
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function fmtDateTime(value) {
  if (!value) return '—';
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? String(value) : dateTimeFmt.format(ms);
}

function fmtDate(value) {
  if (!value) return '—';
  const ms = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00-06:00` : value);
  return Number.isNaN(ms) ? String(value) : dateFmt.format(ms);
}

export default function IncidentDetailPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { online } = useOutletContext() ?? { online: navigator.onLine };
  const { user, displayName, profile } = useAuth();
  const [incident, setIncident] = useState(null);
  const [tab, setTab] = useState('details');
  const [banner, setBanner] = useState(null);
  const [updateBody, setUpdateBody] = useState('');
  const [reinspections, setReinspections] = useState([]);
  const [locationView, setLocationView] = useState('map');
  const [statusOpen, setStatusOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [verifyDraft, setVerifyDraft] = useState(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const rec = await getIncident(id);
    setIncident(rec);
    if (rec) setReinspections(await listQualifyingReinspections(rec));
  }

  useEffect(() => {
    reload();
  }, [id]);

  // SLA must follow the demo clock, not the wall clock, or the countdown
  // contradicts every other date on screen once the clock is advanced.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const clock = await getRepos().instances.getClock();
        if (!cancelled && clock?.nowMs) setClockMs(clock.nowMs);
      } catch {
        /* supabase adapter not wired — fall back to wall clock */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [incident?.updatedAt, incident?.target_date]);

  useEffect(() => {
    const t = params.get('tab');
    if (t) setTab(t);
  }, [params]);

  const level = incident ? getDeficiencyLevel(incident.deficiency_level) : null;
  const sla = incident ? slaState(incident.target_date, clockMs) : { kind: 'none' };
  const step = incident ? incidentStepIndex(incident.status) : 0;
  const verified = incident ? hasSatVerification(incident) : false;

  async function saveIncident(next) {
    const saved = await persistIncident(next);
    setIncident(saved);
    return saved;
  }

  async function changeStatus(toStatus) {
    setStatusOpen(false);
    const blockers = incidentTransitionBlockers(incident, toStatus, {
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

  // ---- Edit mode -----------------------------------------------------------

  function startEdit() {
    setDraft({ ...incident });
    setEditing(true);
    setTab('details');
  }

  function cancelEdit() {
    setDraft(null);
    setEditing(false);
  }

  async function saveEdit() {
    setBusy(true);
    try {
      const next = {
        ...draft,
        description: String(draft.description ?? '').slice(0, DESCRIPTION_MAX),
        deficiency_level: Number(draft.deficiency_level),
      };
      await saveIncident(next);
      await addIncidentUpdate(next, {
        body: 'Incident details edited.',
        authorId: user?.id,
        authorName: displayName,
      });
      setEditing(false);
      setDraft(null);
      setBanner({ type: 'ok', text: 'Incident updated.' });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  // ---- Item verification (does NOT modify the submitted checklist) ---------

  async function confirmVerification() {
    setBusy(true);
    try {
      const next = {
        ...incident,
        verification: {
          result: 'sat',
          verified_at: new Date().toISOString(),
          verified_by: user?.id ?? 'local',
          verified_by_name: displayName || profile?.full_name || 'User',
          note: verifyDraft.note?.trim() || '',
          photo_url: verifyDraft.photo || null,
        },
      };
      await saveIncident(next);
      await addIncidentUpdate(next, {
        body: `${incident.source_item_code} verified back to SAT${
          verifyDraft.note?.trim() ? ` — ${verifyDraft.note.trim()}` : ''
        }`,
        authorId: user?.id,
        authorName: displayName,
      });
      setVerifyDraft(null);
      setBanner({ type: 'ok', text: `${incident.source_item_code} verified SAT. The incident can now be closed.` });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function clearVerification() {
    const next = { ...incident, verification: null };
    await saveIncident(next);
    await addIncidentUpdate(next, {
      body: `${incident.source_item_code} verification withdrawn — item is NO SAT again.`,
      authorId: user?.id,
      authorName: displayName,
    });
    setBanner({ type: 'ok', text: 'Verification withdrawn.' });
    await reload();
  }

  async function attachVerificationPhoto(file) {
    const { dataUrl } = await compressImage(file);
    setVerifyDraft((d) => ({ ...d, photo: dataUrl }));
  }

  // ---- Attachments ---------------------------------------------------------

  async function addAttachment(file) {
    setBusy(true);
    try {
      const { dataUrl, bytes } = await compressImage(file);
      const next = {
        ...incident,
        attachments: [
          ...(incident.attachments ?? []),
          {
            id: crypto.randomUUID(),
            photo_url: dataUrl,
            caption: file.name,
            bytes,
            uploaded_by: user?.id ?? 'local',
            uploaded_by_name: displayName,
            uploaded_at: new Date().toISOString(),
          },
        ],
      };
      await saveIncident(next);
      setBanner({ type: 'ok', text: 'Photo attached.' });
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function removeAttachment(attId) {
    const next = {
      ...incident,
      attachments: (incident.attachments ?? []).filter((a) => (a.id ?? a.photo_url) !== attId),
    };
    await saveIncident(next);
  }

  async function useMyLocation() {
    try {
      const geo = await captureGps();
      const next = { ...incident, ...geo };
      setIncident(next);
      await saveIncident(next);
      setBanner({ type: 'ok', text: 'Location captured from device GPS.' });
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    }
  }

  if (!incident) return <p className="text-muted">Loading incident…</p>;

  const view = editing ? draft : incident;
  const inspectionLabel =
    INSPECTION_TYPES.find((opt) => opt.value === incident.source_inspection_type)?.label ||
    incident.source_inspection_type;

  const geoBlock = (
    <>
      <div className="grid grid-cols-2 gap-y-3 border-t border-navy/10 px-4 py-3 text-sm sm:grid-cols-4">
        <Metric label="Latitude" value={incident.latitude ?? '—'} />
        <Metric label="Longitude" value={incident.longitude ?? '—'} />
        <Metric
          label="Accuracy"
          value={incident.location_accuracy_m != null ? `± ${Math.round(incident.location_accuracy_m)} m` : '—'}
        />
        <Metric label="Captured" value={fmtDateTime(incident.location_captured_at)} />
      </div>
      <div className="mx-4 mb-4 flex gap-2 rounded-md border border-primary/25 bg-primary/5 px-3 py-2.5">
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-primary" aria-hidden />
        <div className="text-xs">
          <p className="font-semibold text-navy">
            {incident.location_capture_method === 'gps'
              ? 'Location captured from device GPS'
              : 'Location captured by pin on map'}
          </p>
          <p className="text-muted">You can drag the pin to adjust the exact location.</p>
        </div>
      </div>
    </>
  );

  return (
    <div className="space-y-4">
      {/* Page heading + actions */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Incident Management</h1>
          <p className="mt-1 text-sm text-muted">
            <Link to="/incidents" className="hover:text-primary hover:underline">
              Incidents
            </Link>
            <span className="px-1.5">&gt;</span>
            <span>{incident.incident_ref}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/incidents')}
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-navy/20 bg-white px-3.5 text-sm font-medium text-navy hover:bg-stripe"
          >
            <ArrowLeft size={16} aria-hidden /> Back to Incidents
          </button>

          {editing ? (
            <>
              <button
                type="button"
                onClick={cancelEdit}
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-navy/20 bg-white px-3.5 text-sm font-medium text-navy hover:bg-stripe"
              >
                <X size={16} aria-hidden /> Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={busy}
                className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-3.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
              >
                <Check size={16} aria-hidden /> Save Changes
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={startEdit}
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-navy/20 bg-white px-3.5 text-sm font-medium text-navy hover:bg-stripe"
            >
              <Pencil size={16} aria-hidden /> Edit Incident
            </button>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-navy px-3.5 text-sm font-semibold text-white hover:bg-navy-mid"
            >
              More Actions <ChevronDown size={16} aria-hidden />
            </button>
            {moreOpen && (
              <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-md border border-navy/15 bg-white py-1 shadow-lg">
                <MenuItem onClick={() => { setMoreOpen(false); setTab('updates'); }}>Add an update</MenuItem>
                <MenuItem onClick={() => { setMoreOpen(false); setTab('photos'); }}>Attach a photo</MenuItem>
                <MenuItem onClick={() => { setMoreOpen(false); setTab('history'); }}>View history</MenuItem>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status strip */}
      <header className="rounded-md border border-navy/15 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <div className="pr-6">
            <span className="inline-block rounded bg-alert-soft px-4 py-1.5 text-sm font-bold uppercase tracking-wide text-navy">
              {incidentStatusLabel(incident.status)}
            </span>
            <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold" style={{ color: level?.color }}>
              <span className="h-2 w-2 rounded-full" style={{ background: level?.color }} aria-hidden />
              {level?.label ?? '—'}
            </p>
          </div>
          <StripField label="Incident ID" value={incident.incident_ref} strong />
          <StripField label="Date Reported" value={fmtDateTime(incident.reported_at)} />
          <StripField
            label="Reported By"
            value={incident.reported_by_name || 'Inspector'}
            sub={incident.reported_by_position || 'Maintenance Inspector'}
          />
          <StripField label="Department" value={incident.department || '—'} />
          <StripField
            label="Assigned To"
            value={incident.assigned_team ? labelOf(ASSIGNED_TEAMS, incident.assigned_team) : 'Unassigned'}
            sub={incident.assigned_to_name || null}
          />
          <StripField label="Due Date" value={fmtDate(incident.target_date)} />
        </div>
      </header>

      {banner && (
        <p
          className={`rounded-md px-4 py-2 text-sm ${
            banner.type === 'error'
              ? 'border border-alert bg-alert-soft text-alert'
              : 'border border-success bg-success-soft text-success'
          }`}
        >
          {banner.text}
        </p>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-navy/15">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex items-center gap-2 px-3.5 py-2.5 text-sm ${
                active
                  ? 'border-b-2 border-primary font-semibold text-navy'
                  : 'border-b-2 border-transparent text-muted hover:text-navy'
              }`}
            >
              <Icon size={15} aria-hidden />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          {tab === 'details' && (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-4">
                  <Card title="Source Information">
                    <dl className="divide-y divide-navy/5">
                      <Row
                        label="Source Checklist"
                        value={`${incident.source_template_code || ''} – ${
                          incident.source_template_title || 'Drainage System Inspection Checklist'
                        }`}
                      />
                      <Row label="Checklist Section" value={incident.source_section} />
                      <Row label="Checklist Item" value={incident.source_item_code} />
                      <Row label="Checklist Type" value={inspectionLabel} />
                      <Row label="Inspection Date" value={fmtDate(incident.source_inspection_date)} />
                      <Row label="Item Description" value={incident.source_item_description} />
                    </dl>
                  </Card>

                  <Card title="Incident Description">
                    <Field label="Issue / Remarks">
                      {editing ? (
                        <textarea
                          rows={3}
                          maxLength={DESCRIPTION_MAX}
                          value={draft.description ?? ''}
                          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                          className="w-full rounded border border-navy/20 px-3 py-2 text-sm"
                        />
                      ) : (
                        <p className="rounded border border-navy/20 bg-white px-3 py-2 text-sm">{incident.description}</p>
                      )}
                    </Field>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <Field label="Deficiency Level">
                        {editing ? (
                          <select
                            value={draft.deficiency_level ?? ''}
                            onChange={(e) => setDraft({ ...draft, deficiency_level: e.target.value })}
                            className="min-h-10 w-full rounded border border-navy/20 px-2 text-sm"
                          >
                            {DEFICIENCY_LEVELS.map((l) => (
                              <option key={l.level} value={l.level}>
                                {l.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="flex min-h-10 items-center gap-2 rounded border border-navy/20 px-3 text-sm">
                            <span className="h-2 w-2 rounded-full" style={{ background: level?.color }} aria-hidden />
                            {level?.label ?? '—'}
                          </div>
                        )}
                      </Field>
                      <Field label="Category">
                        {editing ? (
                          <select
                            value={draft.category ?? ''}
                            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                            className="min-h-10 w-full rounded border border-navy/20 px-2 text-sm"
                          >
                            {INCIDENT_CATEGORIES.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="flex min-h-10 items-center rounded border border-navy/20 px-3 text-sm">
                            {labelOf(INCIDENT_CATEGORIES, incident.category)}
                          </div>
                        )}
                      </Field>
                    </div>

                    <div className="mt-3">
                      <Field label="Incident Type">
                        {editing ? (
                          <select
                            value={draft.incident_type ?? ''}
                            onChange={(e) => setDraft({ ...draft, incident_type: e.target.value })}
                            className="min-h-10 w-full rounded border border-navy/20 px-2 text-sm"
                          >
                            <option value="">—</option>
                            {INCIDENT_TYPES.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="flex min-h-10 items-center rounded border border-navy/20 px-3 text-sm">
                            {labelOf(INCIDENT_TYPES, incident.incident_type)}
                          </div>
                        )}
                      </Field>
                    </div>

                    <div className="mt-3 grid gap-3">
                      <Field label="Potential Impact">
                        <textarea
                          rows={2}
                          value={view.potential_impact ?? ''}
                          onChange={(e) =>
                            editing
                              ? setDraft({ ...draft, potential_impact: e.target.value })
                              : setIncident({ ...incident, potential_impact: e.target.value })
                          }
                          onBlur={(e) => !editing && saveIncident({ ...incident, potential_impact: e.target.value })}
                          className="w-full rounded border border-navy/20 px-3 py-2 text-sm"
                        />
                      </Field>
                      <Field label="Immediate Action Taken (if any)">
                        <textarea
                          rows={2}
                          value={view.immediate_action_taken ?? ''}
                          onChange={(e) =>
                            editing
                              ? setDraft({ ...draft, immediate_action_taken: e.target.value })
                              : setIncident({ ...incident, immediate_action_taken: e.target.value })
                          }
                          onBlur={(e) =>
                            !editing && saveIncident({ ...incident, immediate_action_taken: e.target.value })
                          }
                          className="w-full rounded border border-navy/20 px-3 py-2 text-sm"
                        />
                      </Field>
                    </div>
                  </Card>
                </div>

                {/* Location card */}
                <section className="h-fit rounded-md border border-navy/15 bg-white shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2 px-4 pt-4">
                    <h2 className="text-sm font-semibold text-navy">Incident Location</h2>
                    <button
                      type="button"
                      onClick={useMyLocation}
                      className="inline-flex min-h-9 items-center gap-2 rounded-md border border-navy/20 px-3 text-xs font-semibold text-navy hover:bg-stripe"
                    >
                      <LocateFixed size={14} aria-hidden /> Use My Location
                    </button>
                  </div>
                  <div className="mt-2 flex gap-4 border-b border-navy/10 px-4">
                    {[
                      { id: 'map', label: 'Map View' },
                      { id: 'details', label: 'Details View' },
                    ].map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setLocationView(v.id)}
                        className={`pb-2 text-xs ${
                          locationView === v.id
                            ? 'border-b-2 border-primary font-semibold text-navy'
                            : 'border-b-2 border-transparent text-muted hover:text-navy'
                        }`}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>

                  {locationView === 'map' ? (
                    <div className="relative p-4">
                      <LocationPicker
                        latitude={incident.latitude}
                        longitude={incident.longitude}
                        height={300}
                        onChange={(geo) => {
                          const next = { ...incident, ...geo };
                          setIncident(next);
                          saveIncident(next);
                        }}
                      />
                      <div className="pointer-events-none absolute right-7 top-7 z-[400] rounded border border-navy/15 bg-white px-3 py-2 text-xs shadow-sm">
                        <p className="font-semibold text-navy">Incident Location</p>
                        <p className="text-muted">{incident.location_label}</p>
                      </div>
                    </div>
                  ) : (
                    <dl className="divide-y divide-navy/5 px-4 py-2">
                      <Row label="Location" value={incident.location_label} />
                      <Row label="Capture Method" value={incident.location_capture_method || '—'} />
                      <Row label="Pin Adjusted" value={incident.location_user_adjusted ? 'Yes' : 'No'} />
                    </dl>
                  )}

                  {geoBlock}
                </section>
              </div>

              {/* Related checklist item + verification */}
              <Card title="Related Checklist Item">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-navy/10 text-left text-xs font-semibold text-muted">
                        <th className="py-2 pr-3">Item</th>
                        <th className="py-2 pr-3" />
                        <th className="w-16 py-2 text-center">SAT</th>
                        <th className="w-20 py-2 text-center">NO SAT</th>
                        <th className="py-2 pr-3">Remarks / Location</th>
                        <th className="w-28 py-2 text-center">View Checklist</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="py-3 pr-3 align-top font-medium text-navy">{incident.source_item_code}</td>
                        <td className="py-3 pr-3 align-top">{incident.source_item_description}</td>
                        <td className="py-3 text-center align-top">
                          <RadioButton
                            checked={verified}
                            tone="success"
                            label={`Mark ${incident.source_item_code} verified SAT`}
                            onClick={() => !verified && setVerifyDraft({ note: '', photo: null })}
                          />
                        </td>
                        <td className="py-3 text-center align-top">
                          <RadioButton
                            checked={!verified}
                            tone="alert"
                            label={`Revert ${incident.source_item_code} to NO SAT`}
                            onClick={() => verified && clearVerification()}
                          />
                        </td>
                        <td className="py-3 pr-3 align-top">{incident.source_item_remarks || incident.description}</td>
                        <td className="py-3 text-center align-top">
                          {incident.submission_id ? (
                            <Link
                              to={`/checklists/${incident.submission_id}`}
                              title="View checklist"
                              className="inline-flex min-h-9 min-w-9 items-center justify-center rounded border border-navy/20 text-navy hover:bg-stripe"
                            >
                              <Camera size={16} aria-hidden />
                              <span className="sr-only">View checklist</span>
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Audit trail — the submitted checklist is never altered */}
                <p className="mt-3 border-t border-navy/10 pt-3 text-xs text-muted">
                  Recorded <strong className="font-semibold text-alert">NO SAT</strong> on{' '}
                  {fmtDate(incident.source_inspection_date)} in {incident.source_template_code}.
                  {incident.verification?.result === 'sat' && (
                    <>
                      {' '}
                      Verified <strong className="font-semibold text-success">SAT</strong> by{' '}
                      {incident.verification.verified_by_name} on {fmtDateTime(incident.verification.verified_at)}.
                      {incident.verification.note ? ` ${incident.verification.note}` : ''}
                    </>
                  )}
                  {incident.reinspection_submission_id && ' Closure evidence: linked re-inspection.'}
                  <br />
                  The submitted checklist is a locked record and is never modified — verification is stored against
                  the incident.
                </p>

                {incident.verification?.photo_url && (
                  <img
                    src={incident.verification.photo_url}
                    alt="Verification evidence"
                    className="mt-2 h-32 rounded border border-navy/15 object-cover"
                  />
                )}

                {verifyDraft && (
                  <div className="mt-3 rounded-md border border-success/40 bg-success-soft/60 p-3">
                    <p className="text-sm font-semibold text-navy">
                      Verify {incident.source_item_code} back to SAT
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      Records that corrective action was completed and the item re-inspected. The original checklist
                      stays untouched.
                    </p>
                    <textarea
                      rows={2}
                      value={verifyDraft.note}
                      onChange={(e) => setVerifyDraft({ ...verifyDraft, note: e.target.value })}
                      placeholder="What was done, and what was observed on re-inspection…"
                      className="mt-2 w-full rounded border border-navy/20 px-3 py-2 text-sm"
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-navy/20 bg-white px-3 text-xs font-semibold text-navy hover:bg-stripe">
                        <ImagePlus size={14} aria-hidden /> Attach evidence
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) attachVerificationPhoto(f);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      {verifyDraft.photo && (
                        <img src={verifyDraft.photo} alt="Evidence preview" className="h-9 w-14 rounded object-cover" />
                      )}
                      <span className="flex-1" />
                      <button
                        type="button"
                        onClick={() => setVerifyDraft(null)}
                        className="min-h-9 rounded-md border border-navy/20 bg-white px-3 text-xs font-semibold text-navy hover:bg-stripe"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={confirmVerification}
                        disabled={busy}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-success px-3 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        <Check size={14} aria-hidden /> Confirm SAT
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            </>
          )}

          {tab === 'location' && (
            <section className="rounded-md border border-navy/15 bg-white shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2 px-4 pt-4">
                <h2 className="text-sm font-semibold text-navy">Incident Location</h2>
                <button
                  type="button"
                  onClick={useMyLocation}
                  className="inline-flex min-h-9 items-center gap-2 rounded-md border border-navy/20 px-3 text-xs font-semibold text-navy hover:bg-stripe"
                >
                  <LocateFixed size={14} aria-hidden /> Use My Location
                </button>
              </div>
              <p className="px-4 pb-2 pt-1 text-sm text-muted">{incident.location_label}</p>
              <div className="p-4">
                <LocationPicker
                  latitude={incident.latitude}
                  longitude={incident.longitude}
                  height={380}
                  onChange={(geo) => {
                    const next = { ...incident, ...geo };
                    setIncident(next);
                    saveIncident(next);
                  }}
                />
              </div>
              {geoBlock}
            </section>
          )}

          {tab === 'photos' && (
            <Card title="Photos & Attachments">
              <label className="mb-3 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md bg-navy px-3.5 text-sm font-semibold text-white hover:bg-navy-mid">
                <ImagePlus size={16} aria-hidden /> Add Photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) addAttachment(f);
                    e.target.value = '';
                  }}
                />
              </label>
              {(incident.attachments ?? []).length === 0 && <p className="text-sm text-muted">No attachments yet.</p>}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(incident.attachments ?? []).map((att, i) => {
                  const key = att.id ?? att.photo_url ?? i;
                  return (
                    <figure key={key} className="relative overflow-hidden rounded border border-navy/10">
                      {(att.previewUrl || att.photo_url) && (
                        <img
                          src={att.previewUrl || att.photo_url}
                          alt={att.caption || 'Attachment'}
                          className="h-40 w-full object-cover"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => removeAttachment(att.id ?? att.photo_url)}
                        aria-label="Remove attachment"
                        className="absolute right-2 top-2 rounded-full bg-navy/80 p-1 text-white hover:bg-navy"
                      >
                        <X size={14} aria-hidden />
                      </button>
                      <figcaption className="px-2 py-1.5 text-xs text-muted">
                        {att.caption || 'Checklist photo'}
                        {att.uploaded_at ? ` · ${fmtDateTime(att.uploaded_at)}` : ''}
                      </figcaption>
                    </figure>
                  );
                })}
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
                className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-md bg-navy px-3.5 text-sm font-semibold text-white hover:bg-navy-mid"
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
                <MessageSquarePlus size={16} aria-hidden /> Add Update
              </button>
              <ul className="mt-4 space-y-3">
                {(incident.updates ?? []).map((u) => (
                  <li key={u.id} className="border-t border-navy/10 pt-3 text-sm">
                    <p>{u.body}</p>
                    <p className="text-xs text-muted">
                      {u.author_name || 'User'} · {fmtDateTime(u.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {tab === 'history' && (
            <Card title="History">
              <ul className="space-y-2 text-sm">
                <li>Created {fmtDateTime(incident.reported_at)}</li>
                {(incident.updates ?? [])
                  .filter((u) => u.status_to)
                  .map((u) => (
                    <li key={u.id}>
                      {incidentStatusLabel(u.status_from)} → {incidentStatusLabel(u.status_to)} ·{' '}
                      {fmtDateTime(u.created_at)}
                    </li>
                  ))}
              </ul>
            </Card>
          )}
        </div>

        {/* Right rail */}
        <aside className="h-fit space-y-4 xl:sticky xl:top-4">
          <Card title="Status & Workflow">
            <div className="space-y-3">
              <SelectField
                label="Current Status"
                value={incident.status}
                onChange={(v) => changeStatus(v)}
                options={INCIDENT_STATUSES}
              />
              <div>
                <span className="mb-1 block text-xs text-muted">Deficiency Level</span>
                <div className="flex min-h-10 items-center gap-2 rounded border border-navy/20 px-3 text-sm">
                  <span className="h-2 w-2 rounded-full" style={{ background: level?.color }} aria-hidden />
                  {level?.label ?? '—'}
                </div>
              </div>
              <SelectField
                label="Workflow Step"
                value={incident.status}
                onChange={(v) => changeStatus(v)}
                options={INCIDENT_STATUSES.map((s, i) => ({ value: s.value, label: STEP_LABELS[i] }))}
              />
            </div>

            <ol className="mt-4 flex items-start justify-between">
              {INCIDENT_STATUSES.map((s, i) => {
                const done = i < step;
                const current = i === step;
                return (
                  <li key={s.value} className="relative flex flex-1 flex-col items-center text-center">
                    {i > 0 && (
                      <span
                        className={`absolute right-1/2 top-2.5 h-0.5 w-full ${i <= step ? 'bg-primary' : 'bg-navy/15'}`}
                        aria-hidden
                      />
                    )}
                    <span
                      className={`relative z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                        done
                          ? 'border-success bg-success text-white'
                          : current
                            ? 'border-primary bg-primary text-white'
                            : 'border-navy/20 bg-white'
                      }`}
                    >
                      {done && <Check size={12} aria-hidden />}
                    </span>
                    <span
                      className={`mt-1.5 text-[10px] leading-tight ${current ? 'font-semibold text-navy' : 'text-muted'}`}
                    >
                      {STEP_LABELS[i]}
                    </span>
                  </li>
                );
              })}
            </ol>
          </Card>

          <Card title="Assignment">
            <div className="space-y-3">
              <SelectField
                label="Assigned To"
                value={incident.assigned_team || ''}
                onChange={(v) => {
                  const team = ASSIGNED_TEAMS.find((t) => t.value === v);
                  const next = { ...incident, assigned_team: v, assigned_to_name: team?.label || '' };
                  setIncident(next);
                  saveIncident(next);
                }}
                options={[{ value: '', label: 'Unassigned' }, ...ASSIGNED_TEAMS]}
              />
              <div>
                <span className="mb-1 block text-xs text-muted">CC</span>
                <select
                  disabled
                  className="min-h-10 w-full rounded border border-navy/20 bg-stripe px-2 text-sm text-muted"
                  title="Notification recipients are pending BACC confirmation"
                >
                  <option>Select users…</option>
                </select>
              </div>
              <div>
                <span className="mb-1 block text-xs text-muted">Assigned Date</span>
                <p className="text-sm">{incident.assigned_at ? fmtDateTime(incident.assigned_at) : '—'}</p>
              </div>
            </div>
          </Card>

          <Card title="Target Resolution">
            <div className="space-y-3">
              <div>
                <span className="mb-1 block text-xs text-muted">Due Date</span>
                <div className="relative">
                  <input
                    type="date"
                    value={incident.target_date || ''}
                    onChange={(e) => {
                      const next = { ...incident, target_date: e.target.value };
                      setIncident(next);
                      saveIncident(next);
                    }}
                    className="min-h-10 w-full rounded border border-navy/20 px-3 pr-9 text-sm"
                  />
                  <Calendar
                    size={15}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
                    aria-hidden
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted">SLA</span>
                <span
                  className={`rounded px-2.5 py-1 text-xs font-semibold ${
                    sla.kind === 'overdue'
                      ? 'bg-alert-soft text-alert'
                      : sla.kind === 'warning'
                        ? 'bg-[#FDF3E2] text-[#9A6414]'
                        : sla.kind === 'ok'
                          ? 'bg-success-soft text-success'
                          : 'bg-stripe text-muted'
                  }`}
                >
                  {sla.kind === 'none' && 'No target date'}
                  {(sla.kind === 'ok' || sla.kind === 'warning') && `${sla.remainingDays} days remaining`}
                  {sla.kind === 'overdue' && `${Math.abs(sla.remainingDays)} days overdue`}
                </span>
              </div>
            </div>
          </Card>

          <Card title="Quick Actions">
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setTab('updates')}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-3.5 text-sm font-semibold text-white hover:bg-primary-hover"
              >
                <MessageSquarePlus size={16} aria-hidden /> Add Update
              </button>

              <button
                type="button"
                onClick={() => setStatusOpen((v) => !v)}
                aria-expanded={statusOpen}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-navy/25 px-3.5 text-sm font-semibold text-navy hover:bg-stripe"
              >
                <RefreshCw size={16} aria-hidden /> Change Status
              </button>
              {statusOpen && (
                <select
                  autoFocus
                  className="min-h-10 rounded border border-navy/20 px-2 text-sm"
                  value=""
                  onChange={(e) => e.target.value && changeStatus(e.target.value)}
                >
                  <option value="">Select a status…</option>
                  {INCIDENT_STATUSES.filter((s) => s.value !== incident.status).map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              )}

              <div>
                <span className="mb-1 block text-xs text-muted">Link re-inspection</span>
                <select
                  value={incident.reinspection_submission_id || ''}
                  onChange={(e) => {
                    const next = { ...incident, reinspection_submission_id: e.target.value || null };
                    setIncident(next);
                    saveIncident(next);
                  }}
                  className="min-h-10 w-full rounded border border-navy/20 px-2 text-sm"
                >
                  <option value="">Select a SAT re-inspection…</option>
                  {reinspections.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.inspection_date || row.header?.date} · {row.template_code || 'checklist'}
                    </option>
                  ))}
                </select>
                {reinspections.length === 0 && !verified && (
                  <p className="mt-1 text-xs text-muted">
                    No qualifying re-inspection yet. You can also mark {incident.source_item_code} SAT on the Related
                    Checklist Item row.
                  </p>
                )}
              </div>

              {incident.status !== 'closed' && (
                <button
                  type="button"
                  onClick={() => changeStatus('closed')}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-alert px-3.5 text-sm font-semibold text-alert hover:bg-alert-soft"
                >
                  <Lock size={16} aria-hidden /> Close Incident
                </button>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function RadioButton({ checked, tone, label, onClick }) {
  const ring = tone === 'success' ? 'border-success' : 'border-alert';
  const dot = tone === 'success' ? 'bg-success' : 'bg-alert';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      aria-label={label}
      title={label}
      className={`inline-flex h-5 w-5 items-center justify-center rounded-full border-2 transition ${
        checked ? ring : 'border-navy/25 hover:border-navy/50'
      }`}
    >
      {checked && <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />}
    </button>
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

function Row({ label, value }) {
  return (
    <div className="grid grid-cols-[10rem_minmax(0,1fr)] gap-3 py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink">{value || '—'}</dd>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}

function StripField({ label, value, sub, strong }) {
  return (
    <div className="min-w-[8rem] border-l border-navy/10 pl-6 first:border-l-0 first:pl-0">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-0.5 text-sm ${strong ? 'font-semibold text-navy' : 'text-ink'}`}>{value || '—'}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-sm text-ink">{value}</p>
    </div>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <div>
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-10 w-full rounded border border-navy/20 px-2 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function MenuItem({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full px-3 py-2 text-left text-sm text-navy hover:bg-stripe"
    >
      {children}
    </button>
  );
}

function labelOf(list, value) {
  return list.find((row) => row.value === value)?.label || value || '—';
}
