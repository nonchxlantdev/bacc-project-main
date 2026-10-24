import { createSupabaseRepositories } from './supabase/index.js';
import { loadWithReload } from '../../lib/lazyWithReload.js';

export function getDataSource() {
  const env =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DATA_SOURCE) ||
    (typeof process !== 'undefined' && process.env?.VITE_DATA_SOURCE) ||
    'mock';
  if (env === 'supabase' || env === 'd1') return env;
  return 'mock';
}

let cached = null;
let cachedSource = null;
let mockModule = null;
let d1Module = null;

/**
 * Production (Supabase) and d1 mode never load the mock store / seed catalogue.
 * Mock mode loads that chunk once via prepareRepos() before render.
 */
export async function prepareRepos() {
  if (getDataSource() === 'mock' && !mockModule) {
    mockModule = await loadWithReload('repos-mock', () => import('./mock/index.js'));
  }
  // d1 mode reads templates from the bundled registry (a large chunk), so it
  // loads on demand too and Supabase production never pays for it.
  if (getDataSource() === 'd1' && !d1Module) {
    d1Module = await loadWithReload('repos-d1', () => import('./d1/index.js'));
  }
  getRepos();
}

export function getRepos() {
  const source = getDataSource();
  if (cached && cachedSource === source) return cached;
  cachedSource = source;
  if (source === 'supabase') {
    cached = createSupabaseRepositories();
    return cached;
  }
  if (source === 'd1') {
    if (!d1Module) throw new Error('D1 repositories are not ready. Await prepareRepos() before render.');
    cached = d1Module.createD1Repositories();
    return cached;
  }
  if (!mockModule) {
    throw new Error('Mock repositories are not ready. Await prepareRepos() before render.');
  }
  cached = mockModule.createMockRepositories();
  return cached;
}

export function resetRepos() {
  cached = null;
  cachedSource = null;
}

export function subscribeData(fn) {
  if (getDataSource() !== 'mock') return () => {};
  if (!mockModule?.subscribeStore) return () => {};
  return mockModule.subscribeStore(fn);
}
