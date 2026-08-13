import { describe, it, expect, beforeEach, vi } from 'vitest';

const CACHE = 'oavix-shell-v13';

function createCache() {
  const store = new Map();
  return {
    store,
    addAll: vi.fn(async () => {}),
    put: vi.fn(async (request, response) => {
      store.set(String(request.url || request), response);
    })
  };
}

let cache;
let listeners;

async function loadServiceWorker() {
  vi.resetModules();
  await import('../sw.js');
}

function waitUntil() {
  const promises = [];
  return { promises, waitUntil: p => promises.push(p) };
}

function fetchEvent(url, method = 'GET') {
  const event = {
    request: { url, method },
    response: null,
    respondWith(p) {
      this.response = p;
    }
  };
  return event;
}

beforeEach(async () => {
  listeners = {};
  cache = createCache();

  vi.spyOn(window, 'addEventListener').mockImplementation((type, handler) => {
    listeners[type] = handler;
  });
  self.skipWaiting = vi.fn(async () => {});
  self.clients = { claim: vi.fn(async () => {}) };
  self.caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => [CACHE, 'oavix-shell-v1']),
    delete: vi.fn(async () => true),
    match: vi.fn(async () => undefined)
  };
  self.fetch = vi.fn();

  await loadServiceWorker();
});

describe('service worker lifecycle', () => {
  it('registers the install, activate and fetch handlers', () => {
    expect(Object.keys(listeners).sort()).toEqual(['activate', 'fetch', 'install']);
  });

  it('precaches the app shell and activates immediately on install', async () => {
    const event = waitUntil();
    listeners.install(event);
    await Promise.all(event.promises);

    expect(self.caches.open).toHaveBeenCalledWith(CACHE);
    expect(cache.addAll).toHaveBeenCalledWith([
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
      './oavix-fuel-module.js',
      './src/app.js',
      './src/config/tailwind.js',
      './src/styles/app.css',
      './src/core/utils.js',
      './src/core/state.js',
      './src/core/storage.js',
      './src/core/bootstrap.js',
      './src/ui/toasts/controller.js',
      './src/ui/theme/controller.js',
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
      './src/ui/toasts/view.html',
      './manifest.webmanifest',
      './icon.svg'
    ]);
    expect(self.skipWaiting).toHaveBeenCalled();
  });

  it('deletes stale caches and claims clients on activate', async () => {
    const event = waitUntil();
    listeners.activate(event);
    await Promise.all(event.promises);

    expect(self.caches.delete).toHaveBeenCalledTimes(1);
    expect(self.caches.delete).toHaveBeenCalledWith('oavix-shell-v1');
    expect(self.clients.claim).toHaveBeenCalled();
  });
});

describe('service worker fetch strategy', () => {
  const sameOrigin = url => new URL(url, window.location.origin).href;

  it('ignores non-GET requests', () => {
    const event = fetchEvent(sameOrigin('/index.html'), 'POST');
    listeners.fetch(event);
    expect(event.response).toBeNull();
  });

  it('ignores cross-origin requests', () => {
    const event = fetchEvent('https://accounts.google.com/gsi/client');
    listeners.fetch(event);
    expect(event.response).toBeNull();
  });

  it('serves the network response and caches a clone', async () => {
    const clone = { body: 'clone' };
    const response = { ok: true, clone: vi.fn(() => clone) };
    self.fetch.mockResolvedValue(response);
    const event = fetchEvent(sameOrigin('/index.html'));

    listeners.fetch(event);
    await expect(event.response).resolves.toBe(response);

    expect(cache.put).toHaveBeenCalledWith(event.request, clone);
  });

  it('does not fail the request when writing to the cache fails', async () => {
    const response = { ok: true, clone: vi.fn(() => ({})) };
    self.fetch.mockResolvedValue(response);
    self.caches.open.mockRejectedValue(new Error('cache unavailable'));
    const event = fetchEvent(sameOrigin('/index.html'));

    listeners.fetch(event);
    await expect(event.response).resolves.toBe(response);
  });

  it('falls back to the cached response when offline', async () => {
    const cached = { body: 'cached' };
    self.fetch.mockRejectedValue(new Error('offline'));
    self.caches.match.mockResolvedValue(cached);
    const event = fetchEvent(sameOrigin('/src/services/sync/synchronizer.js'));

    listeners.fetch(event);
    await expect(event.response).resolves.toBe(cached);
    expect(self.caches.match).toHaveBeenCalledWith(event.request);
  });

  it('falls back to the app shell when the request is not cached', async () => {
    const shell = { body: 'shell' };
    self.fetch.mockRejectedValue(new Error('offline'));
    self.caches.match.mockImplementation(async req => (req === './index.html' ? shell : undefined));
    const event = fetchEvent(sameOrigin('/unknown-route'));

    listeners.fetch(event);
    await expect(event.response).resolves.toBe(shell);
  });
});
