import { useProject } from './context/ProjectContext.jsx';
import { useAppConfig } from './context/AppConfigContext.jsx';
import Landing from './components/Landing.jsx';
import ProjectView from './components/ProjectView.jsx';

export default function App() {
  const { project } = useProject();
  const { loaded, mapProviderSource } = useAppConfig();

  // Wait until the config layer has tried to read localStorage + the config
  // file before selecting the first-run or returning-user experience.
  if (!loaded) {
    return (
      <main className="app-loading" role="status" aria-live="polite">
        Loading Brinfolynk…
      </main>
    );
  }

  // Map setup no longer blocks entry to research; the provider can be selected
  // later from the Map tab.
  const isFirstRun = mapProviderSource === null;
  if (isFirstRun) {
    return <Landing />;
  }

  return project ? <ProjectView /> : <Landing />;
}
