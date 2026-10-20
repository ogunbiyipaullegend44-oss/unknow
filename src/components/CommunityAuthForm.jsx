import { useState } from 'react';
import { useCommunityAuth } from '../context/CommunityAuthContext.jsx';

export default function CommunityAuthForm({
  compact = false,
  heading = 'Sign in to the Community Hub',
}) {
  const { signIn, signUp, configError } = useCommunityAuth();
  const [mode, setMode] = useState('sign-in');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const email = String(form.get('email') ?? '').trim();
      const password = String(form.get('password') ?? '');
      if (mode === 'sign-up') {
        await signUp(email, password, String(form.get('displayName') ?? '').trim());
        setNotice('Account created. If email confirmation is enabled, follow the link sent to your inbox, then sign in.');
        setMode('sign-in');
      } else {
        await signIn(email, password);
      }
    } catch (authError) {
      setError(authError.message || 'Authentication failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (configError) return <div className="community-alert" role="status"><strong>Community service setup required</strong><p>{configError}</p><p>Apply the included Supabase migration and enable email/password authentication before signing in.</p></div>;

  return (
    <form className={`community-auth-form${compact ? ' is-compact' : ''}`} onSubmit={submit}>
      <h2>{mode === 'sign-up' ? 'Create your account' : heading}</h2>
      {mode === 'sign-up' && <label><span>Display name</span><input name="displayName" required maxLength={80} autoComplete="name" /></label>}
      <label><span>Email</span><input name="email" type="email" required autoComplete="email" /></label>
      <label><span>Password</span><input name="password" type="password" required minLength={8} autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} /></label>
      {error && <p className="community-alert" role="alert">{error}</p>}
      {notice && <p className="community-success" role="status">{notice}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'sign-up' ? 'Create account' : 'Sign in'}</button>
      <button className="btn btn-ghost" type="button" onClick={() => { setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up'); setError(''); setNotice(''); }}>
        {mode === 'sign-up' ? 'Already have an account? Sign in' : 'Create an account'}
      </button>
    </form>
  );
}
