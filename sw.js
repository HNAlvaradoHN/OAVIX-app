const CACHE = 'oavix-shell-v2';
const APP_SHELL = [
  './',
  './index.html',
  './oavix-sync.js',
  './oavix-sync-config.js',
  './manifest.webmanifest',
  './icon.svg'
];

/* Cachea cada recurso por separado: un 404 en un archivo opcional no debe
   abortar la instalación completa del service worker sin dejar rastro. */
async function precacheAppShell() {
  const cache = await caches.open(CACHE);
  const results = await Promise.allSettled(APP_SHELL.map(url => cache.add(url)));
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.warn('[OAVIX SW] No se pudo precachear', APP_SHELL[i], result.reason);
    }
  });
}

self.addEventListener('install', event => {
  event.waitUntil(
    precacheAppShell()
      .catch(err => console.error('[OAVIX SW] Falló el precacheo del app shell', err))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .catch(err => console.error('[OAVIX SW] Falló la limpieza de cachés antiguos', err))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    const copy = response.clone();
    caches.open(CACHE)
      .then(cache => cache.put(request, copy))
      .catch(err => console.warn('[OAVIX SW] No se pudo guardar en caché', request.url, err));
    return response;
  } catch (networkError) {
    const cached = await caches.match(request) || await caches.match('./index.html');
    if (cached) return cached;
    console.error('[OAVIX SW] Sin red y sin copia en caché para', request.url, networkError);
    return new Response('OAVIX no está disponible sin conexión para este recurso.', {
      status: 503,
      statusText: 'Offline',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(networkFirst(event.request));
});
