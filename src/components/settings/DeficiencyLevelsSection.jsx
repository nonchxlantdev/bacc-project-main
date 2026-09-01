import { useMemo } from 'react';
import { ArrowDown, ArrowUp, HelpCircle } from 'lucide-react';
import { ChoiceCards, NumberInput, Panel, Row, TextArea, TextInput, Toggle, Note } from './settingsUi.jsx';

const SEVERITY_OPTIONS = [
  {
    value: 'one_highest',
    label: 'Level 1 is the most severe',
    hint: 'Level 1 is the most urgent, Level 4 the least. Common where Level 1 means "immediate hazard".',
  },
  {
    value: 'four_highest',
    label: 'Level 4 is the most severe',
    hint: 'Level 4 is the most urgent, Level 1 the least. Common where the number counts up with severity.',
  },
  {
    value: 'unset',
    label: 'Not decided yet',
    hint: 'The portal will not rank, colour-code by urgency, or auto-escalate by level until this is set.',
  },
];

/**
 * Deficiency Levels — BACC configuration questions A1 and A2.
 *
 * This is the section that unblocks the incident module. Until a level has a
 * target-day count, `target_date` is null and no incident counts down; until
 * the severity direction is set, nothing in the portal ranks by urgency.
 *
 * Severity direction is asked first and separately, because it is the one
 * answer that changes the meaning of every other row on the page.
 */
export default function DeficiencyLevelsSection({ draft, onChange }) {
  const { severityOrder, levels, slaWarningDays } = draft;

  // Most severe first once the direction is known, so the list reads in the
  // order someone triaging would want it. Until then, numeric order — inventing
  // a ranking is the exact mistake this setting exists to prevent.
  const ordered = useMemo(() => {
    if (severityOrder === 'four_highest') return [...levels].sort((a, b) => b.level - a.level);
    return [...levels].sort((a, b) => a.level - b.level);
  }, [levels, severityOrder]);

  const patchLevel = (level, patch) =>
    onChange({ ...draft, levels: levels.map((row) => (row.level === level ? { ...row, ...patch } : row)) });

  const unset = levels.filter((l) => l.targetDays == null).length;

  return (
    <div className="space-y-4">
      <Panel
        title="Which end of the scale is most severe?"
        description="Annex G and Annex H both record “Level (1–4)” without defining it. Nothing in the portal assumes a direction — this is the single place it is stated."
      >
        <ChoiceCards
          name="severity-order"
          value={severityOrder}
          onChange={(value) => onChange({ ...draft, severityOrder: value })}
          options={SEVERITY_OPTIONS}
        />
        {severityOrder === 'unset' && (
          <Note title="While this is undecided:">
            incidents show their level as a plain label and nothing is ranked by urgency. Getting the
            direction wrong would invert urgency, colour and alerting everywhere at once, so the
            portal waits rather than guesses.
          </Note>
        )}
      </Panel>

      <Panel
        title="What each level means"
        description="The definition appears as help text wherever someone picks a level, so an inspector on the apron sees your wording rather than a bare number."
        footer={
          <p className="flex items-center gap-2 text-xs text-muted">
            <HelpCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {unset === 0
              ? 'Every level has a response time. Incident target dates and countdowns are active.'
              : `${unset} of ${levels.length} levels have no response time yet, so incidents raised at those levels have no target date.`}
          </p>
        }
      >
        <div className="space-y-4">
          {ordered.map((row, i) => (
            <article key={row.level} className="rounded-md border border-line/15 p-4">
              <div className="mb-3 flex items-center gap-2.5">
                <span
                  className="h-8 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: row.color }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink">{row.label || `Level ${row.level}`}</p>
                  <p className="text-xs text-muted">
                    Recorded on the form as {row.level}
                    {severityOrder !== 'unset' &&
                      (i === 0 ? ' · most severe' : i === ordered.length - 1 ? ' · least severe' : '')}
                  </p>
                </div>
                {severityOrder !== 'unset' && i === 0 && (
                  <ArrowUp className="h-4 w-4 shrink-0 text-alert" aria-label="Most severe" />
                )}
                {severityOrder !== 'unset' && i === ordered.length - 1 && (
                  <ArrowDown className="h-4 w-4 shrink-0 text-muted" aria-label="Least severe" />
                )}
              </div>

              <div className="space-y-4">
                <Row
                  label="Name"
                  htmlFor={`label-${row.level}`}
                  effect="Shown wherever this level appears — incident list, exports, reports."
                >
                  <TextInput
                    id={`label-${row.level}`}
                    value={row.label}
                    onChange={(v) => patchLevel(row.level, { label: v })}
                    placeholder={`Level ${row.level}`}
                  />
                </Row>
                <Row
                  label="Definition"
                  htmlFor={`def-${row.level}`}
                  effect="Help text under the level picker when someone raises a deficiency."
                  stacked
                >
                  <TextArea
                    id={`def-${row.level}`}
                    value={row.definition}
                    onChange={(v) => patchLevel(row.level, { definition: v })}
                    placeholder="e.g. Immediate hazard to aircraft operations. Rectify or close the affected area before the next movement."
                  />
                </Row>
                <Row
                  label="Response time"
                  htmlFor={`days-${row.level}`}
                  effect="Sets the target date when a deficiency is raised at this level, and the countdown shown on the incident."
                >
                  <NumberInput
                    id={`days-${row.level}`}
                    value={row.targetDays}
                    onChange={(v) => patchLevel(row.level, { targetDays: v })}
                    suffix="days"
                    unsetLabel="No target date"
                  />
                </Row>
                <Row
                  label="Notify management"
                  effect="Alerts the Operations Manager and COO the moment a deficiency is raised at this level."
                >
                  <Toggle
                    checked={row.alerting}
                    onChange={(v) => patchLevel(row.level, { alerting: v })}
                    label={row.alerting ? 'Alerts OM and COO' : 'No alert'}
                  />
                </Row>
              </div>
            </article>
          ))}
        </div>
      </Panel>

      <Panel title="Countdown warning">
        <Row
          label="Turn the countdown amber"
          htmlFor="sla-warning"
          effect="How long before the target date an incident starts showing as approaching its deadline."
        >
          <NumberInput
            id="sla-warning"
            value={slaWarningDays}
            onChange={(v) => onChange({ ...draft, slaWarningDays: v })}
            min={0}
            suffix="days before"
          />
        </Row>
      </Panel>
    </div>
  );
}
