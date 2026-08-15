import { AlertTriangle, Check, ChevronDown, Info, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { missingRequiredHeaderKeys, unresolvedNoSatCodes } from '../../lib/checklistSchema.js';
import ChecklistItemRow from './ChecklistItemRow.jsx';
import PhotoUpload from './PhotoUpload.jsx';
import SectionHeader, { ColumnHead } from './SectionHeader.jsx';
import SignoffBlock from './SignoffBlock.jsx';

export default function ChecklistForm({
  schema,
  header,
  items,
  deficiencies,
  signoffs,
  readOnly,
  selectedCode,
  photoPreviewByCode = {},
  lastSavedAt,
  linkedIncidentByCode = {},
  onHeaderChange,
  onItemChange,
  onDeficienciesChange,
  onSelectItem,
  onPhotoSelect,
  onPhotoClear,
  onSignoffChange,
  onCreateIncident,
}) {
  const unresolved = useMemo(() => unresolvedNoSatCodes(schema, items), [schema, items]);
  const missingHeader = useMemo(() => missingRequiredHeaderKeys(schema, header), [schema, header]);
  const sections = schema.sections ?? [];
  const [open, setOpen] = useState(() => new Set([0]));

  useEffect(() => {
    if (!selectedCode) return;
    const index = sections.findIndex((section) => section.items.some((item) => item.code === selectedCode));
    if (index >= 0) {
      setOpen((prev) => {
        if (prev.has(index)) return prev;
        const next = new Set(prev);
        next.add(index);
        return next;
      });
    }
  }, [selectedCode, sections]);

  const selectedItem = useMemo(() => {
    for (const section of sections) {
      const found = section.items.find((item) => item.code === selectedCode);
      if (found) return { ...found, sectionTitle: section.title };
    }
    return null;
  }, [sections, selectedCode]);

  const selectedRow = selectedCode ? items[selectedCode] : null;
  const inspectionLabel =
    schema.headerFields
      ?.find((field) => field.key === 'inspectionType')
      ?.options?.find((opt) => opt.value === header.inspectionType)?.label ?? header.inspectionType;

  function toggleSection(index) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function openNext(fromIndex) {
    const nextIndex = sections.findIndex((_, i) => i > fromIndex && !open.has(i));
    if (nextIndex >= 0) {
      setOpen((prev) => new Set(prev).add(nextIndex));
      document.getElementById(`section-${nextIndex}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="space-y-4">
        {(unresolved.length > 0 || missingHeader.length > 0) && (
          <div className="flex gap-3 rounded-md border border-alert bg-alert-soft px-4 py-3 text-sm text-alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              {unresolved.length > 0 && (
                <p>
                  NO SAT items need remarks before submission: <strong>{unresolved.join(', ')}</strong>
                </p>
              )}
              {missingHeader.length > 0 && (
                <p className="mt-1">Required header fields are empty: {missingHeader.join(', ')}</p>
              )}
            </div>
          </div>
        )}

        <HeaderFields
          schema={schema}
          header={header}
          disabled={readOnly}
          onChange={onHeaderChange}
        />

        {sections.map((section, sectionIndex) => {
          const isOpen = open.has(sectionIndex);
          const hasNextClosed = sections.some((_, i) => i > sectionIndex && !open.has(i));
          return (
            <section
              id={`section-${sectionIndex}`}
              key={section.title}
              className="scroll-mt-3 overflow-hidden rounded-md border border-navy/15 bg-white shadow-sm"
            >
              <SectionHeader
                title={section.title}
                itemCount={section.items.length}
                open={isOpen}
                onToggle={() => toggleSection(sectionIndex)}
              />
              {isOpen && (
                <>
                  <ColumnHead />
                  {section.items.map((item, index) => (
                    <ChecklistItemRow
                      key={item.code}
                      item={item}
                      row={items[item.code]}
                      selected={selectedCode === item.code}
                      striped={index % 2 === 0}
                      disabled={readOnly}
                      remarksError={unresolved.includes(item.code)}
                      hasPhoto={Boolean(photoPreviewByCode[item.code] || items[item.code]?.photo_url)}
                      onSelect={onSelectItem}
                      onChange={(patch) => onItemChange(item.code, patch)}
                      onPhotoClick={onSelectItem}
                    />
                  ))}
                  {hasNextClosed && (
                    <div className="flex justify-center border-t border-navy/10 bg-white py-2">
                      <button
                        type="button"
                        onClick={() => openNext(sectionIndex)}
                        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                      >
                        View Next Sections
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          );
        })}

        {schema.deficienciesField && (
          <section className="rounded-md border border-navy/15 bg-white p-4 shadow-sm">
            <label className="mb-2 block text-[13px] font-semibold uppercase tracking-wide text-navy">
              {schema.deficienciesField.label}
            </label>
            <textarea
              rows={4}
              disabled={readOnly}
              value={deficiencies ?? ''}
              onChange={(e) => onDeficienciesChange(e.target.value)}
              className="w-full rounded border border-navy/20 px-3 py-2 text-sm leading-relaxed"
            />
          </section>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {(schema.signoffs ?? []).map((def) => {
            const signed = signoffs?.find((s) => s.role === def.role);
            return (
              <SignoffBlock
                key={def.role}
                label={def.label}
                dateLabel={def.dateLabel}
                name={signed?.name ?? ''}
                position={signed?.position ?? ''}
                signedAt={signed?.signed_at}
                signatureDataUri={signed?.signature_data_uri}
                readOnly={readOnly}
                onChange={(patch) => onSignoffChange?.(def.role, patch)}
              />
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-navy/10 pt-3 text-xs text-muted">
          <p>
            {schema.footer?.reviewLine}
            {schema.footer?.dateLine ? ` | ${schema.footer.dateLine}` : ''}
          </p>
          <p className="inline-flex items-center gap-1.5 font-medium text-success">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
            {lastSavedAt ? `Auto-saved: ${formatTime(lastSavedAt)}` : 'Autosave on every change'}
          </p>
        </div>
      </div>

      <aside className="h-fit rounded-md border border-navy/15 bg-white shadow-sm xl:sticky xl:top-4">
        {selectedItem ? (
          <div>
            {selectedRow?.result === 'no_sat' && (
              <div className="flex items-start justify-between gap-2 border-b border-alert bg-alert-soft px-4 py-3 text-sm text-alert">
                <span className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Item {selectedItem.code} marked NO SAT
                </span>
                <button type="button" onClick={() => onSelectItem(null)} aria-label="Close detail" className="text-alert">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <div className="space-y-4 p-4">
              {selectedRow?.result === 'no_sat' && (
                <div>
                  <p className="mb-2 text-sm font-medium text-navy">Create Incident from this item?</p>
                  <p className="mb-3 text-xs text-alert">
                    This item has been marked NO SAT. Please provide remarks and select an action.
                  </p>
                  <button
                    type="button"
                    onClick={() => onCreateIncident?.(selectedItem, selectedRow)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-navy px-3 py-2.5 text-sm font-semibold text-white"
                  >
                    <Plus className="h-4 w-4" />
                    {linkedIncidentByCode[selectedItem.code] ? 'View Incident' : 'Create Incident'}
                  </button>
                </div>
              )}

              <PhotoUpload
                itemCode={selectedItem.code}
                previewUrl={photoPreviewByCode[selectedItem.code] || selectedRow?.photo_url}
                disabled={readOnly}
                onSelect={(file) => onPhotoSelect(selectedItem.code, file)}
                onClear={() => onPhotoClear(selectedItem.code)}
              />

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Remarks / Location</p>
                <p className="mt-1 text-sm text-ink">{selectedRow?.remarks?.trim() || '—'}</p>
              </div>

              <dl className="space-y-1.5 text-sm">
                <Detail label="Checklist" value={schema.title} />
                <Detail label="Form" value={schema.code} />
                <Detail label="Section" value={selectedItem.sectionTitle} />
                <Detail label="Item" value={selectedItem.code} />
                <Detail label="Inspection Type" value={inspectionLabel} />
                <Detail label="Location" value={selectedRow?.remarks?.trim() || '—'} />
              </dl>

              <p className="flex gap-2 rounded-md bg-primary/10 px-3 py-2 text-xs text-navy">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                All NO SAT items must have remarks. Creating an incident helps ensure timely corrective action.
              </p>
            </div>
          </div>
        ) : (
          <p className="p-4 text-sm text-muted">Select an item to attach evidence. NO SAT items require remarks.</p>
        )}
      </aside>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-navy">{value}</dd>
    </div>
  );
}

function HeaderFields({ schema, header, disabled, onChange }) {
  const fields = schema.headerFields ?? [];
  return (
    <section className="rounded-md border border-navy/15 bg-white p-4 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {fields.map((field) => (
          <label key={field.key} className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">
              {field.label}
              {field.required ? ' *' : ''}
            </span>
            {field.type === 'radio' ? (
              <div className="space-y-2">
                {(field.options ?? []).map((opt) => (
                  <label key={opt.value} className="flex min-h-8 items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={field.key}
                      disabled={disabled}
                      checked={header[field.key] === opt.value}
                      onChange={() => onChange({ [field.key]: opt.value })}
                      className="h-4 w-4 accent-primary"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            ) : (
              <input
                type={field.type === 'date' ? 'date' : 'text'}
                disabled={disabled || field.key === 'conductedBy'}
                value={header[field.key] ?? ''}
                onChange={(e) => onChange({ [field.key]: e.target.value })}
                className="min-h-10 w-full rounded border border-navy/20 px-3 py-2 text-sm read-only:bg-stripe"
              />
            )}
          </label>
        ))}
      </div>
    </section>
  );
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function validateChecklist(schema, header, items) {
  return {
    unresolved: unresolvedNoSatCodes(schema, items),
    missingHeader: missingRequiredHeaderKeys(schema, header),
  };
}
