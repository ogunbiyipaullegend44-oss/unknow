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
  const [showInstructions, setShowInstructions] = useState(false);

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
      setShowInstructions(false);
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

  const install = async () => {
    if (!installEvent) {
      setShowInstructions(true);
      return;
    }

    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      setInstallEvent(null);
      if (choice.outcome === 'accepted') {
        setIsVisible(false);
      } else {
        setShowInstructions(true);
      }
    } catch (error) {
      console.error('Brinfolynk install prompt could not be opened:', error);
      setInstallEvent(null);
      setShowInstructions(true);
    }
  };

  return (
    <aside className="install-notice" aria-label="Install Brinfolynk" role="status">
      <div className="install-notice-copy">
        <strong>Install Brinfolynk</strong>
        <span>Add the research workspace to your device for quick access.</span>
        {showInstructions && (
          <div className="install-instructions">
            <strong>{instructions.heading}</strong>
            <ol>
              {instructions.steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </div>
        )}
      </div>
      <div className="install-notice-actions">
        <button className="btn btn-primary" type="button" onClick={install}>
          Install
        </button>
        <button
          className="icon-btn install-notice-dismiss"
          type="button"
          aria-label="Dismiss install notification"
          onClick={() => setIsVisible(false)}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </aside>
  );
}
