import { AlertTriangle, CalendarClock, Check, ChevronRight, Clock, Plus } from 'lucide-react';

/**
 * One team's folder in the catalogue grid.
 *
 * Reads top to bottom the way someone scanning for work does: who owns it, how
 * much there is, whether anything is late, and when it was last filed.
 */
export default function TeamCard({ team, onOpen }) {
  const { Icon } = team;
  return (
    <button
      type="button"
      onClick={() => onOpen(team.name)}
      className="group flex w-full flex-col gap-3 rounded-lg border border-line/12 bg-surface p-4 text-left shadow-card transition hover:border-primary/40 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="flex items-start gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${team.tile}`}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold text-ink">{team.name}</p>
          <p className="text-xs text-muted">
            {team.count} {team.count === 1 ? 'form' : 'forms'}
          </p>
        </div>
        <ChevronRight
          className="mt-1 h-5 w-5 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-primary"
          aria-hidden
        />
      </div>

      <p className="line-clamp-2 text-[13px] leading-snug text-muted">{team.blurb}</p>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        <StatusChip overdue={team.overdue} missed={team.missed} dueSoon={team.dueSoon} />
        <span className="text-xs text-muted">
          Last completed {team.lastCompleted ?? '—'}
        </span>
      </div>
    </button>
  );
}

// Worst state wins the chip: a missed inspection outranks an overdue one,
// which outranks something merely coming up.
function StatusChip({ overdue, missed, dueSoon }) {
  if (missed > 0) {
    return (
      <Chip className="border-alert/30 bg-alert-soft text-alert" Icon={AlertTriangle}>
        {missed} missed
      </Chip>
    );
  }
  if (overdue > 0) {
    return (
      <Chip className="border-alert/30 bg-alert-soft text-alert" Icon={Clock}>
        {overdue} overdue
      </Chip>
    );
  }
  if (dueSoon > 0) {
    return (
      <Chip className="border-caution/35 bg-caution-soft text-[#8a5c14]" Icon={CalendarClock}>
        {dueSoon} due soon
      </Chip>
    );
  }
  return (
    <Chip className="border-success/30 bg-success-soft text-success" Icon={Check}>
      Up to date
    </Chip>
  );
}

function Chip({ className, Icon, children }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${className}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {children}
    </span>
  );
}

/** The dashed "start something new" tile that closes the grid. */
export function NewInspectionCard({ onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[8.5rem] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line/25 bg-surface/60 p-4 text-center text-muted transition hover:border-primary hover:bg-surface hover:text-primary disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full border border-current">
        <Plus className="h-5 w-5" aria-hidden />
      </span>
      <span className="text-sm font-semibold">Create New Inspection</span>
      <span className="text-xs">Pick any form you are permitted to open</span>
    </button>
  );
}
