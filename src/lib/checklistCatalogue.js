import {
  Flame,
  HardHat,
  ClipboardList,
  FileText,
  PlaneTakeoff,
  ShieldCheck,
  Zap,
  Folder,
} from 'lucide-react';
import { GROUP_ORDER } from '../data/templates/registry.js';
import { airportMonthStartYmd, airportYmd, daysUntilDue } from './belizeTime.js';

/**
 * Catalogue maths, kept out of the components.
 *
 * The catalogue is presented as one folder per owning team — the same way BACC
 * files the approved forms — so every screen that shows forms (the All
 * Checklists grid, the New Inspection picker) needs the same three things:
 * match a search, bucket by team, and say how that team is doing. Those live
 * here so the two screens cannot drift apart.
 */

/** Fields a catalogue search looks at. Order is irrelevant; presence is not. */
const SEARCHABLE = ['code', 'title', 'annex_label', 'group', 'department', 'manual', 'document_family'];

const UNGROUPED = 'Other';

/** Icon and tile colour per team. Falls back to a neutral folder. */
const TEAM_STYLES = {
  'Apron Supervisor': { Icon: PlaneTakeoff, tile: 'bg-amber-100 text-amber-700' },
  'Civil Engineer': { Icon: HardHat, tile: 'bg-orange-100 text-orange-700' },
  'Crash Fire & Rescue': { Icon: Flame, tile: 'bg-red-100 text-red-700' },
  'Duty Manager': { Icon: ClipboardList, tile: 'bg-sky-100 text-sky-700' },
  'Electrical Engineer': { Icon: Zap, tile: 'bg-violet-100 text-violet-700' },
  'General Checklist': { Icon: FileText, tile: 'bg-slate-100 text-slate-700' },
  'Operations Manager': { Icon: ShieldCheck, tile: 'bg-teal-100 text-teal-700' },
};

const TEAM_BLURBS = {
  'Apron Supervisor': 'Apron, stand and unpaved area inspections.',
  'Civil Engineer': 'Structural and pavement oversight records.',
  'Crash Fire & Rescue': 'Airfield lighting, PAPI and safety equipment rounds.',
  'Duty Manager': 'Drainage and duty-shift routine checks.',
  'Electrical Engineer': 'Photometric, vault and engineering inspections.',
  'General Checklist': 'Plans and reference documents used across teams.',
  'Operations Manager': 'Activity logs held by Operations.',
};

export function teamStyle(name) {
  return TEAM_STYLES[name] ?? { Icon: Folder, tile: 'bg-navy/10 text-navy' };
}

export function teamBlurb(name, count) {
  return TEAM_BLURBS[name] ?? `${count} approved ${count === 1 ? 'form' : 'forms'} filed under ${name}.`;
}

/** Does this template match a free-text catalogue search? */
export function matchesQuery(template, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return SEARCHABLE.map((key) => template[key])
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}

/**
 * Apply the catalogue filters. Every filter is optional; an empty string means
 * "no opinion", which is what the `All …` option in each select submits.
 */
export function filterTemplates(templates, { query = '', family = '', group = '', frequency = '' } = {}) {
  return templates.filter((t) => {
    if (family && t.document_family !== family) return false;
    if (group && (t.group || UNGROUPED) !== group) return false;
    if (frequency && t.default_frequency !== frequency) return false;
    return matchesQuery(t, query);
  });
}

/**
 * Bucket templates by owning team, in the order the folders appear, with
 * anything ungrouped last. Returns `[name, templates][]`.
 */
export function groupTemplates(templates) {
  const byGroup = new Map();
  for (const t of templates) {
    const key = t.group || UNGROUPED;
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(t);
  }
  return [...GROUP_ORDER, UNGROUPED].filter((g) => byGroup.has(g)).map((g) => [g, byGroup.get(g)]);
}

/**
 * Latest completion date per template code.
 *
 * Two sources, because they answer the same question from different ends: a
 * filed checklist record proves the work was done, and a scheduled occurrence
 * marked submitted records that it was closed out. Using only the first left
 * every form but Annex D reading "Never" despite a full completion history.
 */
export function lastCompletedByCode(submissions, instances = [], templates = []) {
  const map = new Map();
  const keep = (code, date) => {
    if (!code || !date) return;
    const current = map.get(code);
    if (!current || date > current) map.set(code, date);
  };

  for (const row of submissions) {
    if (row.status === 'draft') continue;
    keep(row.template_code, row.inspection_date || row.header?.date);
  }

  const codeByTemplateId = new Map(templates.map((t) => [t.id, t.code]));
  for (const row of instances) {
    if (row.status !== 'submitted') continue;
    keep(codeByTemplateId.get(row.template_id), row.period_end);
  }

  return map;
}

// Overdue and missed are different states, not synonyms: an overdue inspection
// is recoverable, a missed one is a compliance gap. The scheduler separates
// them at 14 days past due, so the catalogue keeps them separate too.
const DUE_SOON_DAYS = 7;

function isDueSoon(instance, nowMs) {
  if (instance.status !== 'pending') return false;
  const days = daysUntilDue(instance.due_at, nowMs);
  return days >= 0 && days <= DUE_SOON_DAYS;
}

/**
 * One row of card data per team: how many forms it owns, when it last filed
 * one, and whether anything is late.
 *
 * `instances` are the scheduled occurrences; only those belonging to a template
 * this user can see are counted, so the card totals always add up to what the
 * drill-down actually shows.
 */
export function buildTeamSummaries({ templates, submissions = [], instances = [], nowMs = Date.now() }) {
  const lastByCode = lastCompletedByCode(submissions, instances, templates);
  const groupByTemplateId = new Map(templates.map((t) => [t.id, t.group || UNGROUPED]));

  const counts = new Map();
  for (const instance of instances) {
    const group = groupByTemplateId.get(instance.template_id);
    if (!group) continue;
    const tally = counts.get(group) ?? { overdue: 0, missed: 0, dueSoon: 0 };
    if (instance.status === 'overdue') tally.overdue += 1;
    else if (instance.status === 'missed') tally.missed += 1;
    else if (isDueSoon(instance, nowMs)) tally.dueSoon += 1;
    counts.set(group, tally);
  }

  return groupTemplates(templates).map(([name, list]) => {
    const dates = list.map((t) => lastByCode.get(t.code)).filter(Boolean);
    const tally = counts.get(name) ?? { overdue: 0, missed: 0, dueSoon: 0 };
    return {
      name,
      templates: list,
      count: list.length,
      lastCompleted: dates.length ? dates.sort().at(-1) : null,
      overdue: tally.overdue,
      missed: tally.missed,
      dueSoon: tally.dueSoon,
      blurb: teamBlurb(name, list.length),
      ...teamStyle(name),
    };
  });
}

/** The four numbers across the top of the catalogue. */
export function catalogueKpis({ templates, submissions = [], instances = [], nowMs = Date.now() }) {
  const visible = new Set(templates.map((t) => t.id));
  const monthStart = airportMonthStartYmd(airportYmd(nowMs));
  const scoped = instances.filter((i) => visible.has(i.template_id));

  return {
    total: templates.length,
    // Scheduled work closed out this month, not checklist records filed — a
    // form completed against last month's occurrence is not this month's work.
    completedThisMonth: scoped.filter(
      (i) => i.status === 'submitted' && i.period_start >= monthStart,
    ).length,
    overdue: scoped.filter((i) => i.status === 'overdue').length,
    missed: scoped.filter((i) => i.status === 'missed').length,
    dueSoon: scoped.filter((i) => isDueSoon(i, nowMs)).length,
  };
}
