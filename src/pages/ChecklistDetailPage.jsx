import { AlertTriangle, Download, Eye, Save } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import ChecklistForm, { validateChecklist } from '../components/checklist/ChecklistForm.jsx';
import PdfPreview from '../components/checklist/PdfPreview.jsx';
import CreateIncidentModal from '../components/incidents/CreateIncidentModal.jsx';
import SignaturePad from '../components/checklist/SignaturePad.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  emptyHeaderState,
  emptyItemState,
  flattenItems,
} from '../lib/checklistSchema.js';
import {
  buildDraftRecord,
  createCorrection,
  getSubmission,
  persistSubmission,
  refreshDraftTemplate,
  uploadPhoto,
  acknowledgeSubmission,
} from '../lib/submissions.js';
import { listIncidents } from '../lib/incidents.js';
import { getTemplate } from '../lib/templates.js';
import { airportYmd } from '../lib/belizeTime.js';
import { getRepos } from '../data/repositories/index.js';
import { baseFormUrl } from '../lib/baseForms.js';
import { signatureImages } from '../lib/signoffFields.js';
import { compressImageFile, blobToDataUri } from '../utils/compressImage.js';
import { enqueue, getPhotoRecord, putPhotoBlob } from '../utils/offlineQueue.js';

export default function ChecklistDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { online } = useOutletContext() ?? { online: navigator.onLine };
  const { user, displayName, position, profile } = useAuth();

  const [record, setRecord] = useState(null);
  const [selectedCode, setSelectedCode] = useState(null);
  const [photoPreview, setPhotoPreview] = useState({});
  const [banner, setBanner] = useState(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [incidentModal, setIncidentModal] = useState(null);
  const [itemIncidents, setItemIncidents] = useState({});
  const [omSignature, setOmSignature] = useState('');
  const previewUrlRef = useRef(null);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (id === 'new') {
        const template = await getTemplate(searchParams.get('template'));
        const clock = await getRepos().instances.getClock();
        const header = emptyHeaderState(template.schema, {
          date: airportYmd(clock.nowMs),
          inspectionType: 'monthly_routine',
          conductedBy: `${displayName} / ${position}`,
        });
        const draft = buildDraftRecord({
          template,
          user,
          header,
          items: emptyItemState(template.schema),
        });
        await persistSubmission(draft);
        if (!cancelled) navigate(`/checklists/${draft.id}`, { replace: true });
        return;
      }

      const existing = await getSubmission(id);
      if (!existing) {
        if (!cancelled) setLoadError('Checklist not found.');
        return;
      }
      // A submission pins the template it was filled against, and BACC §11 means
      // a SUBMITTED record keeps that snapshot forever. A draft has not been
      // submitted, so it should follow the current approved template — otherwise
      // a draft started before a template fix is stuck with the old mapping and
      // exports differently from an identical draft started today.
      const refreshed = await refreshDraftTemplate(existing);
      if (!cancelled) {
        setRecord(refreshed);
        if (refreshed !== existing) persistSubmission(refreshed).catch(() => {});
        // Keep the whole incident, not just its id: the checklist needs to show
        // whether the deficiency it raised has since been cleared.
        const linked = {};
        const incidents = await listIncidents();
        for (const inc of incidents) {
          if (inc.submission_id === existing.id && inc.source_item_code) {
            linked[inc.source_item_code] = inc;
          }
        }
        setItemIncidents(linked);
      }
    }

    load().catch((err) => {
      if (!cancelled) setLoadError(err.message);
    });
    return () => {
      cancelled = true;
    };
  }, [id, searchParams, user, displayName, position, navigate]);

  const schema = record?.schema;
  // A reference sheet (Annex L) is pre-printed end to end. There is nothing to
  // draft, submit, acknowledge or stamp — only to read, and to open as the
  // approved PDF. Treating it as read-only keeps the autosave loop off it too.
  const isReference = Boolean(schema?.referenceGroups?.length) || schema?.documentType === 'reference';
  const readOnly = isReference || record?.status === 'submitted' || record?.locked;

  useEffect(() => {
    if (!record || readOnly) return undefined;
    const handle = setTimeout(() => {
      persistSubmission(record)
        .then(() => setLastSavedAt(new Date()))
        .catch(() => {});
    }, 500);
    return () => clearTimeout(handle);
  }, [record, readOnly]);

  async function patchRecord(updater) {
    setRecord((prev) => updater(prev));
  }

  async function save(nextRecord = record) {
    if (!nextRecord || readOnly) return nextRecord;
    setSaving(true);
    try {
      const merged = {
        ...nextRecord,
        inspection_type: nextRecord.header.inspectionType,
        inspection_date: nextRecord.header.date,
        rainfall_mm: nextRecord.header.rainfallMm,
      };
      const saved = await persistSubmission(merged);
      setRecord(saved);
      setLastSavedAt(new Date());
      return saved;
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    const { unresolved, missingHeader } = validateChecklist(schema, record.header, record.items);
    if (unresolved.length || missingHeader.length) {
      setBanner({
        type: 'error',
        text: unresolved.length
          ? `NO SAT items need remarks before submission: ${unresolved.join(', ')}`
          : `Required header fields are empty: ${missingHeader.join(', ')}`,
      });
      if (unresolved[0]) setSelectedCode(unresolved[0]);
      return;
    }

    const signedAt = new Date().toISOString();
    const inspectorSignoff = {
      role: 'inspector',
      name: displayName,
      position,
      signature_data_uri: record.signoffs?.find((s) => s.role === 'inspector')?.signature_data_uri,
      signed_at: signedAt,
    };
    const om = record.signoffs?.find((s) => s.role === 'om_acknowledgment');
    const next = {
      ...record,
      status: 'submitted',
      submitted_at: signedAt,
      inspection_type: record.header.inspectionType,
      inspection_date: record.header.date,
      header: {
        ...record.header,
        conductedBy: `${displayName} / ${position}`,
      },
      signoffs: [inspectorSignoff, om].filter(Boolean),
      locked: true,
    };
    await save(next);
    setBanner({ type: 'ok', text: 'Submitted. You can export the official PDF when online.' });
  }

  async function handlePhotoSelect(code, file) {
    const compressed = await compressImageFile(file);
    const localId = crypto.randomUUID();
    await putPhotoBlob(localId, compressed, { itemCode: code, submissionId: record.id });
    const preview = URL.createObjectURL(compressed);
    setPhotoPreview((prev) => ({ ...prev, [code]: preview }));

    let photoUrl = null;
    if (online) {
      try {
        const uploaded = await uploadPhoto({
          userId: user.id,
          submissionId: record.id,
          itemCode: code,
          blob: compressed,
          contentType: compressed.type,
        });
        photoUrl = uploaded.url;
      } catch {
        await enqueue({
          type: 'upload_photo',
          payload: {
            photo_local_id: localId,
            userId: user.id,
            submissionId: record.id,
            itemCode: code,
          },
        });
      }
    } else {
      await enqueue({
        type: 'upload_photo',
        payload: {
          photo_local_id: localId,
          userId: user.id,
          submissionId: record.id,
          itemCode: code,
        },
      });
    }

    const next = {
      ...record,
      items: {
        ...record.items,
        [code]: {
          ...record.items[code],
          photo_local_id: localId,
          photo_url: photoUrl,
        },
      },
    };
    await save(next);
  }

  async function buildOverlayBlob(current = record) {
    // Every declared sign-off, not a hardcoded pair. See lib/signoffFields.js.
    const images = signatureImages(current, current.field_map);
    const photos = [];
    for (const item of flattenItems(schema)) {
      const row = current.items[item.code];
      if (!row?.photo_local_id && !row?.photo_url) continue;
      let dataUri = photoPreview[item.code];
      if (!dataUri && row.photo_local_id) {
        const rec = await getPhotoRecord(row.photo_local_id);
        if (rec?.blob) dataUri = await blobToDataUri(rec.blob);
      }
      if (dataUri) photos.push({ label: item.code, dataUri, contentType: 'image/jpeg' });
    }
    // Drawings ride the same attachment channel as photo evidence — both end up
    // on captioned continuation pages after the approved sheets, which are
    // never drawn over. The caption names the section that asked for the
    // drawing, so a reader of the export knows which one it answers.
    const sectionLabel = (key) =>
      (schema.summaryFields ?? []).find((f) => f.key === key)?.label ?? key;
    for (const [key, list] of Object.entries(current.attachments ?? {})) {
      for (const drawing of list ?? []) {
        if (!drawing?.dataUri) continue;
        photos.push({
          label: drawing.label,
          caption: `${sectionLabel(key)} — ${drawing.label}`,
          dataUri: drawing.dataUri,
          contentType: drawing.contentType || 'image/png',
        });
      }
    }
    const res = await fetch('/api/export-checklist-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateKey: current.print_template_key || 'annex-d-drainage',
        templateVersion: current.template_version || 'ed01',
        fieldMap: current.field_map,
        submission: current,
        images,
        photos,
      }),
    });
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('pdf')) {
      let message = `Export failed (${res.status})`;
      try {
        const payload = await res.clone().json();
        if (payload?.error) message = payload.error;
      } catch {
        const text = await res.text();
        if (text) message = text.slice(0, 280);
      }
      throw new Error(message);
    }
    return res.blob();
  }

  function setPreviewBlobUrl(blob) {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const url = URL.createObjectURL(blob);
    previewUrlRef.current = url;
    setPreviewUrl(url);
  }

  function scrollToPreview() {
    document.getElementById('pdf-preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closePreview() {
    // Only blob URLs we created need revoking; a bundled asset URL must not be.
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl(null);
  }

  async function handleShowPreview() {
    // Nothing is stamped onto a reference sheet, so there is no overlay to
    // render — open the approved file itself.
    if (isReference) {
      const url = baseFormUrl(record?.field_map?.basePdf);
      if (!url) {
        setPreviewError('The approved PDF for this document is not bundled with the app.');
        return;
      }
      setPreviewError(null);
      setPreviewUrl(url);
      return;
    }
    scrollToPreview();
    if (!online) {
      setPreviewError('Preview is available once you are back online. Your checklist is saved.');
      return;
    }
    setPreviewing(true);
    setPreviewError(null);
    try {
      const current = (await save(record)) || record;
      const blob = await buildOverlayBlob(current);
      setPreviewBlobUrl(blob);
      requestAnimationFrame(scrollToPreview);
    } catch (err) {
      setPreviewError(err.message);
    } finally {
      setPreviewing(false);
    }
  }

  async function handleExport() {
    if (!online) {
      setBanner({
        type: 'error',
        text: 'Export available once you are back online. Your submission is saved.',
      });
      return;
    }
    setExporting(true);
    setBanner(null);
    try {
      await save(record);
      const blob = await buildOverlayBlob(record);
      const filename = `${schema.code}-${record.template_version || 'ed01'}-${record.inspection_date || 'draft'}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      setBanner({ type: 'ok', text: 'PDF downloaded.' });
    } catch (err) {
      setBanner({
        type: 'error',
        text: `${err.message} You can retry export; the submission itself is already saved.`,
      });
    } finally {
      setExporting(false);
    }
  }

  if (loadError) {
    return (
      <div className="rounded-md border border-alert bg-alert-soft p-4 text-alert">
        {loadError}{' '}
        <Link to="/checklists/mine" className="underline">
          Back to my checklists
        </Link>
      </div>
    );
  }

  if (!record || !schema) {
    return <p className="text-muted">Loading checklist…</p>;
  }

  const inProgress = !readOnly;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold leading-tight text-navy sm:text-[1.65rem]">{schema.title}</h1>
            {/* A reference sheet has no workflow state — it is never drafted,
                submitted or acknowledged, so it carries no status pill. */}
            {!isReference && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                inProgress ? 'bg-success-soft text-success' : 'bg-navy text-white'
              }`}
            >
              {inProgress ? 'In Progress' : record.status === 'acknowledged' ? 'Acknowledged' : 'Submitted'}
            </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            Form: {schema.code}
            {!isReference && record.locked ? ' · locked' : ''}
            {!isReference && record.supersedes_id ? ' · correction' : ''}
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          {!readOnly && (
            <button
              type="button"
              onClick={() => save()}
              disabled={saving}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md sm:min-h-10 sm:justify-start border border-primary/40 bg-white px-3 py-2 text-sm font-medium text-primary"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving…' : 'Save Draft'}
            </button>
          )}
          <button
            type="button"
            onClick={isReference && previewUrl ? closePreview : handleShowPreview}
            disabled={previewing}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md sm:min-h-10 sm:justify-start border border-navy/20 bg-white px-3 py-2 text-sm font-medium text-navy"
          >
            <Eye className="h-4 w-4" />
            {previewing ? 'Rendering…' : !isReference ? 'Show preview' : previewUrl ? 'Back to list' : 'View PDF'}
          </button>
          {!readOnly && (
            <button
              type="button"
              onClick={handleSubmit}
              className="inline-flex min-h-11 items-center justify-center rounded-md sm:min-h-10 sm:justify-start bg-navy px-4 py-2 text-sm font-semibold text-white"
            >
              Submit Checklist
            </button>
          )}
          {!isReference && (
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md sm:min-h-10 sm:justify-start bg-primary px-4 py-2 text-sm font-semibold text-white"
          >
            <Download className="h-4 w-4" />
            {exporting ? 'Exporting…' : 'Export PDF'}
          </button>
          )}
          {readOnly && !isReference && (
            <button
              type="button"
              onClick={async () => {
                const next = createCorrection(record, user);
                await persistSubmission(next);
                navigate(`/checklists/${next.id}`);
              }}
              className="min-h-11 rounded-md border border-navy/20 bg-white px-3 py-2 text-sm sm:min-h-10"
            >
              Create correction
            </button>
          )}
        </div>
      </div>

      {banner && (
        <div
          className={`flex gap-2 rounded-md px-4 py-3 text-sm ${
            banner.type === 'error'
              ? 'border border-alert bg-alert-soft text-alert'
              : 'border border-success bg-success-soft text-success'
          }`}
        >
          {banner.type === 'error' && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{banner.text}</span>
        </div>
      )}

      {!online && (
        <p className="rounded-md bg-navy px-4 py-2 text-sm text-white">
          You are offline. Saves stay on this device and sync when you reconnect. PDF preview and export require
          connectivity.
        </p>
      )}

      {record.status === 'submitted' && ['om', 'coo'].includes(profile?.role) && (
        <section className="rounded-md border border-navy/15 bg-white p-4">
          <h2 className="text-sm font-semibold text-navy">OM acknowledgment</h2>
          <p className="mt-1 text-sm text-muted">
            The submitted answers stay frozen. Acknowledgment appends your signature and regenerates the overlay PDF.
          </p>
          <div className="mt-3 max-w-md">
            <SignaturePad value={omSignature} onChange={setOmSignature} />
          </div>
          <button
            type="button"
            className="mt-3 min-h-11 w-full rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white sm:w-auto"
            onClick={async () => {
              try {
                const next = await acknowledgeSubmission({
                  id: record.id,
                  name: displayName,
                  position,
                  signature_data_uri: omSignature,
                  actorId: user?.id,
                });
                setRecord(next);
                setBanner({ type: 'ok', text: 'Acknowledged. Export PDF to stamp the OM block on the approved form.' });
              } catch (err) {
                setBanner({ type: 'error', text: err.message });
              }
            }}
          >
            Acknowledge
          </button>
        </section>
      )}

      {isReference && previewUrl ? (
        <iframe
          title={`${schema.title} — approved PDF`}
          src={previewUrl}
          className="block h-[calc(100dvh-13rem)] min-h-[420px] w-full rounded-lg border border-navy/15 bg-stripe"
        />
      ) : (
      <ChecklistForm
        schema={schema}
        header={record.header}
        items={record.items}
        deficiencies={record.deficiencies_summary}
        signoffs={record.signoffs}
        readOnly={readOnly}
        selectedCode={selectedCode}
        photoPreviewByCode={photoPreview}
        lastSavedAt={lastSavedAt}
        linkedIncidentByCode={itemIncidents}
        onHeaderChange={(patch) =>
          patchRecord((prev) => ({
            ...prev,
            header: { ...prev.header, ...patch },
            inspection_type: patch.inspectionType ?? prev.inspection_type,
            inspection_date: patch.date ?? prev.inspection_date,
          }))
        }
        onItemChange={(code, patch) =>
          patchRecord((prev) => ({
            ...prev,
            items: { ...prev.items, [code]: { ...prev.items[code], ...patch } },
          }))
        }
        onDeficienciesChange={(value) => patchRecord((prev) => ({ ...prev, deficiencies_summary: value }))}
        summary={record.summary ?? {}}
        onSummaryChange={(patch) =>
          patchRecord((prev) => ({ ...prev, summary: { ...(prev.summary ?? {}), ...patch } }))
        }
        attachments={record.attachments ?? {}}
        onAttachmentsChange={(patch) =>
          patchRecord((prev) => ({ ...prev, attachments: { ...(prev.attachments ?? {}), ...patch } }))
        }
        onSelectItem={setSelectedCode}
        onPhotoSelect={handlePhotoSelect}
        onPhotoClear={(code) =>
          patchRecord((prev) => ({
            ...prev,
            items: { ...prev.items, [code]: { ...prev.items[code], photo_url: null, photo_local_id: null } },
          }))
        }
        onCreateIncident={(item, row) => {
          if (itemIncidents[item.code]) {
            navigate(`/incidents/${itemIncidents[item.code].id}`);
            return;
          }
          setIncidentModal({ item, row });
        }}
        onSignoffChange={(role, patch) =>
          patchRecord((prev) => {
            const rest = (prev.signoffs ?? []).filter((s) => s.role !== role);
            const current = (prev.signoffs ?? []).find((s) => s.role === role) ?? { role };
            return {
              ...prev,
              signoffs: [
                ...rest,
                {
                  ...current,
                  ...patch,
                  role,
                  signed_at: new Date().toISOString(),
                },
              ],
            };
          })
        }
      />
      )}

      {/* A reference sheet has no overlay to re-render, so it gets no refresh
          block — View PDF simply swaps the page for the approved document. */}
      {!isReference && (
        <PdfPreview url={previewUrl} loading={previewing} error={previewError} onRefresh={handleShowPreview} />
      )}
      {isReference && previewError && (
        <p className="rounded-md border border-alert bg-alert-soft px-4 py-2 text-sm text-alert">{previewError}</p>
      )}

      {incidentModal && (
        <CreateIncidentModal
          open
          onClose={() => setIncidentModal(null)}
          item={incidentModal.item}
          row={incidentModal.row}
          record={record}
          schema={schema}
          user={user}
          profile={profile}
          displayName={displayName}
          photoPreview={photoPreview[incidentModal.item.code]}
          onCreated={({ incident, proceed }) => {
            setItemIncidents((prev) => ({ ...prev, [incident.source_item_code]: incident.id }));
            setBanner({
              type: 'ok',
              text: `${incident.incident_ref} created. The NO SAT response was not changed.`,
            });
            if (proceed) navigate(`/incidents/${incident.id}`);
          }}
        />
      )}
    </div>
  );
}
