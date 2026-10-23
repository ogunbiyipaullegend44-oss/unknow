import { useEffect, useState } from 'react';
import { useProject } from './context/ProjectContext.jsx';
import { useAppConfig } from './context/AppConfigContext.jsx';
import Landing from './components/Landing.jsx';
import ProjectView from './components/ProjectView.jsx';
import ResetPasswordPage from './components/ResetPasswordPage.jsx';
import InstallPrompt from './components/InstallPrompt.jsx';

export default function App() {
  const { project } = useProject();
  const { loaded, mapProviderSource } = useAppConfig();
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const isResetPasswordRoute = window.location.pathname.replace(/\/+$/, '') === '/reset-password';
  const isWaitingForConfig = !isResetPasswordRoute && !loaded;

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
  if (isResetPasswordRoute) {
    screen = <ResetPasswordPage />;
  } else if (!loaded) {
    screen = <main className="app-loading" aria-busy="true" />;
  } else if (mapProviderSource === null) {
    // Map setup no longer blocks entry to research; the provider can be selected
    // later from the Map tab.
    screen = <Landing />;
  } else {
    screen = project ? <ProjectView /> : <Landing />;
  }

  return (
    <>
      {!isWaitingForConfig && !isOnline && (
        <div className="offline-notice" role="status">
          You’re offline. Saved work stays available; live research, maps, and account features need internet.
        </div>
      )}
      {!isWaitingForConfig && <InstallPrompt />}
      {screen}
    </>
  );
}
