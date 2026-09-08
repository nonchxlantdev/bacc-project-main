/**
 * Lightweight template metadata — no checklist schemas or field maps.
 *
 * Import this from adapters and list pages that only need team/family labels.
 * Pulling `registry.js` instead ships ~700KB of JSON on every first load.
 *
 * Keep CODE_TO_GROUP in sync when adding a form to TEMPLATE_REGISTRY.
 */

export const GROUP_ORDER = [
  'Apron Supervisor',
  'Civil Engineer',
  'Crash Fire & Rescue',
  'Duty Manager',
  'Electrical Engineer',
  'General Checklist',
  'Operations Manager',
  'SMS',
  'Wildlife',
];

export const FAMILY_LABELS = {
  PMM: 'Maintenance Paved & Unpaved (Annex 1-1)',
  VAES: 'Visual Aids & Electrical Systems (Annex 1-2)',
  AOM: 'Aerodrome Operations Manual (Annexes 2-1)',
};

export const FREQUENCY_LABELS = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  semi_annual: 'Semi-annual',
  annual: 'Annual',
  on_demand: 'On demand',
  ad_hoc: 'Ad hoc',
};

/** Form number → catalogue team (folder the approved form arrived in). */
export const CODE_TO_GROUP = {
  'PGIA-PMM-F04': 'Duty Manager',
  'PGIA-CL-VAES-01': 'Crash Fire & Rescue',
  'PGIA-CL-VAES-02': 'Crash Fire & Rescue',
  'PGIA-CL-VAES-03': 'Crash Fire & Rescue',
  'PGIA-CL-VAES-04': 'Electrical Engineer',
  'PGIA-CL-VAES-05': 'Crash Fire & Rescue',
  'PGIA-CL-VAES-06': 'Crash Fire & Rescue',
  'PGIA-CL-VAES-07': 'Crash Fire & Rescue',
  'PGIA-CL-VAES-08': 'Crash Fire & Rescue',
  'PGIA-CL-VAES-09': 'Crash Fire & Rescue',
  'PGIA-CL-VAES-10': 'Electrical Engineer',
  'PGIA-CL-VAES-11': 'Crash Fire & Rescue',
  'PGIA-CL-VAES-12': 'Crash Fire & Rescue',
  'PGIA-CL-VAES-13': 'Crash Fire & Rescue',
  'PGIA-CL-VAES-14': 'Crash Fire & Rescue',
  'PGIA-CL-VAES-15': 'Electrical Engineer',
  'PGIA-CL-VAES-16': 'Crash Fire & Rescue',
  'PGIA-CL-VAES-17': 'Crash Fire & Rescue',
  'PGIA-CL-VAES-18': 'Crash Fire & Rescue',
  'PGIA-CL-VAES-19': 'Crash Fire & Rescue',
  'PGIA-CL-VAES-20': 'Crash Fire & Rescue',
  'PGIA-PMM-F01': 'Crash Fire & Rescue',
  'PGIA-PMM-F02': 'Apron Supervisor',
  'PGIA-PMM-F03': 'Civil Engineer',
  'PGIA-PMM-F05': 'Apron Supervisor',
  'PGIA-PMM-F06': 'Apron Supervisor',
  'PGIA-PMM-F09': 'Operations Manager',
  'PGIA-PMM-F10': 'Apron Supervisor',
  'PGIA-PMM-F11': 'General Checklist',
  'PGIA 16-14': 'General Checklist',
  'EGSO-PR-001': 'SMS',
  'PGIA-AOM-A5-06': 'Wildlife',
  'PGIA-AOM-A5-07': 'Wildlife',
  'PGIA-AOM-A5-01': 'Wildlife',
  'PGIA-AOM-A5-04': 'Wildlife',
  'PGIA-AOM-A5-08': 'Wildlife',
};

export function groupForCode(code) {
  if (!code) return null;
  return CODE_TO_GROUP[code] ?? null;
}
