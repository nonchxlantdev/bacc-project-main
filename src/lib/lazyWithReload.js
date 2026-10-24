import { lazy } from 'react';

/**
 * A stale tab after a deploy asks for a chunk the new build no longer has.
 * Retry the import once, then reload the page once. The session flag stops a
 * second reload if the new page fails the same way.
 */

export function lazyWithReload(name, importer) {
  return lazy(() => loadWithReload(name, importer));
}

const CHUNK_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk [\d]+ failed|Loading CSS chunk|dynamically imported module/i;

export function isChunkLoadError(error) {
  const message = String(error?.message ?? error ?? '');
  return error?.name === 'ChunkLoadError' || CHUNK_ERROR.test(message);
}

export function chunkReloadKey(name) {
  return `bacc:chunk-reload:${name}`;
}

export async function loadWithReload(name, importer, { storage, reload } = {}) {
  const store = storage ?? sessionStorage;
  const key = chunkReloadKey(name);
  const refresh = reload ?? (() => location.reload());

  const attempt = () => importer();

  try {
    const loaded = await attempt();
    store.removeItem(key);
    return loaded;
  } catch (error) {
    if (!isChunkLoadError(error)) throw error;
    try {
      const loaded = await attempt();
      store.removeItem(key);
      return loaded;
    } catch (again) {
      if (!isChunkLoadError(again)) throw again;
      if (store.getItem(key)) throw again;
      store.setItem(key, '1');
      refresh();
      return new Promise(() => {});
    }
  }
}
