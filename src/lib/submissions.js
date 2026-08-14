import { isSupabaseConfigured, supabase } from './supabase.js';
import {
  enqueue,
  getLocalSubmission,
  getPhotoRecord,
  listLocalSubmissions,
  saveLocalSubmission,
} from '../utils/offlineQueue.js';
import { flattenItems } from './checklistSchema.js';

export function newSubmissionId() {
  return crypto.randomUUID();
}

export function buildDraftRecord({ template, user, header, items, deficiencies_summary }) {
  const now = new Date().toISOString();
  return {
    id: newSubmissionId(),
    template_id: template.id,
    template_code: template.code,
    print_template_key: template.print_template_key,
    schema: template.schema,
    location_id: null,
    inspector_id: user?.id ?? 'local',
    inspection_type: header.inspectionType || 'monthly_routine',
    inspection_date: header.date || now.slice(0, 10),
    rainfall_mm: header.rainfallMm === '' || header.rainfallMm == null ? null : Number(header.rainfallMm),
    status: 'draft',
    deficiencies_summary: deficiencies_summary ?? '',
    header,
    items,
    signoffs: [],
    pending_sync: true,
    created_at: now,
    submitted_at: null,
    updatedAt: now,
  };
}

export async function listMineSubmissions() {
  const local = await listLocalSubmissions();
  if (!isSupabaseConfigured || !supabase) return local;

  const { data, error } = await supabase
    .from('checklist_submissions')
    .select('*, checklist_templates(code, title, annex_label, print_template_key, schema), checklist_items(*), checklist_signoffs(*)')
    .order('created_at', { ascending: false });

  if (error) return local;

  const remote = (data ?? []).map(hydrateRemote);
  const remoteIds = new Set(remote.map((row) => row.id));
  const pendingLocal = local.filter((row) => row.pending_sync && !remoteIds.has(row.id));
  return [...pendingLocal, ...remote];
}

export async function getSubmission(id) {
  const local = await getLocalSubmission(id);
  if (local) return local;
  if (!isSupabaseConfigured || !supabase) return null;

  const { data, error } = await supabase
    .from('checklist_submissions')
    .select('*, checklist_templates(code, title, annex_label, print_template_key, schema), checklist_items(*), checklist_signoffs(*)')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  const hydrated = hydrateRemote(data);
  await saveLocalSubmission(hydrated);
  return hydrated;
}

function hydrateRemote(row) {
  const schema = row.checklist_templates?.schema;
  const items = {};
  for (const item of flattenItems(schema ?? { sections: [] })) {
    items[item.code] = { result: null, remarks: '', photo_url: null, photo_local_id: null };
  }
  for (const item of row.checklist_items ?? []) {
    items[item.item_code] = {
      result: item.result,
      remarks: item.remarks ?? '',
      photo_url: item.photo_url,
      photo_local_id: null,
    };
  }
  return {
    id: row.id,
    template_id: row.template_id,
    template_code: row.checklist_templates?.code,
    print_template_key: row.checklist_templates?.print_template_key,
    schema,
    location_id: row.location_id,
    inspector_id: row.inspector_id,
    inspection_type: row.inspection_type,
    inspection_date: row.inspection_date,
    rainfall_mm: row.rainfall_mm,
    status: row.status,
    deficiencies_summary: row.deficiencies_summary ?? '',
    header: {
      date: row.inspection_date,
      inspectionType: row.inspection_type,
      conductedBy: row.checklist_signoffs?.find((s) => s.role === 'inspector')?.name ?? '',
      rainfallMm: row.rainfall_mm ?? '',
    },
    items,
    signoffs: row.checklist_signoffs ?? [],
    pending_sync: false,
    created_at: row.created_at,
    submitted_at: row.submitted_at,
    updatedAt: row.submitted_at ?? row.created_at,
  };
}

export async function persistSubmission(record) {
  const canSyncRemote = Boolean(
    isSupabaseConfigured && supabase && isUuid(record.template_id) && isUuid(record.inspector_id),
  );
  const saved = await saveLocalSubmission({ ...record, pending_sync: canSyncRemote });
  if (!canSyncRemote) {
    return { ...saved, pending_sync: false };
  }
  if (!navigator.onLine) {
    await enqueue({ type: 'upsert_submission', payload: saved });
    return saved;
  }
  try {
    await upsertSubmissionRemote(saved);
    return saveLocalSubmission({ ...saved, pending_sync: false });
  } catch {
    await enqueue({ type: 'upsert_submission', payload: saved });
    return saved;
  }
}

export async function upsertSubmissionRemote(record) {
  if (!supabase) throw new Error('Supabase is not configured');

  const isUuidTemplate = isUuid(record.template_id);
  if (!isUuidTemplate) {
    throw new Error('Remote sync requires a seeded checklist_templates row. Apply supabase/migrations first.');
  }

  const submissionRow = {
    id: record.id,
    template_id: record.template_id,
    location_id: record.location_id,
    inspector_id: record.inspector_id,
    inspection_type: record.inspection_type || record.header?.inspectionType || 'monthly_routine',
    inspection_date: record.inspection_date || record.header?.date,
    rainfall_mm: parseRainfall(record.header?.rainfallMm ?? record.rainfall_mm),
    status: record.status,
    deficiencies_summary: record.deficiencies_summary ?? '',
    submitted_at: record.submitted_at,
  };

  const { error } = await supabase.from('checklist_submissions').upsert(submissionRow);
  if (error) throw error;

  const itemRows = Object.entries(record.items ?? {}).map(([item_code, row]) => ({
    submission_id: record.id,
    item_code,
    result: row.result,
    remarks: row.remarks || null,
    photo_url: row.photo_url || null,
  }));

  if (itemRows.length) {
    const { error: itemError } = await supabase.from('checklist_items').upsert(itemRows, {
      onConflict: 'submission_id,item_code',
    });
    if (itemError) throw itemError;
  }

  if (record.signoffs?.length) {
    const { error: signError } = await supabase.from('checklist_signoffs').upsert(
      record.signoffs.map((s) => ({
        submission_id: record.id,
        role: s.role,
        name: s.name,
        position: s.position ?? null,
        signed_at: s.signed_at,
      })),
      { onConflict: 'submission_id,role' },
    );
    if (signError) throw signError;
  }
}

export async function uploadPhoto({ userId, submissionId, itemCode, blob, contentType }) {
  const ext = (contentType || blob.type || 'image/jpeg').split('/')[1] || 'jpeg';
  const path = `${userId}/${submissionId}/${itemCode}.${ext}`;
  if (!navigator.onLine || !isSupabaseConfigured || !supabase) {
    return { url: null, path, queued: true };
  }
  const { error } = await supabase.storage.from('checklist-photos').upload(path, blob, {
    upsert: true,
    contentType: contentType || blob.type,
  });
  if (error) throw error;
  return { url: path, path, queued: false };
}

export async function resolvePhotoUrl(photoUrl) {
  if (!photoUrl) return null;
  if (photoUrl.startsWith('data:') || photoUrl.startsWith('blob:') || photoUrl.startsWith('http')) {
    return photoUrl;
  }
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from('checklist-photos').createSignedUrl(photoUrl, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function syncQueuedPhoto(payload) {
  const photo = await getPhotoRecord(payload.photo_local_id);
  if (!photo?.blob) return;
  const result = await uploadPhoto({
    userId: payload.userId,
    submissionId: payload.submissionId,
    itemCode: payload.itemCode,
    blob: photo.blob,
    contentType: photo.blob.type,
  });
  const local = await getLocalSubmission(payload.submissionId);
  if (local?.items?.[payload.itemCode]) {
    local.items[payload.itemCode].photo_url = result.url || result.path;
    await persistSubmission(local);
  }
}

function parseRainfall(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value));
}

export const queueHandlers = {
  upsert_submission: upsertSubmissionRemote,
  upload_photo: syncQueuedPhoto,
};
