import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
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
import VerificationPanel from '../components/incidents/VerificationPanel.jsx';
import {
  Card,
  Field,
  MenuItem,
  Metric,
  Row,
  SelectField,
  StripField,
  labelOf,
} from '../components/incidents/detailUi.jsx';
import { fmtCoord, fmtDate, fmtDateTime } from '../lib/airportFormat.js';
import { DEFICIENCY_LEVELS, getDeficiencyLevel, slaState } from '../config/deficiencyLevels.js';
import {
  ASSIGNED_TEAMS,
  INCIDENT_CATEGORIES,
  INCIDENT_TYPES,
  defaultTeamFor,
} from '../config/incidentLookups.js';
import { INSPECTION_TYPES } from '../lib/checklistSchema.js';
import { useAuth } from '../context/AuthContext.jsx';
import { syncSourceChecklist } from '../lib/checklistSync.js';
import { getRepos } from '../data/repositories/index.js';
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
  const [directory, setDirectory] = useState([]);

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

  // Anyone in the directory can carry an incident — a deficiency does not know
  // which department will end up fixing it, so the list is not filtered by
  // role or by where the checklist came from.
  useEffect(() => {
    let cancelled = false;
    getRepos()
      .users.list()
      .then((rows) => !cancelled && setDirectory(rows))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const level = incident ? getDeficiencyLevel(incident.deficiency_level) : null;
  const sla = incident ? slaState(incident.target_date, clockMs) : { kind: 'none' };
  const step = incident ? incidentStepIndex(incident.status) : 0;
  const verified = incident ? hasSatVerification(incident) : false;

  async function saveIncident(next) {
    const saved = await persistIncident(next);
    setIncident(saved);
    // One call site keeps the checklist in step with the incident. See
    // lib/checklistSync.js for why this writes back at all. The incident itself
    // is already saved, so a failure here is reported, not thrown away.
    try {
      await syncSourceChecklist(saved);
    } catch (err) {
      setBanner({
        type: 'error',
        text: `Incident saved, but the source checklist could not be updated: ${err.message}`,
      });
    }
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
        <Metric label="Latitude" value={fmtCoord(incident.latitude)} />
        <Metric label="Longitude" value={fmtCoord(incident.longitude)} />
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
          <h1 className="text-xl font-bold text-navy sm:text-2xl">Incident Management</h1>
          <p className="mt-1 text-sm text-muted">
            <Link to="/incidents" className="hover:text-primary hover:underline">
              Incidents
            </Link>
            <span className="px-1.5">&gt;</span>
            <span>{incident.incident_ref}</span>
          </p>
        </div>
        <div className="grid w-full grid-cols-2 items-center gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <button
            type="button"
            onClick={() => navigate('/incidents')}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-navy/20 bg-white px-3.5 text-sm font-medium text-navy hover:bg-stripe sm:min-h-10 sm:justify-start"
          >
            <ArrowLeft size={16} aria-hidden />
            <span className="sm:hidden">Back</span>
            <span className="hidden sm:inline">Back to Incidents</span>
          </button>

          {editing ? (
            <>
              <button
                type="button"
                onClick={cancelEdit}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-navy/20 bg-white px-3.5 text-sm font-medium text-navy hover:bg-stripe sm:min-h-10 sm:justify-start"
              >
                <X size={16} aria-hidden /> Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={busy}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-3.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60 sm:min-h-10 sm:justify-start"
              >
                <Check size={16} aria-hidden /> Save Changes
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={startEdit}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-navy/20 bg-white px-3.5 text-sm font-medium text-navy hover:bg-stripe sm:min-h-10 sm:justify-start"
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
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-center lg:gap-x-6">
          <div className="col-span-2 min-w-0 sm:col-span-3 lg:col-span-1 lg:pr-6">
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
            value={incident.assigned_to_name || 'Unassigned'}
            sub={incident.assigned_team ? labelOf(ASSIGNED_TEAMS, incident.assigned_team) : null}
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
      <div className="-mx-4 flex gap-1 overflow-x-auto border-b border-navy/15 px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-3.5 py-2.5 text-sm ${
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

              <VerificationPanel
                incident={incident}
                verified={verified}
                verifyDraft={verifyDraft}
                busy={busy}
                onStartVerify={() => setVerifyDraft({ note: '', photo: null })}
                onClearVerification={clearVerification}
                onDraftChange={setVerifyDraft}
                onAttachPhoto={attachVerificationPhoto}
                onConfirm={confirmVerification}
              />
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
                value={incident.assigned_to || ''}
                onChange={(v) => {
                  const person = directory.find((u) => u.id === v);
                  const next = {
                    ...incident,
                    assigned_to: v || null,
                    assigned_to_name: person?.full_name ?? '',
                    // Picking a person sets a sensible team; the team select
                    // below still overrides it.
                    assigned_team: person ? defaultTeamFor(person) : null,
                  };
                  setIncident(next);
                  saveIncident(next);
                }}
                options={[
                  { value: '', label: 'Unassigned' },
                  ...directory.map((u) => ({
                    value: u.id,
                    label: `${u.full_name} — ${u.position}`,
                  })),
                ]}
              />
              <SelectField
                label="Team"
                value={incident.assigned_team || ''}
                onChange={(v) => {
                  const next = { ...incident, assigned_team: v || null };
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









