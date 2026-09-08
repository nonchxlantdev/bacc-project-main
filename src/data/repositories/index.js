import { createSupabaseRepositories } from './supabase/index.js';

export function getDataSource() {
  const env =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DATA_SOURCE) ||
    (typeof process !== 'undefined' && process.env?.VITE_DATA_SOURCE) ||
    'mock';
  return env === 'supabase' ? 'supabase' : 'mock';
}

let cached = null;
let cachedSource = null;
let mockModule = null;

/**
 * Production (Supabase) never loads the mock store / seed catalogue.
 * Mock mode loads that chunk once via prepareRepos() before render.
 */
export async function prepareRepos() {
  if (getDataSource() === 'mock' && !mockModule) {
    mockModule = await import('./mock/index.js');
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
