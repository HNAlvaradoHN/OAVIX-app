const CACHE = 'oavix-shell-v5';
const APP_SHELL = [
  './',
  './index.html',
  './oavix-sync.js',
  './oavix-sync-config.js',
  './oavix-fuel-module.js',
  './src/app.js',
  './src/config/tailwind.js',
  './src/styles/app.css',
  './src/legacy/app.js',
  './src/app-shell/navigation.html',
  './src/app-shell/header.html',
  './src/features/dashboard/view.html',
  './src/features/maintenance/view.html',
  './src/features/maintenance/overlays.html',
  './src/features/calendar/view.html',
  './src/features/alerts/view.html',
  './src/features/alerts/overlays.html',
  './src/features/fuel/view.html',
  './src/features/archive/view.html',
  './src/ui/theme/view.html',
  './src/ui/toasts/view.html',
  './manifest.webmanifest',
  './icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
  );
});
