import { isQualifyingReinspection, workOrderVerifiedBlockers } from '../../../lib/incidentLifecycle.js';
import {
  generatePendingInstances,
  linkSubmissionToInstance,
  refreshInstanceStatuses,
} from '../../../lib/instanceGeneration.js';
import { addAirportDays, airportYmd } from '../../../lib/belizeTime.js';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase.js';
import { groupForCode } from '../../templates/templateMeta.js';
import { createReportAggregations } from '../reportAggregations.js';

/** Fixed entity id for settings overrides stored in audit_log (no app_settings table). */
const SETTINGS_ENTITY_ID = '00000000-0000-4000-8000-0000000000a1';

/** Match api/_shared.js LIMITS.backfillDays. */
const BACKFILL_DAYS = 120;

const DEMO_UNAVAILABLE = 'Demo-only method is not available on Supabase';

function client() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  return supabase;
}

function fail(error, fallback = 'Supabase request failed') {
  const message = error?.message || fallback;
  throw new Error(message);
}

async function sb(builder) {
  const { data, error } = await builder;
  if (error) fail(error);
  return data;
}

function demoUnavailable(name) {
  return async function unavailable() {
    throw new Error(`${DEMO_UNAVAILABLE} (${name}).`);
  };
}

function nowIso() {
  return new Date().toISOString();
}

function withSourceTeam(inc) {
  return { ...inc, source_group: groupForCode(inc.source_template_code) };
}

const TEMPLATE_LIST_COLUMNS =
  'id, code, version, title, annex_label, document_family, department, status, effective_date, base_pdf_path';

function mapTemplate(row, rules = []) {
  if (!row) return null;
  const assignment_rules = rules.filter((r) => r.template_id === row.id).map(mapAssignmentRule);
  const schema =
    row.content_schema ??
    row.schema ?? {
      title: row.title,
      annexLabel: row.annex_label,
      code: row.code,
    };
  const field_map = row.field_map ?? null;
  return {
    ...row,
    schema,
    content_schema: row.content_schema ?? row.schema ?? schema,
    field_map,
    group: row.group ?? groupForCode(row.code),
    annex_label: row.annex_label ?? schema?.annexLabel ?? null,
    print_template_key: row.print_template_key || field_map?.templateKey || null,
    default_frequency: row.default_frequency ?? assignment_rules[0]?.frequency ?? null,
    assignment_rules,
  };
}

function mapAssignmentRule(row) {
  return {
    ...row,
    template_version: row.template_version || 'ed01',
    assigned_user: row.assigned_user ?? null,
  };
}

function itemsRowsToMap(rows = []) {
  const items = {};
  for (const row of rows) {
    items[row.item_code] = {
      result: row.result ?? null,
      remarks: row.remarks ?? '',
      photo_url: row.photo_url ?? null,
    };
  }
  return items;
}

function itemsMapToRows(submissionId, items = {}) {
  return Object.entries(items).map(([item_code, value]) => ({
    submission_id: submissionId,
    item_code,
    result: value?.result ?? null,
    remarks: value?.remarks ?? null,
    photo_url: value?.photo_url ?? null,
  }));
}

function mapSignoffFromDb(row) {
  return {
    role: row.role,
    name: row.name,
    position: row.position ?? null,
    signature_data_uri: row.signature_image_path ?? null,
    signature_image_path: row.signature_image_path ?? null,
    signed_at: row.signed_at,
  };
}

function mapSignoffToDb(submissionId, sg) {
  return {
    submission_id: submissionId,
    role: sg.role,
    name: sg.name || 'Signed',
    position: sg.position ?? null,
    signature_image_path: sg.signature_data_uri || sg.signature_image_path || null,
    signed_at: sg.signed_at || nowIso(),
  };
}

function reconstructHeader(sub, inspectorName) {
  const existing = sub.header && typeof sub.header === 'object' ? sub.header : {};
  return {
    ...existing,
    inspectionType: sub.inspection_type || existing.inspectionType || '',
    date: sub.inspection_date || existing.date || '',
    rainfallMm: sub.rainfall_mm ?? existing.rainfallMm ?? null,
    conductedBy: existing.conductedBy || inspectorName || '',
  };
}

async function loadAmendments(submissionId) {
  try {
    const rows =
      (await sb(
        client()
          .from('audit_log')
          .select('detail, created_at')
          .eq('entity_type', 'checklist_submission')
          .eq('entity_id', submissionId)
          .eq('action', 'amend_item')
          .order('created_at', { ascending: true }),
      )) ?? [];
    return rows
      .map((r) => r.detail)
      .filter((d) => d && typeof d === 'object' && d.item_code);
  } catch {
    return [];
  }
}

async function hydrateSubmission(row, { templatesById, profilesById, amendments } = {}) {
  if (!row) return null;
  let tpl = templatesById?.get(row.template_id) || null;
  const schemaHint = tpl?.content_schema ?? tpl?.schema;
  // Catalogue index intentionally omits heavy content_schema. Always load the
  // full template when the cached row has no sections — otherwise drafts open
  // as an empty shell with Save/Submit but no SAT items.
  if (!schemaHint?.sections?.length) {
    tpl = (await fetchTemplateById(row.template_id)) || tpl;
  }
  const itemsRows = row.checklist_items || row.items_rows || [];
  const signoffRows = row.checklist_signoffs || row.signoffs_rows || [];
  const inspector = profilesById?.get(row.inspector_id);
  const inspector_name = inspector?.full_name || null;
  const schema = tpl?.content_schema ?? tpl?.schema ?? null;
  const field_map = tpl?.field_map ?? null;
  const amend =
    amendments ??
    (await loadAmendments(row.id));
  return {
    id: row.id,
    template_id: row.template_id,
    template_code: tpl?.code || null,
    template_version: row.template_version,
    print_template_key: field_map?.templateKey || null,
    schema,
    content_schema: schema,
    field_map,
    location_id: row.location_id,
    inspector_id: row.inspector_id,
    inspector_name,
    inspection_type: row.inspection_type,
    inspection_date: row.inspection_date,
    rainfall_mm: row.rainfall_mm,
    status: row.status,
    deficiencies_summary: row.deficiencies_summary ?? '',
    exported_pdf_path: row.exported_pdf_path,
    content_hash: row.content_hash,
    supersedes_id: row.supersedes_id,
    created_at: row.created_at,
    submitted_at: row.submitted_at,
    locked: Boolean(row.locked),
    reopened_at: row.reopened_at ?? null,
    reopened_by: row.reopened_by ?? null,
    pending_sync: false,
    updatedAt: row.updated_at || row.submitted_at || row.created_at,
    header: reconstructHeader(row, inspector_name),
    items: itemsRowsToMap(itemsRows),
    signoffs: (signoffRows || []).map(mapSignoffFromDb),
    amendments: amend,
  };
}

async function fetchTemplateById(id) {
  if (!id) return null;
  const row = await sb(
    client().from('checklist_templates').select('*').eq('id', id).maybeSingle(),
  );
  return mapTemplate(row, []);
}

let templatesIndexCache = { at: 0, value: null };

async function fetchTemplatesIndex() {
  const now = Date.now();
  if (templatesIndexCache.value && now - templatesIndexCache.at < 15000) {
    return templatesIndexCache.value;
  }
  let rules = [];
  try {
    rules = (await sb(client().from('checklist_assignment_rules').select('*'))) || [];
  } catch {
    rules = [];
  }
  const templates =
    (await sb(
      client().from('checklist_templates').select(TEMPLATE_LIST_COLUMNS).eq('status', 'active').order('code'),
    )) || [];
  const mapped = templates.map((t) => mapTemplate(t, rules));
  const value = {
    list: mapped,
    byId: new Map(mapped.map((t) => [t.id, t])),
    rules: rules.map(mapAssignmentRule),
  };
  templatesIndexCache = { at: now, value };
  return value;
}

async function fetchProfilesIndex() {
  const rows = (await sb(client().from('profiles').select('*'))) || [];
  return {
    list: rows.map(mapProfile),
    byId: new Map(rows.map((r) => [r.id, mapProfile(r)])),
  };
}

function mapProfile(row, signature = null) {
  if (!row) return null;
  return {
    ...row,
    email: row.email ?? null,
    can_login: row.can_login !== false,
    is_active: row.is_active !== false,
    is_approver: Boolean(row.is_approver),
    stored_signature_data_uri:
      signature?.stored_signature_data_uri ?? row.stored_signature_data_uri ?? null,
    stored_signature_updated_at:
      signature?.stored_signature_updated_at ?? row.stored_signature_updated_at ?? null,
    hide_signature_prompt:
      signature?.hide_signature_prompt ?? row.hide_signature_prompt ?? false,
  };
}

async function attachSignatures(profiles) {
  if (!profiles.length) return profiles;
  try {
    const ids = profiles.map((p) => p.id);
    const sigs =
      (await sb(
        client()
          .from('profile_signatures')
          .select('user_id, stored_signature_data_uri, stored_signature_updated_at, hide_signature_prompt')
          .in('user_id', ids),
      )) ?? [];
    const byUser = new Map(sigs.map((s) => [s.user_id, s]));
    return profiles.map((p) => mapProfile(p, byUser.get(p.id)));
  } catch {
    return profiles.map((p) => mapProfile(p));
  }
}

async function upsertSignature(userId, patch) {
  if (
    patch.stored_signature_data_uri === undefined &&
    patch.hide_signature_prompt === undefined &&
    patch.stored_signature_updated_at === undefined
  ) {
    return;
  }
  const row = {
    user_id: userId,
    stored_signature_data_uri:
      patch.stored_signature_data_uri === undefined ? undefined : patch.stored_signature_data_uri,
    stored_signature_updated_at:
      patch.stored_signature_updated_at ??
      (patch.stored_signature_data_uri ? nowIso() : null),
    hide_signature_prompt:
      patch.hide_signature_prompt === undefined ? undefined : Boolean(patch.hide_signature_prompt),
  };
  // Drop undefined keys so upsert does not null out omitted fields unexpectedly.
  Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);
  await sb(client().from('profile_signatures').upsert(row, { onConflict: 'user_id' }));
}

const SUBMISSION_SELECT = `
  *,
  checklist_items (*),
  checklist_signoffs (*)
`;

async function fetchSubmission(id) {
  const row = await sb(
    client().from('checklist_submissions').select(SUBMISSION_SELECT).eq('id', id).maybeSingle(),
  );
  if (!row) return null;
  const { byId: templatesById } = await fetchTemplatesIndex();
  const { byId: profilesById } = await fetchProfilesIndex();
  return hydrateSubmission(row, { templatesById, profilesById });
}

async function listSubmissions() {
  let rows;
  try {
    rows =
      (await sb(
        client()
          .from('checklist_submissions')
          .select(SUBMISSION_SELECT)
          .order('created_at', { ascending: false }),
      )) ?? [];
  } catch {
    rows =
      (await sb(
        client().from('checklist_submissions').select('*').order('created_at', { ascending: false }),
      )) ?? [];
  }
  const { byId: templatesById } = await fetchTemplatesIndex();
  const { byId: profilesById } = await fetchProfilesIndex();
  return Promise.all(rows.map((row) => hydrateSubmission(row, { templatesById, profilesById })));
}

function submissionDbRow(record, { forInsert = false } = {}) {
  const row = {
    id: record.id,
    template_id: record.template_id,
    template_version: record.template_version || 'ed01',
    location_id: record.location_id ?? null,
    inspector_id: record.inspector_id,
    inspection_type: record.inspection_type || record.header?.inspectionType || 'monthly_routine',
    inspection_date: record.inspection_date || record.header?.date || airportYmd(Date.now()),
    rainfall_mm:
      record.rainfall_mm ??
      (record.header?.rainfallMm === '' || record.header?.rainfallMm == null
        ? null
        : Number(record.header.rainfallMm)),
    status: record.status || 'draft',
    deficiencies_summary: record.deficiencies_summary ?? null,
    exported_pdf_path: record.exported_pdf_path ?? null,
    content_hash: record.content_hash ?? null,
    supersedes_id: record.supersedes_id ?? null,
    locked: Boolean(record.locked),
    submitted_at: record.submitted_at ?? null,
  };
  if (forInsert && record.created_at) row.created_at = record.created_at;
  return row;
}

async function replaceSubmissionChildren(submissionId, record) {
  const itemRows = itemsMapToRows(submissionId, record.items || {});
  if (itemRows.length) {
    await sb(
      client()
        .from('checklist_items')
        .upsert(itemRows, { onConflict: 'submission_id,item_code' }),
    );
  }
  // Remove items no longer present on the draft.
  const existing =
    (await sb(
      client().from('checklist_items').select('id, item_code').eq('submission_id', submissionId),
    )) ?? [];
  const keep = new Set(Object.keys(record.items || {}));
  const drop = existing.filter((r) => !keep.has(r.item_code)).map((r) => r.id);
  if (drop.length) {
    await sb(client().from('checklist_items').delete().in('id', drop));
  }

  for (const sg of record.signoffs || []) {
    // Skip empty stubs — mapSignoffToDb would invent name "Signed" and we
    // must not persist forged secondary blocks (OM/supervisor) on every save.
    if (!sg?.role) continue;
    const hasSig = Boolean(sg.signature_data_uri || sg.signature_image_path);
    const hasName = Boolean(String(sg.name || '').trim());
    if (!hasSig && !hasName) continue;
    await sb(
      client()
        .from('checklist_signoffs')
        .upsert(mapSignoffToDb(submissionId, sg), { onConflict: 'submission_id,role' }),
    );
  }
}

async function ensureChecklistApproval(submissionId) {
  const existing = await sb(
    client()
      .from('approvals')
      .select('id')
      .eq('entity_id', submissionId)
      .eq('approval_role', 'om_acknowledgment')
      .eq('status', 'pending')
      .maybeSingle(),
  );
  if (existing) return;
  const om = await sb(
    client().from('profiles').select('id').eq('role', 'om').limit(1).maybeSingle(),
  );
  await sb(
    client().from('approvals').insert({
      entity_type: 'checklist_submission',
      entity_id: submissionId,
      approval_role: 'om_acknowledgment',
      assigned_to: om?.id ?? null,
      status: 'pending',
    }),
  );
}

async function linkInstanceForSubmission(submission) {
  const instances =
    (await sb(client().from('checklist_instances').select('*').is('submission_id', null))) ?? [];
  const linked = linkSubmissionToInstance(instances, submission);
  const changed = linked.filter((row, i) => row.submission_id && !instances[i].submission_id);
  for (const row of changed) {
    await sb(
      client()
        .from('checklist_instances')
        .update({
          submission_id: row.submission_id,
          status: 'submitted',
        })
        .eq('id', row.id),
    );
  }
}

function mapIncidentFromDb(row, { updates = [], attachments = [], extras = {} } = {}) {
  if (!row) return null;
  return withSourceTeam({
    ...row,
    assigned_unit: row.assigned_team ?? extras.assigned_unit ?? null,
    assigned_team: row.assigned_team ?? null,
    inspector_name: extras.inspector_name ?? null,
    reported_by_name: extras.reported_by_name ?? null,
    verification: extras.verification ?? null,
    updates,
    attachments,
    pending_sync: false,
  });
}

function incidentDbRow(record) {
  const isTemp = String(record.incident_ref || '').includes('TEMP');
  const row = {
    id: record.id,
    submission_id: record.submission_id ?? null,
    checklist_item_id: record.checklist_item_id ?? null,
    source_template_code: record.source_template_code ?? null,
    source_section: record.source_section ?? null,
    source_item_code: record.source_item_code ?? null,
    source_item_description: record.source_item_description ?? null,
    source_inspection_type: record.source_inspection_type ?? null,
    source_inspection_date: record.source_inspection_date ?? null,
    title: record.title,
    description: record.description,
    deficiency_level: Number(record.deficiency_level),
    category: record.category ?? null,
    incident_type: record.incident_type ?? null,
    potential_impact: record.potential_impact ?? null,
    immediate_action_taken: record.immediate_action_taken ?? null,
    location_label: record.location_label,
    location_id: record.location_id ?? null,
    latitude: record.latitude ?? null,
    longitude: record.longitude ?? null,
    location_accuracy_m: record.location_accuracy_m ?? null,
    location_captured_at: record.location_captured_at ?? null,
    location_capture_method: record.location_capture_method ?? null,
    location_user_adjusted: Boolean(record.location_user_adjusted),
    status: record.status || 'open',
    reported_by: record.reported_by,
    reported_at: record.reported_at || nowIso(),
    department: record.department ?? null,
    assigned_to: record.assigned_to ?? null,
    assigned_team: record.assigned_unit ?? record.assigned_team ?? null,
    assigned_at: record.assigned_at ?? null,
    target_date: record.target_date ?? null,
    closed_at: record.closed_at ?? null,
    closure_notes: record.closure_notes ?? null,
    reinspection_submission_id: record.reinspection_submission_id ?? null,
  };
  if (!isTemp && record.seq != null) {
    row.year = record.year;
    row.seq = record.seq;
    row.incident_ref = record.incident_ref;
    row.noc_no = record.noc_no;
  } else if (record.year != null) {
    row.year = record.year;
  }
  return row;
}

async function saveIncidentExtras(record) {
  const detail = {
    verification: record.verification ?? null,
    inspector_name: record.inspector_name ?? null,
    reported_by_name: record.reported_by_name ?? null,
    assigned_unit: record.assigned_unit ?? record.assigned_team ?? null,
  };
  await sb(
    client().from('audit_log').insert({
      entity_type: 'incident',
      entity_id: record.id,
      action: 'spa_extras',
      actor_id: record.reported_by ?? null,
      detail,
    }),
  );
}

async function loadIncidentExtras(incidentIds) {
  const map = new Map();
  if (!incidentIds.length) return map;
  try {
    const rows =
      (await sb(
        client()
          .from('audit_log')
          .select('entity_id, detail, created_at')
          .eq('entity_type', 'incident')
          .eq('action', 'spa_extras')
          .in('entity_id', incidentIds)
          .order('created_at', { ascending: true }),
      )) ?? [];
    for (const row of rows) {
      map.set(row.entity_id, row.detail || {});
    }
  } catch {
    // audit extras are best-effort
  }
  return map;
}

function mapWorkOrderFromDb(row, signoffs = []) {
  if (!row) return null;
  return {
    ...row,
    signoffs: signoffs.map((sg) => ({
      role: sg.role,
      name: sg.name,
      signature_data_uri: sg.signature_image_path ?? null,
      signature_image_path: sg.signature_image_path ?? null,
      signed_at: sg.signed_at,
    })),
    pending_sync: false,
  };
}

function workOrderDbRow(record) {
  const row = {
    id: record.id,
    incident_id: record.incident_id,
    date_issued: record.date_issued,
    issued_by: record.issued_by ?? null,
    issued_by_name: record.issued_by_name,
    assigned_to_name: record.assigned_to_name,
    assigned_to_user: record.assigned_to_user ?? null,
    noc_reference_no: record.noc_reference_no,
    deficiency_level: Number(record.deficiency_level),
    description_of_work: record.description_of_work,
    location_text: record.location_text ?? null,
    target_completion_date: record.target_completion_date ?? null,
    notam_required: record.notam_required ?? null,
    notam_ref: record.notam_ref ?? null,
    cec_clearance_required: Boolean(record.cec_clearance_required),
    date_works_completed: record.date_works_completed ?? null,
    completed_by: record.completed_by ?? null,
    description_of_work_performed: record.description_of_work_performed ?? null,
    materials_used: record.materials_used ?? null,
    test_verification_results: record.test_verification_results ?? null,
    area_cleared_for_operations: record.area_cleared_for_operations ?? null,
    area_not_cleared_explanation: record.area_not_cleared_explanation ?? null,
    cec_clearance_issued: record.cec_clearance_issued ?? null,
    cec_clearance_date: record.cec_clearance_date ?? null,
    status: record.status || 'issued',
    exported_pdf_path: record.exported_pdf_path ?? null,
    locked: Boolean(record.locked),
  };
  const num = record.work_order_number;
  if (num && !String(num).includes('TEMP')) {
    row.work_order_number = num;
  }
  return row;
}

function isApprovalForUser(row, user) {
  if (!user) return false;
  if (row.assigned_to && row.assigned_to === user.id) return true;
  // Admins exercise every approval queue for end-to-end testing.
  if (user.role === 'admin') return true;
  if (row.approval_role === 'om_acknowledgment' && (user.role === 'om' || user.role === 'coo')) return true;
  if (row.approval_role === 'om_coo_verification' && (user.role === 'om' || user.role === 'coo')) return true;
  if (row.approval_role === 'cec_clearance' && user.role === 'cec') return true;
  return false;
}

async function hydrateApproval(row) {
  if (!row) return null;
  if (row.entity_type === 'checklist_submission') {
    const sub = await fetchSubmission(row.entity_id);
    const assignee = row.assigned_to
      ? await sb(client().from('profiles').select('full_name').eq('id', row.assigned_to).maybeSingle())
      : null;
    return {
      ...row,
      entity: sub
        ? {
            title: sub.schema?.title || sub.template_code,
            annex_label: sub.schema?.annexLabel || null,
            code: sub.template_code,
            group: groupForCode(sub.template_code),
            department: sub.schema?.department ?? null,
            filed_by: sub.inspector_name || null,
            date: sub.inspection_date,
            href: `/checklists/${sub.id}`,
            status: sub.status,
          }
        : null,
      assigned_to_name: assignee?.full_name ?? null,
    };
  }
  const wo = await sb(
    client().from('work_orders').select('*').eq('id', row.entity_id).maybeSingle(),
  );
  const inc = wo
    ? await sb(client().from('incidents').select('incident_ref').eq('id', wo.incident_id).maybeSingle())
    : null;
  return {
    ...row,
    entity: wo
      ? {
          title: wo.work_order_number,
          date: wo.date_issued,
          href: `/incidents/${wo.incident_id}?tab=work-orders&wo=${wo.id}`,
          status: wo.status,
          incident_ref: inc?.incident_ref,
        }
      : null,
  };
}

async function loadSettingsOverrides() {
  try {
    const rows =
      (await sb(
        client()
          .from('audit_log')
          .select('detail, created_at')
          .eq('entity_type', 'app_settings')
          .eq('entity_id', SETTINGS_ENTITY_ID)
          .order('created_at', { ascending: true }),
      )) ?? [];
    const overrides = {};
    for (const row of rows) {
      const d = row.detail || {};
      if (d.action === 'reset' && d.section) {
        delete overrides[d.section];
      } else if (d.section) {
        overrides[d.section] = d.to;
      } else if (d.overrides && typeof d.overrides === 'object') {
        Object.assign(overrides, d.overrides);
      }
    }
    return overrides;
  } catch (err) {
    // No settings table and audit may be restricted — defaults still boot the app.
    console.warn('settings.get via audit_log failed:', err?.message || err);
    return {};
  }
}

async function appendSettingsAudit({ section, action, from, to, actor }) {
  await sb(
    client().from('audit_log').insert({
      entity_type: 'app_settings',
      entity_id: SETTINGS_ENTITY_ID,
      action: action === 'reset' ? 'settings_reset' : 'settings_save',
      actor_id: actor?.id ?? null,
      detail: {
        section,
        action,
        from,
        to,
        by: actor?.id ?? null,
        by_name: actor?.full_name ?? null,
        at: nowIso(),
      },
    }),
  );
}


export function createSupabaseRepositories() {
  const reportCache = { at: 0, value: null };

  async function loadReportContext() {
    const now = Date.now();
    if (reportCache.value && now - reportCache.at < 5000) return reportCache.value;
    const [templatesIdx, profilesIdx, submissions, incidentsRaw, instancesRaw, approvals, workOrdersRaw] =
      await Promise.all([
        fetchTemplatesIndex(),
        fetchProfilesIndex(),
        listSubmissions().catch(() => []),
        sb(client().from('incidents').select('*').order('reported_at', { ascending: false })).catch(
          () => [],
        ),
        sb(client().from('checklist_instances').select('*')).catch(() => []),
        sb(client().from('approvals').select('*')).catch(() => []),
        sb(client().from('work_orders').select('*')).catch(() => []),
      ]);
    const extras = await loadIncidentExtras((incidentsRaw || []).map((i) => i.id));
    const incidents = (incidentsRaw || []).map((row) =>
      mapIncidentFromDb(row, { extras: extras.get(row.id) || {} }),
    );
    const instances = refreshInstanceStatuses(
      (instancesRaw || []).map((row) => ({
        ...row,
        completed_at: row.completed_at ?? null,
      })),
      Date.now(),
    );
    const value = {
      templates: templatesIdx.list,
      users: profilesIdx.list,
      submissions,
      incidents,
      instances,
      approvals: approvals || [],
      workOrders: (workOrdersRaw || []).map((w) => mapWorkOrderFromDb(w, [])),
    };
    reportCache.at = now;
    reportCache.value = value;
    return value;
  }

  const reports = createReportAggregations(loadReportContext);

  return {
    users: {
      async list() {
        const rows =
          (await sb(
            client()
              .from('profiles')
              .select('id, email, full_name, position, role, department, is_active, is_approver, can_login, avatar_url')
              .order('full_name'),
          )) || [];
        return rows.map((p) => mapProfile(p));
      },
      async listLogins() {
        const all = await this.list();
        const enabled = all.filter((row) => row.can_login !== false && row.is_active !== false);
        return enabled.length ? enabled : all;
      },
      async getById(id) {
        const row = await sb(client().from('profiles').select('*').eq('id', id).maybeSingle());
        if (!row) return null;
        const [mapped] = await attachSignatures([row]);
        return mapped;
      },
      async getByEmail(email) {
        const key = String(email || '').toLowerCase();
        const users = await this.list();
        return (
          users.find((row) => String(row.email || '').toLowerCase() === key) ??
          users.find((row) => row.can_login) ??
          users[0] ??
          null
        );
      },
      async update(id, patch) {
        const {
          stored_signature_data_uri,
          stored_signature_updated_at,
          hide_signature_prompt,
          role: _role,
          id: _id,
          ...profilePatch
        } = patch;
        // Never mass-assign role from the SPA update helper; persist() is the admin path.
        void _role;
        void _id;
        let updated = null;
        if (Object.keys(profilePatch).length) {
          updated = await sb(
            client().from('profiles').update(profilePatch).eq('id', id).select('*').single(),
          );
        } else {
          updated = await sb(client().from('profiles').select('*').eq('id', id).single());
        }
        await upsertSignature(id, {
          stored_signature_data_uri,
          stored_signature_updated_at,
          hide_signature_prompt,
        });
        const [mapped] = await attachSignatures([updated]);
        return mapped;
      },
      async persist(record) {
        const id = record.id || crypto.randomUUID();
        const {
          stored_signature_data_uri,
          stored_signature_updated_at,
          hide_signature_prompt,
          email,
          ...rest
        } = record;
        const profileRow = {
          id,
          full_name: rest.full_name,
          position: rest.position,
          role: rest.role,
          department: rest.department,
          location_id: rest.location_id ?? null,
        };
        // Optional columns (may exist after later seeds / migrations).
        if (email !== undefined) profileRow.email = String(email || '').toLowerCase();
        if (rest.is_active !== undefined) profileRow.is_active = rest.is_active !== false;
        if (rest.can_login !== undefined) profileRow.can_login = Boolean(rest.can_login);
        if (rest.is_approver !== undefined) profileRow.is_approver = Boolean(rest.is_approver);
        if (profileRow.is_active === false) profileRow.can_login = false;

        let saved;
        try {
          saved = await sb(
            client().from('profiles').upsert(profileRow, { onConflict: 'id' }).select('*').single(),
          );
        } catch (err) {
          // Retry without optional columns if the schema is still lean (001 only).
          const lean = {
            id,
            full_name: profileRow.full_name,
            position: profileRow.position,
            role: profileRow.role,
            department: profileRow.department,
            location_id: profileRow.location_id,
          };
          saved = await sb(
            client().from('profiles').upsert(lean, { onConflict: 'id' }).select('*').single(),
          );
          if (!saved) fail(err);
        }
        await upsertSignature(id, {
          stored_signature_data_uri,
          stored_signature_updated_at,
          hide_signature_prompt,
        });
        const [mapped] = await attachSignatures([saved]);
        return mapped;
      },
      async setActive(id, isActive) {
        try {
          const updated = await sb(
            client()
              .from('profiles')
              .update({ is_active: Boolean(isActive), can_login: Boolean(isActive) })
              .eq('id', id)
              .select('*')
              .single(),
          );
          const [mapped] = await attachSignatures([updated]);
          return mapped;
        } catch (err) {
          throw new Error(
            `profiles.is_active/can_login columns are required for setActive (${err.message})`,
          );
        }
      },
    },

    templates: {
      async list() {
        const { list } = await fetchTemplatesIndex();
        return list;
      },
      async get(idOrCode) {
        if (!idOrCode) return null;
        let row = await sb(
          client().from('checklist_templates').select('*').eq('id', idOrCode).maybeSingle(),
        );
        if (!row) {
          row = await sb(
            client().from('checklist_templates').select('*').eq('code', idOrCode).maybeSingle(),
          );
        }
        if (!row) return null;
        const { rules } = await fetchTemplatesIndex();
        return mapTemplate(row, rules);
      },
    },

    checklists: {
      async listMine(userId) {
        const rows = await listSubmissions();
        if (!userId) return rows;
        // "My Checklists" is personal — OM/admin still only see their own here.
        // Everyone else's filed work lives under All Checklists / Approvals / Reports.
        return rows.filter((row) => row.inspector_id === userId);
      },
      async listAll() {
        return listSubmissions();
      },
      async get(id) {
        return fetchSubmission(id);
      },
      async persist(record) {
        const existing = await sb(
          client()
            .from('checklist_submissions')
            .select('id, locked, status, exported_pdf_path')
            .eq('id', record.id)
            .maybeSingle(),
        );

        if (existing?.locked && existing.status !== 'draft') {
          const saved = await sb(
            client()
              .from('checklist_submissions')
              .update({
                exported_pdf_path: record.exported_pdf_path ?? existing.exported_pdf_path,
              })
              .eq('id', record.id)
              .select(SUBMISSION_SELECT)
              .single(),
          );
          return hydrateSubmission(saved);
        }

        const becomingSubmitted = record.status === 'submitted';
        const payload = submissionDbRow({
          ...record,
          locked: becomingSubmitted ? true : Boolean(record.locked),
          submitted_at: becomingSubmitted ? record.submitted_at || nowIso() : record.submitted_at,
        });

        let saved;
        if (existing) {
          saved = await sb(
            client()
              .from('checklist_submissions')
              .update(payload)
              .eq('id', record.id)
              .select(SUBMISSION_SELECT)
              .single(),
          );
        } else {
          saved = await sb(
            client()
              .from('checklist_submissions')
              .insert(payload)
              .select(SUBMISSION_SELECT)
              .single(),
          );
        }

        await replaceSubmissionChildren(saved.id, record);

        if (becomingSubmitted && existing?.status !== 'submitted') {
          await ensureChecklistApproval(saved.id);
        }

        const hydrated = await hydrateSubmission(saved);
        if (hydrated.status === 'submitted' || hydrated.status === 'acknowledged') {
          await linkInstanceForSubmission(hydrated);
        }
        return fetchSubmission(saved.id);
      },
      async amendItemResult({ id, code, result, amendment, reason }) {
        const tag = amendment?.reason ?? reason;
        if (!tag) throw new Error('amendItemResult needs a reason');
        const current = await fetchSubmission(id);
        if (!current) throw new Error('Checklist not found');
        if (!current.items?.[code]) throw new Error(`Item ${code} is not on this checklist`);

        const {
          data: { user },
        } = await client().auth.getUser();
        const actorId = user?.id ?? null;

        // Mark reopen audit pair so locked-row policies/triggers can allow the correction.
        await sb(
          client()
            .from('checklist_submissions')
            .update({
              reopened_at: nowIso(),
              reopened_by: actorId,
            })
            .eq('id', id),
        );

        await sb(
          client()
            .from('checklist_items')
            .upsert(
              {
                submission_id: id,
                item_code: code,
                result,
                remarks: current.items[code].remarks ?? null,
                photo_url: current.items[code].photo_url ?? null,
              },
              { onConflict: 'submission_id,item_code' },
            ),
        );

        const rest = (current.amendments ?? []).filter(
          (a) => !(a.item_code === code && a.reason === tag),
        );
        const nextAmendments = amendment ? [...rest, amendment] : rest;

        await sb(
          client().from('audit_log').insert({
            entity_type: 'checklist_submission',
            entity_id: id,
            action: 'amend_item',
            actor_id: actorId,
            detail: amendment || { item_code: code, result, reason: tag },
          }),
        );

        // Clear prior amend audits for undo and rewrite remaining trail.
        if (!amendment) {
          // Best-effort: leave history; SPA filters by reason tag when reading.
        }

        return {
          ...current,
          items: { ...current.items, [code]: { ...current.items[code], result } },
          amendments: nextAmendments,
          reopened_at: nowIso(),
          reopened_by: actorId,
          updatedAt: nowIso(),
        };
      },
      async deleteDraft(record) {
        if (record?.status !== 'draft' || record?.locked) {
          throw new Error('Only unlocked drafts can be deleted. Submitted records stay on file.');
        }
        // RPC removes linked incidents/work orders first (FK otherwise blocks).
        const { error } = await client().rpc('delete_draft_submission', { p_id: record.id });
        if (error) fail(error, 'Could not delete that draft.');
      },
      async acknowledge({ id, name, position, signature_data_uri, actorId }) {
        const current = await fetchSubmission(id);
        if (!current) throw new Error('Checklist not found');
        if (current.status === 'draft') throw new Error('Drafts cannot be acknowledged');

        await sb(
          client()
            .from('checklist_signoffs')
            .upsert(
              mapSignoffToDb(id, {
                role: 'om_acknowledgment',
                name,
                position,
                signature_data_uri,
                signed_at: nowIso(),
              }),
              { onConflict: 'submission_id,role' },
            ),
        );

        await sb(
          client()
            .from('checklist_submissions')
            .update({ status: 'acknowledged', locked: true })
            .eq('id', id),
        );

        const appr = await sb(
          client()
            .from('approvals')
            .select('*')
            .eq('entity_id', id)
            .eq('approval_role', 'om_acknowledgment')
            .eq('status', 'pending')
            .maybeSingle(),
        );
        if (appr) {
          await sb(
            client()
              .from('approvals')
              .update({
                status: 'approved',
                decided_by: actorId,
                decided_at: nowIso(),
                signature_image_path: signature_data_uri ? 'local-signature' : null,
              })
              .eq('id', appr.id),
          );
        }

        return fetchSubmission(id);
      },
      async listQualifyingReinspections(incident) {
        const rows = await listSubmissions();
        return rows.filter((row) => isQualifyingReinspection(row, incident));
      },
    },

    incidents: {
      async list() {
        const rows =
          (await sb(
            client().from('incidents').select('*').order('reported_at', { ascending: false }),
          )) ?? [];
        const extras = await loadIncidentExtras(rows.map((r) => r.id));
        return rows.map((row) => mapIncidentFromDb(row, { extras: extras.get(row.id) || {} }));
      },
      async get(id) {
        const row = await sb(client().from('incidents').select('*').eq('id', id).maybeSingle());
        if (!row) return null;
        const [updates, attachments, extras] = await Promise.all([
          sb(
            client()
              .from('incident_updates')
              .select('*')
              .eq('incident_id', id)
              .order('created_at', { ascending: false }),
          ).catch(() => []),
          sb(client().from('incident_attachments').select('*').eq('incident_id', id)).catch(() => []),
          loadIncidentExtras([id]),
        ]);
        return mapIncidentFromDb(row, {
          updates: updates || [],
          attachments: attachments || [],
          extras: extras.get(id) || {},
        });
      },
      async persist(record) {
        const existing = await sb(
          client().from('incidents').select('id').eq('id', record.id).maybeSingle(),
        );
        const payload = incidentDbRow(record);
        let saved;
        if (existing) {
          // Do not overwrite allocated numbers on update.
          delete payload.seq;
          delete payload.year;
          delete payload.incident_ref;
          delete payload.noc_no;
          saved = await sb(
            client().from('incidents').update(payload).eq('id', record.id).select('*').single(),
          );
        } else {
          // Let DB allocate seq/ref when TEMP or missing.
          if (String(record.incident_ref || '').includes('TEMP') || record.seq == null) {
            delete payload.seq;
            delete payload.incident_ref;
            delete payload.noc_no;
          }
          saved = await sb(client().from('incidents').insert(payload).select('*').single());
        }
        await saveIncidentExtras({ ...record, id: saved.id });
        return mapIncidentFromDb(saved, {
          updates: record.updates || [],
          attachments: record.attachments || [],
          extras: {
            verification: record.verification ?? null,
            inspector_name: record.inspector_name ?? null,
            reported_by_name: record.reported_by_name ?? null,
            assigned_unit: record.assigned_unit ?? null,
          },
        });
      },
      async addUpdate(incident, update) {
        const {
          data: { user },
        } = await client().auth.getUser();
        const row = await sb(
          client()
            .from('incident_updates')
            .insert({
              incident_id: incident.id,
              author_id: update.author_id || user?.id,
              body: update.body,
              status_from: update.status_from ?? null,
              status_to: update.status_to ?? null,
            })
            .select('*')
            .single(),
        );
        return row;
      },
    },

    workOrders: {
      async listByIncident(incidentId) {
        const rows =
          (await sb(
            client()
              .from('work_orders')
              .select('*, work_order_signoffs (*)')
              .eq('incident_id', incidentId)
              .order('date_issued', { ascending: false }),
          )) ?? [];
        return rows.map((row) => mapWorkOrderFromDb(row, row.work_order_signoffs || []));
      },
      async get(id) {
        const row = await sb(
          client()
            .from('work_orders')
            .select('*, work_order_signoffs (*)')
            .eq('id', id)
            .maybeSingle(),
        );
        return row ? mapWorkOrderFromDb(row, row.work_order_signoffs || []) : null;
      },
      async persist(record) {
        if (record.status === 'verified') {
          const blockers = workOrderVerifiedBlockers(record);
          if (blockers.length) throw new Error(blockers[0]);
        }
        const existing = await sb(
          client()
            .from('work_orders')
            .select('id, locked, exported_pdf_path')
            .eq('id', record.id)
            .maybeSingle(),
        );
        if (existing?.locked) {
          const saved = await sb(
            client()
              .from('work_orders')
              .update({
                exported_pdf_path: record.exported_pdf_path ?? existing.exported_pdf_path,
              })
              .eq('id', record.id)
              .select('*, work_order_signoffs (*)')
              .single(),
          );
          return mapWorkOrderFromDb(saved, saved.work_order_signoffs || []);
        }

        const payload = workOrderDbRow(record);
        let saved;
        if (existing) {
          saved = await sb(
            client()
              .from('work_orders')
              .update(payload)
              .eq('id', record.id)
              .select('*, work_order_signoffs (*)')
              .single(),
          );
        } else {
          saved = await sb(
            client()
              .from('work_orders')
              .insert(payload)
              .select('*, work_order_signoffs (*)')
              .single(),
          );
        }

        for (const sg of record.signoffs || []) {
          await sb(
            client()
              .from('work_order_signoffs')
              .upsert(
                {
                  work_order_id: saved.id,
                  role: sg.role,
                  name: sg.name || 'Signed',
                  signature_image_path: sg.signature_data_uri || sg.signature_image_path || null,
                  signed_at: sg.signed_at || nowIso(),
                },
                { onConflict: 'work_order_id,role' },
              ),
          );
        }

        if (record.status === 'completed') {
          const pending = await sb(
            client()
              .from('approvals')
              .select('id')
              .eq('entity_id', saved.id)
              .eq('approval_role', 'om_coo_verification')
              .eq('status', 'pending')
              .maybeSingle(),
          );
          if (!pending) {
            const om = await sb(
              client().from('profiles').select('id').eq('role', 'om').limit(1).maybeSingle(),
            );
            await sb(
              client().from('approvals').insert({
                entity_type: 'work_order',
                entity_id: saved.id,
                approval_role: 'om_coo_verification',
                assigned_to: om?.id ?? null,
                status: 'pending',
              }),
            );
          }
        }

        return this.get(saved.id);
      },
    },

    approvals: {
      async listInbox(user) {
        const rows =
          (await sb(
            client()
              .from('approvals')
              .select('*')
              .eq('status', 'pending')
              .eq('entity_type', 'checklist_submission')
              .order('created_at', { ascending: false }),
          )) ?? [];
        const filtered = rows.filter((row) => isApprovalForUser(row, user));
        return Promise.all(filtered.map((row) => hydrateApproval(row)));
      },
      async get(id) {
        const row = await sb(client().from('approvals').select('*').eq('id', id).maybeSingle());
        return row ? hydrateApproval(row) : null;
      },
      async decide({ id, decision, notes, signature_data_uri, actor, name, position }) {
        const row = await sb(client().from('approvals').select('*').eq('id', id).maybeSingle());
        if (!row) throw new Error('Approval not found');

        if (decision === 'rejected') {
          await sb(
            client()
              .from('approvals')
              .update({
                status: 'rejected',
                notes: notes ?? '',
                decided_by: actor.id,
                decided_at: nowIso(),
              })
              .eq('id', id),
          );
          return hydrateApproval(
            await sb(client().from('approvals').select('*').eq('id', id).single()),
          );
        }

        if (row.entity_type === 'checklist_submission') {
          const repos = createSupabaseRepositories();
          await repos.checklists.acknowledge({
            id: row.entity_id,
            name: name || actor.full_name,
            position: position || actor.position,
            signature_data_uri,
            actorId: actor.id,
          });
        } else {
          const woRepos = createSupabaseRepositories().workOrders;
          const wo = await woRepos.get(row.entity_id);
          if (!wo) throw new Error('Work order not found');
          const signRole = row.approval_role === 'cec_clearance' ? 'cec_clearance' : 'om_coo_verification';
          const blockers = workOrderVerifiedBlockers({
            ...wo,
            status: 'verified',
            cec_clearance_issued:
              row.approval_role === 'cec_clearance' ? true : wo.cec_clearance_issued,
          });
          if (blockers.length) throw new Error(blockers.join(' '));
          const signoffs = [
            ...(wo.signoffs ?? []).filter((sg) => sg.role !== signRole),
            {
              role: signRole,
              name: name || actor.full_name,
              signature_data_uri,
              signed_at: nowIso(),
            },
          ];
          await woRepos.persist({
            ...wo,
            signoffs,
            status: 'verified',
            locked: true,
            cec_clearance_issued:
              row.approval_role === 'cec_clearance' ? true : wo.cec_clearance_issued,
          });
          await sb(
            client()
              .from('approvals')
              .update({
                status: 'approved',
                decided_by: actor.id,
                decided_at: nowIso(),
                signature_image_path: signature_data_uri ? 'local-signature' : null,
                notes: notes ?? null,
              })
              .eq('id', id),
          );
        }

        return hydrateApproval(
          await sb(client().from('approvals').select('*').eq('id', id).single()),
        );
      },
    },

    settings: {
      async get() {
        return loadSettingsOverrides();
      },
      async save({ section, value, actor }) {
        const current = await loadSettingsOverrides();
        await appendSettingsAudit({
          section,
          action: 'save',
          from: current[section] ?? null,
          to: value,
          actor,
        });
        return { ...current, [section]: value };
      },
      async resetSection({ section, actor }) {
        const current = await loadSettingsOverrides();
        if (current[section] !== undefined) {
          await appendSettingsAudit({
            section,
            action: 'reset',
            from: current[section],
            to: null,
            actor,
          });
        }
        const next = { ...current };
        delete next[section];
        return next;
      },
      async audit() {
        try {
          const rows =
            (await sb(
              client()
                .from('audit_log')
                .select('id, detail, created_at, actor_id')
                .eq('entity_type', 'app_settings')
                .eq('entity_id', SETTINGS_ENTITY_ID)
                .order('created_at', { ascending: false }),
            )) ?? [];
          return rows.map((row) => ({
            id: row.id,
            section: row.detail?.section,
            action: row.detail?.action,
            from: row.detail?.from ?? null,
            to: row.detail?.to ?? null,
            by: row.detail?.by ?? row.actor_id,
            by_name: row.detail?.by_name ?? null,
            at: row.detail?.at || row.created_at,
          }));
        } catch {
          return [];
        }
      },
    },

    instances: {
      async list() {
        try {
          const rows = (await sb(client().from('checklist_instances').select('*'))) || [];
          return refreshInstanceStatuses(rows, Date.now());
        } catch {
          return [];
        }
      },
      async generate() {
        const { rules } = await fetchTemplatesIndex();
        const existing = (await sb(client().from('checklist_instances').select('*'))) || [];
        const now = Date.now();
        const toYmd = airportYmd(now);
        const fromYmd = addAirportDays(toYmd, -BACKFILL_DAYS);
        const created = generatePendingInstances({
          rules,
          existing,
          fromYmd,
          toYmd,
          nowMs: now,
          idFactory: () => crypto.randomUUID(),
        });
        if (created.length) {
          const rows = created.map((row) => ({
            id: row.id,
            template_id: row.template_id,
            template_version: row.template_version || 'ed01',
            assignment_rule_id: row.assignment_rule_id,
            assigned_role: row.assigned_role,
            assigned_department: row.assigned_department,
            assigned_user: row.assigned_user,
            location_id: row.location_id,
            period_start: row.period_start,
            period_end: row.period_end,
            due_at: row.due_at,
            status: row.status || 'pending',
            submission_id: row.submission_id ?? null,
          }));
          await sb(
            client()
              .from('checklist_instances')
              .upsert(rows, { onConflict: 'assignment_rule_id,period_start' }),
          );
        }
        const all = (await sb(client().from('checklist_instances').select('id'))) || [];
        return { created: created.length, total: all.length };
      },
      advanceClock: demoUnavailable('instances.advanceClock'),
      async getClock() {
        // No demo clock on Supabase — use real airport-now for due-date helpers.
        return { demoNow: nowIso(), nowMs: Date.now() };
      },
      resetDemo: demoUnavailable('instances.resetDemo'),
      loadShowcase: demoUnavailable('instances.loadShowcase'),
      clearAll: demoUnavailable('instances.clearAll'),
    },

    notifications: {
      async listForUser(userId) {
        return (
          (await sb(
            client()
              .from('notifications')
              .select('*')
              .eq('recipient_id', userId)
              .order('created_at', { ascending: false }),
          )) ?? []
        );
      },
      async unreadCount(userId) {
        const rows =
          (await sb(
            client()
              .from('notifications')
              .select('id')
              .eq('recipient_id', userId)
              .is('read_at', null),
          )) ?? [];
        return rows.length;
      },
      async markRead(id) {
        await sb(
          client().from('notifications').update({ read_at: nowIso() }).eq('id', id).is('read_at', null),
        );
      },
      async markAllRead(userId) {
        await sb(
          client()
            .from('notifications')
            .update({ read_at: nowIso() })
            .eq('recipient_id', userId)
            .is('read_at', null),
        );
      },
    },

    reports,
  };
}
