import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, supabaseConfigError } from '../community/supabaseClient.js';
import { useCommunityAuth } from '../context/CommunityAuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import CommunityAuthForm from './CommunityAuthForm.jsx';
import './AccountCenter.css';

const PURPOSES = [
  ['general', 'General knowledge'],
  ['academic', 'Academic research'],
  ['assignment', 'Assignment'],
  ['journalism', 'Journalism or content creation'],
  ['business', 'Business research'],
  ['other', 'Other'],
];
const DEFAULT_PREFERENCES = {
  theme: 'system',
  default_purpose: 'general',
  geographic_focus: 'worldwide',
  region: '',
  publication_period: 'any',
  default_view: 'overview',
};

function profileFromRow(row) {
  return {
    display_name: row?.display_name ?? '',
    username: row?.username ?? '',
    avatar_path: row?.avatar_path ?? null,
    research_interests: row?.research_interests ?? [],
    research_purpose: row?.research_purpose ?? 'general',
    bio: row?.bio ?? '',
  };
}

function preferencesFromRow(row, theme) {
  const saved = row?.research_preferences ?? {};
  return {
    ...DEFAULT_PREFERENCES,
    ...saved,
    theme: saved.theme ?? theme,
  };
}

function Avatar({ src, name, size = 52 }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return src
    ? <img className="account-avatar" style={{ width: size, height: size }} src={src} alt="" />
    : <span className="account-avatar account-avatar-fallback" style={{ width: size, height: size }} aria-hidden="true">{initials || 'U'}</span>;
}

export default function AccountCenter({ section = 'profile', onSectionChange }) {
  const { user, loading: authLoading, signOut } = useCommunityAuth();
  const { theme, setTheme } = useTheme();
  const [profile, setProfile] = useState(profileFromRow(null));
  const [preferences, setPreferences] = useState(preferencesFromRow(null, theme));
  const [editingProfile, setEditingProfile] = useState(false);
  const initialPreferences = useRef(preferences);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarFile, setAvatarFile] = useState(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [emailDraft, setEmailDraft] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [passwordDraft, setPasswordDraft] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [avatarPreview, setAvatarPreview] = useState('');

  const isAuthenticated = Boolean(user);
  const interestsText = useMemo(() => profile.research_interests.join(', '), [profile.research_interests]);

  useEffect(() => {
    if (!user || !supabase) return undefined;
    let active = true;
    setLoadingProfile(true);
    setError('');
    (async () => {
      const { data, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!active) return;
      const nextProfile = profileFromRow(data);
      if (!nextProfile.display_name) {
        nextProfile.display_name = user.user_metadata?.display_name ?? '';
      }
      setProfile(nextProfile);
      try {
        window.localStorage.setItem('attis:display-name', nextProfile.display_name);
      } catch {
        setNotice('Your profile loaded, but this browser could not cache your display name.');
      }
      const nextPreferences = preferencesFromRow(data, theme);
      setPreferences(nextPreferences);
      initialPreferences.current = nextPreferences;
      if (nextPreferences.theme !== theme) setTheme(nextPreferences.theme);
      setEmailDraft(user.email ?? '');
      setPendingEmail(user.new_email ?? '');
      if (data?.avatar_path) {
        const { data: signed, error: signedError } = await supabase.storage
          .from('user-avatars')
          .createSignedUrl(data.avatar_path, 60 * 60);
        if (signedError) throw signedError;
        if (active) {
          setAvatarUrl(signed.signedUrl);
          window.dispatchEvent(new CustomEvent('attis-profile-updated', {
            detail: { displayName: nextProfile.display_name, avatarUrl: signed.signedUrl },
          }));
        }
      } else {
        setAvatarUrl('');
        window.dispatchEvent(new CustomEvent('attis-profile-updated', {
          detail: { displayName: nextProfile.display_name, avatarUrl: '' },
        }));
      }
    })().catch((loadError) => {
      if (active) setError(`Could not load your account profile: ${loadError.message}`);
    }).finally(() => {
      if (active) setLoadingProfile(false);
    });
    return () => { active = false; };
  }, [user?.id, user?.email, user?.new_email]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview('');
      return undefined;
    }
    const preview = URL.createObjectURL(avatarFile);
    setAvatarPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [avatarFile]);

  const saveProfile = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const displayName = String(form.get('display_name') ?? '').trim();
    const username = String(form.get('username') ?? '').trim().toLowerCase();
    const bio = String(form.get('bio') ?? '').trim();
    const interests = String(form.get('interests') ?? '')
      .split(/[,\n]/)
      .map((interest) => interest.trim())
      .filter(Boolean);
    if (displayName.length > 80 || bio.length > 500 ||
      interests.length > 20 || interests.some((interest) => interest.length > 80)) {
      setError('Check the length of your name, bio, or research interests.');
      return;
    }
    if (username && !/^[a-z0-9_]{3,24}$/.test(username)) {
      setError('Username must be 3–24 characters and use only lowercase letters, numbers, or underscores.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    let newAvatarPath = profile.avatar_path;
    let uploadedAvatarUrl = '';
    let uploadedAvatarPath = null;
    let profileSaved = false;
    try {
      if (!supabase || !user) throw new Error(supabaseConfigError || 'Sign in to update your profile.');
      if (avatarFile) {
        const extension = avatarFile.type === 'image/png' ? 'png' :
          avatarFile.type === 'image/webp' ? 'webp' : 'jpg';
        newAvatarPath = `${user.id}/${globalThis.crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from('user-avatars')
          .upload(newAvatarPath, avatarFile, { contentType: avatarFile.type, upsert: false });
        if (uploadError) throw uploadError;
        uploadedAvatarPath = newAvatarPath;
        const { data: signed, error: signedError } = await supabase.storage
          .from('user-avatars')
          .createSignedUrl(newAvatarPath, 60 * 60);
        if (signedError) throw signedError;
        uploadedAvatarUrl = signed.signedUrl;
      }
      if (removeAvatar) newAvatarPath = null;
      const nextProfile = {
        id: user.id,
        display_name: displayName,
        username: username || null,
        avatar_path: newAvatarPath,
        research_interests: interests,
        research_purpose: String(form.get('research_purpose') ?? 'general'),
        bio,
      };
      const { error: saveError } = await supabase
        .from('user_profiles')
        .upsert(nextProfile, { onConflict: 'id' });
      if (saveError) throw saveError;
      profileSaved = true;
      const previousAvatar = profile.avatar_path;
      setProfile(profileFromRow(nextProfile));
      setEditingProfile(false);
      setAvatarFile(null);
      setRemoveAvatar(false);
      if (avatarFile) {
        setAvatarUrl(uploadedAvatarUrl);
      } else if (removeAvatar) {
        setAvatarUrl('');
      }
      let cacheWarning = false;
      try {
        window.localStorage.setItem('attis:display-name', displayName);
      } catch {
        cacheWarning = true;
      }
      window.dispatchEvent(new CustomEvent('attis-profile-updated', {
        detail: { displayName, avatarUrl: avatarFile ? uploadedAvatarUrl : removeAvatar ? '' : avatarUrl },
      }));
      let cleanupWarning = false;
      if (previousAvatar && previousAvatar !== newAvatarPath) {
        const { error: removeError } = await supabase.storage
          .from('user-avatars')
          .remove([previousAvatar]);
        cleanupWarning = Boolean(removeError);
      }
      setNotice(cleanupWarning
        ? 'Profile saved, but the previous photo could not be removed.'
        : cacheWarning
          ? 'Profile saved, but this browser could not cache your display name.'
          : 'Profile saved.');
    } catch (saveError) {
      if (!profileSaved && uploadedAvatarPath) {
        const { error: cleanupError } = await supabase.storage
          .from('user-avatars')
          .remove([uploadedAvatarPath]);
        if (cleanupError) {
          setError(`Could not save your profile: ${saveError.message}. The uploaded photo also could not be cleaned up: ${cleanupError.message}`);
          return;
        }
      }
      setError(profileSaved
        ? `Your profile was saved, but follow-up cleanup failed: ${saveError.message}`
        : `Could not save your profile: ${saveError.message}`);
    } finally {
      setBusy(false);
    }
  };

  const savePreferences = async (event) => {
    event.preventDefault();
    if (preferences.geographic_focus === 'region' && !preferences.region.trim()) {
      setError('Enter a country or region, or choose Worldwide.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    let accountDeleted = false;
    try {
      if (!supabase || !user) throw new Error(supabaseConfigError || 'Sign in to save preferences.');
      const { error: saveError } = await supabase.from('user_profiles').upsert({
        id: user.id,
        display_name: profile.display_name,
        username: profile.username || null,
        avatar_path: profile.avatar_path,
        research_interests: profile.research_interests,
        research_purpose: profile.research_purpose,
        bio: profile.bio,
        research_preferences: preferences,
      }, { onConflict: 'id' });
      if (saveError) throw saveError;
      setTheme(preferences.theme);
      initialPreferences.current = preferences;
      setNotice('Settings saved. They will be used for future research.');
    } catch (saveError) {
      setError(`Could not save settings: ${saveError.message}`);
    } finally {
      setBusy(false);
    }
  };

  const changeEmail = async (event) => {
    event.preventDefault();
    const nextEmail = emailDraft.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (!supabase || !user?.email) throw new Error('Email changes require an email/password account.');
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: emailPassword,
      });
      if (reauthError) throw reauthError;
      const { error: updateError } = await supabase.auth.updateUser({ email: nextEmail });
      if (updateError) throw updateError;
      setPendingEmail(nextEmail);
      setEmailPassword('');
      setNotice('Check your email addresses to confirm the change. Your registered email changes after confirmation.');
    } catch (changeError) {
      setError(`Could not start the email change: ${changeError.message}`);
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    if (passwordDraft.length < 8 || passwordDraft !== passwordConfirm) {
      setError('Use a password of at least 8 characters and make both entries match.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (!supabase || !user?.email) throw new Error('Password changes require an email/password account.');
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (reauthError) throw reauthError;
      const { error: updateError } = await supabase.auth.updateUser({ password: passwordDraft });
      if (updateError) throw updateError;
      setCurrentPassword('');
      setPasswordDraft('');
      setPasswordConfirm('');
      setNotice('Password changed.');
    } catch (changeError) {
      setError(`Could not change password: ${changeError.message}`);
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async (event) => {
    event.preventDefault();
    if (deleteConfirmation !== 'DELETE') {
      setError('Type DELETE to confirm account deletion.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (!supabase || !user?.email) throw new Error('Account deletion requires an email/password account.');
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: deletePassword,
      });
      if (reauthError) throw reauthError;
      if (profile.avatar_path) {
        const { error: removeError } = await supabase.storage
          .from('user-avatars')
          .remove([profile.avatar_path]);
        if (removeError) throw new Error(`Profile photo cleanup failed: ${removeError.message}`);
      }
      const { error: deletionError } = await supabase.rpc('delete_my_account');
      if (deletionError) throw deletionError;
      accountDeleted = true;
      await signOut('local');
      window.localStorage.removeItem('attis:display-name');
      window.localStorage.removeItem(`attis:research-preferences:${user.id}`);
      setNotice('Account deleted. Browser-local research history and saved projects were not deleted.');
      onSectionChange('profile');
    } catch (deleteError) {
      setError(accountDeleted
        ? `Your account was deleted, but local cleanup or sign-out failed: ${deleteError.message}`
        : `Account deletion did not complete: ${deleteError.message}`);
    } finally {
      setBusy(false);
    }
  };

  if (authLoading) return <p className="account-state" role="status">Checking your account…</p>;
  if (!isAuthenticated) {
    return (
      <section className="account-center">
        <p className="research-eyebrow">Private account</p>
        <h1>Profile &amp; Settings</h1>
        <p>Sign in with your existing Community Hub account to manage a private profile and sync supported preferences.</p>
        {error && <p className="account-message account-error" role="alert">{error}</p>}
        {notice && <p className="account-message account-success" role="status">{notice}</p>}
        <CommunityAuthForm heading="Sign in to your account" />
      </section>
    );
  }

  return (
    <section className="account-center" aria-labelledby="account-center-title">
      <p className="research-eyebrow">Your account</p>
      <h1 id="account-center-title">{section === 'profile' ? 'Profile' : section === 'settings' ? 'Settings' : 'Privacy & Security'}</h1>
      <nav className="account-section-tabs" aria-label="Account sections">
        <button type="button" aria-current={section === 'profile' ? 'page' : undefined} onClick={() => onSectionChange('account-profile')}>Profile</button>
        <button type="button" aria-current={section === 'settings' ? 'page' : undefined} onClick={() => onSectionChange('account-settings')}>Settings</button>
        <button type="button" aria-current={section === 'security' ? 'page' : undefined} onClick={() => onSectionChange('account-security')}>Privacy &amp; Security</button>
      </nav>
      {loadingProfile && <p className="account-state" role="status">Loading your private profile…</p>}
      {error && <p className="account-message account-error" role="alert">{error}</p>}
      {notice && <p className="account-message account-success" role="status">{notice}</p>}

      {!loadingProfile && section === 'profile' && !editingProfile && (
        <section className="account-card">
          <div className="account-photo-row">
            <Avatar src={avatarUrl} name={profile.display_name} size={72} />
            <div>
              <h2>{profile.display_name || 'Your profile'}</h2>
              {profile.username && <p>@{profile.username}</p>}
            </div>
          </div>
          <div className="account-profile-summary">
            <p><strong>Email:</strong> {user.email}</p>
            <p><strong>Research purpose:</strong> {PURPOSES.find(([value]) => value === profile.research_purpose)?.[1] ?? 'General knowledge'}</p>
            <p><strong>Research interests:</strong> {profile.research_interests.length ? profile.research_interests.join(', ') : 'Not set'}</p>
            <p><strong>Bio:</strong> {profile.bio || 'Not set'}</p>
            <p><strong>Account created:</strong> {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Date unavailable'}</p>
          </div>
          <div className="account-actions">
            <button type="button" className="btn btn-primary" onClick={() => setEditingProfile(true)}>Edit Profile</button>
          </div>
        </section>
      )}

      {!loadingProfile && section === 'profile' && editingProfile && (
        <form className="account-form" onSubmit={saveProfile}>
          <section className="account-card">
            <h2>Profile details</h2>
            <p>This information is private to your account.</p>
            <div className="account-photo-row">
              <Avatar src={avatarPreview || (removeAvatar ? '' : avatarUrl)} name={profile.display_name} size={72} />
              <label className="account-file-input">
                <span>Profile photo</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    if (file && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
                      setError('Choose a JPEG, PNG, or WebP image.');
                      event.target.value = '';
                      return;
                    }
                    if (file && file.size > 5 * 1024 * 1024) {
                      setError('Profile photos must be 5 MB or smaller.');
                      event.target.value = '';
                      return;
                    }
                    setError('');
                    setAvatarFile(file);
                    if (file) setRemoveAvatar(false);
                  }}
                />
              </label>
              {(avatarUrl || avatarFile) && (
                <button type="button" className="btn btn-ghost" onClick={() => { setAvatarFile(null); setRemoveAvatar(true); }}>
                  Remove photo
                </button>
              )}
            </div>
            <div className="account-fields-grid">
              <label><span>Full name</span><input name="display_name" maxLength={80} required defaultValue={profile.display_name} /></label>
              <label><span>Username</span><input name="username" minLength={3} maxLength={24} pattern="[a-zA-Z0-9_]{3,24}" defaultValue={profile.username} autoComplete="username" /><small>Optional; 3–24 letters, numbers, or underscores.</small></label>
              <label><span>Registered email</span><input value={user.email ?? ''} readOnly /></label>
              <label><span>Primary research purpose</span><select name="research_purpose" defaultValue={profile.research_purpose}>{PURPOSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="account-field-wide"><span>Research interests</span><textarea name="interests" rows="3" defaultValue={interestsText} placeholder="Separate topics with commas" /></label>
              <label className="account-field-wide"><span>Bio</span><textarea name="bio" rows="3" maxLength={500} defaultValue={profile.bio} placeholder="Optional short description" /></label>
            </div>
            <p className="account-muted">Account created {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'date unavailable'}.</p>
            <div className="account-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setAvatarFile(null);
                  setRemoveAvatar(false);
                  setEditingProfile(false);
                  setError('');
                  setNotice('');
                }}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save Profile'}</button>
            </div>
          </section>
        </form>
      )}

      {!loadingProfile && section === 'settings' && (
        <form className="account-form" onSubmit={savePreferences}>
          <section className="account-card">
            <h2>Appearance</h2>
            <p>Choose how ATTIS looks on this device. System appearance follows your operating-system setting.</p>
            <label className="account-field"><span>Theme</span>
              <select value={preferences.theme} onChange={(event) => setPreferences({ ...preferences, theme: event.target.value })}>
                <option value="system">Follow system</option><option value="light">Light mode</option><option value="dark">Dark mode</option>
              </select>
            </label>
          </section>
          <section className="account-card">
            <h2>Research defaults</h2>
            <p>These defaults apply to new searches. You can still change the question scope and result view for each investigation.</p>
            <div className="account-fields-grid">
              <label><span>Default research purpose</span><select value={preferences.default_purpose} onChange={(event) => setPreferences({ ...preferences, default_purpose: event.target.value })}>{PURPOSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label><span>Geographic focus</span><select value={preferences.geographic_focus} onChange={(event) => setPreferences({ ...preferences, geographic_focus: event.target.value })}><option value="worldwide">Worldwide</option><option value="region">Specific country or region</option></select></label>
              {preferences.geographic_focus === 'region' && <label><span>Country or region</span><input maxLength={160} value={preferences.region} onChange={(event) => setPreferences({ ...preferences, region: event.target.value })} required /></label>}
              <label><span>Default publication period</span><select value={preferences.publication_period} onChange={(event) => setPreferences({ ...preferences, publication_period: event.target.value })}><option value="any">Any date</option><option value="1">Past year</option><option value="3">Past 3 years</option><option value="5">Past 5 years</option></select></label>
              <label><span>Default research view</span><select value={preferences.default_view} onChange={(event) => setPreferences({ ...preferences, default_view: event.target.value })}><option value="overview">Research Map</option><option value="discovery">Source discovery</option><option value="sources">Sources</option></select></label>
            </div>
            <p className="account-muted">The app currently supports English only. Notification controls, source-type restrictions, and summary-detail levels are not shown because those features are not implemented yet.</p>
            <div className="account-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setPreferences({ ...DEFAULT_PREFERENCES })}
              >
                Restore defaults
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setPreferences(initialPreferences.current);
                  setError('');
                  setNotice('');
                }}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save Settings'}</button>
            </div>
          </section>
        </form>
      )}

      {!loadingProfile && section === 'security' && (
        <div className="account-form">
          <section className="account-card">
            <h2>Change email</h2>
            <p>Supabase sends confirmation links before a new email becomes active.</p>
            <form className="account-security-form" onSubmit={changeEmail}>
              <label><span>New email</span><input type="email" required value={emailDraft} onChange={(event) => setEmailDraft(event.target.value)} autoComplete="email" /></label>
              <label><span>Current password (verify identity)</span><input type="password" required value={emailPassword} onChange={(event) => setEmailPassword(event.target.value)} autoComplete="current-password" /></label>
              <button className="btn btn-primary" type="submit" disabled={busy}>Request email change</button>
              {pendingEmail && pendingEmail !== user.email && <p className="account-muted">Confirmation pending for {pendingEmail}.</p>}
            </form>
          </section>
          <section className="account-card">
            <h2>Change password</h2>
            <p>Your current password is verified before the new password is saved.</p>
            <form className="account-security-form" onSubmit={changePassword}>
              <label><span>Current password</span><input type="password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" /></label>
              <label><span>New password</span><input type="password" required minLength={8} value={passwordDraft} onChange={(event) => setPasswordDraft(event.target.value)} autoComplete="new-password" /></label>
              <label><span>Confirm new password</span><input type="password" required minLength={8} value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} autoComplete="new-password" /></label>
              <button className="btn btn-primary" type="submit" disabled={busy}>Change password</button>
            </form>
          </section>
          <section className="account-card">
            <h2>Privacy and data</h2>
            <p>Profile details and profile photos are private to your account. Community publications and related records are removed by the account deletion workflow. Research history, saved collections, and mapping projects currently live in this browser; they are not uploaded to your account and will remain on this device after account deletion.</p>
            <div className="account-actions">
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => signOut().catch((signOutError) => setError(`Could not sign out: ${signOutError.message}`))}>Sign out</button>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => signOut('global').catch((signOutError) => setError(`Could not sign out all sessions: ${signOutError.message}`))}>Sign out all sessions</button>
            </div>
          </section>
          <section className="account-card account-danger-zone">
            <h2>Delete account</h2>
            <p>This permanently deletes your Supabase account, private profile, profile photo, and associated Community Hub records. Local research history, saved collections, mapping projects, and data held in this browser are not deleted. The app has no separate legal-retention workflow; deletion only removes records covered by the configured database cascades.</p>
            <form className="account-security-form" onSubmit={deleteAccount}>
              <label><span>Current password</span><input type="password" required value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} autoComplete="current-password" /></label>
              <label><span>Type DELETE to confirm</span><input required value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off" /></label>
              <button className="btn btn-danger" type="submit" disabled={busy}>Permanently delete account</button>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
