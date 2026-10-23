import { lazy, Suspense, useEffect, useState } from 'react';
import './Landing.css';

const ResearchDiscovery = lazy(() => import('./ResearchDiscovery.jsx'));

export default function Landing() {
  const [showResearch, setShowResearch] = useState(false);
  const [hasOpenedResearch, setHasOpenedResearch] = useState(false);
  const [researchEntry, setResearchEntry] = useState({ page: 'research', id: 0 });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setResearchEntry((entry) => ({ page: 'research', id: entry.id + 1 }));
      setHasOpenedResearch(true);
      setShowResearch(true);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <div className="landing-screen" hidden={showResearch}>
        <LandingScreen />
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

function LandingScreen() {
  return (
    <div className="landing">
      <div className="landing-content landing-content-splash">
        <div className="landing-brand landing-brand-splash">
          <div className="landing-brand-lockup">
            <img className="landing-logo" src="/brinfolynk-mark.png" alt="Brinfolynk" />
          </div>
        </div>
      </div>
    </div>
  );
}
