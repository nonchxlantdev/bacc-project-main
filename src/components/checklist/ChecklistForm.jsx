import {
  AlertTriangle,
  Briefcase,
  Calendar,
  Check,
  ChevronDown,
  Clock,
  CloudRain,
  FileText,
  Hash,
  Info,
  Plus,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { missingRequiredHeaderKeys, unresolvedNoSatCodes } from '../../lib/checklistSchema.js';
import { itemResolutionState } from '../../lib/incidentLifecycle.js';
import { selfSignoffRole } from '../../lib/storedSignature.js';
import { ROLE_TITLES } from '../../lib/roleStaffing.js';
import ChecklistItemRow from './ChecklistItemRow.jsx';
import PhotoUpload from './PhotoUpload.jsx';
import SectionHeader, { ColumnHead } from './SectionHeader.jsx';
import ResolutionChip from './ResolutionChip.jsx';
import LogTable from './LogTable.jsx';
import DrawingAttach from './DrawingAttach.jsx';
import ReferenceList from './ReferenceList.jsx';
import SignoffBlock from './SignoffBlock.jsx';
import Select from '../ui/Select.jsx';

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
  storedSignatureUri,
  onApplySelfStoredSignature,
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
    // On phone and tablet the panel is a bottom sheet (through 1279px, the
    // same width the item table itself waits for) — scroll the item into
    // view so it is not hidden behind the sheet when NO SAT auto-opens it.
    const el = document.getElementById(`checklist-item-${selectedCode}`);
    if (el && window.matchMedia('(max-width: 1279px)').matches) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    <div className={`grid gap-5 ${hasItems ? 'xl:grid-cols-[minmax(0,1fr)_19rem]' : ''}`}>
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
          // "View Next Sections" should appear once — at the bottom of the
          // furthest section currently open — not on every open section that
          // happens to have a later closed one. `open` only grows as sections
          // are expanded, so without the `isFrontier` check this rendered on
          // every previously-opened section as soon as a second one opened.
          const isFrontier = isOpen && sectionIndex === Math.max(-1, ...open);
          const hasNextClosed = isFrontier && sections.some((_, i) => i > sectionIndex && !open.has(i));
          return (
            <section
              id={`section-${sectionIndex}`}
              key={section.title}
              className="scroll-mt-3 overflow-hidden rounded-md border border-line/15 bg-surface shadow-card"
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
                    <div className="flex justify-center border-t border-line/10 bg-surface py-2">
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
          <section className="rounded-md border border-line/15 bg-surface p-4 shadow-card">
            <label className="mb-2 block text-[13px] font-semibold uppercase tracking-wide text-muted">
              {schema.deficienciesField.label}
            </label>
            <textarea
              rows={4}
              disabled={readOnly}
              value={deficiencies ?? ''}
              onChange={(e) => onDeficienciesChange(e.target.value)}
              className="w-full rounded border border-line/20 bg-surface px-3 py-2 text-sm leading-relaxed text-ink"
            />
          </section>
        )}

        {(schema.preprintedStatements ?? []).map((block) => (
          <section key={block.key} className="rounded-md border border-line/15 bg-stripe p-4">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">{block.label}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">{block.text}</p>
            <p className="mt-2 text-xs text-muted">
              Pre-printed on the approved form — nothing is written into it.
            </p>
          </section>
        ))}

        <div className="grid gap-4 md:grid-cols-2">
          {(schema.signoffs ?? []).map((def) => {
            const signed = signoffs?.find((s) => s.role === def.role);
            // Only the self block (the form's own signer — first in
            // schema.signoffs, whatever that annex calls the role) offers
            // "use my saved signature"; a colleague's or approver's block
            // never gets stamped with the current account's signature.
            const isSelf = def.role === selfSignoffRole(schema);
            return (
              <SignoffBlock
                key={def.role}
                role={def.role}
                label={def.label}
                dateLabel={def.dateLabel}
                name={signed?.name ?? ''}
                position={signed?.position ?? ''}
                signedAt={signed?.signed_at}
                signatureDataUri={signed?.signature_data_uri}
                storedSignatureUri={storedSignatureUri}
                readOnly={readOnly}
                onChange={(patch) => onSignoffChange?.(def.role, patch)}
                onApplyStored={isSelf ? onApplySelfStoredSignature : undefined}
              />
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/10 pt-3 text-xs text-muted">
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

      {/* Desktop (xl, 1280px+): sticky evidence rail, matching the width where
          the item table itself takes over. Phone and tablet: a bottom sheet
          when an item is selected (including auto-open on NO SAT) — that's
          also where the tablet compact row lives, since it drops its own
          remarks/photo controls in favor of this sheet. The sheet no longer
          adds dead padding below the form — the selected row scrolls into
          view instead, and closing it never scrolls the page: it's a fixed
          overlay, not part of the document flow, so review position holds. */}
      {/* Annex K and Annex L have no item table, so there is nothing to select
          and nothing to attach evidence to — the rail would just be an empty box. */}
      {selectedItem && (
        <button
          type="button"
          aria-label="Close item detail"
          onClick={() => onSelectItem(null)}
          className="fixed inset-0 z-30 bg-navy/40 xl:hidden"
        />
      )}
      <aside
        className={`border-line/15 bg-surface xl:sticky xl:top-4 xl:h-fit xl:rounded-md xl:border xl:shadow-card max-xl:fixed max-xl:inset-x-0 max-xl:bottom-0 max-xl:z-40 max-xl:max-h-[min(52vh,420px)] max-xl:overflow-y-auto max-xl:overscroll-contain max-xl:rounded-t-xl max-xl:border-t max-xl:pb-[env(safe-area-inset-bottom)] max-xl:shadow-[0_-8px_24px_rgba(11,30,61,0.18)] ${
          hasItems ? '' : 'hidden'
        } ${selectedItem ? '' : 'max-xl:hidden'}`}
      >
        {selectedItem ? (
          <div>
            <div
              className={`sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-surface px-4 py-2 xl:hidden ${
                selectedRow?.result === 'no_sat' ? 'border-alert bg-alert-soft text-alert' : 'border-line/10'
              }`}
            >
              <span className="flex min-w-0 items-start gap-2 text-sm font-semibold">
                {selectedRow?.result === 'no_sat' && (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                )}
                <span className="truncate">
                  {selectedItem.code} · {selectedItem.sectionTitle}
                  {selectedRow?.result === 'no_sat' ? ' — NO SAT' : ''}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onSelectItem(null)}
                aria-label="Close item detail"
                className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-4">
              {(selectedRow?.result === 'no_sat' || resolution) && (
                <div>
                  {resolution ? (
                    <div className="mb-3">
                      <p className="mb-1 text-sm font-medium text-ink">Deficiency status</p>
                      <ResolutionChip resolution={resolution} />
                      <p className="mt-2 text-xs text-muted">{resolution.detail}</p>
                    </div>
                  ) : (
                    <p className="mb-3 text-xs text-alert">
                      This item has been marked NO SAT. Please provide remarks and select an action.
                    </p>
                  )}
                  <p className="mb-2 text-sm font-medium text-ink">
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
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
                  Remarks / Location
                  {selectedRow?.result === 'no_sat' ? ' *' : ''}
                </label>
                {readOnly ? (
                  <p className="mt-1 text-sm text-ink">{selectedRow?.remarks?.trim() || '—'}</p>
                ) : (
                  <textarea
                    rows={3}
                    value={selectedRow?.remarks ?? ''}
                    placeholder={selectedRow?.result === 'no_sat' ? 'Required for NO SAT' : 'Remarks / location'}
                    onChange={(e) => onItemChange(selectedItem.code, { remarks: e.target.value })}
                    className={`mt-1 w-full rounded border bg-surface px-3 py-2 text-sm text-ink ${
                      unresolved.includes(selectedItem.code) ? 'border-alert' : 'border-line/20'
                    }`}
                  />
                )}
              </div>

              <dl className="space-y-1.5 text-sm">
                <Detail label="Checklist" value={schema.title} />
                <Detail label="Form" value={schema.code} />
                <Detail label="Section" value={selectedItem.sectionTitle} />
                <Detail label="Item" value={selectedItem.code} />
                <Detail label="Inspection Type" value={inspectionLabel} />
                <Detail label="Location" value={selectedRow?.remarks?.trim() || '—'} />
              </dl>

              <p className="flex gap-2 rounded-md bg-primary/10 px-3 py-2 text-xs text-ink">
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
    <section className="rounded-md border border-line/15 bg-surface p-4 shadow-card">
      <label className="block text-[13px] font-semibold uppercase tracking-wide text-muted">
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
                    : 'border-line/20 bg-surface text-ink hover:border-primary hover:text-primary'
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
            className="mt-2 w-full rounded border border-line/20 bg-surface px-3 py-2 text-sm leading-relaxed text-ink"
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
      <dd className="min-w-0 break-words text-right font-medium text-ink">{value}</dd>
    </div>
  );
}

const YES_NO_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

// Which icon reads a field at a glance. This is deliberately keyword/type
// driven rather than a per-annex lookup table — 36 schemas between them use
// dozens of distinct header field labels (weather, NOTAM ref, field
// technician, movement area clearance ref...) and hardcoding an icon per
// label would need updating every time a new annex is added. Type wins
// first since it is exact; label keywords are a best-effort fallback for
// the generic "text" fields, and anything unmatched gets a plain document
// icon rather than guessing wrong.
function fieldIcon(field) {
  if (field.type === 'date') return Calendar;
  if (field.type === 'time') return Clock;
  const label = (field.label ?? '').toLowerCase();
  if (/rain|weather|wind|visibility/.test(label)) return CloudRain;
  if (/ref\.|reference|no\.|number|license/i.test(field.label ?? '')) return Hash;
  return FileText;
}

/** A small icon inline at the left of a text-style control, matching the
 * card layout everywhere else in this header. */
function FieldIcon({ Icon }) {
  return <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />;
}

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
    // No `overflow-hidden` here (unlike the other card wrappers in this file):
    // this card's "Conducted by — title" field opens a dropdown that has to be
    // able to float past the card's own bottom edge. Only the footer strip
    // below has a fill that would otherwise show square corners, so it gets
    // its own `rounded-b-md` instead of relying on the section to clip it.
    <section className="rounded-md border border-line/15 bg-surface shadow-card">
      <div className="flex items-start gap-3 border-b border-line/10 px-4 py-4 sm:px-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Calendar className="h-5 w-5" aria-hidden />
        </span>
        <h2 className="text-base font-bold text-ink">Inspection Details</h2>
      </div>

      <div className="p-4 sm:p-5">
        {/* auto-fit rather than a fixed 2/3/4-up breakpoint ladder: a 2-field
            form and a 14-field form (Annex K) each get however many columns
            actually fit, instead of every annex being forced into the same
            column count regardless of how many fields it has. */}
        <div className={stacked ? 'grid gap-4' : 'grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4'}>
          {fields.map((field) => {
            // "Conducted by (Name / Position)" is one field on the approved form
            // and stays one field in the record — but it is two answers, and the
            // position half is a post with a fixed name. Two keys carry it
            // (conductedBy, conductedByNamePosition), so it is found by its label.
            const composed = isConductedBy(field);
            const Wrapper = composed ? 'div' : 'label';
            const Icon = fieldIcon(field);
            // A radio field's 2-4 option pills wrap onto as many rows as they
            // need, not a single line like Date/Text. Left in the same ~220px
            // auto-fit column as those neighbors, that has too little room:
            // pills stack one per row and tower over the short fields beside
            // them. Same fix as the composed name/title pair below — give it
            // the width its content needs so the pills sit two-plus to a row.
            const wide = composed || field.type === 'radio';
            return (
              // The name/title pair needs real width to keep the position title
              // ("Electrical Maintenance Technician", "Civil Engineering
              // Consultant"...) from truncating in its half of the control — a
              // single grid cell is too narrow once the header runs several-up.
              <Wrapper key={field.key} className={wide ? 'block sm:col-span-2' : 'block'}>
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
                  // Wraps into a row of pills rather than stacking full-width —
                  // a 2-4 option field (Inspection Type, Quarter…) otherwise
                  // towers over the single-line Date/Text fields beside it.
                  <div className="flex flex-wrap gap-2">
                    {(field.options ?? []).map((opt) => {
                      const checked = header[field.key] === opt.value;
                      return (
                        <label
                          key={opt.value}
                          className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 py-2.5 text-sm font-medium transition-colors ${
                            checked
                              ? 'border-primary bg-primary/5 text-ink'
                              : 'border-line/20 text-ink hover:border-primary/40'
                          } ${disabled ? 'cursor-default opacity-70' : ''}`}
                        >
                          <input
                            type="radio"
                            name={field.key}
                            disabled={disabled}
                            checked={checked}
                            onChange={() => onChange({ [field.key]: opt.value })}
                            className="h-4 w-4 accent-primary"
                          />
                          {opt.label}
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="relative">
                    {/* Date/time inputs already carry their own meaning — the
                        native picker icon and the value text say what the
                        field is — so our icon here only crowds against them,
                        worst on a narrow tablet column. Every other field
                        type keeps it: it's the only cue of what the field is
                        before anything has been typed into it. */}
                    {field.type !== 'date' && field.type !== 'time' && <FieldIcon Icon={Icon} />}
                    <input
                      type={INPUT_TYPES[field.type] ?? 'text'}
                      disabled={disabled}
                      value={header[field.key] ?? ''}
                      onChange={(e) => onChange({ [field.key]: e.target.value })}
                      className={`min-h-10 w-full rounded border border-line/20 bg-surface py-2 pr-3 text-sm text-ink read-only:bg-stripe ${
                        field.type === 'date' || field.type === 'time' ? 'pl-3' : 'pl-9'
                      }`}
                    />
                  </div>
                )}
              </Wrapper>
            );
          })}
        </div>
      </div>

      <div className="flex items-start justify-between gap-3 rounded-b-md border-t border-line/10 bg-stripe px-4 py-3 sm:px-5">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <div>
            <p className="text-xs font-semibold text-ink">All fields marked with * are required.</p>
            <p className="text-xs text-muted">Please ensure all information is accurate before proceeding.</p>
          </div>
        </div>
        <ShieldCheck className="h-5 w-5 shrink-0 text-ink/15" aria-hidden />
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

  const titleOptions = useMemo(
    () => [
      { value: '', label: 'Select a title…', Icon: Briefcase },
      ...titles.map((title) => ({ value: title, label: title, Icon: Briefcase })),
    ],
    [titles],
  );

  return (
    // A name ("Glenrick Spain") is reliably shorter than the longest approved
    // titles ("Electrical Maintenance Technician", "Civil Engineering
    // Consultant"), so the pair splits unevenly rather than 50/50 — an equal
    // split still truncated the longest titles even after the wrapper above
    // was widened to span two header columns.
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)]">
      <div className="relative">
        <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="text"
          aria-label="Conducted by — name"
          placeholder="Name"
          disabled={disabled}
          value={parts.name}
          onChange={(e) => commit({ ...parts, name: e.target.value })}
          className="min-h-10 w-full rounded border border-line/20 bg-surface py-2 pl-9 pr-3 text-sm text-ink read-only:bg-stripe"
        />
      </div>
      <Select
        label="Conducted by — title"
        value={parts.title}
        onChange={(title) => commit({ ...parts, title })}
        options={titleOptions}
        disabled={disabled}
        className="w-full"
      />
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
                  : 'border-line/20 bg-surface text-ink hover:border-primary hover:text-primary'
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
