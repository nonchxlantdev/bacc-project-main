import { Calendar, Check } from 'lucide-react';
import { canClearUnit, progressSteps } from '../../lib/incidentProgress.js';
import { Card } from './detailUi.jsx';

/**
 * The incident's progress as four tick boxes. Every rule lives in
 * lib/incidentProgress.js and the page's handlers; this only draws.
 */
export default function ProgressChecklist({
  incident,
  unitOptions,
  sla,
  alreadyVerified,
  confirming,
  note,
  busy,
  onUnitChange,
  onDueDateChange,
  onTick,
  onUntick,
  onNoteChange,
  onConfirmClose,
  onCancelClose,
}) {
  const steps = progressSteps(incident);
  const closed = incident.status === 'closed';
  const code = incident.source_item_code;

  return (
    <Card title="Progress">
      <ol className="space-y-3">
        {steps.map((step, i) => {
          const isFirst = step.key === 'sent';
          // Step 1 ticks itself from the unit + due date below; its own box is a readout.
          const clickable = !busy && (step.done ? step.canUntick : step.enabled && !isFirst);
          const toggle = () => {
            if (!clickable) return;
            if (step.done) onUntick(step.key);
            else onTick(step.key);
          };
          return (
            <li
              key={step.key}
              className={`rounded-md border px-3 py-2.5 ${
                step.done ? 'border-success/40 bg-success-soft/40' : 'border-line/15'
              } ${!step.enabled && !step.done ? 'opacity-50' : ''}`}
            >
              <label className={`flex min-h-11 items-center gap-3 ${clickable ? 'cursor-pointer' : 'cursor-default'}`}>
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={step.done}
                  disabled={!clickable}
                  aria-disabled={!clickable}
                  onChange={toggle}
                />
                <span
                  aria-hidden
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border-2 peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 ${
                    step.done ? 'border-success bg-success text-white' : 'border-line/30 bg-surface'
                  }`}
                >
                  {step.done && <Check size={14} />}
                </span>
                <span className="text-sm font-semibold text-ink">
                  {i + 1}. {step.label}
                </span>
              </label>

              {isFirst && (
                <div className="mt-2 space-y-3 pl-9">
                  <fieldset disabled={closed || busy} className="flex flex-wrap gap-2">
                    <legend className="sr-only">Unit</legend>
                    {unitOptions.map((opt) => {
                      const checked = incident.assigned_unit === opt.value;
                      return (
                        <label
                          key={opt.value}
                          className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm ${
                            checked ? 'border-primary bg-primary/5 font-semibold text-ink' : 'border-line/20 text-ink'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-primary"
                            checked={checked}
                            onChange={() => {
                              if (!checked) onUnitChange(opt.value);
                              else if (canClearUnit(incident)) onUnitChange(null);
                            }}
                          />
                          {opt.label}
                        </label>
                      );
                    })}
                  </fieldset>

                  <div>
                    <span className="mb-1 block text-xs text-muted">Due date</span>
                    <div className="relative">
                      <input
                        type="date"
                        disabled={closed || busy}
                        value={incident.target_date || ''}
                        onChange={(e) => onDueDateChange(e.target.value)}
                        className="min-h-11 w-full rounded border border-line/20 bg-surface px-3 pr-9 text-sm text-ink desk:min-h-10"
                      />
                      <Calendar
                        size={15}
                        aria-hidden
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
                      />
                    </div>
                    <SlaChip sla={sla} />
                  </div>
                  {!step.done && (
                    <p className="text-xs text-muted">Tick a unit and set a due date to complete this step.</p>
                  )}
                </div>
              )}

              {step.key === 'closed' && confirming && (
                <div className="mt-2 rounded-md border border-success/40 bg-success-soft/60 p-3">
                  {alreadyVerified ? (
                    <p className="text-sm font-semibold text-ink">Close this incident?</p>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-ink">Is item {code} OK now (SAT)?</p>
                      <p className="mt-0.5 text-xs text-muted">Closing marks {code} SAT on the original checklist.</p>
                      <textarea
                        rows={2}
                        value={note}
                        onChange={(e) => onNoteChange(e.target.value)}
                        placeholder="Optional note — what was checked on site"
                        className="mt-2 w-full rounded border border-line/20 bg-surface px-3 py-2 text-sm text-ink"
                      />
                    </>
                  )}
                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={onCancelClose}
                      className="min-h-11 rounded-md border border-line/20 bg-surface px-3 text-sm font-semibold text-ink hover:bg-surface-2 desk:min-h-9"
                    >
                      Not yet
                    </button>
                    <button
                      type="button"
                      onClick={onConfirmClose}
                      disabled={busy}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-success px-3 text-sm font-semibold text-white disabled:opacity-60 desk:min-h-9"
                    >
                      <Check size={14} aria-hidden /> Yes, close it
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function SlaChip({ sla }) {
  const tone =
    sla.kind === 'overdue'
      ? 'bg-alert-soft text-alert'
      : sla.kind === 'warning'
        ? 'bg-[#FDF3E2] text-[#9A6414]'
        : sla.kind === 'ok'
          ? 'bg-success-soft text-success'
          : 'bg-stripe text-muted';
  return (
    <span className={`mt-2 inline-block rounded px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {sla.kind === 'none' && 'No due date'}
      {(sla.kind === 'ok' || sla.kind === 'warning') && `${sla.remainingDays} days remaining`}
      {sla.kind === 'overdue' && `${Math.abs(sla.remainingDays)} days overdue`}
    </span>
  );
}
