/**
 * Category and Incident Type are configurable lookups.
 * The Create Incident mockup and the Incident Management mockup disagree
 * (Infrastructure vs Drainage). Seeded from BACC-style terminology; not hardcoded
 * in forms or export. Confirm the taxonomy with BACC before go-live.
 */
export const INCIDENT_CATEGORIES = [
  { value: 'drainage', label: 'Drainage' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'pavement', label: 'Pavement' },
  { value: 'lighting', label: 'Lighting' },
  { value: 'other', label: 'Other' },
];

export const INCIDENT_TYPES = [
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'drainage', label: 'Drainage' },
  { value: 'pavement', label: 'Pavement' },
  { value: 'lighting', label: 'Lighting' },
  { value: 'other', label: 'Other' },
];

export const ASSIGNED_TEAMS = [
  { value: 'maintenance', label: 'Maintenance Personnel' },
  { value: 'cec', label: 'CEC' },
  { value: 'eec', label: 'EEC' },
];
