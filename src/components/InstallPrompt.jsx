import { useEffect, useState } from 'react';
import './InstallPrompt.css';

function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

export default function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState(null);
  const [isAppInstalled, setIsAppInstalled] = useState(isInstalled);

  useEffect(() => {
    if (isAppInstalled) return undefined;

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallEvent(event);
    };
    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      setInstallEvent(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [isAppInstalled]);

  if (isAppInstalled || !installEvent) return null;

  const install = async () => {
    try {
      await installEvent.prompt();
      await installEvent.userChoice;
      setInstallEvent(null);
    } catch (error) {
      console.error('Brinfolynk install prompt could not be opened:', error);
      setInstallEvent(null);
    }
  };

  return (
    <button
      className="btn btn-primary install-notice"
      type="button"
      aria-label="Install Brinfolynk"
      onClick={install}
    >
      Install
    </button>
  );
}
