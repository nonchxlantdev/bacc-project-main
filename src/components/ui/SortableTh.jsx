import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';

/**
 * Click-to-sort table headers.
 *
 * Each column declares how it should be compared, because the right order is
 * not the same for every kind of value: text sorts A–Z, a deficiency level
 * sorts 1→4, a date sorts earliest→latest. Guessing from the rendered string
 * would sort "Level 10" before "Level 2" and "Sep 1" before "Aug 20".
 *
 * Clicking a new column sorts it ascending; clicking the active column flips
 * direction. There is no third "unsorted" click — returning to the original
 * order is not something anyone asks for, and a three-state toggle makes the
 * two useful states harder to reach.
 */

/** Compare functions by column kind. All are ascending; the hook flips them. */
const COMPARATORS = {
  // localeCompare gives a real A–Z, so "Ángela" files next to "Angela".
  text: (a, b) => String(a ?? '').localeCompare(String(b ?? ''), undefined, { sensitivity: 'base' }),
  number: (a, b) => (Number(a) || 0) - (Number(b) || 0),
  // ISO dates sort correctly as strings; blanks go last in both directions so
  // "no target date" never masquerades as the most urgent row.
  date: (a, b) => String(a ?? '').localeCompare(String(b ?? '')),
};

const BLANK_LAST = new Set(['date', 'text']);

function isBlank(v) {
  return v == null || v === '';
}

/**
 * Sorting state plus the sorted rows.
 *
 * `columns` is `{ [key]: { get, kind } }` — `get(row)` returns the value to
 * compare and `kind` picks the comparator.
 */
export function useSort(rows, columns, initial = null) {
  const [sort, setSort] = useState(initial);

  const sorted = useMemo(() => {
    const column = sort && columns[sort.key];
    if (!column) return rows;
    const compare = COMPARATORS[column.kind] ?? COMPARATORS.text;
    const blankLast = BLANK_LAST.has(column.kind);
    const dir = sort.dir === 'desc' ? -1 : 1;
    return [...rows].sort((rowA, rowB) => {
      const a = column.get(rowA);
      const b = column.get(rowB);
      if (blankLast && isBlank(a) !== isBlank(b)) return isBlank(a) ? 1 : -1;
      return compare(a, b) * dir;
    });
  }, [rows, columns, sort]);

  function toggle(key) {
    setSort((current) =>
      current?.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' },
    );
  }

  return { sorted, sort, toggle };
}

/**
 * One sortable header cell. `hint` names what each direction means in words —
 * "A–Z", "1 → 4", "earliest first" — because an arrow alone does not say
 * whether up means smallest or largest.
 */
export default function SortableTh({ label, sortKey, sort, onToggle, hint, align = 'left', className = '' }) {
  const active = sort?.key === sortKey;
  const dir = active ? sort.dir : null;
  const Icon = !active ? ChevronsUpDown : dir === 'asc' ? ArrowUp : ArrowDown;

  return (
    <th
      scope="col"
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`p-0 font-semibold ${className}`}
    >
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        title={hint ? `Sort by ${label} (${hint})` : `Sort by ${label}`}
        className={`flex min-h-11 w-full items-center gap-1.5 px-4 py-2 text-left transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70 lg:min-h-0 ${
          align === 'right' ? 'justify-end' : ''
        }`}
      >
        <span>{label}</span>
        <Icon
          className={`h-3.5 w-3.5 shrink-0 transition ${active ? 'text-white' : 'text-white/40'}`}
          aria-hidden
        />
      </button>
    </th>
  );
}
