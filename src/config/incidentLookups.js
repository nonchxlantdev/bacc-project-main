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

/**
 * Default team for a person, used to prefill the Team field when someone is
 * assigned. It is only a starting point — the team select stays editable,
 * because who does the work and which team carries it are not always the same.
 */
const TEAM_BY_ROLE = {
  cec: 'cec',
  electrical_tech: 'eec',
};

export function defaultTeamFor(user) {
  return TEAM_BY_ROLE[user?.role] ?? 'maintenance';
}
