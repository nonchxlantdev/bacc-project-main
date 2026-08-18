import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getRepos } from '../data/repositories/index.js';
import { isSupabaseConfigured, supabase } from '../lib/supabase.js';

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

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const repos = getRepos();
      // Sign-in roster only. The full user directory is wider — seeded history
      // references people who are not sign-in accounts.
      const users = await (repos.users.listLogins?.() ?? repos.users.list()).catch(() => []);
      if (!cancelled) setDemoUsers(users);

      if (!isSupabaseConfigured || !supabase) {
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
  }, []);

  const value = useMemo(() => {
    const user = session?.user ?? null;

    async function signIn(email, password) {
      setError(null);
      if (!isSupabaseConfigured || !supabase) {
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
      if (!isSupabaseConfigured || !supabase) {
        sessionStorage.removeItem(AUTH_KEY);
        setSession(null);
        setProfile(null);
        return;
      }
      await supabase.auth.signOut();
    }

    async function updateProfile(patch) {
      if (!user) return;
      if (!isSupabaseConfigured || !supabase) {
        const next = { ...profile, ...patch };
        setProfile(next);
        return next;
      }
      const { data, error: updateError } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', user.id)
        .select()
        .single();
      if (updateError) throw updateError;
      setProfile(data);
      return data;
    }

    return {
      user,
      profile,
      loading,
      error,
      configured: isSupabaseConfigured,
      demoUsers,
      signIn,
      signOut,
      updateProfile,
      displayName: profile?.full_name || user?.email || 'Inspector',
      position: profile?.position || 'Inspector',
    };
  }, [session, profile, loading, error, demoUsers]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

async function fetchProfile(user) {
  const fallback = {
    full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Inspector',
    position: user.user_metadata?.position || 'Inspector',
    role: user.user_metadata?.role || 'inspector',
    department: user.user_metadata?.department || 'Maintenance',
  };
  if (!supabase) return fallback;
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  return data ?? fallback;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
