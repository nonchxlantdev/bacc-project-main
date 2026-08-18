/**
 * Shared column template for the inspection table (approved-form layout).
 *
 * The five-column grid only switches on at `md`. Below that the row is a
 * stacked card — 400px cannot hold a 12rem remarks column without either
 * sideways scrolling or 8pt text, and this form gets filled on a phone.
 */
export const CHECKLIST_GRID =
  'md:grid md:grid-cols-[4.75rem_minmax(0,1fr)_4.5rem_5.5rem_minmax(12rem,16rem)]';
