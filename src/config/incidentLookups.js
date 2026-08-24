/**
 * Category and Incident Type are configurable lookups.
 * This slice only seeds Annex D drainage, so the demo list is drainage-only.
 * Confirm the full taxonomy with BACC before other annexes are added.
 */
export const INCIDENT_CATEGORIES = [
  { value: 'drainage', label: 'Drainage' },
  { value: 'other', label: 'Other' },
];

export const INCIDENT_TYPES = [
  { value: 'drainage', label: 'Drainage' },
  { value: 'other', label: 'Other' },
];

/**
 * Who an incident is handed to. An incident goes to a unit, never to a named
 * person: the units have no portal accounts, so there is nobody to pick.
 *
 * Fixed here rather than configurable because these are standing maintenance
 * units at the airport, not data BACC edits day to day — a unit appearing or
 * disappearing is a change to how the airport is organised. Confirm with BACC
 * whether these three are the complete set before this ships.
 */
export const ASSIGNED_UNITS = [
  { value: 'grounds', label: 'Grounds' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'plumbing', label: 'Plumbing' },
];
