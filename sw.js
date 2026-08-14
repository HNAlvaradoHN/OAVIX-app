const CACHE = 'oavix-shell-v15';
const APP_SHELL = [
  './',
  './index.html',
  './oavix-sync-config.js',
  './src/services/sync/context.js',
  './src/services/sync/merge-engine.js',
  './src/services/sync/account-storage.js',
  './src/services/sync/feedback.js',
  './src/services/sync/google-auth.js',
  './src/services/sync/drive-client.js',
  './src/services/sync/synchronizer.js',
  './src/services/sync/ui.js',
  './src/services/sync/bootstrap.js',
  './src/features/fuel/module.js',
  './data/sen-prices.json',
  './src/app.js',
  './src/config/tailwind.js',
  './src/styles/app.css',
  './src/core/utils.js',
  './src/core/state.js',
  './src/core/storage.js',
  './src/core/bootstrap.js',
  './src/ui/toasts/controller.js',
  './src/ui/theme/controller.js',
  './src/features/export/controller.js',
  './src/ui/settings/controller.js',
  './src/ui/navigation/controller.js',
  './src/features/dashboard/controller.js',
  './src/features/maintenance/controller.js',
  './src/features/archive/controller.js',
  './src/features/calendar/controller.js',
  './src/features/alerts/controller.js',
  './src/features/fuel/controller.js',
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
  './src/ui/settings/view.html',
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
