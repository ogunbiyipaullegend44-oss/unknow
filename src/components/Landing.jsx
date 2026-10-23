import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import ClearAllDataButton from './ClearAllDataButton.jsx';
import './Landing.css';

const ResearchDiscovery = lazy(() => import('./ResearchDiscovery.jsx'));

export default function Landing() {
  const [showResearch, setShowResearch] = useState(false);
  const [hasOpenedResearch, setHasOpenedResearch] = useState(false);
  const [researchEntry, setResearchEntry] = useState({ page: 'research', id: 0 });
  const hasHandledInitialEntry = useRef(false);
  useEffect(() => {
    if (showResearch || hasHandledInitialEntry.current) return undefined;
    const timer = window.setTimeout(() => {
      hasHandledInitialEntry.current = true;
      setResearchEntry((entry) => ({ page: 'research', id: entry.id + 1 }));
      setHasOpenedResearch(true);
      setShowResearch(true);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [showResearch]);

  const openResearch = (page = 'research') => {
    hasHandledInitialEntry.current = true;
    setResearchEntry((entry) => ({ page, id: entry.id + 1 }));
    setHasOpenedResearch(true);
    setShowResearch(true);
  };

  return (
    <>
      <div className="landing-screen" hidden={showResearch}>
        <LandingScreen
          onOpenDashboard={() => openResearch('org-dashboard')}
          hasResearch={hasOpenedResearch}
        />
      </div>
      {hasOpenedResearch && (
        <div className="landing-research-screen" hidden={!showResearch}>
          <Suspense fallback={<p className="landing-loading" role="status">Opening research workspace…</p>}>
            <ResearchDiscovery
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
  onOpenDashboard,
  hasResearch,
}) {
  return (
    <div className="landing">
      <div className={`landing-content${hasResearch ? '' : ' landing-content-splash'}`}>
        <div className={`landing-brand${hasResearch ? '' : ' landing-brand-splash'}`}>
          <div className="landing-brand-lockup">
            <img className="landing-logo" src="/brinfolynk-mark.png" alt="Brinfolynk" />
          </div>
        </div>

        {hasResearch && <div className="landing-tools">
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
              <button className="btn btn-primary" onClick={onOpenDashboard}>
                Open Dashboard
              </button>
            </div>
          </section>
        </div>}

      </div>

      {hasResearch && <div className="landing-footer">
        Research searches use public catalogs ·{' '}
        <ClearAllDataButton variant="inline" />
      </div>}
    </div>
  );
}
