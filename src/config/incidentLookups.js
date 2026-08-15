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

export const ASSIGNED_TEAMS = [
  { value: 'maintenance', label: 'Maintenance Personnel' },
  { value: 'cec', label: 'CEC' },
  { value: 'eec', label: 'EEC' },
];
