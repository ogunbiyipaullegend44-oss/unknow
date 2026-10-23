import { lazy, Suspense } from 'react';

const ResearchDiscovery = lazy(() => import('./ResearchDiscovery.jsx'));

export default function Landing() {
  return (
    <Suspense fallback={(
      <main className="app-startup-splash" role="status" aria-label="Brinfolynk">
        <img src="/brinfolynk-splash.png" alt="Brinfolynk" />
      </main>
    )}>
      <ResearchDiscovery initialPage="research" />
    </Suspense>
  );
}
