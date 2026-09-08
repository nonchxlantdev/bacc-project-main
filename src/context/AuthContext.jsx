import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getRepos } from '../data/repositories/index.js';
import { isLiveSupabase, isSupabaseConfigured, supabase } from '../lib/supabase.js';

const AuthContext = createContext(null);
const AUTH_KEY = 'bacc-local-auth';

function toSessionUser(profile) {
  return {
    id: profile.id,
    email: profile.email,
    profile,
  };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [demoUsers, setDemoUsers] = useState([]);
  const live = isLiveSupabase();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const repos = getRepos();
      // Sign-in roster only. The full user directory is wider — seeded history
      // references people who are not sign-in accounts.
      const users = await (repos.users.listLogins?.() ?? repos.users.list()).catch(() => []);
      if (!cancelled) setDemoUsers(users);

      if (!live || !supabase) {
        const cached = sessionStorage.getItem(AUTH_KEY);
        if (cached) {
          const found = users.find((u) => u.id === cached || u.email === cached) ?? users[0];
          if (found) {
            setSession({ user: toSessionUser(found) });
            setProfile(found);
          }
        }
        setLoading(false);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(data.session ?? null);
      if (data.session?.user) {
        const nextProfile = await fetchProfile(data.session.user);
        if (!cancelled) setProfile(nextProfile);
      }
      setLoading(false);

      const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
        setSession(nextSession);
        if (nextSession?.user) setProfile(await fetchProfile(nextSession.user));
        else setProfile(null);
      });
      return () => listener.subscription.unsubscribe();
    }

    const cleanupPromise = load();
    return () => {
      cancelled = true;
      cleanupPromise?.then?.((fn) => fn?.());
    };
  }, [live]);

  const value = useMemo(() => {
    const user = session?.user ?? null;

    async function signIn(email, password) {
      setError(null);
      if (!live || !supabase) {
        const repos = getRepos();
        const key = String(email || '').trim().toLowerCase();
        // Only the two demo accounts may sign in. Typing anyone else's address
        // must not grant their permissions.
        const allowed = demoUsers.find((row) => row.email.toLowerCase() === key);
        if (key && demoUsers.length && !allowed) {
          const message = 'That address is not a demo sign-in account. Pick one of the accounts above.';
          setError(message);
          throw new Error(message);
        }
        const profileRow = allowed ?? (await repos.users.getByEmail(email)) ?? demoUsers[0];
        if (!profileRow) throw new Error('No demo users in seed');
        sessionStorage.setItem(AUTH_KEY, profileRow.id);
        setSession({ user: toSessionUser(profileRow) });
        setProfile(profileRow);
        return { user: toSessionUser(profileRow) };
      }
      const { data, error: signError } = await supabase.auth.signInWithPassword({ email, password });
      if (signError) {
        setError(signError.message);
        throw signError;
      }
      return data;
    }

    async function signOut() {
      if (!live || !supabase) {
        sessionStorage.removeItem(AUTH_KEY);
        setSession(null);
        setProfile(null);
        return;
      }
      await supabase.auth.signOut();
    }

    async function updateProfile(patch) {
      if (!user) return;
      if (!live || !supabase) {
        const repos = getRepos();
        const next = { ...profile, ...patch };
        if (repos.users.update) {
          await repos.users.update(user.id, patch);
        }
        setProfile(next);
        setSession((prev) =>
          prev?.user ? { ...prev, user: toSessionUser({ ...next, email: next.email ?? profile?.email }) } : prev,
        );
        return next;
      }

      // Prefer repository path (handles profile_signatures correctly).
      const repos = getRepos();
      const {
        role: _role,
        is_approver: _approver,
        is_active: _active,
        can_login: _login,
        id: _id,
        ...safePatch
      } = patch;

      if (repos.users.update) {
        const next = await repos.users.update(user.id, safePatch);
        setProfile((prev) => ({ ...prev, ...next }));
        return next;
      }

      const {
        stored_signature_data_uri,
        stored_signature_updated_at,
        hide_signature_prompt,
        ...profilePatch
      } = safePatch;

      if (Object.keys(profilePatch).length) {
        const { data, error: updateError } = await supabase
          .from('profiles')
          .update(profilePatch)
          .eq('id', user.id)
          .select('id, email, full_name, position, role, department, is_active, is_approver, can_login')
          .single();
        if (updateError) throw updateError;
        setProfile((prev) => ({ ...prev, ...data }));
      }

      if (
        stored_signature_data_uri !== undefined ||
        hide_signature_prompt !== undefined ||
        stored_signature_updated_at !== undefined
      ) {
        const sigRow = {
          user_id: user.id,
          ...(stored_signature_data_uri !== undefined
            ? { stored_signature_data_uri }
            : {}),
          ...(hide_signature_prompt !== undefined
            ? { hide_signature_prompt: Boolean(hide_signature_prompt) }
            : {}),
          stored_signature_updated_at:
            stored_signature_updated_at ??
            (stored_signature_data_uri ? new Date().toISOString() : undefined),
        };
        Object.keys(sigRow).forEach((k) => sigRow[k] === undefined && delete sigRow[k]);
        const { error: sigError } = await supabase
          .from('profile_signatures')
          .upsert(sigRow, { onConflict: 'user_id' });
        if (sigError) throw sigError;
        setProfile((prev) => ({
          ...prev,
          ...sigRow,
          user_id: undefined,
        }));
      }

      return profile;
    }

    return {
      user,
      profile,
      loading,
      error,
      // Login UI: demo picker when not on live Supabase, even if keys are present.
      configured: live,
      keysPresent: isSupabaseConfigured,
      demoUsers,
      signIn,
      signOut,
      updateProfile,
      displayName: profile?.full_name || user?.email || 'Inspector',
      position: profile?.position || 'Inspector',
    };
  }, [session, profile, loading, error, demoUsers, live]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

async function fetchProfile(user) {
  // Role must come from profiles (server-assigned). Never trust user_metadata.role —
  // signup metadata is client-controlled and was an escalation vector.
  const fallback = {
    id: user.id,
    email: user.email,
    full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Inspector',
    position: user.user_metadata?.position || 'Inspector',
    role: 'inspector',
    department: user.user_metadata?.department || 'Maintenance',
    has_ever_signed: false,
  };
  if (!supabase) return fallback;
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, position, role, department, is_active, is_approver, can_login, has_ever_signed')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) return fallback;

  let stored_signature_data_uri = null;
  let stored_signature_updated_at = null;
  let hide_signature_prompt = false;
  try {
    const { data: sig } = await supabase
      .from('profile_signatures')
      .select('stored_signature_data_uri, stored_signature_updated_at, hide_signature_prompt')
      .eq('user_id', user.id)
      .maybeSingle();
    stored_signature_data_uri = sig?.stored_signature_data_uri ?? null;
    stored_signature_updated_at = sig?.stored_signature_updated_at ?? null;
    hide_signature_prompt = Boolean(sig?.hide_signature_prompt);
  } catch {
    // Table may not exist until migration 010 is applied.
  }

  return {
    ...profile,
    has_ever_signed: Boolean(profile.has_ever_signed),
    stored_signature_data_uri,
    stored_signature_updated_at,
    hide_signature_prompt,
  };
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
