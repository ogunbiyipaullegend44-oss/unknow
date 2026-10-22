import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { neon, neonConfigError, neonRegistration } from '../community/neonClient.js';

const CommunityAuthContext = createContext(null);

export function CommunityAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(neon));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!neon) return undefined;

    let active = true;
    neon.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) setError(sessionError.message);
      setUser(data.session?.user ?? null);
      setLoading(false);
    }).catch((sessionError) => {
      if (!active) return;
      setError(sessionError.message || 'Could not read the Neon Auth session.');
      setLoading(false);
    });

    const { data: { subscription } } = neon.auth.onAuthStateChange((_event, session) => {
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
    configError: neonConfigError,
    async signIn(email, password) {
      if (!neon) throw new Error(neonConfigError);
      const { error: authError } = await neon.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
    },
    async signUp(email, password, displayName) {
      if (!neon) throw new Error(neonConfigError);
      if (!neonRegistration) throw new Error(neonConfigError);
      const { data, error: authError } = await neonRegistration.auth.signUp.email({
        email,
        password,
        name: displayName,
      });
      if (authError) throw authError;
      if (!data?.user) throw new Error('Neon Auth did not confirm account creation.');

      const { data: sessionData, error: sessionError } = await neon.auth.getSession({ forceFetch: true });
      if (sessionError) throw sessionError;
      setUser(sessionData.session?.user ?? null);
      return { requiresEmailVerification: !sessionData.session };
    },
    async signOut() {
      if (!neon) return;
      const { error: authError } = await neon.auth.signOut();
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
