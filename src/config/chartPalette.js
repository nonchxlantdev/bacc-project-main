/**
 * Categorical chart hues — assigned in fixed order, never cycled.
 * Color follows the entity key, not rank. Filtering a series must not repaint survivors.
 *
 * Status colors (good/warning/serious/critical) live in tokens and are reserved for
 * SLA / overdue state. They are not used as a categorical series.
 */
import { validateCategoricalPalette } from '../lib/colorDeltaE.js';

const SURFACE = '#F3F6FA';

/** Okabe–Ito-derived categorical set (not a sequential ramp). */
export const CATEGORICAL = {
  blue: '#0072B2',
  orange: '#E69F00',
  green: '#009E73',
  vermillion: '#D55E00',
  purple: '#CC79A7',
  sky: '#56B4E9',
  grey: '#7A7A7A',
};

export const TEMPLATE_COLORS = {
  'PGIA-PMM-F04': CATEGORICAL.blue,
};

export const DEPARTMENT_COLORS = {
  Maintenance: CATEGORICAL.blue,
  Operations: CATEGORICAL.orange,
  Engineering: CATEGORICAL.purple,
};

/** Lifecycle is categorical, not SLA status. Do not use success/alert tokens here. */
export const INCIDENT_STATUS_COLORS = {
  open: CATEGORICAL.blue,
  assigned: CATEGORICAL.orange,
  in_progress: CATEGORICAL.sky,
  resolved: CATEGORICAL.purple,
  closed: CATEGORICAL.grey,
};

export const INSTANCE_STATUS_COLORS = {
  pending: CATEGORICAL.blue,
  in_progress: CATEGORICAL.sky,
  submitted: CATEGORICAL.orange,
  overdue: CATEGORICAL.vermillion,
  missed: CATEGORICAL.grey,
};

export const CHART_SURFACE = SURFACE;

const LEVEL_ORDER = [CATEGORICAL.blue, CATEGORICAL.orange, CATEGORICAL.green, CATEGORICAL.vermillion];
const SERIES_ORDER = [
  CATEGORICAL.blue,
  CATEGORICAL.orange,
  CATEGORICAL.green,
  CATEGORICAL.vermillion,
  CATEGORICAL.sky,
  CATEGORICAL.purple,
  CATEGORICAL.grey,
];

export const PALETTE_VALIDATION = validateCategoricalPalette(LEVEL_ORDER, SURFACE);
export const SERIES_PALETTE_VALIDATION = validateCategoricalPalette(SERIES_ORDER.slice(0, 4), SURFACE);

if (!PALETTE_VALIDATION.ok) {
  console.error('Deficiency-level categorical palette failed CVD validation', PALETTE_VALIDATION.failures);
}

export function colorForKey(map, key, fallback = CATEGORICAL.grey) {
  return map[key] ?? fallback;
}
