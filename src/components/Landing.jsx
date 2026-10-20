import { lazy, Suspense, useState } from 'react';
import { useProject } from '../context/ProjectContext.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import ClearAllDataButton from './ClearAllDataButton.jsx';
import { getTimeGreeting } from './landingGreeting.js';
import './Landing.css';

const ResearchDiscovery = lazy(() => import('./ResearchDiscovery.jsx'));
const DISPLAY_NAME_KEY = 'attis:display-name';

function readDisplayName() {
  return window.localStorage.getItem(DISPLAY_NAME_KEY) ?? '';
}

export default function Landing() {
  const { newProject } = useProject();
  const [showResearch, setShowResearch] = useState(false);
  const [hasOpenedResearch, setHasOpenedResearch] = useState(false);
  const [researchEntry, setResearchEntry] = useState({ page: 'research', id: 0 });
  const [displayName, setDisplayName] = useState(readDisplayName);
  const [editingName, setEditingName] = useState(false);
  const openResearch = (page = 'research') => {
    setResearchEntry((entry) => ({ page, id: entry.id + 1 }));
    setHasOpenedResearch(true);
    setShowResearch(true);
  };
  const saveDisplayName = (name) => {
    const trimmedName = name.trim();
    window.localStorage.setItem(DISPLAY_NAME_KEY, trimmedName);
    setDisplayName(trimmedName);
    setEditingName(false);
  };

  return (
    <>
      <div className="landing-screen" hidden={showResearch}>
        <LandingScreen
          onStartResearch={openResearch}
          onOpenMapping={() => newProject({ name: 'New Mapping Project' })}
          hasResearch={hasOpenedResearch}
          displayName={displayName}
          editingName={editingName}
          onEditName={() => setEditingName(true)}
          onSaveName={saveDisplayName}
          onCancelName={() => setEditingName(false)}
        />
      </div>
      {hasOpenedResearch && (
        <div className="landing-research-screen" hidden={!showResearch}>
          <Suspense fallback={<p className="landing-loading" role="status">Opening research workspace…</p>}>
            <ResearchDiscovery
              onBack={() => setShowResearch(false)}
              initialPage={researchEntry.page}
              entryKey={researchEntry.id}
            />
          </Suspense>
        </div>
      )}
    </>
  );
}

function LandingScreen({
  onStartResearch,
  onOpenMapping,
  hasResearch,
  displayName,
  editingName,
  onEditName,
  onSaveName,
  onCancelName,
}) {
  return (
    <div className="landing">
      <div className="landing-topbar">
        <ThemeToggle />
      </div>

      <div className="landing-content">
        <div className="landing-brand">
          <div className="landing-logo">
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>
          {displayName && !editingName ? (
            <>
              <div className="landing-greeting">
                <h1 className="landing-title">{getTimeGreeting()} {displayName}</h1>
                <button type="button" className="landing-name-edit" onClick={onEditName}>
                  Change name
                </button>
              </div>
              <p className="landing-tagline">What would you like to research today?</p>
            </>
          ) : (
            <>
              <h1 className="landing-title">{editingName ? 'Update your name' : 'Welcome'}</h1>
              <p className="landing-tagline">What would you like to research today?</p>
              <form
                className="landing-name-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  onSaveName(new FormData(event.currentTarget).get('displayName'));
                }}
              >
                <label htmlFor="landing-display-name">What should we call you?</label>
                <div>
                  <input
                    id="landing-display-name"
                    name="displayName"
                    type="text"
                    autoComplete="given-name"
                    maxLength={60}
                    defaultValue={displayName}
                    required
                    autoFocus={editingName}
                  />
                  <button className="btn btn-primary" type="submit">Save</button>
                  {editingName && (
                    <button className="btn btn-ghost" type="button" onClick={onCancelName}>
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </>
          )}
          <button
            className="btn btn-primary landing-start-research"
            type="button"
            onClick={() => onStartResearch('research')}
          >
            Start Research
          </button>
        </div>

        <div className="landing-tools">
          <section className="landing-tool-card" aria-labelledby="mapping-tool-title">
            <div className="landing-tool-icon" aria-hidden="true">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" />
                <path d="M9 3v15M15 6v15" />
              </svg>
            </div>
            <h2 id="mapping-tool-title">Mapping Tool</h2>
            <p>Map identifiers, connections, and locations in a visual workspace.</p>
            <div className="landing-tool-actions">
              <button className="btn btn-primary" type="button" onClick={onOpenMapping}>
                Open Mapping Tool
              </button>
            </div>
          </section>
          <section className="landing-tool-card" aria-labelledby="dashboard-tool-title">
            <div className="landing-tool-icon" aria-hidden="true">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="8" height="8" rx="1.5" />
                <rect x="13" y="3" width="8" height="5" rx="1.5" />
                <rect x="13" y="10" width="8" height="11" rx="1.5" />
                <rect x="3" y="13" width="8" height="8" rx="1.5" />
              </svg>
            </div>
            <h2 id="dashboard-tool-title">Research Dashboard</h2>
            <p>Organize research projects, review sources and findings, and manage saved files.</p>
            <div className="landing-tool-actions">
              <button className="btn btn-primary" onClick={() => onStartResearch('org-dashboard')}>
                Open Dashboard
              </button>
            </div>
          </section>
          <section className="landing-tool-card" aria-labelledby="research-tool-title">
            <div className="landing-tool-icon" aria-hidden="true">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
                <path d="M8 11h6M11 8v6" />
              </svg>
            </div>
            <h2 id="research-tool-title">ATTIS Researcher</h2>
            <p>Search scholarly catalogs, web sources, and video platforms for your topic.</p>
            <div className="landing-tool-actions">
              <button className="btn btn-primary" onClick={() => onStartResearch('research')}>
                {hasResearch ? 'Open Research' : 'Start Research'}
              </button>
            </div>
          </section>
        </div>

      </div>

      <div className="landing-footer">
        Research searches use public catalogs ·{' '}
        <ClearAllDataButton variant="inline" />
      </div>
    </div>
  );
}
