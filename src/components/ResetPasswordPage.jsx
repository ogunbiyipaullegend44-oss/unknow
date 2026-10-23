import { useState } from 'react';
import { useCommunityAuth } from '../context/CommunityAuthContext.jsx';
import './ResetPasswordPage.css';

export default function ResetPasswordPage() {
  const { resetPassword, configError } = useCommunityAuth();
  const token = new URLSearchParams(window.location.search).get('token');
  const hasAuthError = new URLSearchParams(window.location.search).has('error');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    const confirmation = String(form.get('confirmPassword') ?? '');
    if (password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await resetPassword(token, password);
      window.history.replaceState({}, document.title, window.location.pathname);
      setComplete(true);
    } catch (resetError) {
      setError(resetError.message || 'Could not reset your password. Request a new reset link and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="reset-password-page">
      <section className="reset-password-card" aria-labelledby="reset-password-title">
        <p className="reset-password-brand">Brinfolynk</p>
        {configError ? (
          <>
            <h1 id="reset-password-title">Password reset unavailable</h1>
            <p>{configError}</p>
          </>
        ) : complete ? (
          <>
            <h1 id="reset-password-title">Password updated</h1>
            <p>Your password has been reset. Return to Brinfolynk and sign in with your new password.</p>
            <a className="btn btn-primary" href="/">Return to Brinfolynk</a>
          </>
        ) : !token || hasAuthError ? (
          <>
            <h1 id="reset-password-title">Reset link unavailable</h1>
            <p>This link is invalid or has expired. Request a new password reset email from the sign-in screen.</p>
            <a className="btn btn-primary" href="/">Return to Brinfolynk</a>
          </>
        ) : (
          <form className="reset-password-form" onSubmit={submit}>
            <h1 id="reset-password-title">Choose a new password</h1>
            <p>Enter a new password for your Brinfolynk account.</p>
            <label>
              <span>New password</span>
              <input name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" />
            </label>
            <label>
              <span>Confirm new password</span>
              <input name="confirmPassword" type="password" required minLength={8} maxLength={128} autoComplete="new-password" />
            </label>
            {error && <p className="reset-password-error" role="alert">{error}</p>}
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Updating password…' : 'Update password'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
