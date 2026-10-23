const CACHE_NAME = 'attis-app-shell-v7';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/brinfolynk-mark.png',
  '/brinfolynk-180-v2.png',
  '/brinfolynk-192.png',
  '/brinfolynk-512.png',
  '/brinfolynk-splash.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(APP_SHELL);
      const manifestResponse = await fetch('/asset-manifest.json');
      if (!manifestResponse.ok) {
        throw new Error(`Could not load the offline asset manifest (${manifestResponse.status}).`);
      }
      const manifest = await manifestResponse.json();
      const assets = new Set(['/asset-manifest.json']);
      for (const entry of Object.values(manifest)) {
        for (const file of [entry.file, ...(entry.css ?? []), ...(entry.assets ?? [])]) {
          if (file) assets.add(`/${file}`);
        }
      }
      await cache.addAll([...assets]);
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => Promise.all(
      cacheNames
        .filter((cacheName) => cacheName.startsWith('attis-app-shell-') && cacheName !== CACHE_NAME)
        .map((cacheName) => caches.delete(cacheName)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  ) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cachedIndex = await caches.match('/index.html');
        if (self.navigator.onLine === false && cachedIndex) return cachedIndex;

        try {
          const response = await fetch(request);
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy)));
          }
          return response;
        } catch (error) {
          if (cachedIndex) return cachedIndex;
          const cachedRoot = await caches.match('/');
          if (cachedRoot) return cachedRoot;
          throw error;
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
        }
        return response;
      })),
    );
  }
});
