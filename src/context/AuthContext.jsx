import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase.js';

const AuthContext = createContext(null);

const LOCAL_DEV_USER = {
  id: 'local-dev-inspector',
  email: 'inspector@pgia.local',
  profile: {
    full_name: 'Local Inspector',
    position: 'Airside Inspector',
    role: 'inspector',
  },
};

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isSupabaseConfigured || !supabase) {
        const cached = sessionStorage.getItem('bacc-local-auth');
        if (cached === '1') {
          setSession({ user: LOCAL_DEV_USER });
          setProfile(LOCAL_DEV_USER.profile);
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
        if (nextSession?.user) {
          setProfile(await fetchProfile(nextSession.user));
        } else {
          setProfile(null);
        }
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
        sessionStorage.setItem('bacc-local-auth', '1');
        setSession({ user: LOCAL_DEV_USER });
        setProfile(LOCAL_DEV_USER.profile);
        return { user: LOCAL_DEV_USER };
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
        sessionStorage.removeItem('bacc-local-auth');
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
      signIn,
      signOut,
      updateProfile,
      displayName: profile?.full_name || user?.email || 'Inspector',
      position: profile?.position || 'Inspector',
    };
  }, [session, profile, loading, error]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

async function fetchProfile(user) {
  const fallback = {
    full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Inspector',
    position: user.user_metadata?.position || 'Inspector',
    role: 'inspector',
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
