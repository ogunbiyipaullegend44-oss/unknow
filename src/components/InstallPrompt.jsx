import { useEffect, useState } from 'react';
import { getInstallInstructions } from '../utils/installInstructions.js';
import './InstallPrompt.css';

function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function getPlatform() {
  return getInstallInstructions({
    userAgent: window.navigator.userAgent,
    platform: window.navigator.platform,
    maxTouchPoints: window.navigator.maxTouchPoints,
  });
}

export default function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState(null);
  const [isAppInstalled, setIsAppInstalled] = useState(isInstalled);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isAppInstalled) return undefined;

    const showInstallNotification = window.setTimeout(() => setIsVisible(true), 5000);
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallEvent(event);
    };
    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      setIsVisible(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.clearTimeout(showInstallNotification);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [isAppInstalled]);

  if (isAppInstalled || !isVisible) return null;

  const instructions = getPlatform();
  const showInstallInstructions = () => {
    window.alert(`${instructions.heading}\n\n${instructions.steps.join('\n')}`);
  };

  const install = async () => {
    if (!installEvent) {
      showInstallInstructions();
      return;
    }

    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      setInstallEvent(null);
      if (choice.outcome === 'accepted') {
        setIsVisible(false);
      } else {
        showInstallInstructions();
      }
    } catch (error) {
      console.error('Brinfolynk install prompt could not be opened:', error);
      setInstallEvent(null);
      showInstallInstructions();
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
