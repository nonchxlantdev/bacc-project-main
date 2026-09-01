/**
 * Shared column template for the inspection table (approved-form layout).
 *
 * The five-column grid only switches on at `xl` (1280px). Below that,
 * `ChecklistItemRow` renders a phone card (<768px) or a tablet compact row
 * (768–1279px) instead — neither can hold a 12rem remarks column without
 * sideways scrolling or 8pt text, and the SAT/NO SAT toggles need real touch
 * targets, not the table row's compact ones. `xl` rather than `lg` is
 * deliberate, not just cautious — this detail page also opens a 19rem
 * evidence panel (a sticky rail at `xl`, a bottom sheet below it — see
 * `ChecklistForm`) and the app shell pins its sidebar from `md` up (see
 * AppShell/Sidebar), so a viewport merely `lg`-and-up does not actually have
 * room left over for a five-column table once both of those are accounted
 * for; `xl` is where that combination first has genuine space.
 */
export const CHECKLIST_GRID =
  'xl:grid xl:grid-cols-[4.75rem_minmax(0,1fr)_4.5rem_5.5rem_minmax(12rem,16rem)]';
