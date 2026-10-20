import { useState } from 'react';
import { useProject } from '../context/ProjectContext.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import ResearchDiscovery from './ResearchDiscovery.jsx';
import './Welcome.css';

export default function Welcome() {
  const { newProject } = useProject();
  const displayName = window.localStorage.getItem('attis:display-name')?.trim() ?? '';
  const [showResearch, setShowResearch] = useState(false);
  const [hasOpenedResearch, setHasOpenedResearch] = useState(false);

  const openResearch = () => {
    setHasOpenedResearch(true);
    setShowResearch(true);
  };

  return (
    <>
      <div className="welcome-screen" hidden={showResearch}>
        <div className="welcome">
          <div className="welcome-topbar">
            <ThemeToggle />
          </div>

          <main className="welcome-content">
            <div className="welcome-brand">
              <div className="welcome-logo" aria-hidden="true">
                <svg
                  width="42"
                  height="42"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </div>
              <h1 className="welcome-title">
                {displayName ? `${displayName}, Welcome` : 'Welcome'}
              </h1>
              <p className="welcome-sub">
                Start with a question and explore research from trusted public sources.
              </p>
            </div>

            <div className="welcome-actions">
              <button className="btn btn-primary welcome-start" type="button" onClick={openResearch}>
                Start Research
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => newProject({ name: 'New Mapping Project' })}
              >
                Open Mapping Tool
              </button>
            </div>
          </main>

          <div className="welcome-footer">
            Mapping projects stay on this device · Research searches use public catalogs
          </div>
        </div>
      </div>

      {hasOpenedResearch && (
        <div className="welcome-research-screen" hidden={!showResearch}>
          <ResearchDiscovery onBack={() => setShowResearch(false)} backLabel="" />
        </div>
      )}
    </>
  );
}
