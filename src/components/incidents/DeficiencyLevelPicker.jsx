import { deficiencyLevels } from '../../config/deficiencyLevels.js';

/**
 * Deficiency Level 1–4 as a single row of touch targets.
 *
 * Each pill keeps its label on one line — "Level 2" must not break across
 * rows while Level 1 and Level 3 stay inline beside it.
 */
export default function DeficiencyLevelPicker({ value, onChange, disabled, name = 'deficiency-level' }) {
  const levels = deficiencyLevels();

  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Deficiency level">
      {levels.map((lvl) => {
        const checked = Number(value) === lvl.level;
        return (
          <label
            key={lvl.level}
            className={`inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
              checked
                ? 'border-primary bg-primary/5 text-ink'
                : 'border-line/20 text-ink hover:border-primary/40'
            } ${disabled ? 'cursor-default opacity-70' : ''}`}
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              disabled={disabled}
              checked={checked}
              onChange={() => onChange(lvl.level)}
            />
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: lvl.color }} aria-hidden />
            {lvl.label}
          </label>
        );
      })}
    </div>
  );
}
