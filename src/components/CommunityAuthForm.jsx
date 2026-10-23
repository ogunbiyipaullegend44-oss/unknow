import { useState } from 'react';
import { useCommunityAuth } from '../context/CommunityAuthContext.jsx';

function getAuthErrorMessage(authError) {
  if (/invalid origin/i.test(authError.message ?? '')) {
    return `Neon Auth is blocking this request from ${window.location.origin}. In Neon Console, add this exact origin under Auth → Configuration → Domains, then try again.`;
  }

  return authError.message || 'Authentication failed. Please try again.';
}

export default function CommunityAuthForm({
  compact = false,
  heading = 'Sign in to the Community Hub',
}) {
  const { signIn, signUp, sendPasswordReset, configError } = useCommunityAuth();
  const [mode, setMode] = useState('sign-in');
  const [email, setEmail] = useState('');
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
      const submittedEmail = String(form.get('email') ?? '').trim();
      const password = String(form.get('password') ?? '');
      if (mode === 'sign-up') {
        const result = await signUp(submittedEmail, password, String(form.get('displayName') ?? '').trim());
        setSignUpComplete(true);
        setNotice(result.requiresEmailVerification
          ? 'Your account was created. Check your inbox for a verification link before signing in.'
          : 'Your account was created successfully.');
      } else if (mode === 'reset') {
        await sendPasswordReset(submittedEmail);
        setNotice('If an account exists for that email, a password reset link has been sent. Check your inbox.');
      } else {
        await signIn(submittedEmail, password);
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
      <h2>{mode === 'sign-up' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : heading}</h2>
      {mode === 'sign-up' && <label><span>Display name</span><input name="displayName" required maxLength={80} autoComplete="name" /></label>}
      <label><span>Email</span><input name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label>
      {mode !== 'reset' && <label>
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
      }
      {mode === 'sign-in' && (
        <button
          className="btn btn-ghost community-forgot-password"
          type="button"
          onClick={() => {
            setMode('reset');
            setError('');
            setNotice('');
          }}
        >
          Forgot password?
        </button>
      )}
      {error && <p className="community-alert" role="alert">{error}</p>}
      {notice && <p className="community-success" role="status">{notice}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy || (mode === 'sign-up' && signUpComplete)}>{busy ? 'Please wait…' : mode === 'sign-up' ? signUpComplete ? 'Account created' : 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}</button>
      <button className="btn btn-ghost" type="button" onClick={() => {
        const nextMode = mode === 'sign-in' ? 'sign-up' : 'sign-in';
        setMode(nextMode);
        setShowPassword(false);
        setError('');
        setNotice('');
        if (nextMode === 'sign-up') setSignUpComplete(false);
      }}>
        {mode === 'sign-up' ? 'Already have an account? Sign in' : mode === 'reset' ? 'Back to sign in' : 'Create an account'}
      </button>
    </form>
  );
}
