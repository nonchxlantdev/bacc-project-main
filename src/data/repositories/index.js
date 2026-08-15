import { createMockRepositories } from './mock/index.js';
import { subscribeStore } from './mock/store.js';
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

export function getRepos() {
  const source = getDataSource();
  if (cached && cachedSource === source) return cached;
  cachedSource = source;
  cached = source === 'supabase' ? createSupabaseRepositories() : createMockRepositories();
  return cached;
}

export function resetRepos() {
  cached = null;
  cachedSource = null;
}

export function subscribeData(fn) {
  if (getDataSource() !== 'mock') return () => {};
  return subscribeStore(fn);
}
