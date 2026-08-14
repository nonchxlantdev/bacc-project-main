import { AlertTriangle, Info } from 'lucide-react';
import { useMemo } from 'react';
import {
  missingRequiredHeaderKeys,
  unresolvedNoSatCodes,
} from '../../lib/checklistSchema.js';
import ChecklistItemRow from './ChecklistItemRow.jsx';
import PhotoUpload from './PhotoUpload.jsx';
import SectionHeader from './SectionHeader.jsx';
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
  onHeaderChange,
  onItemChange,
  onDeficienciesChange,
  onSelectItem,
  onPhotoSelect,
  onPhotoClear,
  onOmSignoffChange,
}) {
  const unresolved = useMemo(() => unresolvedNoSatCodes(schema, items), [schema, items]);
  const missingHeader = useMemo(() => missingRequiredHeaderKeys(schema, header), [schema, header]);

  const selectedItem = useMemo(() => {
    for (const section of schema.sections ?? []) {
      const found = section.items.find((item) => item.code === selectedCode);
      if (found) return found;
    }
    return null;
  }, [schema, selectedCode]);

  const selectedRow = selectedCode ? items[selectedCode] : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-4">
        {(unresolved.length > 0 || missingHeader.length > 0) && (
          <div className="flex gap-3 rounded-md border border-alert bg-alert-soft px-4 py-3 text-sm text-alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              {unresolved.length > 0 && (
                <p>
                  NO-SAT items need remarks before submission:{' '}
                  <strong>{unresolved.join(', ')}</strong>
                </p>
              )}
              {missingHeader.length > 0 && (
                <p className="mt-1">Required header fields are empty: {missingHeader.join(', ')}</p>
              )}
            </div>
          </div>
        )}

        <HeaderFields schema={schema} header={header} disabled={readOnly} onChange={onHeaderChange} />

        {(schema.sections ?? []).map((section) => (
          <section key={section.title} className="overflow-hidden rounded-md border border-navy/15 bg-white shadow-sm">
            <SectionHeader title={section.title} />
            {section.items.map((item, index) => (
              <ChecklistItemRow
                key={item.code}
                item={item}
                row={items[item.code]}
                selected={selectedCode === item.code}
                striped={index % 2 === 0}
                disabled={readOnly}
                remarksError={unresolved.includes(item.code)}
                onSelect={onSelectItem}
                onChange={(patch) => onItemChange(item.code, patch)}
              />
            ))}
          </section>
        ))}

        {schema.deficienciesField && (
          <section className="rounded-md border border-navy/15 bg-white p-4 shadow-sm">
            <label className="mb-2 block text-sm font-semibold text-navy">
              {schema.deficienciesField.label}
            </label>
            <textarea
              rows={5}
              disabled={readOnly}
              value={deficiencies ?? ''}
              onChange={(e) => onDeficienciesChange(e.target.value)}
              className="w-full rounded border border-navy/20 px-3 py-2 text-sm"
            />
          </section>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {(schema.signoffs ?? []).map((def) => {
            const signed = signoffs?.find((s) => s.role === def.role);
            const isOm = def.role === 'om_acknowledgment';
            return (
              <SignoffBlock
                key={def.role}
                label={def.label}
                dateLabel={def.dateLabel}
                name={signed?.name ?? ''}
                position={signed?.position ?? ''}
                signedAt={signed?.signed_at}
                readOnly={readOnly || !isOm}
                onChange={isOm ? onOmSignoffChange : undefined}
              />
            );
          })}
        </div>
      </div>

      <aside className="h-fit rounded-md border border-navy/15 bg-white p-4 shadow-sm lg:sticky lg:top-20">
        {selectedItem && selectedRow?.result === 'no_sat' ? (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Selected item</p>
              <p className="mt-1 font-bold text-navy">{selectedItem.code}</p>
              <p className="mt-1 text-sm">{selectedItem.text}</p>
            </div>
            <PhotoUpload
              itemCode={selectedItem.code}
              previewUrl={photoPreviewByCode[selectedItem.code] || selectedRow.photo_url}
              disabled={readOnly}
              onSelect={(file) => onPhotoSelect(selectedItem.code, file)}
              onClear={() => onPhotoClear(selectedItem.code)}
            />
            <div className="relative">
              <button
                type="button"
                disabled
                title="Coming in a future update"
                className="w-full cursor-not-allowed rounded-md border border-navy/20 bg-stripe px-3 py-2 text-sm font-medium text-muted"
              >
                Create Incident from this item?
              </button>
              <p className="mt-2 flex items-start gap-1 text-xs text-muted">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Coming in a future update
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">
            Select a <strong>NO-SAT</strong> item to attach photo evidence. Incident creation is reserved for a later phase.
          </p>
        )}
      </aside>
    </div>
  );
}

function HeaderFields({ schema, header, disabled, onChange }) {
  return (
    <section className="grid gap-3 rounded-md border border-navy/15 bg-white p-4 shadow-sm md:grid-cols-2">
      {(schema.headerFields ?? []).map((field) => (
        <label key={field.key} className={field.type === 'radio' ? 'md:col-span-2' : ''}>
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
            {field.label}
            {field.required ? ' *' : ''}
          </span>
          {field.type === 'radio' ? (
            <div className="flex flex-wrap gap-3">
              {(field.options ?? []).map((opt) => (
                <label key={opt.value} className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={field.key}
                    disabled={disabled}
                    checked={header[field.key] === opt.value}
                    onChange={() => onChange({ [field.key]: opt.value })}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          ) : (
            <input
              type={field.type === 'date' ? 'date' : 'text'}
              disabled={disabled}
              value={header[field.key] ?? ''}
              onChange={(e) => onChange({ [field.key]: e.target.value })}
              className="w-full rounded border border-navy/20 px-3 py-2 text-sm"
            />
          )}
        </label>
      ))}
    </section>
  );
}

export function validateChecklist(schema, header, items) {
  return {
    unresolved: unresolvedNoSatCodes(schema, items),
    missingHeader: missingRequiredHeaderKeys(schema, header),
  };
}
