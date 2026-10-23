import { lazy, Suspense } from 'react';

const ResearchDiscovery = lazy(() => import('./ResearchDiscovery.jsx'));

export default function Landing() {
  return (
    <Suspense fallback={<main className="app-loading" aria-busy="true" />}>
      <ResearchDiscovery initialPage="research" />
    </Suspense>
  );
}
