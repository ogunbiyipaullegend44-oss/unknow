import { useEffect, useMemo, useRef, useState } from 'react';
import { deleteAsset, getAvatarUrl, uploadAvatar } from '../neon/assetsClient.js';
import { neon, neonConfigError } from '../community/neonClient.js';
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
  default_view: 'discovery',
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
  const defaultView = ['discovery', 'sources'].includes(saved.default_view)
    ? saved.default_view
    : DEFAULT_PREFERENCES.default_view;
  return {
    ...DEFAULT_PREFERENCES,
    ...saved,
    theme: saved.theme ?? theme,
    default_view: defaultView,
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
  const [avatarPreview, setAvatarPreview] = useState('');

  const isAuthenticated = Boolean(user);
  const interestsText = useMemo(() => profile.research_interests.join(', '), [profile.research_interests]);

  useEffect(() => {
    if (!user || !neon) return undefined;
    let active = true;
    setLoadingProfile(true);
    setError('');
    (async () => {
      const { data, error: profileError } = await neon
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!active) return;
      const nextProfile = profileFromRow(data);
      if (!nextProfile.display_name) {
        nextProfile.display_name = user.user_metadata?.displayName ?? user.user_metadata?.display_name ?? '';
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
      if (data?.avatar_path) {
        const signedUrl = await getAvatarUrl(data.avatar_path);
        if (active) {
          setAvatarUrl(signedUrl);
          window.dispatchEvent(new CustomEvent('attis-profile-updated', {
            detail: { displayName: nextProfile.display_name, avatarUrl: signedUrl },
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
      if (!neon || !user) throw new Error(neonConfigError || 'Sign in to update your profile.');
      if (avatarFile) {
        newAvatarPath = await uploadAvatar(avatarFile);
        uploadedAvatarPath = newAvatarPath;
        uploadedAvatarUrl = await getAvatarUrl(newAvatarPath);
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
      const { error: saveError } = await neon
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
      let cleanupMessage = '';
      if (previousAvatar && previousAvatar !== newAvatarPath) {
        try {
          await deleteAsset(previousAvatar);
        } catch (cleanupError) {
          cleanupMessage = cleanupError.message;
        }
      }
      setNotice(cleanupMessage
        ? `Profile saved, but the previous photo could not be removed: ${cleanupMessage}`
        : cacheWarning
          ? 'Profile saved, but this browser could not cache your display name.'
          : 'Profile saved.');
    } catch (saveError) {
      if (!profileSaved && uploadedAvatarPath) {
        try {
          await deleteAsset(uploadedAvatarPath);
        } catch (cleanupError) {
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
    try {
      if (!neon || !user) throw new Error(neonConfigError || 'Sign in to save preferences.');
      const { error: saveError } = await neon.from('user_profiles').upsert({
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
      <h1 id="account-center-title">
        {section === 'profile'
          ? 'Profile'
          : section === 'settings'
            ? 'Settings'
            : section === 'privacy'
              ? 'Privacy & Data'
              : 'Security'}
      </h1>
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
            <p>Choose how Brinfolynk looks on this device. System appearance follows your operating-system setting.</p>
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
              <label><span>Default research view</span><select value={preferences.default_view} onChange={(event) => setPreferences({ ...preferences, default_view: event.target.value })}><option value="discovery">Sources</option><option value="sources">Source list</option><option value="research-gaps">Explore</option></select></label>
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
        <section className="account-card">
          <h2>Sign-in credentials</h2>
          <p>Your account is managed by Neon Auth. This app does not currently support changing the registered email address or password.</p>
          <p className="account-muted">Registered email: {user.email || 'Unavailable'}</p>
        </section>
      )}

      {!loadingProfile && section === 'privacy' && (
        <div className="account-form">
          <section className="account-card">
            <h2>Privacy and data</h2>
            <p>Profile details and profile photos are private to your account. Community publications and related records are shared according to their publication and moderation status. Research history, saved collections, and mapping projects remain in this browser and are not uploaded to your account.</p>
            <p className="account-muted">Account deletion is not available in this app yet. Contact the project administrator to request removal of your Neon Auth account and associated community data.</p>
          </section>
          <div className="account-actions">
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => signOut().catch((signOutError) => setError(`Could not sign out: ${signOutError.message}`))}>Sign out</button>
          </div>
        </div>
      )}
    </section>
  );
}
