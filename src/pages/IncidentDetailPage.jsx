import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Clock,
  History as HistoryIcon,
  ImagePlus,
  LocateFixed,
  MapPin,
  MessageSquarePlus,
  Paperclip,
  Pencil,
  X,
} from 'lucide-react';
import LocationPicker, { captureGps } from '../components/incidents/LocationPicker.jsx';
import DeficiencyLevelPicker from '../components/incidents/DeficiencyLevelPicker.jsx';
import ProgressChecklist from '../components/incidents/ProgressChecklist.jsx';
import { PROGRESS_STEPS, applyUnitChoice, statusAfterUntick, withAutoAssign } from '../lib/incidentProgress.js';
import { isD1Data } from '../lib/dataMode.js';
import { TeamChip } from './IncidentListPage.jsx';
import {
  Card,
  Field,
  Metric,
  Row,
  StripField,
  labelOf,
} from '../components/incidents/detailUi.jsx';
import { fmtCoord, fmtDate, fmtDateTime } from '../lib/airportFormat.js';
import { getDeficiencyLevel, slaState } from '../config/deficiencyLevels.js';
import { ASSIGNED_UNITS, INCIDENT_CATEGORIES, INCIDENT_TYPES } from '../config/incidentLookups.js';
import { INSPECTION_TYPES } from '../lib/checklistSchema.js';
import { useAuth } from '../context/AuthContext.jsx';
import { syncSourceChecklist } from '../lib/checklistSync.js';
import { getRepos } from '../data/repositories/index.js';
import { compressImage } from '../lib/imageCompress.js';
import {
  hasSatVerification,
  incidentStatusLabel,
  incidentTransitionBlockers,
} from '../lib/incidentLifecycle.js';
import {
  DESCRIPTION_MAX,
  addIncidentUpdate,
  getIncident,
  listQualifyingReinspections,
  persistIncident,
} from '../lib/incidents.js';
import UnavailableNote from '../components/ui/UnavailableNote.jsx';

// On D1 photos and attachments are not offered: the tab stays and says so.
const PHOTOS_ENABLED = !isD1Data();

// Hidden for now (the team asked for a simpler page). The tab code below stays
// in place — flip a flag to bring a tab back.
const SHOW_PHOTOS_TAB = false;
const SHOW_UPDATES_TAB = false;

const TABS = [
  { id: 'details', label: 'Incident Details', icon: AlertTriangle },
  { id: 'location', label: 'Location', icon: MapPin },
  SHOW_PHOTOS_TAB && { id: 'photos', label: 'Photos & Attachments', icon: Paperclip },
  SHOW_UPDATES_TAB && { id: 'updates', label: 'Actions & Updates', icon: Clock },
  { id: 'history', label: 'History', icon: HistoryIcon },
].filter(Boolean);

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
    if (t && TABS.some((row) => row.id === t)) setTab(t);
  }, [params]);

  const level = incident ? getDeficiencyLevel(incident.deficiency_level) : null;
  const sla = incident ? slaState(incident.target_date, clockMs) : { kind: 'none' };
  const verified = incident ? hasSatVerification(incident) : false;

  // Tick boxes, one unit at a time — no "Unassigned" entry: unticking clears.
  const assignedUnitOptions = useMemo(() => {
    if (profile?.role === 'apron_supervisor') return [{ value: 'om', label: 'Operations Manager' }];
    return ASSIGNED_UNITS.filter((u) => u.value !== 'om');
  }, [profile?.role]);

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
      // Picking the unit sets this; moving the status only backfills it for an
      // incident that somehow reached Assigned without one.
      assigned_at:
        toStatus === 'assigned' ? incident.assigned_at ?? new Date().toISOString() : incident.assigned_at,
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

  // ---- Progress tick boxes ------------------------------------------------

  /** Save, and when the status moved, log it so History shows the change. */
  async function saveAndLog(next, body) {
    const saved = await saveIncident(next);
    if (next.status !== incident.status) {
      await addIncidentUpdate(next, {
        body: body ?? `Status changed to ${incidentStatusLabel(next.status)}.`,
        status_from: incident.status,
        status_to: next.status,
        authorId: user?.id,
        authorName: displayName,
      });
    }
    await reload();
    return saved;
  }

  async function onUnitChange(unit) {
    setBanner(null);
    try {
      await saveAndLog(applyUnitChoice(incident, unit, new Date().toISOString()));
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    }
  }

  async function onDueDateChange(ymd) {
    setBanner(null);
    try {
      await saveAndLog(withAutoAssign({ ...incident, target_date: ymd || null }));
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    }
  }

  function onTick(stepKey) {
    setBanner(null);
    if (stepKey === 'closed') {
      setVerifyDraft({ note: '' });
      return;
    }
    const target = PROGRESS_STEPS.find((row) => row.key === stepKey);
    if (target) changeStatus(target.status);
  }

  function onUntick(stepKey) {
    setBanner(null);
    if (stepKey === 'sent') {
      onUnitChange(null);
      return;
    }
    const to = statusAfterUntick(stepKey);
    if (to) changeStatus(to);
  }

  /**
   * Step 4: record SAT (unless already verified) and close, in one save. The
   * SAT verification writes back to the source checklist through
   * saveIncident → syncSourceChecklist, exactly as the old verify panel did.
   */
  async function closeIncident() {
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const alreadyVerified = hasSatVerification(incident);
      const note = verifyDraft?.note?.trim() || '';
      const next = {
        ...incident,
        verification: alreadyVerified
          ? incident.verification
          : {
              result: 'sat',
              verified_at: now,
              verified_by: user?.id ?? 'local',
              verified_by_name: displayName || profile?.full_name || 'User',
              note,
              photo_url: null,
            },
        status: 'closed',
        closed_at: now,
      };
      const blockers = incidentTransitionBlockers(next, 'closed', {
        reinspection: next.reinspection_submission_id,
      });
      if (blockers.length) {
        setBanner({ type: 'error', text: blockers.join(' ') });
        return;
      }
      await saveAndLog(
        next,
        alreadyVerified
          ? 'Status changed to Verified/Closed.'
          : `${incident.source_item_code} checked OK (SAT)${note ? ` — ${note}` : ''}. Status changed to Verified/Closed.`,
      );
      setVerifyDraft(null);
      setBanner({ type: 'ok', text: 'Incident closed.' });
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
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
      <div className="grid grid-cols-2 gap-y-3 border-t border-line/10 px-4 py-3 text-sm sm:grid-cols-4">
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
          <p className="font-semibold text-ink">
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
          <h1 className="text-xl font-bold text-ink sm:text-2xl">Incident Management</h1>
          <p className="mt-1 text-sm text-muted">
            <Link
              to="/incidents"
              className="inline-flex min-h-11 items-center hover:text-primary hover:underline desk:min-h-0"
            >
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
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-line/20 bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-2 desk:min-h-10 sm:justify-start"
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
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-line/20 bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-2 desk:min-h-10 sm:justify-start"
              >
                <X size={16} aria-hidden /> Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={busy}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-3.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60 desk:min-h-10 sm:justify-start"
              >
                <Check size={16} aria-hidden /> Save Changes
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={startEdit}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-line/20 bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-2 desk:min-h-10 sm:justify-start"
            >
              <Pencil size={16} aria-hidden /> Edit Incident
            </button>
          )}

        </div>
      </div>

      {/* Status strip */}
      <header data-tour="incd-status" className="rounded-md border border-line/15 bg-surface px-4 py-3 shadow-card">
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-center lg:gap-x-6">
          <div className="col-span-2 min-w-0 sm:col-span-3 lg:col-span-1 lg:pr-6">
            <span className="inline-block rounded bg-alert-soft px-4 py-1.5 text-sm font-bold uppercase tracking-wide text-ink">
              {incidentStatusLabel(incident.status)}
            </span>
            <p className="mt-1.5 flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold" style={{ color: level?.color }}>
              <span className="h-2 w-2 rounded-full" style={{ background: level?.color }} aria-hidden />
              {level?.label ?? '—'}
            </p>
          </div>
          <StripField label="Incident ID" value={incident.incident_ref} strong />
          {/* Which team's form raised this — the same chip the incident list
              and the checklist catalogue use, so the tie is obvious. */}
          <div className="min-w-0 lg:min-w-[8rem] lg:border-l lg:border-line/10 lg:pl-6">
            <p className="text-xs text-muted">Owning Team</p>
            <div className="mt-0.5">
              <TeamChip name={incident.source_group} code={incident.source_template_code} />
            </div>
          </div>
          <StripField label="Date Reported" value={fmtDateTime(incident.reported_at)} />
          <StripField
            label="Reported By"
            value={incident.reported_by_name || 'Inspector'}
            sub={incident.reported_by_position || 'Maintenance Inspector'}
          />
          <StripField label="Department" value={incident.department || '—'} />
          <StripField
            label="Assigned Unit"
            value={incident.assigned_unit ? labelOf(ASSIGNED_UNITS, incident.assigned_unit) : 'Unassigned'}
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
      <div data-tour="incd-tabs" className="-mx-4 flex gap-1 overflow-x-auto border-b border-line/15 px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
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
                  ? 'border-b-2 border-primary font-semibold text-ink'
                  : 'border-b-2 border-transparent text-muted hover:text-ink'
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
                    <dl className="divide-y divide-line/5">
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
                          className="w-full rounded border border-line/20 bg-surface px-3 py-2 text-sm text-ink"
                        />
                      ) : (
                        <p className="rounded border border-line/20 bg-surface px-3 py-2 text-sm">{incident.description}</p>
                      )}
                    </Field>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <Field label="Deficiency Level">
                        {editing ? (
                          <DeficiencyLevelPicker
                            value={draft.deficiency_level ?? ''}
                            onChange={(level) => setDraft({ ...draft, deficiency_level: level })}
                            name="incident-deficiency-level"
                          />
                        ) : (
                          <div className="flex min-h-10 items-center gap-2 rounded border border-line/20 px-3 text-sm">
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
                            className="min-h-10 w-full rounded border border-line/20 bg-surface px-2 text-sm text-ink"
                          >
                            {INCIDENT_CATEGORIES.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="flex min-h-10 items-center rounded border border-line/20 px-3 text-sm">
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
                            className="min-h-10 w-full rounded border border-line/20 bg-surface px-2 text-sm text-ink"
                          >
                            <option value="">—</option>
                            {INCIDENT_TYPES.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="flex min-h-10 items-center rounded border border-line/20 px-3 text-sm">
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
                          className="w-full rounded border border-line/20 bg-surface px-3 py-2 text-sm text-ink"
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
                          className="w-full rounded border border-line/20 bg-surface px-3 py-2 text-sm text-ink"
                        />
                      </Field>
                    </div>
                  </Card>
                </div>

                {/* Location card */}
                <section className="h-fit rounded-md border border-line/15 bg-surface shadow-card">
                  <div className="flex flex-wrap items-start justify-between gap-2 px-4 pt-4">
                    <h2 className="text-sm font-semibold text-ink">Incident Location</h2>
                    <button
                      type="button"
                      onClick={useMyLocation}
                      className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line/20 px-3 text-xs font-semibold text-ink hover:bg-surface-2 desk:min-h-9"
                    >
                      <LocateFixed size={14} aria-hidden /> Use My Location
                    </button>
                  </div>
                  <div className="mt-2 flex gap-4 border-b border-line/10 px-4">
                    {[
                      { id: 'map', label: 'Map View' },
                      { id: 'details', label: 'Details View' },
                    ].map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setLocationView(v.id)}
                        className={`inline-flex min-h-11 items-center pb-2 text-xs desk:min-h-0 ${
                          locationView === v.id
                            ? 'border-b-2 border-primary font-semibold text-ink'
                            : 'border-b-2 border-transparent text-muted hover:text-ink'
                        }`}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>

                  {locationView === 'map' ? (
                    <div className="relative isolate p-4">
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
                      <div className="pointer-events-none absolute right-7 top-7 z-10 rounded border border-line/15 bg-surface px-3 py-2 text-xs shadow-card">
                        <p className="font-semibold text-ink">Incident Location</p>
                        <p className="text-muted">{incident.location_label}</p>
                      </div>
                    </div>
                  ) : (
                    <dl className="divide-y divide-line/5 px-4 py-2">
                      <Row label="Location" value={incident.location_label} />
                      <Row label="Capture Method" value={incident.location_capture_method || '—'} />
                      <Row label="Pin Adjusted" value={incident.location_user_adjusted ? 'Yes' : 'No'} />
                    </dl>
                  )}

                  {geoBlock}
                </section>
              </div>

              <section className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line/15 bg-surface px-4 py-3 text-sm shadow-card">
                <span className="font-semibold text-ink">Item {incident.source_item_code}</span>
                <span aria-hidden className="text-muted">·</span>
                {verified ? (
                  <span className="font-semibold text-success">Verified SAT</span>
                ) : (
                  <span className="font-semibold text-alert">NO SAT</span>
                )}
                {incident.submission_id && (
                  <>
                    <span aria-hidden className="text-muted">·</span>
                    <Link
                      to={`/checklists/${incident.submission_id}`}
                      className="inline-flex min-h-11 items-center text-primary hover:underline desk:min-h-0"
                    >
                      View checklist
                    </Link>
                  </>
                )}
              </section>
            </>
          )}

          {tab === 'location' && (
            <section className="rounded-md border border-line/15 bg-surface shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-2 px-4 pt-4">
                <h2 className="text-sm font-semibold text-ink">Incident Location</h2>
                <button
                  type="button"
                  onClick={useMyLocation}
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line/20 px-3 text-xs font-semibold text-ink hover:bg-surface-2 desk:min-h-9"
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

          {!PHOTOS_ENABLED && tab === 'photos' && (
            <Card title="Photos & Attachments">
              <UnavailableNote />
            </Card>
          )}

          {PHOTOS_ENABLED && tab === 'photos' && (
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
                    <figure key={key} className="relative overflow-hidden rounded border border-line/10">
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
                className="w-full rounded border border-line/20 bg-surface px-3 py-2 text-sm text-ink"
                placeholder="Add an update…"
              />
              <button
                type="button"
                className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-md bg-navy px-3.5 text-sm font-semibold text-white hover:bg-navy-mid"
                onClick={async () => {
                  if (!updateBody.trim()) return;
                  const body = updateBody.trim();
                  const row = await addIncidentUpdate(incident, {
                    body,
                    authorId: user?.id,
                    authorName: displayName,
                  });
                  setUpdateBody('');
                  setIncident((prev) => ({
                    ...prev,
                    updates: [
                      {
                        id: row.id,
                        body: row.body ?? body,
                        author_name: displayName,
                        author_id: user?.id,
                        created_at: row.created_at,
                        status_from: row.status_from ?? null,
                        status_to: row.status_to ?? null,
                      },
                      ...(prev.updates ?? []),
                    ],
                  }));
                }}
              >
                <MessageSquarePlus size={16} aria-hidden /> Add Update
              </button>
              <ul className="mt-4 space-y-3">
                {(incident.updates ?? []).map((u) => (
                  <li key={u.id} className="border-t border-line/10 pt-3 text-sm">
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
        <aside data-tour="incd-sidebar" className="h-fit space-y-4 xl:sticky xl:top-4">
          <ProgressChecklist
            incident={incident}
            unitOptions={assignedUnitOptions}
            sla={sla}
            alreadyVerified={verified}
            confirming={Boolean(verifyDraft)}
            note={verifyDraft?.note ?? ''}
            busy={busy}
            onUnitChange={onUnitChange}
            onDueDateChange={onDueDateChange}
            onTick={onTick}
            onUntick={onUntick}
            onNoteChange={(text) => setVerifyDraft((d) => ({ ...(d ?? {}), note: text }))}
            onConfirmClose={closeIncident}
            onCancelClose={() => setVerifyDraft(null)}
          />
        </aside>
      </div>
    </div>
  );
}









