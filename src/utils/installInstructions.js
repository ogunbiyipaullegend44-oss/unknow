export function getInstallInstructions({ userAgent = '', platform = '', maxTouchPoints = 0 } = {}) {
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent)
    || (platform === 'MacIntel' && maxTouchPoints > 1);

  if (isIOS) {
    return {
      heading: 'Add Brinfolynk to your Home Screen',
      steps: [
        'Open this page in Safari.',
        'Tap the Share button.',
        'Choose Add to Home Screen, then tap Add.',
      ],
    };
  }

  if (/Android/i.test(userAgent)) {
    return {
      heading: 'Install Brinfolynk on your device',
      steps: [
        'Open the browser menu.',
        'Choose Install app or Add to Home screen.',
        'Confirm the installation.',
      ],
    };
  }

  return {
    heading: 'Install Brinfolynk on your computer',
    steps: [
      'Select the install icon in your browser address bar, or open the browser menu.',
      'Choose Install Brinfolynk or Install this site as an app.',
      'Confirm the installation.',
    ],
  };
}
