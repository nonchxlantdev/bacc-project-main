import { getRepos } from '../data/repositories/index.js';
import { airportYmd } from './belizeTime.js';
import { emptyHeaderState, emptyItemState } from './checklistSchema.js';
import { buildDraftRecord, persistSubmission } from './submissions.js';
import { getTemplate } from './templates.js';

/**
 * Open a new draft against an approved template and return its id.
 *
 * Both places that start an inspection — the catalogue and the picker — went
 * through their own copy of this, which meant the header defaults could drift
 * between them. The inspection date comes from the demo clock rather than the
 * browser so an advanced clock produces consistent records.
 */
export async function startInspection({ templateId, user, displayName, position }) {
  const template = await getTemplate(templateId);
  const clock = await getRepos().instances.getClock();
  const record = buildDraftRecord({
    template,
    user,
    header: emptyHeaderState(template.schema, {
      date: airportYmd(clock.nowMs),
      inspectionType: 'monthly_routine',
      conductedBy: [displayName, position].filter(Boolean).join(' / '),
    }),
    items: emptyItemState(template.schema),
    deficiencies_summary: '',
  });
  await persistSubmission(record);
  return record.id;
}
