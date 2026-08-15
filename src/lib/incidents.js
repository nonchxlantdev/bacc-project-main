import { getRepos } from '../data/repositories/index.js';
import { getDeficiencyLevel } from '../config/deficiencyLevels.js';

export const DESCRIPTION_MAX = 500;

export function newIncidentId() {
  return crypto.randomUUID();
}

function padSeq(n) {
  return String(n).padStart(4, '0');
}

/** UI display ID. Same sequence as noc_no. */
export function formatIncidentRef(year, seq) {
  return `INC-${year}-${padSeq(seq)}`;
}

/**
 * Register column value. BACC has not confirmed prefix vs bare number.
 * Using a padded sequence with no prefix until they decide.
 */
export function formatNocNo(_year, seq) {
  return padSeq(seq);
}

export function formatProvisionalRef(year, id) {
  return `INC-${year}-TEMP-${String(id).slice(0, 8)}`;
}

export function prefillFromChecklistItem({ item, row, record, schema, displayName }) {
  const location = String(row?.remarks ?? '').trim();
  const titleBase = item.text || item.code;
  const title = location ? `${titleBase} — ${location}` : titleBase;
  const description = location || '';
  return {
    title: title.slice(0, 180),
    description: description.slice(0, DESCRIPTION_MAX),
    location_label: location || item.text || item.code,
    source_template_code: schema?.code || record.template_code,
    source_section: item.sectionTitle,
    source_item_code: item.code,
    source_item_description: item.text,
    source_inspection_type: record.header?.inspectionType || record.inspection_type,
    source_inspection_date: record.header?.date || record.inspection_date,
    inspector_name: displayName || record.header?.conductedBy || '',
    photo_local_id: row?.photo_local_id || null,
    photo_url: row?.photo_url || null,
  };
}

async function nextLocalSeq(year) {
  const rows = await getRepos().incidents.list();
  const seqs = rows.filter((row) => row.year === year && Number.isFinite(row.seq)).map((row) => row.seq);
  return (seqs.length ? Math.max(...seqs) : 0) + 1;
}

export async function createIncidentFromChecklist({
  draft,
  user,
  profile,
  source,
}) {
  const now = new Date().toISOString();
  const year = new Date().getFullYear();
  const id = newIncidentId();
  const seq = await nextLocalSeq(year);
  const record = {
    id,
    year,
    seq,
    incident_ref: formatIncidentRef(year, seq),
    noc_no: formatNocNo(year, seq),
    submission_id: source.submissionId,
    checklist_item_id: null,
    source_template_code: draft.source_template_code,
    source_section: draft.source_section,
    source_item_code: draft.source_item_code || source.itemCode,
    source_item_description: draft.source_item_description,
    source_inspection_type: draft.source_inspection_type,
    source_inspection_date: draft.source_inspection_date,
    inspector_name: draft.inspector_name,
    title: draft.title.trim(),
    description: draft.description.trim().slice(0, DESCRIPTION_MAX),
    deficiency_level: Number(draft.deficiency_level),
    category: draft.category,
    incident_type: draft.incident_type || null,
    potential_impact: '',
    immediate_action_taken: '',
    location_label: draft.location_label.trim(),
    latitude: draft.latitude ?? null,
    longitude: draft.longitude ?? null,
    location_accuracy_m: draft.location_accuracy_m ?? null,
    location_captured_at: draft.location_captured_at ?? null,
    location_capture_method: draft.location_capture_method ?? null,
    location_user_adjusted: Boolean(draft.location_user_adjusted),
    status: 'open',
    reported_by: user?.id ?? 'local',
    reported_by_name: profile?.full_name || user?.email || 'Inspector',
    reported_at: now,
    department: profile?.department || null,
    assigned_to: null,
    assigned_team: null,
    assigned_to_name: '',
    assigned_at: null,
    target_date: defaultTargetDate(draft.deficiency_level),
    closed_at: null,
    closure_notes: '',
    reinspection_submission_id: null,
    attachments: draft.attachments ?? [],
    pending_sync: false,
    created_at: now,
  };
  return persistIncident(record);
}

function defaultTargetDate(level) {
  const cfg = getDeficiencyLevel(level);
  if (!cfg?.targetDays) return null;
  const d = new Date();
  d.setDate(d.getDate() + cfg.targetDays);
  return d.toISOString().slice(0, 10);
}

export async function persistIncident(record) {
  return getRepos().incidents.persist(record);
}

export async function listIncidents() {
  return getRepos().incidents.list();
}

export async function getIncident(id) {
  return getRepos().incidents.get(id);
}

export async function addIncidentUpdate(incident, { body, status_from, status_to, authorId, authorName }) {
  return getRepos().incidents.addUpdate(incident, {
    body,
    status_from: status_from ?? null,
    status_to: status_to ?? null,
    author_id: authorId,
    author_name: authorName,
  });
}

export async function listQualifyingReinspections(incident) {
  return getRepos().checklists.listQualifyingReinspections(incident);
}

export async function upsertIncidentRemote(record) {
  return getRepos().incidents.persist(record);
}

export async function insertIncidentUpdateRemote(update) {
  const incident = await getRepos().incidents.get(update.incident_id);
  if (!incident) return;
  return getRepos().incidents.addUpdate(incident, update);
}
