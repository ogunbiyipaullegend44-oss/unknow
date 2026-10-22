import { useState } from 'react';
import { useCommunityAuth } from '../context/CommunityAuthContext.jsx';

function getAuthErrorMessage(authError) {
  if (/invalid origin/i.test(authError.message ?? '')) {
    return `Neon Auth is blocking sign-up from ${window.location.origin}. In Neon Console, add this exact origin under Auth → Configuration → Domains, then try again.`;
  }

  return authError.message || 'Authentication failed. Please try again.';
}

export default function CommunityAuthForm({
  compact = false,
  heading = 'Sign in to the Community Hub',
}) {
  const { signIn, signUp, configError } = useCommunityAuth();
  const [mode, setMode] = useState('sign-in');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [signUpComplete, setSignUpComplete] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
        const result = await signUp(email, password, String(form.get('displayName') ?? '').trim());
        setSignUpComplete(true);
        setNotice(result.requiresEmailVerification
          ? 'Your account was created. Check your inbox for a verification link before signing in.'
          : 'Your account was created successfully.');
      } else {
        await signIn(email, password);
      }
    } catch (authError) {
      setError(getAuthErrorMessage(authError));
    } finally {
      setBusy(false);
    }
  };

  if (configError) return <div className="community-alert" role="status"><strong>Community service setup required</strong><p>{configError}</p><p>Configure Neon Auth and apply the included Neon migration before signing in.</p></div>;

  return (
    <form className={`community-auth-form${compact ? ' is-compact' : ''}`} onSubmit={submit}>
      <h2>{mode === 'sign-up' ? 'Create your account' : heading}</h2>
      {mode === 'sign-up' && <label><span>Display name</span><input name="displayName" required maxLength={80} autoComplete="name" /></label>}
      <label><span>Email</span><input name="email" type="email" required autoComplete="email" /></label>
      <label>
        <span>Password</span>
        <span className="community-password-field">
          <input
            name="password"
            type={mode === 'sign-up' && showPassword ? 'text' : 'password'}
            required
            minLength={8}
            autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
          />
          {mode === 'sign-up' && (
            <button
              className="btn btn-ghost community-password-toggle"
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((visible) => !visible)}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          )}
        </span>
      </label>
      {error && <p className="community-alert" role="alert">{error}</p>}
      {notice && <p className="community-success" role="status">{notice}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy || (mode === 'sign-up' && signUpComplete)}>{busy ? 'Please wait…' : mode === 'sign-up' ? signUpComplete ? 'Account created' : 'Create account' : 'Sign in'}</button>
      <button className="btn btn-ghost" type="button" onClick={() => {
        const nextMode = mode === 'sign-up' ? 'sign-in' : 'sign-up';
        setMode(nextMode);
        setShowPassword(false);
        setError('');
        if (nextMode === 'sign-up') {
          setNotice('');
          setSignUpComplete(false);
        }
      }}>
        {mode === 'sign-up' ? 'Already have an account? Sign in' : 'Create an account'}
      </button>
    </form>
  );
}
