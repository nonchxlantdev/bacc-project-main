/**
 * Profile photos.
 *
 * The `avatars` bucket (migration 018) is private — `public: false` — so
 * there is no plain public URL to hand an <img> tag. What profiles.avatar_url
 * stores is the storage PATH (`<user_id>/avatar.jpg`), never a URL, and
 * anywhere a photo is displayed asks the bucket for a signed URL at render
 * time via `useAvatarUrl`. A signed URL does eventually expire; regenerating
 * it on every mount rather than caching one for the long term sidesteps that
 * entirely, at the cost of one extra Storage round trip per view — cheap next
 * to a broken image the day an old signed URL lapsed.
 */
import { useEffect, useState } from 'react';
import { supabase } from './supabase.js';

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour — plenty for a single page view.

export function avatarPathFor(userId) {
  return `${userId}/avatar.jpg`;
}

/** Upload a compressed avatar blob, overwriting any previous one. Returns the
 * storage path to save on the profile (profiles.avatar_url) — not a URL. */
export async function uploadAvatar({ userId, blob, contentType }) {
  if (!supabase) throw new Error('Profile photos need Supabase configured.');
  const path = avatarPathFor(userId);
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, blob, { upsert: true, contentType: contentType || 'image/jpeg' });
  if (error) throw error;
  return path;
}

export async function removeAvatar(path) {
  if (!supabase || !path) return;
  await supabase.storage.from('avatars').remove([path]);
}

/** A short-lived, signed URL for a stored avatar path, or null if there is
 * none / it can't be reached (no Supabase, not signed in, path cleared). */
export async function getAvatarUrl(path) {
  if (!supabase || !path) return null;
  const { data, error } = await supabase.storage
    .from('avatars')
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Resolve a stored avatar path to a displayable URL, re-fetched whenever the
 * path changes. Every place an avatar is shown (top bar, users directory,
 * settings) uses this instead of storing or caching a URL itself. */
export function useAvatarUrl(path) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setUrl(null);
      return undefined;
    }
    getAvatarUrl(path).then((next) => {
      if (!cancelled) setUrl(next);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return url;
}
