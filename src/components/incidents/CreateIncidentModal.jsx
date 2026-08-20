import { AlertTriangle, Info, MapPin, Navigation, Paperclip, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { deficiencyLevels } from '../../config/deficiencyLevels.js';
import { INCIDENT_CATEGORIES, INCIDENT_TYPES } from '../../config/incidentLookups.js';
import { INSPECTION_TYPES } from '../../lib/checklistSchema.js';
import {
  DESCRIPTION_MAX,
  createIncidentFromChecklist,
  prefillFromChecklistItem,
} from '../../lib/incidents.js';
import LocationPicker, { captureGps, PGIA_CENTER } from './LocationPicker.jsx';

const BANNER =
  'You are creating an incident from a NO SAT item. The item details and remarks will be included in the incident.';

const EXPLAINER =
  'Once corrective action is completed, the item must be re-inspected and updated to SAT. Creating this incident does not change the checklist response.';

export default function CreateIncidentModal({
  open,
  onClose,
  item,
  row,
  record,
  schema,
  user,
  profile,
  displayName,
  photoPreview,
  onCreated,
}) {
  const source = useMemo(
    () => (item ? prefillFromChecklistItem({ item, row, record, schema, displayName }) : null),
    [item, row, record, schema, displayName],
  );
  const [form, setForm] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [proceed, setProceed] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !source) return;
    setProceed(true);
    setError(null);
    setShowMap(false);
    setForm({
      title: source.title,
      description: source.description,
      deficiency_level: '',
      category: 'drainage',
      incident_type: 'drainage',
      location_label: source.location_label,
      latitude: PGIA_CENTER.lat,
      longitude: PGIA_CENTER.lng,
      location_accuracy_m: null,
      location_captured_at: null,
      location_capture_method: 'manual',
      location_user_adjusted: false,
      attachments: source.photo_local_id || source.photo_url || photoPreview
        ? [{ photo_local_id: source.photo_local_id, photo_url: source.photo_url, previewUrl: photoPreview }]
        : [],
    });
  }, [open, source, photoPreview]);

  if (!open || !form || !source) return null;

  const inspectionLabel =
    INSPECTION_TYPES.find((opt) => opt.value === source.source_inspection_type)?.label ||
    source.source_inspection_type;

  function patch(next) {
    setForm((prev) => ({ ...prev, ...next }));
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (!form.title.trim() || !form.description.trim() || !form.location_label.trim() || !form.category) {
      setError('Title, description, category, and location are required.');
      return;
    }
    if (!form.deficiency_level) {
      setError('Deficiency Level is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createIncidentFromChecklist({
        draft: { ...source, ...form },
        user,
        profile,
        source: { submissionId: record.id, itemCode: item.code },
      });
      onCreated?.({ incident: created, proceed, itemCode: item.code });
      onClose();
    } catch (err) {
      setError(err.message || 'Could not create incident.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center overflow-y-auto bg-navy/50 sm:items-start sm:p-4 sm:pt-10">
      <form
        onSubmit={onSubmit}
        className="flex max-h-none w-full max-w-5xl flex-col bg-white shadow-xl sm:max-h-[90dvh] sm:rounded-lg"
      >
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-navy/10 bg-white px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5 sm:pt-3">
          <h2 className="text-lg font-bold text-navy">Create Incident</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex h-10 w-10 items-center justify-center rounded text-muted hover:bg-stripe"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mx-4 mt-4 flex gap-2 rounded-md border border-alert bg-alert-soft px-4 py-3 text-sm text-alert sm:mx-5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {BANNER}
        </div>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-navy">Incident Information</h3>
            <Field label="Title" required>
              <input
                required
                value={form.title}
                onChange={(e) => patch({ title: e.target.value })}
                className="min-h-10 w-full rounded border border-navy/20 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Description / Remarks" required>
              <textarea
                required
                maxLength={DESCRIPTION_MAX}
                rows={5}
                value={form.description}
                onChange={(e) => patch({ description: e.target.value.slice(0, DESCRIPTION_MAX) })}
                className="w-full rounded border border-navy/20 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-right text-xs text-muted">
                {form.description.length}/{DESCRIPTION_MAX}
              </p>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Deficiency Level" required>
                <select
                  required
                  value={form.deficiency_level}
                  onChange={(e) => patch({ deficiency_level: e.target.value ? Number(e.target.value) : '' })}
                  className="min-h-10 w-full rounded border border-navy/20 px-3 py-2 text-sm"
                >
                  <option value="">Select…</option>
                  {deficiencyLevels().map((lvl) => (
                    <option key={lvl.level} value={lvl.level}>
                      {lvl.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Category" required>
                <select
                  required
                  value={form.category}
                  onChange={(e) => patch({ category: e.target.value })}
                  className="min-h-10 w-full rounded border border-navy/20 px-3 py-2 text-sm"
                >
                  {INCIDENT_CATEGORIES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Incident Type">
                <select
                  value={form.incident_type}
                  onChange={(e) => patch({ incident_type: e.target.value })}
                  className="min-h-10 w-full rounded border border-navy/20 px-3 py-2 text-sm"
                >
                  {INCIDENT_TYPES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Location" required>
                <input
                  required
                  value={form.location_label}
                  onChange={(e) => patch({ location_label: e.target.value })}
                  className="min-h-10 w-full rounded border border-navy/20 px-3 py-2 text-sm"
                />
              </Field>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Capture Location</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const gps = await captureGps();
                      patch(gps);
                      setShowMap(true);
                    } catch (err) {
                      setError(err.message);
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-md border border-navy/20 px-3 py-2 text-sm"
                >
                  <Navigation className="h-4 w-4" />
                  Use Current Location
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMap(true);
                    patch({
                      location_capture_method: 'map_pin',
                      location_captured_at: new Date().toISOString(),
                    });
                  }}
                  className="inline-flex items-center gap-2 rounded-md border border-navy/20 px-3 py-2 text-sm"
                >
                  <MapPin className="h-4 w-4" />
                  Pin on Map
                </button>
              </div>
              {showMap && (
                <div className="mt-3 space-y-1">
                  <LocationPicker
                    latitude={form.latitude}
                    longitude={form.longitude}
                    onChange={(geo) => patch(geo)}
                  />
                  <p className="text-xs text-muted">
                    You can drag the pin to adjust the exact location. The reporter may not be standing at the incident.
                  </p>
                  {form.latitude != null && (
                    <p className="text-xs text-muted">
                      {form.latitude}, {form.longitude}
                      {form.location_accuracy_m != null ? ` · ±${Math.round(form.location_accuracy_m)} m` : ''}
                      {form.location_capture_method ? ` · ${form.location_capture_method}` : ''}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div>
              <p className="mb-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                <Paperclip className="h-3.5 w-3.5" />
                Attachments / Photos
              </p>
              {form.attachments[0]?.previewUrl || form.attachments[0]?.photo_url ? (
                <img
                  src={form.attachments[0].previewUrl || form.attachments[0].photo_url}
                  alt="Item evidence"
                  className="h-28 rounded-md border border-navy/15 object-cover"
                />
              ) : (
                <p className="text-sm text-muted">No photo on the checklist item. You can add photos after creating the incident.</p>
              )}
            </div>
          </div>

          <aside className="space-y-3 rounded-md border border-navy/10 bg-stripe p-4">
            <h3 className="text-sm font-semibold text-navy">Source Checklist Item</h3>
            <ReadOnly label="Form" value={source.source_template_code} />
            <ReadOnly label="Checklist" value={schema?.title} />
            <ReadOnly label="Section" value={source.source_section} />
            <ReadOnly label="Item ID" value={source.source_item_code} />
            <ReadOnly label="Item Description" value={source.source_item_description} />
            <ReadOnly label="Response" value="NO SAT" />
            <ReadOnly label="Inspection Type" value={inspectionLabel} />
            <ReadOnly label="Inspection Date" value={source.source_inspection_date} />
            <ReadOnly label="Inspector" value={source.inspector_name} />
            <ReadOnly label="Remarks / Location" value={row?.remarks || '—'} />
            <p className="flex gap-2 rounded-md bg-primary/10 px-3 py-2 text-xs text-navy">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              {EXPLAINER}
            </p>
          </aside>
        </div>

        {error && <p className="px-5 pb-2 text-sm text-alert">{error}</p>}

        <div className="sticky bottom-0 z-10 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-navy/10 bg-white px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5 sm:pb-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={proceed} onChange={(e) => setProceed(e.target.checked)} className="h-4 w-4" />
            Proceed to Incident Management after creating this incident
          </label>
          <div className="flex w-full gap-2 sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 flex-1 rounded-md border border-navy/20 px-4 py-2 text-sm sm:flex-none"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-11 flex-1 rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:flex-none"
            >
              {saving ? 'Creating…' : 'Create Incident'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
        {required ? ' *' : ''}
      </span>
      {children}
    </label>
  );
}

function ReadOnly({ label, value }) {
  return (
    <div className="text-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="text-navy">{value || '—'}</p>
    </div>
  );
}
