import { openDB } from 'idb';

const DB_NAME = 'bacc-portal';
const DB_VERSION = 2;

function db() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('queue')) {
        const store = database.createObjectStore('queue', { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
        store.createIndex('type', 'type');
      }
      if (!database.objectStoreNames.contains('photos')) {
        database.createObjectStore('photos', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('submissions')) {
        const store = database.createObjectStore('submissions', { keyPath: 'id' });
        store.createIndex('status', 'status');
        store.createIndex('updatedAt', 'updatedAt');
      }
      if (!database.objectStoreNames.contains('incidents')) {
        const store = database.createObjectStore('incidents', { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
        store.createIndex('status', 'status');
      }
      if (!database.objectStoreNames.contains('work_orders')) {
        const store = database.createObjectStore('work_orders', { keyPath: 'id' });
        store.createIndex('incident_id', 'incident_id');
      }
      if (!database.objectStoreNames.contains('incident_updates')) {
        database.createObjectStore('incident_updates', { keyPath: 'id' });
      }
    },
  });
}

export async function saveLocalSubmission(record) {
  const next = { ...record, updatedAt: record.updatedAt ?? new Date().toISOString() };
  await (await db()).put('submissions', next);
  return next;
}

export async function getLocalSubmission(id) {
  return (await db()).get('submissions', id);
}

export async function deleteLocalSubmission(id) {
  const database = await db();
  const photos = await database.getAll('photos');
  for (const photo of photos) {
    if (photo.submissionId === id) await database.delete('photos', photo.id);
  }
  const jobs = await database.getAll('queue');
  for (const job of jobs) {
    const payload = job.payload ?? {};
    if (payload.id === id || payload.submissionId === id) {
      await database.delete('queue', job.id);
    }
  }
  await database.delete('submissions', id);
}

export async function listLocalSubmissions() {
  const rows = await (await db()).getAll('submissions');
  return rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function saveLocalIncident(record) {
  const next = { ...record, updatedAt: record.updatedAt ?? new Date().toISOString() };
  await (await db()).put('incidents', next);
  return next;
}

export async function getLocalIncident(id) {
  return (await db()).get('incidents', id);
}

export async function listLocalIncidents() {
  const rows = await (await db()).getAll('incidents');
  return rows.sort((a, b) => String(b.updatedAt || b.reported_at).localeCompare(String(a.updatedAt || a.reported_at)));
}

export async function saveLocalWorkOrder(record) {
  const next = { ...record, updatedAt: record.updatedAt ?? new Date().toISOString() };
  await (await db()).put('work_orders', next);
  return next;
}

export async function getLocalWorkOrder(id) {
  return (await db()).get('work_orders', id);
}

export async function listLocalWorkOrders(incidentId) {
  const rows = await (await db()).getAll('work_orders');
  const filtered = incidentId ? rows.filter((row) => row.incident_id === incidentId) : rows;
  return filtered.sort((a, b) => String(b.date_issued || '').localeCompare(String(a.date_issued || '')));
}

export async function saveLocalIncidentUpdate(record) {
  await (await db()).put('incident_updates', record);
  return record;
}

export async function listLocalIncidentUpdates(incidentId) {
  const rows = await (await db()).getAll('incident_updates');
  return rows
    .filter((row) => row.incident_id === incidentId)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

export async function putPhotoBlob(id, blob, meta = {}) {
  await (await db()).put('photos', { id, blob, ...meta, createdAt: new Date().toISOString() });
}

export async function getPhotoRecord(id) {
  return (await db()).get('photos', id);
}

export async function enqueue(job) {
  const record = {
    id: job.id ?? crypto.randomUUID(),
    type: job.type,
    payload: job.payload,
    attempts: 0,
    createdAt: new Date().toISOString(),
    lastError: null,
  };
  await (await db()).put('queue', record);
  return record;
}

export async function listQueue() {
  const rows = await (await db()).getAll('queue');
  return rows.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

export async function removeQueueItem(id) {
  await (await db()).delete('queue', id);
}

export async function bumpQueueAttempt(id, lastError) {
  const database = await db();
  const row = await database.get('queue', id);
  if (!row) return;
  await database.put('queue', {
    ...row,
    attempts: (row.attempts ?? 0) + 1,
    lastError: lastError ?? null,
  });
}

let flushing = false;
const listeners = new Set();

export function onQueueChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn();
}

/**
 * Flush pending checklist writes and photo uploads to Supabase.
 * Call on boot and on the window `online` event.
 */
export async function flushQueue(handlers) {
  if (flushing || typeof navigator !== 'undefined' && !navigator.onLine) return { flushed: 0, failed: 0 };
  flushing = true;
  let flushed = 0;
  let failed = 0;
  try {
    const jobs = await listQueue();
    for (const job of jobs) {
      try {
        const handler = handlers[job.type];
        if (!handler) throw new Error(`No handler for queue type ${job.type}`);
        await handler(job.payload);
        await removeQueueItem(job.id);
        flushed += 1;
      } catch (err) {
        failed += 1;
        await bumpQueueAttempt(job.id, err?.message ?? String(err));
      }
    }
  } finally {
    flushing = false;
    notify();
  }
  return { flushed, failed };
}

export function startOnlineFlush(handlers) {
  const run = () => {
    flushQueue(handlers).catch(() => {});
  };
  window.addEventListener('online', run);
  if (navigator.onLine) run();
  return () => window.removeEventListener('online', run);
}
