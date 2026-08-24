import { AlertTriangle, Check, ChevronDown, Info, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { missingRequiredHeaderKeys, unresolvedNoSatCodes } from '../../lib/checklistSchema.js';
import { itemResolutionState } from '../../lib/incidentLifecycle.js';
import { ROLE_TITLES } from '../../lib/roleStaffing.js';
import ChecklistItemRow from './ChecklistItemRow.jsx';
import PhotoUpload from './PhotoUpload.jsx';
import SectionHeader, { ColumnHead } from './SectionHeader.jsx';
import ResolutionChip from './ResolutionChip.jsx';
import LogTable from './LogTable.jsx';
import DrawingAttach from './DrawingAttach.jsx';
import ReferenceList from './ReferenceList.jsx';
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
  summary = {},
  onSummaryChange,
  attachments = [],
  onAttachmentsChange,
  onSelectItem,
  onPhotoSelect,
  onPhotoClear,
  onSignoffChange,
  onCreateIncident,
}) {
  const unresolved = useMemo(() => unresolvedNoSatCodes(schema, items), [schema, items]);
  const missingHeader = useMemo(() => missingRequiredHeaderKeys(schema, header), [schema, header]);
  const sections = schema.sections ?? [];
  const hasItems = sections.some((section) => (section.items ?? []).length > 0);
  const [open, setOpen] = useState(() => new Set([0]));

  // Someone opening a submitted checklist is usually asking "was that defect
  // dealt with?", so any section holding a linked incident starts open —
  // otherwise the answer is hidden behind a collapsed heading.
  useEffect(() => {
    const codes = Object.keys(linkedIncidentByCode ?? {});
    if (!codes.length) return;
    setOpen((prev) => {
      const next = new Set(prev);
      sections.forEach((section, i) => {
        if ((section.items ?? []).some((item) => codes.includes(item.code))) next.add(i);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [linkedIncidentByCode, sections]);

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
  const resolution = selectedCode ? itemResolutionState(linkedIncidentByCode[selectedCode]) : null;
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

  // A reference sheet has no items, no header fields and nothing to fill in —
  // rendering the inspection chrome around it would invent an interaction the
  // approved document does not have.
  if (schema.referenceGroups?.length) return <ReferenceList schema={schema} />;

  return (
    <div
      className={`grid gap-5 ${hasItems ? 'xl:grid-cols-[minmax(0,1fr)_19rem]' : ''} ${
        hasItems && selectedItem ? 'max-xl:pb-[52vh]' : ''
      }`}
    >
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
                <p className="mt-1">
                  Required header fields are empty:{' '}
                  {missingHeader
                    .map((k) => schema.headerFields?.find((f) => f.key === k)?.label ?? k)
                    .join(', ')}
                </p>
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

        {/* Everything the approved form prints after the item table: its free-text
            areas and its ☐ option groups, in the order they appear on the page.
            Annex K is nothing but these. */}
        {(schema.summaryFields ?? []).map((field) => (
          <SummaryBlock
            key={field.key}
            field={field}
            value={summary?.[field.key] ?? ''}
            disabled={readOnly}
            onChange={(value) => onSummaryChange?.({ [field.key]: value })}
            drawings={attachments?.[field.key] ?? []}
            onDrawingsChange={(next) => onAttachmentsChange?.({ [field.key]: next })}
          />
        ))}

        {/* Forms mapped before summaryFields existed (Annex D) keep the single
            deficiency box they have always had. */}
        {schema.deficienciesField && !(schema.summaryFields ?? []).length && (
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

        {(schema.preprintedStatements ?? []).map((block) => (
          <section key={block.key} className="rounded-md border border-navy/15 bg-stripe p-4">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-navy">{block.label}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">{block.text}</p>
            <p className="mt-2 text-xs text-muted">
              Pre-printed on the approved form — nothing is written into it.
            </p>
          </section>
        ))}

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

      {/* Desktop: sticky evidence rail. Phone and tablet: a bottom sheet that
          appears when an item is tapped, so the panel is next to the thumb
          instead of below every section. Not modal — tapping another item
          swaps the sheet's contents without closing it. */}
      {/* Annex K and Annex L have no item table, so there is nothing to select
          and nothing to attach evidence to — the rail would just be an empty box. */}
      <aside
        className={`border-navy/15 bg-white xl:sticky xl:top-4 xl:h-fit xl:rounded-md xl:border xl:shadow-sm max-xl:fixed max-xl:inset-x-0 max-xl:bottom-0 max-xl:z-40 max-xl:max-h-[52vh] max-xl:overflow-y-auto max-xl:rounded-t-xl max-xl:border-t max-xl:pb-[env(safe-area-inset-bottom)] max-xl:shadow-[0_-8px_24px_rgba(11,30,61,0.18)] ${
          hasItems ? '' : 'hidden'
        } ${selectedItem ? '' : 'max-xl:hidden'}`}
      >
        {selectedItem ? (
          <div>
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-navy/10 bg-white px-4 py-2 xl:hidden">
              <span className="min-w-0 truncate text-sm font-semibold text-navy">
                {selectedItem.code} · {selectedItem.sectionTitle}
              </span>
              <button
                type="button"
                onClick={() => onSelectItem(null)}
                aria-label="Close item detail"
                className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted hover:bg-stripe"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
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
              {(selectedRow?.result === 'no_sat' || resolution) && (
                <div>
                  {resolution ? (
                    <div className="mb-3">
                      <p className="mb-1 text-sm font-medium text-navy">Deficiency status</p>
                      <ResolutionChip resolution={resolution} />
                      <p className="mt-2 text-xs text-muted">{resolution.detail}</p>
                    </div>
                  ) : (
                    <p className="mb-3 text-xs text-alert">
                      This item has been marked NO SAT. Please provide remarks and select an action.
                    </p>
                  )}
                  <p className="mb-2 text-sm font-medium text-navy">
                    {resolution ? 'Incident' : 'Create Incident from this item?'}
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

/**
 * One post-table block from the approved form: a free-text area, or a ☐ choice.
 * `hint` is the completion guidance the form itself prints in brackets under the
 * heading, so it is shown rather than paraphrased.
 */
function SummaryBlock({ field, value, disabled, onChange, drawings, onDrawingsChange }) {
  const isChoice = field.type === 'yes_no' || field.type === 'radio';
  const isTable = field.type === 'table';
  return (
    <section className="rounded-md border border-navy/15 bg-white p-4 shadow-sm">
      <label className="block text-[13px] font-semibold uppercase tracking-wide text-navy">
        {field.label}
      </label>
      {field.hint && <p className="mt-1 text-xs italic text-muted">{field.hint}</p>}
      {isTable ? (
        <LogTable field={field} value={value} disabled={disabled} onChange={onChange} />
      ) : isChoice ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {(field.options ?? []).map((opt) => {
            const active = value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={disabled}
                aria-pressed={active}
                onClick={() => onChange(active ? '' : opt.value)}
                className={`min-h-11 rounded border px-3 text-sm font-semibold transition disabled:opacity-60 ${
                  active
                    ? 'border-primary bg-primary text-white'
                    : 'border-navy/20 bg-white text-navy hover:border-primary hover:text-primary'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <textarea
            rows={4}
            disabled={disabled}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            className="mt-2 w-full rounded border border-navy/20 px-3 py-2 text-sm leading-relaxed"
          />
          {field.tightOnForm && (
            <p className="mt-1 text-xs text-muted">
              The approved form leaves only one line here — anything longer prints on a continuation page.
            </p>
          )}
        </>
      )}

      {/* Only the sections whose pre-printed hint says "Attach drawing." */}
      {field.attachDrawing && (
        <DrawingAttach
          sectionKey={field.key}
          sectionLabel={field.label}
          items={drawings}
          disabled={disabled}
          onChange={onDrawingsChange}
        />
      )}
    </section>
  );
}

function Detail({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium text-navy">{value}</dd>
    </div>
  );
}

const YES_NO_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

function HeaderFields({ schema, header, disabled, onChange }) {
  const fields = schema.headerFields ?? [];
  if (!fields.length) return null;
  // Most forms head with a handful of short entries (Date, Time, Vehicle No.),
  // which read best several to a row. A form that NUMBERS its header — Annex K's
  // "1. PROJECT TITLE" through "10. BDCA Acceptance Date" — is a list of
  // full-width answers on the approved page, and is rendered the same way here.
  // A draft created before `headerLayout` existed carries a schema snapshot
  // without it, so fall back to the structure itself: a header the form NUMBERS
  // is a list of full-width answers, however old the snapshot is.
  const numbered = fields.filter((f) => /^\s*\d+\./.test(f.label ?? '')).length >= 3;
  const stacked = schema.headerLayout === 'stacked' || numbered;
  return (
    <section className="rounded-md border border-navy/15 bg-white p-4 shadow-sm">
      <div className={stacked ? 'grid gap-4' : 'grid gap-4 md:grid-cols-2 xl:grid-cols-4'}>
        {fields.map((field) => {
          // "Conducted by (Name / Position)" is one field on the approved form
          // and stays one field in the record — but it is two answers, and the
          // position half is a post with a fixed name. Two keys carry it
          // (conductedBy, conductedByNamePosition), so it is found by its label.
          const composed = isConductedBy(field);
          const Wrapper = composed ? 'div' : 'label';
          return (
            <Wrapper key={field.key} className="block">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                {field.label}
                {field.required ? ' *' : ''}
              </span>
              {composed ? (
                <ConductedByField
                  field={field}
                  value={header[field.key] ?? ''}
                  disabled={disabled}
                  onChange={onChange}
                />
              ) : field.type === 'yes_no' ? (
                <YesNoField field={field} value={header[field.key]} disabled={disabled} onChange={onChange} />
              ) : field.type === 'radio' ? (
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
                  type={INPUT_TYPES[field.type] ?? 'text'}
                  disabled={disabled}
                  value={header[field.key] ?? ''}
                  onChange={(e) => onChange({ [field.key]: e.target.value })}
                  className="min-h-10 w-full rounded border border-navy/20 px-3 py-2 text-sm read-only:bg-stripe"
                />
              )}
            </Wrapper>
          );
        })}
      </div>
    </section>
  );
}

const INPUT_TYPES = { date: 'date', time: 'time', number: 'number' };

/** The approved forms name this field the same way whatever key carries it. */
function isConductedBy(field) {
  return /^conducted by/i.test(field?.label ?? '');
}

/** The post names as printed on the approved forms, in picking order. */
const CONDUCTED_BY_TITLES = [...new Set(Object.values(ROLE_TITLES))].sort((a, b) => a.localeCompare(b));

/**
 * Split "Name / Position" the way a person wrote it.
 *
 * The first slash separates the halves; anything after it is the position, so
 * a post whose own name contains a slash survives the round trip.
 */
export function splitNamePosition(value) {
  const raw = String(value ?? '');
  const cut = raw.indexOf('/');
  if (cut < 0) return { name: raw.trim(), title: '' };
  return { name: raw.slice(0, cut).trim(), title: raw.slice(cut + 1).trim() };
}

export function joinNamePosition(name, title) {
  return [name.trim(), title.trim()].filter(Boolean).join(' / ');
}

/**
 * Two controls, one stored value.
 *
 * BACC §14 fixes the approved form's field, its label and the string that is
 * stamped onto the exported PDF — so the record still holds a single
 * "Name / Position". What changes is only how it is typed: the position half is
 * a post with a canonical name, and picking it beats retyping it whenever the
 * person who conducted the inspection is not the account holder.
 *
 * The halves are held locally so a half-finished entry stays put while it is
 * being made, and re-read from the value whenever the record changes underneath
 * — loading a draft saved before this control existed, or one typed by hand.
 */
function ConductedByField({ field, value, disabled, onChange }) {
  const [parts, setParts] = useState(() => splitNamePosition(value));

  useEffect(() => {
    setParts((prev) => (joinNamePosition(prev.name, prev.title) === (value ?? '') ? prev : splitNamePosition(value)));
  }, [value]);

  function commit(next) {
    setParts(next);
    onChange({ [field.key]: joinNamePosition(next.name, next.title) });
  }

  // A position typed before this control existed is not on the list. Dropping
  // it would quietly rewrite what an inspector recorded, so it is offered as
  // one more option instead.
  const titles = CONDUCTED_BY_TITLES.includes(parts.title) || !parts.title
    ? CONDUCTED_BY_TITLES
    : [...CONDUCTED_BY_TITLES, parts.title];

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <input
        type="text"
        aria-label="Conducted by — name"
        placeholder="Name"
        disabled={disabled}
        value={parts.name}
        onChange={(e) => commit({ ...parts, name: e.target.value })}
        className="min-h-10 w-full rounded border border-navy/20 px-3 py-2 text-sm read-only:bg-stripe"
      />
      <select
        aria-label="Conducted by — title"
        disabled={disabled}
        value={parts.title}
        onChange={(e) => commit({ ...parts, title: e.target.value })}
        className="min-h-10 w-full rounded border border-navy/20 bg-white px-3 py-2 text-sm"
      >
        <option value="">Select a title…</option>
        {titles.map((title) => (
          <option key={title} value={title}>
            {title}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Yes / No header field. Some approved forms attach an operational consequence
 * to one answer — Appendix C-8's "Systems Affected / AOC Impact" prints
 * "if Yes — notify Operations Manager immediately" on the form itself. When the
 * schema sets `escalateOnYes`, choosing Yes surfaces that instruction rather
 * than leaving it buried in the paper wording.
 */
function YesNoField({ field, value, disabled, onChange }) {
  const options = field.options?.length ? field.options : YES_NO_OPTIONS;
  const escalated = field.escalateOnYes && value === 'yes';
  return (
    <div>
      <div className="flex gap-2">
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onChange({ [field.key]: opt.value })}
              className={`min-h-10 flex-1 rounded border px-3 text-sm font-semibold transition disabled:opacity-60 ${
                active
                  ? 'border-primary bg-primary text-white'
                  : 'border-navy/20 bg-white text-navy hover:border-primary hover:text-primary'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {escalated && (
        <p className="mt-1.5 rounded border border-alert bg-alert-soft px-2 py-1.5 text-[11px] font-semibold text-alert">
          {field.note || 'Notify the Operations Manager immediately.'}
        </p>
      )}
      {!escalated && field.note && <p className="mt-1 text-[11px] text-muted">{field.note}</p>}
    </div>
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
