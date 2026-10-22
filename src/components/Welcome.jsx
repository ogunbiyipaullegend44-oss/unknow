import { useEffect, useState } from 'react';
import ThemeToggle from './ThemeToggle.jsx';
import ResearchDiscovery from './ResearchDiscovery.jsx';
import './Welcome.css';

export default function Welcome() {
  const [showResearch, setShowResearch] = useState(false);
  const [hasOpenedResearch, setHasOpenedResearch] = useState(false);

  useEffect(() => {
    if (showResearch) return undefined;
    const timer = window.setTimeout(() => {
      setHasOpenedResearch(true);
      setShowResearch(true);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [showResearch]);

  return (
    <>
      <div className="welcome-screen" hidden={showResearch}>
        <div className="welcome">
          <div className="welcome-topbar">
            <ThemeToggle />
          </div>

          <main className="welcome-content">
            <div className="welcome-brand">
              <div className="welcome-brand-lockup">
                <img className="welcome-logo" src="/brinfolynk-mark.png" alt="" />
                <h1 className="welcome-title">Brinfolynk</h1>
              </div>
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
