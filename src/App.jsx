import { lazy, Suspense } from 'react';
import { useProject } from './context/ProjectContext.jsx';
import { useAppConfig } from './context/AppConfigContext.jsx';
import Landing from './components/Landing.jsx';
import ProjectView from './components/ProjectView.jsx';

const Welcome = lazy(() => import('./components/Welcome.jsx'));

export default function App() {
  const { project } = useProject();
  const { loaded, mapProviderSource } = useAppConfig();

  // Wait until the config layer has tried to read localStorage + the config
  // file. Showing nothing for one frame beats flashing the welcome screen
  // to an existing user.
  if (!loaded) {
    return (
      <main className="app-loading" role="status" aria-live="polite">
        Loading ATTIS Researcher…
      </main>
    );
  }

  // Keep the welcome home for users without a saved map preference. Map setup
  // no longer blocks entry to research; the provider can be selected later
  // from the Map tab. Clearing app data returns users to this welcome home.
  const isFirstRun = mapProviderSource === null;
  if (isFirstRun) {
    return (
      <Suspense fallback={<p role="status">Loading workspace…</p>}>
        <Welcome />
      </Suspense>
    );
  }

  return project ? <ProjectView /> : <Landing />;
}
