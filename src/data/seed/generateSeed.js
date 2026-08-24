/**
 * A clean environment.
 *
 * The portal seeds exactly two things: the approved forms, and the people who
 * use them. Nothing has been filed and nothing has been scheduled — no
 * submissions, no incidents, no work orders, no approvals, no occurrences, no
 * notifications and no activity. A walkthrough starts by picking a form from
 * the catalogue rather than by finding one already waiting.
 *
 * Fixed IDs so deep links never dangle.
 */
import { airportIso, airportYmd } from '../../lib/belizeTime.js';
import { TEMPLATE_REGISTRY } from '../templates/registry.js';
import { buildDirectory } from './directory.js';

// Bumped to 10: the seeded Annex D history is gone, the directory is BACC's
// real staff list, and the schedule runs forward from today. A store saved
// before this holds fictional records attributed to people who do not work at
// PGIA and must regenerate.
export const SEED_VERSION = 10;

/**
 * The demo clock is the real clock.
 *
 * This was pinned to a fixed date because six months of hand-written history
 * hung off it and had to stay reproducible. With no history the pin has nothing
 * to anchor, and it still drives every date the portal prefills — so pinning it
 * only means an inspection carries a date days before the day it was filled in.
 */
export const SEED_AS_OF = airportYmd(Date.now());

export function seedId(bucket, n) {
  const code = {
    user: '8001',
    template: '8002',
    rule: '8003',
    submission: '8004',
    incident: '8005',
    wo: '8006',
    approval: '8007',
    notif: '8008',
    instance: '8009',
    update: '8010',
    activity: '8011',
  }[bucket];
  return `00000000-0000-4000-${code}-${String(n).padStart(12, '0')}`;
}

export function generateSeed({ asOf = SEED_AS_OF } = {}) {
  // See ./directory.js — BACC's real staff plus two demo accounts.
  const users = buildDirectory(seedId);

  // Templates come from the registry, not hardcoded here — adding a form is one
  // registry entry. See src/data/templates/registry.js.
  const templates = TEMPLATE_REGISTRY.map((entry, i) => ({
    id: seedId('template', i + 1),
    code: entry.code,
    version: entry.version,
    title: entry.title,
    annex_label: entry.annexLabel,
    document_family: entry.family,
    // The folder the approved form arrived in — the team that owns it.
    group: entry.group ?? null,
    document_type: entry.documentType ?? 'checklist',
    manual: entry.manual,
    department: entry.department,
    default_frequency: entry.defaultFrequency,
    content_schema: entry.schema,
    schema: entry.schema,
    field_map: entry.fieldMap,
    base_pdf_path: entry.fieldMap.basePdf,
    print_template_key: entry.fieldMap.templateKey,
    registry_key: entry.key,
    status: 'active',
  }));
  const templateByKey = (key) => templates.find((t) => t.registry_key === key);

  let ruleSeq = 0;
  const assignment_rules = TEMPLATE_REGISTRY.flatMap((entry) => {
    const tpl = templateByKey(entry.key);
    return entry.assignments.map((a) => {
      ruleSeq += 1;
      // A real employee, or nobody. Five of these posts have no BACC account
      // yet; their rules carry a null assignee, which is the honest answer and
      // is what the Users page banner reports. Two Duty Managers hold the same
      // role, so `find` takes the first — deliberate, because the rule names
      // the post and any holder of it can pick the work up.
      const assignee = users.find((row) => row.role === a.role && !row.is_demo) ?? null;
      return {
        id: seedId('rule', ruleSeq),
        template_id: tpl.id,
        template_version: entry.version,
        department: a.department,
        role: a.role,
        frequency: a.frequency,
        assigned_user: assignee?.id ?? null,
      };
    });
  });

  return {
    seedVersion: SEED_VERSION,
    demoNow: airportIso(asOf, '12:00:00.000'),
    users,
    templates,
    assignment_rules,
    submissions: [],
    incidents: [],
    work_orders: [],
    approvals: [],
    instances: [],
    notifications: [],
    activity: [],
  };
}

export function findSeedUserByEmail(email) {
  return generateSeed().users.find((row) => row.email === email) ?? null;
}
