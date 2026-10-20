import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, supabaseConfigError } from '../community/supabaseClient.js';

const CommunityAuthContext = createContext(null);

export function CommunityAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase) return undefined;

    let active = true;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) setError(sessionError.message);
      setUser(data.session?.user ?? null);
      setLoading(false);
    }).catch((sessionError) => {
      if (!active) return;
      setError(sessionError.message || 'Could not read the Supabase session.');
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setError('');
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    error,
    configError: supabaseConfigError,
    async signIn(email, password) {
      if (!supabase) throw new Error(supabaseConfigError);
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
    },
    async signUp(email, password, displayName) {
      if (!supabase) throw new Error(supabaseConfigError);
      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } },
      });
      if (authError) throw authError;
    },
    async signOut(scope = 'local') {
      if (!supabase) return;
      const { error: authError } = await supabase.auth.signOut({ scope });
      if (authError) throw authError;
    },
  }), [error, loading, user]);

  return <CommunityAuthContext.Provider value={value}>{children}</CommunityAuthContext.Provider>;
}

export function useCommunityAuth() {
  const context = useContext(CommunityAuthContext);
  if (!context) throw new Error('useCommunityAuth must be used within CommunityAuthProvider');
  return context;
}
