/**
 * Checklist template JSON shape.
 *
 * Content schema drives the interactive UI; a separate field map drives overlay export.
 * Annex D lives at `src/data/checklists/annex-d-drainage.json`. Future forms add JSON +
 * a field map + a base PDF — no engine changes, no hardcoded questions.
 *
 * @typedef {Object} HeaderFieldOption
 * @property {string} value
 * @property {string} label
 *
 * @typedef {Object} HeaderField
 * @property {string} key
 * @property {string} label
 * @property {'date'|'text'|'radio'|'number'} type
 * @property {boolean} [required]
 * @property {HeaderFieldOption[]} [options]
 *
 * @typedef {Object} ChecklistItemDef
 * @property {string} code          e.g. "DR-04"
 * @property {string} text          item wording — use verbatim from source
 *
 * @typedef {Object} ChecklistSection
 * @property {string} title         e.g. "SECTION 1 — RUNWAY DRAINAGE"
 * @property {ChecklistItemDef[]} items
 *
 * @typedef {Object} SignoffDef
 * @property {'inspector'|'om_acknowledgment'} role
 * @property {string} label
 * @property {string} [dateLabel]
 *
 * @typedef {Object} ChecklistTemplateSchema
 * @property {string} code                 form number, e.g. "PGIA-PMM-F04"
 * @property {string} annexLabel           e.g. "Annex D"
 * @property {string} title
 * @property {string} [description]
 * @property {{ line1: string, line2: string, pageRef: string }} [manualHeader]
 * @property {{ reviewLine: string, dateLine: string, pages: number[] }} [footer]
 * @property {HeaderField[]} headerFields
 * @property {ChecklistSection[]} sections
 * @property {{ label: string, type: string }} [deficienciesField]
 * @property {SignoffDef[]} [signoffs]
 * @property {string[]} [validationRules]
 * @property {string[]} [notes]
 */

export const PRINT_TEMPLATE_KEYS = {
  ANNEX_D_DRAINAGE: 'annex-d-drainage',
};

export const INSPECTION_TYPES = [
  { value: 'monthly_routine', label: 'Monthly Routine' },
  { value: 'semi_annual_cec', label: 'Semi-Annual Structural (CEC)' },
  { value: 'post_storm_emergency', label: 'Post-Storm Emergency' },
];

export function flattenItems(schema) {
  return (schema?.sections ?? []).flatMap((section) =>
    (section.items ?? []).map((item) => ({
      ...item,
      sectionTitle: section.title,
    })),
  );
}

export function emptyItemState(schema) {
  const items = {};
  for (const item of flattenItems(schema)) {
    items[item.code] = { result: 'sat', remarks: '', photo_url: null, photo_local_id: null };
  }
  return items;
}

export function emptyHeaderState(schema, defaults = {}) {
  const header = {};
  for (const field of schema?.headerFields ?? []) {
    header[field.key] = defaults[field.key] ?? '';
  }
  return header;
}

/**
 * Any item marked no_sat must have non-empty remarks before submit.
 * Returns the item codes that still need remarks.
 */
export function unresolvedNoSatCodes(schema, items) {
  return flattenItems(schema)
    .filter((item) => {
      const row = items?.[item.code];
      return row?.result === 'no_sat' && !String(row.remarks ?? '').trim();
    })
    .map((item) => item.code);
}

export function missingRequiredHeaderKeys(schema, header) {
  return (schema?.headerFields ?? [])
    .filter((field) => field.required && !String(header?.[field.key] ?? '').trim())
    .map((field) => field.key);
}

export function countResults(items) {
  const values = Object.values(items ?? {});
  return {
    sat: values.filter((row) => row.result === 'sat').length,
    noSat: values.filter((row) => row.result === 'no_sat').length,
    unanswered: values.filter((row) => !row.result).length,
    total: values.length,
  };
}
