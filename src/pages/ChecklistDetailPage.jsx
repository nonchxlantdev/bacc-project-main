import { AlertTriangle, Download, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import ChecklistForm, { validateChecklist } from '../components/checklist/ChecklistForm.jsx';
import AnnexDDrainagePrint from '../components/checklist/print-templates/AnnexDDrainagePrint.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  emptyHeaderState,
  emptyItemState,
} from '../lib/checklistSchema.js';
import { buildChecklistPrintHtml } from '../lib/printHtml.js';
import {
  buildDraftRecord,
  getSubmission,
  persistSubmission,
  uploadPhoto,
} from '../lib/submissions.js';
import { getTemplate } from '../lib/templates.js';
import { enqueue, putPhotoBlob } from '../utils/offlineQueue.js';

export default function ChecklistDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { online } = useOutletContext() ?? { online: navigator.onLine };
  const { user, displayName, position } = useAuth();

  const [record, setRecord] = useState(null);
  const [selectedCode, setSelectedCode] = useState(null);
  const [photoPreview, setPhotoPreview] = useState({});
  const [banner, setBanner] = useState(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (id === 'new') {
        const template = await getTemplate(searchParams.get('template'));
        const header = emptyHeaderState(template.schema, {
          date: new Date().toISOString().slice(0, 10),
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
      if (!cancelled) setRecord(existing);
    }

    load().catch((err) => {
      if (!cancelled) setLoadError(err.message);
    });
    return () => {
      cancelled = true;
    };
  }, [id, searchParams, user, displayName, position, navigate]);

  const schema = record?.schema;
  const readOnly = record?.status === 'submitted';

  async function patchRecord(updater) {
    setRecord((prev) => {
      const next = updater(prev);
      return next;
    });
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
          ? `NO-SAT items need remarks before submission: ${unresolved.join(', ')}`
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
    };
    await save(next);
    setBanner({ type: 'ok', text: 'Submitted. You can export the official PDF when online.' });
  }

  async function handlePhotoSelect(code, file) {
    const localId = crypto.randomUUID();
    await putPhotoBlob(localId, file, { itemCode: code, submissionId: record.id });
    const preview = URL.createObjectURL(file);
    setPhotoPreview((prev) => ({ ...prev, [code]: preview }));

    let photoUrl = null;
    if (online) {
      try {
        const uploaded = await uploadPhoto({
          userId: user.id,
          submissionId: record.id,
          itemCode: code,
          blob: file,
          contentType: file.type,
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
      const html = await buildChecklistPrintHtml({
        schema,
        submission: record,
        printTemplateKey: record.print_template_key,
      });
      const filename = `${schema.code}-${record.inspection_date || 'draft'}.pdf`;
      const res = await fetch('/api/export-checklist-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, filename }),
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
      const blob = await res.blob();
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
        {loadError} <Link to="/checklists/mine" className="underline">Back to my checklists</Link>
      </div>
    );
  }

  if (!record || !schema) {
    return <p className="text-muted">Loading checklist…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{schema.annexLabel}</p>
          <h1 className="text-2xl font-bold text-navy">{schema.title}</h1>
          <p className="text-sm text-muted">Form {schema.code}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!readOnly && (
            <button
              type="button"
              onClick={() => save()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md border border-navy/20 bg-white px-3 py-2 text-sm font-medium text-navy"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving…' : record.pending_sync ? 'Save locally' : 'Save draft'}
            </button>
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={handleSubmit}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
            >
              Submit
            </button>
          )}
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white"
          >
            <Download className="h-4 w-4" />
            {exporting ? 'Exporting…' : 'Export PDF'}
          </button>
          <button
            type="button"
            onClick={() => setShowPrint((v) => !v)}
            className="rounded-md border border-navy/20 bg-white px-3 py-2 text-sm"
          >
            {showPrint ? 'Hide preview' : 'Print preview'}
          </button>
        </div>
      </div>

      {banner && (
        <div
          className={`flex gap-2 rounded-md px-4 py-3 text-sm ${
            banner.type === 'error' ? 'border border-alert bg-alert-soft text-alert' : 'border border-success bg-success-soft text-success'
          }`}
        >
          {banner.type === 'error' && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{banner.text}</span>
        </div>
      )}

      {!online && (
        <p className="rounded-md bg-navy px-4 py-2 text-sm text-white">
          You are offline. Saves stay on this device and sync when you reconnect. PDF export requires connectivity.
        </p>
      )}

      <ChecklistForm
        schema={schema}
        header={record.header}
        items={record.items}
        deficiencies={record.deficiencies_summary}
        signoffs={record.signoffs}
        readOnly={readOnly}
        selectedCode={selectedCode}
        photoPreviewByCode={photoPreview}
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
        onDeficienciesChange={(value) =>
          patchRecord((prev) => ({ ...prev, deficiencies_summary: value }))
        }
        onSelectItem={setSelectedCode}
        onPhotoSelect={handlePhotoSelect}
        onPhotoClear={(code) =>
          patchRecord((prev) => ({
            ...prev,
            items: { ...prev.items, [code]: { ...prev.items[code], photo_url: null, photo_local_id: null } },
          }))
        }
        onOmSignoffChange={(patch) =>
          patchRecord((prev) => {
            const rest = (prev.signoffs ?? []).filter((s) => s.role !== 'om_acknowledgment');
            return {
              ...prev,
              signoffs: [
                ...rest,
                {
                  role: 'om_acknowledgment',
                  name: patch.name ?? '',
                  position: patch.position ?? '',
                  signed_at: patch.name ? new Date().toISOString() : null,
                },
              ],
            };
          })
        }
      />

      {showPrint && (
        <section className="rounded-lg border border-navy/10 bg-white p-4">
          <h2 className="mb-3 font-semibold text-navy">Print preview</h2>
          <AnnexDDrainagePrint schema={schema} submission={record} />
        </section>
      )}
    </div>
  );
}
