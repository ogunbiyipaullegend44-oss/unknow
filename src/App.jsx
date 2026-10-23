import { useEffect, useState } from 'react';
import { useProject } from './context/ProjectContext.jsx';
import { useAppConfig } from './context/AppConfigContext.jsx';
import Landing from './components/Landing.jsx';
import ProjectView from './components/ProjectView.jsx';
import ResetPasswordPage from './components/ResetPasswordPage.jsx';

export default function App() {
  const { project } = useProject();
  const { loaded, mapProviderSource } = useAppConfig();
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const updateConnection = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    return () => {
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
    };
  }, []);

  let screen;
  if (window.location.pathname.replace(/\/+$/, '') === '/reset-password') {
    screen = <ResetPasswordPage />;
  } else if (!loaded) {
    // Wait until the config layer has tried to read localStorage + the config
    // file before selecting the first-run or returning-user experience.
    screen = (
      <main className="app-loading" role="status" aria-live="polite">
        Loading Brinfolynk…
      </main>
    );
  } else if (mapProviderSource === null) {
    // Map setup no longer blocks entry to research; the provider can be selected
    // later from the Map tab.
    screen = <Landing />;
  } else {
    screen = project ? <ProjectView /> : <Landing />;
  }

  return (
    <>
      {!isOnline && (
        <div className="offline-notice" role="status">
          You’re offline. Saved work stays available; live research, maps, and account features need internet.
        </div>
      )}
      {screen}
    </>
  );
}
