import { getRepos } from '../data/repositories/index.js';
import { isSupabaseConfigured, supabase } from './supabase.js';
import { getPhotoRecord } from '../utils/offlineQueue.js';
import { getRegistryEntry } from '../data/templates/registry.js';

export function newSubmissionId() {
  return crypto.randomUUID();
}

export function buildDraftRecord({ template, user, header, items, deficiencies_summary }) {
  const now = new Date().toISOString();
  return {
    id: newSubmissionId(),
    template_id: template.id,
    template_code: template.code,
    template_version: template.version || 'ed01',
    print_template_key: template.print_template_key || template.field_map?.templateKey,
    schema: template.schema || template.content_schema,
    field_map: template.field_map,
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
    locked: false,
    supersedes_id: null,
    pending_sync: false,
    created_at: now,
    submitted_at: null,
    updatedAt: now,
  };
}

export async function listMineSubmissions(userId) {
  return getRepos().checklists.listMine(userId);
}

/**
 * Every submission on file. The catalogue uses this for "last completed" —
 * that question means "when was this form last filed at PGIA", not "when did I
 * last file it", and a date alone discloses nothing about the inspection.
 */
export async function listAllSubmissions() {
  return getRepos().checklists.listAll();
}

export async function getSubmission(id) {
  return getRepos().checklists.get(id);
}

export async function persistSubmission(record) {
  return getRepos().checklists.persist(record);
}

/** Amend one item's result on a submitted record. See checklistSync.js. */
export async function amendItemResult(payload) {
  return getRepos().checklists.amendItemResult(payload);
}

/**
 * Start a correction: a NEW draft that supersedes a submitted record.
 *
 * §11 keeps the original on file untouched, which means the copy must not
 * share any mutable structure with it — a shallow spread handed the draft the
 * same `items` and `header` objects, so typing in the correction silently
 * edited the submitted record in memory.
 */
export function createCorrection(original, user) {
  if (!original?.locked) return null;
  return {
    ...structuredClone(original),
    id: newSubmissionId(),
    status: 'draft',
    locked: false,
    submitted_at: null,
    exported_pdf_path: null,
    supersedes_id: original.id,
    inspector_id: user?.id ?? original.inspector_id,
    created_at: new Date().toISOString(),
    pending_sync: false,
  };
}

export function isDeletableDraft(record) {
  return record?.status === 'draft' && !record?.locked;
}

export async function deleteDraft(record) {
  return getRepos().checklists.deleteDraft(record);
}

export async function acknowledgeSubmission(payload) {
  return getRepos().checklists.acknowledge(payload);
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
  const local = await getSubmission(payload.submissionId);
  if (local?.items?.[payload.itemCode]) {
    local.items[payload.itemCode].photo_url = result.url || result.path;
    await persistSubmission(local);
  }
}

export const queueHandlers = {
  upsert_submission: async (payload) => getRepos().checklists.persist(payload),
  upload_photo: syncQueuedPhoto,
  delete_submission: async ({ id }) => {
    const rec = await getSubmission(id);
    if (rec) await deleteDraft(rec);
  },
};

/**
 * Re-pin an UNSUBMITTED draft to the current approved template.
 *
 * Every submission carries a snapshot of the schema and field map it was filled
 * against — that is what makes an export reproducible years later, and BACC §11
 * requires a submitted record to keep its snapshot untouched.
 *
 * A draft is not a submitted record. Leaving it on an old snapshot means a draft
 * started last week exports differently from an identical one started today, and
 * any correction to a template silently misses every draft already open. So a
 * draft — and only a draft — follows the live template.
 *
 * Returns the record unchanged when it is locked, when the template is gone, or
 * when nothing actually differs, so callers can compare by identity.
 */
export async function refreshDraftTemplate(record) {
  if (!record || record.locked || record.status !== 'draft') return record;
  const key = record.print_template_key ?? record.field_map?.templateKey;
  const entry = key ? getRegistryEntry(key) : null;
  if (!entry) return record;
  const sameSchema = JSON.stringify(entry.schema) === JSON.stringify(record.schema);
  const sameMap = JSON.stringify(entry.fieldMap) === JSON.stringify(record.field_map);
  if (sameSchema && sameMap) return record;
  return {
    ...record,
    schema: entry.schema,
    content_schema: entry.schema,
    field_map: entry.fieldMap,
    template_version: entry.version ?? record.template_version,
  };
}
