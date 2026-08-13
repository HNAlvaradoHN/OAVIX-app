import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const SESSION_KEY = 'oavix_google_session';
const PENDING_KEY = 'oavix_sync_pending';
const LAST_SYNC_KEY = 'oavix_sync_last';
const CATEGORY_KEY = 'oavix_auto_categories';
const EMAIL = 'piloto@oavix.hn';

const accountKey = (email, key) => 'oavix_account_' + encodeURIComponent(email.toLowerCase()) + '__' + key;
const metaKey = email => accountKey(email, '__meta');
const localUpdatedKey = email => accountKey(email, 'local_updated');

let originalLocation;
let reload;
let fetchMock;
let tokenClientState;

/**
 * jsdom expone localStorage a través de un Proxy que convierte cualquier
 * asignación de propiedad en un valor almacenado, así que el parche que
 * account-storage.js aplica sobre setItem/removeItem no se instalaría. Este doble
 * cumple la misma API con propiedades normales.
 */
function createStorage() {
  const map = new Map();
  return {
    getItem: key => (map.has(String(key)) ? map.get(String(key)) : null),
    setItem: (key, value) => { map.set(String(key), String(value)); },
    removeItem: key => { map.delete(String(key)); },
    clear: () => map.clear(),
    key: index => Array.from(map.keys())[index] ?? null,
    get length() { return map.size; }
  };
}

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/** Minimal stand-in for Google Identity Services token client. */
function stubGoogleIdentity() {
  const state = { config: null, requests: [], nextToken: 1 };
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient: vi.fn(config => {
          state.config = config;
          return {
            requestAccessToken: vi.fn(options => {
              state.requests.push(options);
              state.config.callback({ access_token: 'token-' + state.nextToken++, expires_in: 3600 });
            })
          };
        })
      }
    }
  };
  return state;
}

function setOnline(value) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });
}

function seedSession(email = EMAIL) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ email, displayName: 'Piloto' }));
}

function seedAccountSnapshot(email, data, updatedAt) {
  localStorage.setItem(metaKey(email), JSON.stringify({ schemaVersion: 5, updatedAt, data }));
  localStorage.setItem(localUpdatedKey(email), updatedAt);
}

async function loadSync() {
  delete window.__OAVIX_SYNC_V6__;
  delete window.__OAVIX_SYNC_V7__;
  delete window.OAVIXSyncInternal;
  delete window.OAVIXDriveSync;
  vi.resetModules();
  await import('../src/services/sync/context.js');
  await import('../src/services/sync/merge-engine.js');
  await import('../src/services/sync/account-storage.js');
  await import('../src/services/sync/feedback.js');
  await import('../src/services/sync/google-auth.js');
  await import('../src/services/sync/drive-client.js');
  await import('../src/services/sync/synchronizer.js');
  await import('../src/services/sync/ui.js');
  await import('../src/services/sync/bootstrap.js');
  return window.OAVIXDriveSync;
}

/** Routes the Drive REST calls the module makes onto configurable fakes. */
function driveBackend({ files = [], content = null, about = { user: { emailAddress: EMAIL, displayName: 'Piloto' } } } = {}) {
  const calls = [];
  fetchMock.mockImplementation(async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', options });
    if (url.includes('/drive/v3/about')) return jsonResponse(about);
    if (url.includes('uploadType=multipart')) return jsonResponse({ id: 'new-file', modifiedTime: '2025-04-01T00:00:00.000Z' });
    if (url.includes('uploadType=media')) return jsonResponse({ id: 'file-1' });
    if (url.includes('alt=media')) return jsonResponse(content);
    if (url.includes('/drive/v3/files?q=')) return jsonResponse({ files });
    throw new Error('unexpected request: ' + url);
  });
  return calls;
}

/** A single in-memory Drive file shared by multiple simulated devices. */
function sharedDriveBackend(initialContent = null) {
  let content = initialContent;
  const calls = [];
  fetchMock.mockImplementation(async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', options });
    if (url.includes('/drive/v3/about')) {
      return jsonResponse({ user: { emailAddress: EMAIL, displayName: 'Piloto' } });
    }
    if (url.includes('uploadType=multipart')) {
      const marker = 'Content-Type: application/json\r\n\r\n';
      const start = options.body.lastIndexOf(marker) + marker.length;
      const end = options.body.lastIndexOf('\r\n--');
      content = JSON.parse(options.body.slice(start, end));
      return jsonResponse({ id: 'shared-file', modifiedTime: content.updatedAt });
    }
    if (url.includes('uploadType=media')) {
      content = JSON.parse(options.body);
      return jsonResponse({ id: 'shared-file', modifiedTime: content.updatedAt });
    }
    if (url.includes('alt=media')) return jsonResponse(structuredClone(content));
    if (url.includes('/drive/v3/files?q=')) {
      return jsonResponse({
        files: content
          ? [{ id: 'shared-file', name: 'oavix-data.json', modifiedTime: content.updatedAt }]
          : []
      });
    }
    throw new Error('unexpected request: ' + url);
  });
  return { calls, content: () => structuredClone(content) };
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: createStorage(), configurable: true, writable: true });
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  vi.restoreAllMocks();
  setOnline(true);
  window.OAVIX_GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
  window.showToast = vi.fn();
  fetchMock = vi.fn();
  window.fetch = fetchMock;
  tokenClientState = stubGoogleIdentity();
  reload = vi.fn();
  originalLocation = window.location;
  delete window.location;
  window.location = { origin: originalLocation.origin, href: originalLocation.href, reload };
});

afterEach(() => {
  window.location = originalLocation;
  vi.useRealTimers();
});

describe('account bootstrap', () => {
  it('restores the snapshot of the signed-in account', async () => {
    seedSession();
    seedAccountSnapshot(EMAIL, { oavix_auto_records: '[{"id":1}]', oavix_auto_unit: 'km' }, '2025-04-01T00:00:00.000Z');
    localStorage.setItem('oavix_auto_mileage', '999');
    localStorage.setItem(PENDING_KEY, 'true');

    await loadSync();

    expect(localStorage.getItem('oavix_auto_records')).toBe('[{"id":1}]');
    expect(localStorage.getItem('oavix_auto_unit')).toBe('km');
    // Las claves ausentes del snapshot se eliminan para no mezclar cuentas.
    expect(localStorage.getItem('oavix_auto_mileage')).toBeNull();
    expect(localStorage.getItem(LAST_SYNC_KEY)).toBe('2025-04-01T00:00:00.000Z');
    // Una edición pendiente sobrevive al cierre y se enviará al recuperar conexión.
    expect(localStorage.getItem(PENDING_KEY)).toBe('true');
  });

  it('clears active data when nobody is signed in and the migration already ran', async () => {
    localStorage.setItem('oavix_auto_records', '[{"id":1}]');
    localStorage.setItem('oavix_migration_v5', 'done');

    await loadSync();

    expect(localStorage.getItem('oavix_auto_records')).toBeNull();
  });

  it('keeps legacy data around while the migration is still pending', async () => {
    localStorage.setItem('oavix_auto_records', '[{"id":1}]');

    await loadSync();

    expect(localStorage.getItem('oavix_auto_records')).toBe('[{"id":1}]');
  });

  it('ignores a corrupt session entry', async () => {
    localStorage.setItem(SESSION_KEY, '{broken');
    localStorage.setItem('oavix_migration_v5', 'done');
    localStorage.setItem('oavix_auto_records', '[{"id":1}]');

    await loadSync();

    expect(localStorage.getItem('oavix_auto_records')).toBeNull();
  });
});

describe('localStorage interception', () => {
  it('marks tracked keys as pending, snapshots them and debounces a sync', async () => {
    vi.useFakeTimers();
    seedSession();
    seedAccountSnapshot(EMAIL, {}, '2025-04-01T00:00:00.000Z');
    await loadSync();
    setOnline(false);

    localStorage.setItem('oavix_auto_records', '[{"id":7}]');

    expect(localStorage.getItem(PENDING_KEY)).toBe('true');
    const snapshot = JSON.parse(localStorage.getItem(metaKey(EMAIL)));
    expect(snapshot.data.oavix_auto_records).toBe('[{"id":7}]');
    expect(snapshot.updatedAt).toBe(localStorage.getItem(localUpdatedKey(EMAIL)));
    expect(window.showToast).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1600);
    expect(window.showToast).toHaveBeenCalledWith('✓ Guardado localmente', expect.any(String), 'amber');
  });

  it('tracks removals of synced keys', async () => {
    vi.useFakeTimers();
    seedSession();
    seedAccountSnapshot(EMAIL, { oavix_auto_records: '[{"id":7}]' }, '2025-04-01T00:00:00.000Z');
    await loadSync();
    setOnline(false);

    localStorage.removeItem('oavix_auto_records');

    expect(localStorage.getItem(PENDING_KEY)).toBe('true');
    expect(JSON.parse(localStorage.getItem(metaKey(EMAIL))).data.oavix_auto_records).toBeUndefined();
  });

  it('leaves untracked keys alone', async () => {
    vi.useFakeTimers();
    seedSession();
    // Categorías ya gestionadas: el arranque no debe escribir claves sincronizadas.
    localStorage.setItem(CATEGORY_KEY, JSON.stringify(['Frenos']));
    seedAccountSnapshot(EMAIL, { [CATEGORY_KEY]: JSON.stringify(['Frenos']) }, '2025-04-01T00:00:00.000Z');
    await loadSync();

    localStorage.setItem('oavix_fuel_data', '{}');
    localStorage.removeItem('oavix_fuel_data');

    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not schedule a sync when a module saves the same value again', async () => {
    vi.useFakeTimers();
    seedSession();
    seedAccountSnapshot(EMAIL, {}, '2026-08-10T10:00:00.000Z');
    localStorage.setItem('oavix_fuel_history', '[{"id":"same"}]');
    await loadSync();

    localStorage.setItem('oavix_fuel_history', '[{"id":"same"}]');
    await vi.advanceTimersByTimeAsync(2000);

    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('syncNow', () => {
  it('queues the sync while offline', async () => {
    seedSession();
    seedAccountSnapshot(EMAIL, {}, '2025-04-01T00:00:00.000Z');
    const sync = await loadSync();
    setOnline(false);

    await sync.syncNow();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(PENDING_KEY)).toBe('true');
    expect(window.showToast).toHaveBeenCalledWith('✓ Guardado localmente', expect.any(String), 'amber');
  });

  it('does nothing when nobody is signed in', async () => {
    const sync = await loadSync();

    await sync.syncNow();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates the Drive file on the first sync', async () => {
    seedSession();
    seedAccountSnapshot(EMAIL, { oavix_auto_records: '[{"id":1}]' }, '2025-04-01T00:00:00.000Z');
    const calls = driveBackend({ files: [] });
    const sync = await loadSync();

    await sync.syncNow();

    const upload = calls.find(c => c.url.includes('uploadType=multipart'));
    expect(upload.method).toBe('POST');
    expect(upload.options.headers['Content-Type']).toMatch(/^multipart\/related; boundary=oavix_/);
    expect(upload.options.body).toContain('"name":"oavix-data.json"');
    expect(upload.options.body).toContain('oavix_auto_records');
    expect(upload.options.headers.Authorization).toBe('Bearer token-1');
    expect(localStorage.getItem(LAST_SYNC_KEY)).toBe('2025-04-01T00:00:00.000Z');
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
    expect(window.showToast).toHaveBeenLastCalledWith('✓ Sincronizado correctamente', expect.any(String), 'emerald');
  });

  it('uploads the local copy when it is newer than the cloud copy', async () => {
    seedSession();
    seedAccountSnapshot(EMAIL, { oavix_auto_records: '[{"id":2}]' }, '2025-04-05T00:00:00.000Z');
    localStorage.setItem('oavix_auto_records', '[{"id":2}]');
    const calls = driveBackend({
      files: [{ id: 'file-1', name: 'oavix-data.json', modifiedTime: '2025-04-02T00:00:00.000Z' }],
      content: { schemaVersion: 5, updatedAt: '2025-04-02T00:00:00.000Z', data: { oavix_auto_records: '[{"id":1}]' } }
    });
    const sync = await loadSync();

    await sync.syncNow();

    const patch = calls.find(c => c.url.includes('uploadType=media'));
    expect(patch.method).toBe('PATCH');
    expect(JSON.parse(patch.options.body).data.oavix_auto_records).toBe('[{"id":2}]');
    expect(localStorage.getItem('oavix_auto_records')).toBe('[{"id":2}]');
  });

  it('applies the cloud copy when it is newer', async () => {
    seedSession();
    seedAccountSnapshot(EMAIL, { oavix_auto_records: '[{"id":1}]', oavix_auto_unit: 'mi' }, '2025-04-01T00:00:00.000Z');
    const calls = driveBackend({
      files: [{ id: 'file-1', name: 'oavix-data.json', modifiedTime: '2025-04-09T00:00:00.000Z' }],
      content: { schemaVersion: 5, updatedAt: '2025-04-09T00:00:00.000Z', data: { oavix_auto_records: '[{"id":9}]' } }
    });
    const sync = await loadSync();

    await sync.syncNow();

    expect(localStorage.getItem('oavix_auto_records')).toBe('[{"id":9}]');
    expect(localStorage.getItem('oavix_auto_unit')).toBeNull();
    expect(localStorage.getItem(LAST_SYNC_KEY)).toBe('2025-04-09T00:00:00.000Z');
    expect(calls.some(c => c.url.includes('uploadType='))).toBe(false);
  });

  it('only refreshes the local stamps when both copies match', async () => {
    seedSession();
    seedAccountSnapshot(EMAIL, { oavix_auto_records: '[{"id":1}]' }, '2025-04-01T00:00:00.000Z');
    const calls = driveBackend({
      files: [{ id: 'file-1', name: 'oavix-data.json', modifiedTime: '2025-04-09T00:00:00.000Z' }],
      content: { schemaVersion: 5, updatedAt: '2025-04-09T00:00:00.000Z', data: { oavix_auto_records: '[{"id":1}]' } }
    });
    const sync = await loadSync();

    await sync.syncNow();

    expect(calls.some(c => c.url.includes('uploadType='))).toBe(false);
    expect(localStorage.getItem(localUpdatedKey(EMAIL))).toBe('2025-04-09T00:00:00.000Z');
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('retries once with an interactive token after a 401', async () => {
    seedSession();
    seedAccountSnapshot(EMAIL, {}, '2025-04-01T00:00:00.000Z');
    let first = true;
    fetchMock.mockImplementation(async url => {
      if (first) {
        first = false;
        return jsonResponse(null, 401);
      }
      if (url.includes('uploadType=multipart')) return jsonResponse({ id: 'new-file' });
      return jsonResponse({ files: [] });
    });
    const sync = await loadSync();

    await sync.syncNow();

    expect(tokenClientState.requests).toHaveLength(2);
    expect(tokenClientState.requests[1].prompt).toBe('select_account');
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('keeps the data pending when Drive fails', async () => {
    seedSession();
    seedAccountSnapshot(EMAIL, {}, '2025-04-01T00:00:00.000Z');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockResolvedValue(jsonResponse(null, 500));
    const sync = await loadSync();

    await sync.syncNow();

    expect(localStorage.getItem(PENDING_KEY)).toBe('true');
    expect(window.showToast).toHaveBeenLastCalledWith('⚠ Guardado localmente', expect.any(String), 'amber');
  });

  it('reports a missing client id', async () => {
    seedSession();
    seedAccountSnapshot(EMAIL, {}, '2025-04-01T00:00:00.000Z');
    window.OAVIX_GOOGLE_CLIENT_ID = '';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sync = await loadSync();

    await sync.syncNow();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.showToast).toHaveBeenLastCalledWith('⚠ Guardado localmente', expect.any(String), 'amber');
  });

  it('syncs again when the browser comes back online with pending changes', async () => {
    vi.useFakeTimers();
    seedSession();
    seedAccountSnapshot(EMAIL, {}, '2025-04-01T00:00:00.000Z');
    driveBackend({ files: [] });
    await loadSync();
    localStorage.setItem(PENDING_KEY, 'true');

    window.dispatchEvent(new window.Event('online'));
    await vi.advanceTimersByTimeAsync(500);

    expect(fetchMock).toHaveBeenCalled();
  });

  it('checks Drive again when the user returns to the app', async () => {
    vi.useFakeTimers();
    seedSession();
    seedAccountSnapshot(EMAIL, {}, '2026-08-10T10:00:00.000Z');
    driveBackend({ files: [] });
    await loadSync();

    window.dispatchEvent(new window.Event('focus'));
    await vi.advanceTimersByTimeAsync(300);

    expect(fetchMock).toHaveBeenCalled();
  });
});

describe('cross-device pull', () => {
  const needsPullKey = email => accountKey(email, 'needs_pull');

  it('downloads the account data on a device that has no local copy', async () => {
    vi.useFakeTimers();
    seedSession();
    const calls = driveBackend({
      files: [{ id: 'file-1', name: 'oavix-data.json', modifiedTime: '2025-04-09T00:00:00.000Z' }],
      content: { schemaVersion: 5, updatedAt: '2025-04-09T00:00:00.000Z', data: { oavix_auto_records: '[{"id":9}]' } }
    });
    const sync = await loadSync();

    await sync.syncNow();

    // Nunca se sube la copia vacía del dispositivo nuevo.
    expect(calls.some(c => c.url.includes('uploadType='))).toBe(false);
    expect(localStorage.getItem('oavix_auto_records')).toBe('[{"id":9}]');
    expect(localStorage.getItem(localUpdatedKey(EMAIL))).toBe('2025-04-09T00:00:00.000Z');
    await vi.advanceTimersByTimeAsync(1000);
    expect(reload).toHaveBeenCalled();
  });

  it('removes the exact old demo record from an existing Drive file', async () => {
    seedSession();
    const demo = {
      id: '1',
      title: 'Cambio de Aceite Sintético',
      category: 'Cambio de Aceite',
      amount: 60,
      mileage: 86000,
      provider: 'Taller San Pedro',
      date: '2026-06-01',
      notes: 'Filtro nuevo'
    };
    const real = { id: 'real', title: 'Mi mantenimiento' };
    const calls = driveBackend({
      files: [{ id: 'file-1', name: 'oavix-data.json', modifiedTime: '2026-08-10T10:00:00.000Z' }],
      content: {
        schemaVersion: 5,
        updatedAt: '2026-08-10T10:00:00.000Z',
        data: { oavix_auto_records: JSON.stringify([demo, real]) }
      }
    });
    const sync = await loadSync();

    await sync.syncNow();

    expect(JSON.parse(localStorage.getItem('oavix_auto_records'))).toEqual([real]);
    const patchCall = calls.find(call => call.url.includes('uploadType=media'));
    expect(JSON.parse(JSON.parse(patchCall.options.body).data.oavix_auto_records)).toEqual([real]);
  });

  it('still pulls first when the user edited something before the sync ran', async () => {
    vi.useFakeTimers();
    seedSession();
    localStorage.setItem(needsPullKey(EMAIL), 'true');
    const calls = driveBackend({
      files: [{ id: 'file-1', name: 'oavix-data.json', modifiedTime: '2025-04-09T00:00:00.000Z' }],
      content: { schemaVersion: 5, updatedAt: '2025-04-09T00:00:00.000Z', data: { oavix_auto_records: '[{"id":9}]' } }
    });
    const sync = await loadSync();
    localStorage.setItem('oavix_auto_records', '[{"id":100}]');

    await sync.syncNow();

    // El registro creado antes de la primera descarga se combina con Drive.
    expect(calls.some(c => c.url.includes('uploadType=media'))).toBe(true);
    expect(JSON.parse(localStorage.getItem('oavix_auto_records')).map(record => record.id)).toEqual([100, 9]);
    expect(localStorage.getItem(needsPullKey(EMAIL))).toBeNull();
  });

  it('uploads on a device with no local copy when Drive has no file yet', async () => {
    seedSession();
    localStorage.setItem('oavix_auto_records', '[{"id":1}]');
    const calls = driveBackend({ files: [] });
    const sync = await loadSync();

    await sync.syncNow();

    expect(calls.some(c => c.url.includes('uploadType=multipart'))).toBe(true);
    expect(localStorage.getItem(needsPullKey(EMAIL))).toBeNull();
  });

  it('reloads after adopting newer data from another device', async () => {
    vi.useFakeTimers();
    seedSession();
    seedAccountSnapshot(EMAIL, { oavix_auto_records: '[{"id":1}]' }, '2025-04-01T00:00:00.000Z');
    driveBackend({
      files: [{ id: 'file-1', name: 'oavix-data.json', modifiedTime: '2025-04-09T00:00:00.000Z' }],
      content: { schemaVersion: 5, updatedAt: '2025-04-09T00:00:00.000Z', data: { oavix_auto_records: '[{"id":9}]' } }
    });
    const sync = await loadSync();

    await sync.syncNow();
    await vi.advanceTimersByTimeAsync(1000);

    expect(localStorage.getItem('oavix_auto_records')).toBe('[{"id":9}]');
    expect(reload).toHaveBeenCalled();
  });

  it('syncs on load for a signed-in account even without pending changes', async () => {
    vi.useFakeTimers();
    seedSession();
    seedAccountSnapshot(EMAIL, { oavix_auto_records: '[{"id":1}]' }, '2025-04-01T00:00:00.000Z');
    driveBackend({ files: [] });
    await loadSync();

    document.dispatchEvent(new window.Event('DOMContentLoaded'));
    await vi.advanceTimersByTimeAsync(1000);

    expect(fetchMock).toHaveBeenCalled();
  });

  it('marks a newly signed-in account so its data is pulled from Drive', async () => {
    localStorage.setItem('oavix_migration_v5', 'done');
    driveBackend();
    const sync = await loadSync();

    await sync.loginWithGoogle();

    expect(localStorage.getItem(needsPullKey(EMAIL))).toBeNull();
    expect(fetchMock).toHaveBeenCalled();
  });

  it('keeps fuel data that older snapshots never tracked', async () => {
    seedSession();
    const snapshot = { schemaVersion: 5, updatedAt: '2025-04-01T00:00:00.000Z', data: { oavix_auto_records: '[{"id":1}]' } };
    localStorage.setItem(metaKey(EMAIL), JSON.stringify(snapshot));
    localStorage.setItem('oavix_fuel_history', '[{"id":"1"}]');

    await loadSync();

    expect(localStorage.getItem('oavix_fuel_history')).toBe('[{"id":"1"}]');
  });

  it('keeps fuel data that an older Drive file never tracked', async () => {
    vi.useFakeTimers();
    seedSession();
    seedAccountSnapshot(EMAIL, { oavix_auto_records: '[{"id":1}]' }, '2025-04-01T00:00:00.000Z');
    localStorage.setItem('oavix_fuel_history', '[{"id":"1"}]');
    driveBackend({
      files: [{ id: 'file-1', name: 'oavix-data.json', modifiedTime: '2025-04-09T00:00:00.000Z' }],
      content: { schemaVersion: 5, updatedAt: '2025-04-09T00:00:00.000Z', data: { oavix_auto_records: '[{"id":9}]' } }
    });
    const sync = await loadSync();

    await sync.syncNow();

    expect(localStorage.getItem('oavix_auto_records')).toBe('[{"id":9}]');
    expect(localStorage.getItem('oavix_fuel_history')).toBe('[{"id":"1"}]');
  });

  it('does not flag pending changes when opening the app offline', async () => {
    vi.useFakeTimers();
    seedSession();
    seedAccountSnapshot(EMAIL, { oavix_auto_records: '[{"id":1}]', [CATEGORY_KEY]: '["Frenos"]' }, '2025-04-01T00:00:00.000Z');
    await loadSync();
    window.showToast.mockClear();
    setOnline(false);

    document.dispatchEvent(new window.Event('DOMContentLoaded'));
    await vi.advanceTimersByTimeAsync(1000);

    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
    expect(window.showToast).not.toHaveBeenCalledWith(expect.stringContaining('Guardado localmente'), expect.anything(), expect.anything());
  });

  it('warns about unsent changes when the user syncs by hand while offline', async () => {
    seedSession();
    seedAccountSnapshot(EMAIL, { oavix_auto_records: '[{"id":1}]', [CATEGORY_KEY]: '["Frenos"]' }, '2025-04-01T00:00:00.000Z');
    const sync = await loadSync();
    setOnline(false);

    await sync.syncNow();

    expect(localStorage.getItem(PENDING_KEY)).toBe('true');
  });

  it('does not reload in a loop when the Drive file has no data', async () => {
    vi.useFakeTimers();
    seedSession();
    driveBackend({
      files: [{ id: 'file-1', name: 'oavix-data.json', modifiedTime: '2025-04-09T00:00:00.000Z' }],
      content: { schemaVersion: 5, updatedAt: '2025-04-09T00:00:00.000Z' }
    });
    const sync = await loadSync();

    await sync.syncNow();
    await vi.advanceTimersByTimeAsync(1000);

    expect(reload).not.toHaveBeenCalled();
    expect(localStorage.getItem(needsPullKey(EMAIL))).toBeNull();
  });

  it('keeps the fuel history and vehicle setup per account', async () => {
    vi.useFakeTimers();
    seedSession();
    seedAccountSnapshot(EMAIL, {}, '2025-04-01T00:00:00.000Z');
    await loadSync();
    setOnline(false);

    localStorage.setItem('oavix_fuel_history', '[{"id":"1","gallons":5}]');

    expect(localStorage.getItem(PENDING_KEY)).toBe('true');
    const snapshot = JSON.parse(localStorage.getItem(metaKey(EMAIL)));
    expect(snapshot.data.oavix_fuel_history).toBe('[{"id":"1","gallons":5}]');
  });
});

describe('phone, tablet and phone round trip', () => {
  it('downloads, extends and returns the combined Drive history', async () => {
    const drive = sharedDriveBackend();
    const phoneStorage = localStorage;
    seedSession();
    seedAccountSnapshot(
      EMAIL,
      { oavix_auto_records: '[{"id":"phone","title":"Aceite"}]' },
      '2026-08-10T10:00:00.000Z'
    );
    await loadSync();

    await window.OAVIXSyncInternal.synchronizer.syncNow(false, { reload: false });
    expect(JSON.parse(drive.content().data.oavix_auto_records).map(record => record.id)).toEqual(['phone']);

    const tabletStorage = createStorage();
    Object.defineProperty(window, 'localStorage', { value: tabletStorage, configurable: true, writable: true });
    seedSession();
    await loadSync();
    await window.OAVIXSyncInternal.synchronizer.syncNow(false, { reload: false });
    expect(JSON.parse(localStorage.getItem('oavix_auto_records')).map(record => record.id)).toEqual(['phone']);

    localStorage.setItem(
      'oavix_auto_records',
      JSON.stringify([
        { id: 'phone', title: 'Aceite' },
        { id: 'tablet', title: 'Frenos' }
      ])
    );
    await window.OAVIXSyncInternal.synchronizer.syncNow(false, { reload: false });
    expect(JSON.parse(drive.content().data.oavix_auto_records).map(record => record.id)).toEqual(['tablet', 'phone']);

    Object.defineProperty(window, 'localStorage', { value: phoneStorage, configurable: true, writable: true });
    await loadSync();
    await window.OAVIXSyncInternal.synchronizer.syncNow(false, { reload: false });

    expect(JSON.parse(localStorage.getItem('oavix_auto_records')).map(record => record.id)).toEqual(['tablet', 'phone']);
    expect(drive.calls.filter(call => call.url.includes('uploadType=')).length).toBeGreaterThanOrEqual(2);
  });
});

describe('sign in and sign out', () => {
  it('downloads Drive before showing the signed-in application', async () => {
    const cloudRecord = { id: 'cloud', title: 'Mantenimiento desde otro teléfono' };
    driveBackend({
      files: [{ id: 'file-1', name: 'oavix-data.json', modifiedTime: '2026-08-10T11:00:00.000Z' }],
      content: {
        schemaVersion: 5,
        updatedAt: '2026-08-10T11:00:00.000Z',
        data: { oavix_auto_records: JSON.stringify([cloudRecord]) }
      }
    });
    const demoRecord = {
      id: '1',
      title: 'Cambio de Aceite Sintético',
      category: 'Cambio de Aceite',
      amount: 60,
      mileage: 86000,
      provider: 'Taller San Pedro',
      date: '2026-06-01',
      notes: 'Filtro nuevo'
    };
    localStorage.setItem('oavix_auto_records', JSON.stringify([demoRecord]));
    const sync = await loadSync();
    let recordsAtReload = null;
    reload.mockImplementation(() => {
      recordsAtReload = JSON.parse(localStorage.getItem('oavix_auto_records'));
    });

    await sync.loginWithGoogle();

    expect(recordsAtReload).toEqual([cloudRecord]);
    expect(localStorage.getItem('oavix_migration_v5')).toBe('done');
  });

  it('stores the session for the Google account and reloads', async () => {
    driveBackend({ about: { user: { emailAddress: 'Nueva@OAVIX.hn', displayName: 'Nueva' } } });
    localStorage.setItem('oavix_auto_records', '[{"id":1}]');
    const sync = await loadSync();

    await sync.loginWithGoogle();

    expect(tokenClientState.requests[0].prompt).toBe('select_account');
    expect(JSON.parse(localStorage.getItem(SESSION_KEY))).toEqual({ email: 'Nueva@OAVIX.hn', displayName: 'Nueva' });
    expect(localStorage.getItem('oavix_current_user_name')).toBe('Nueva@OAVIX.hn');
    // Los datos existentes se adoptan una única vez para la primera cuenta.
    expect(localStorage.getItem('oavix_migration_v5')).toBe('done');
    expect(localStorage.getItem('oavix_auto_records')).toBe('[{"id":1}]');
    expect(reload).toHaveBeenCalled();
  });

  it('restores an already known account and drops the previous data', async () => {
    localStorage.setItem('oavix_migration_v5', 'done');
    seedAccountSnapshot(EMAIL, { oavix_auto_unit: 'km' }, '2025-04-01T00:00:00.000Z');
    driveBackend();
    const sync = await loadSync();

    await sync.loginWithGoogle();

    expect(localStorage.getItem('oavix_auto_unit')).toBe('km');
  });

  it('starts empty for an unknown account', async () => {
    localStorage.setItem('oavix_migration_v5', 'done');
    localStorage.setItem('oavix_auto_unit', 'mi');
    driveBackend();
    const sync = await loadSync();

    await sync.loginWithGoogle();

    expect(localStorage.getItem('oavix_auto_unit')).toBeNull();
  });

  it('surfaces a failure when Google does not return an account', async () => {
    driveBackend({ about: { user: {} } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sync = await loadSync();

    await sync.loginWithGoogle();

    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(window.showToast).toHaveBeenCalledWith('No se pudo iniciar sesión', expect.any(String), 'rose');
    expect(reload).not.toHaveBeenCalled();
  });

  it('clears the session, keeps the account snapshot and reloads on logout', async () => {
    vi.useFakeTimers();
    seedSession();
    seedAccountSnapshot(EMAIL, { oavix_auto_unit: 'km' }, '2025-04-01T00:00:00.000Z');
    localStorage.setItem('oavix_current_user_pin', '1234');
    const sync = await loadSync();

    sync.logoutSession();

    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(localStorage.getItem('oavix_current_user_pin')).toBeNull();
    expect(localStorage.getItem('oavix_auto_unit')).toBeNull();
    expect(JSON.parse(localStorage.getItem(metaKey(EMAIL))).data.oavix_auto_unit).toBe('km');

    await vi.advanceTimersByTimeAsync(200);
    expect(reload).toHaveBeenCalled();
  });
});

describe('UI wiring on DOMContentLoaded', () => {
  async function initUI() {
    document.dispatchEvent(new window.Event('DOMContentLoaded'));
    await vi.advanceTimersByTimeAsync(1000);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <header><div class="flex flex-wrap items-center gap-1">
        <button onclick="giveAppLike()">Like</button>
        <button title="Otro">Otro</button>
      </div></header>
      <span id="user-session-badge">badge</span>
      <div><span id="banner-username-tag"></span></div>
      <button><span id="global-likes-count">3</span></button>`;
  });

  it('shows the login modal when there is no session', async () => {
    await loadSync();
    await initUI();

    const modal = document.getElementById('modal-login');
    expect(modal.style.display).toBe('flex');
    expect(document.getElementById('oavix-google-login')).not.toBeNull();
    expect(document.getElementById('oavix-v5-css')).not.toBeNull();
    expect(document.querySelector('link[rel=manifest]').getAttribute('href')).toBe('manifest.webmanifest?v=5');
    expect(document.querySelector('meta[name="theme-color"]').content).toBe('#030712');
  });

  it('mounts the session UI before later DOMContentLoaded listeners run', async () => {
    await loadSync();
    let modalSeenByPageListener = false;
    document.addEventListener('DOMContentLoaded', () => {
      modalSeenByPageListener = Boolean(document.getElementById('modal-login'));
      window.checkLoginState();
    }, { once: true });

    document.dispatchEvent(new window.Event('DOMContentLoaded'));

    expect(modalSeenByPageListener).toBe(true);
    expect(document.getElementById('modal-login').style.display).toBe('flex');
  });

  it('signs in from the modal button', async () => {
    driveBackend();
    await loadSync();
    await initUI();

    document.getElementById('oavix-google-login').click();
    await vi.waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it('hides the modal, cleans the header and wires the sync button for a session', async () => {
    seedSession();
    seedAccountSnapshot(EMAIL, {}, '2025-04-01T00:00:00.000Z');
    driveBackend({ files: [] });
    await loadSync();
    await initUI();

    expect(document.getElementById('modal-login')).toBeNull();
    expect(document.querySelector('button[onclick="giveAppLike()"]')).toBeNull();
    expect(document.getElementById('global-likes-count')).toBeNull();
    expect(document.getElementById('user-session-badge')).toBeNull();
    expect(document.getElementById('banner-username-tag').textContent).toBe('Usuario: ' + EMAIL);

    const driveButton = document.getElementById('oavix-drive-control');
    driveButton.click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    document.getElementById('oavix-banner-logout').click();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('reuses a login modal already present in the page', async () => {
    const existing = document.createElement('div');
    existing.id = 'modal-login';
    existing.className = 'hidden';
    document.body.appendChild(existing);

    await loadSync();
    await initUI();

    expect(document.querySelectorAll('#modal-login')).toHaveLength(1);
    expect(existing.classList.contains('hidden')).toBe(false);
    expect(existing.querySelector('#oavix-google-login')).not.toBeNull();
  });

  it('exposes checkLoginState so index.html can re-evaluate the session', async () => {
    await loadSync();
    await initUI();

    expect(window.handleLoginSubmit()).toBe(false);
    window.checkLoginState();
    expect(document.getElementById('modal-login').style.display).toBe('flex');
  });
});

describe('Google Identity Services loading', () => {
  /** Simula la carga del script de GIS que el módulo inyecta en el head. */
  function stubScriptLoading({ fail = false } = {}) {
    const google = window.google;
    delete window.google;
    vi.spyOn(document.head, 'appendChild').mockImplementation(node => {
      if (node.tagName === 'SCRIPT') {
        setTimeout(() => {
          if (fail) node.onerror(new Error('network'));
          else {
            window.google = google;
            node.onload();
          }
        }, 0);
        return node;
      }
      return Object.getPrototypeOf(document.head).appendChild.call(document.head, node);
    });
  }

  it('injects the GIS script before requesting a token', async () => {
    seedSession();
    seedAccountSnapshot(EMAIL, {}, '2025-04-01T00:00:00.000Z');
    driveBackend({ files: [] });
    const sync = await loadSync();
    stubScriptLoading();

    await sync.syncNow();

    expect(fetchMock).toHaveBeenCalled();
  });

  it('reports that the GIS script could not be loaded', async () => {
    seedSession();
    seedAccountSnapshot(EMAIL, {}, '2025-04-01T00:00:00.000Z');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sync = await loadSync();
    stubScriptLoading({ fail: true });

    await sync.syncNow();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(PENDING_KEY)).toBe('true');
  });
});

describe('token client failures', () => {
  it('reports when Google denies access', async () => {
    seedSession();
    seedAccountSnapshot(EMAIL, {}, '2025-04-01T00:00:00.000Z');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.google.accounts.oauth2.initTokenClient = config => ({
      requestAccessToken: () => config.callback({ error: 'access_denied', error_description: 'Sin permiso' })
    });
    const sync = await loadSync();

    await sync.syncNow();

    expect(window.showToast).toHaveBeenLastCalledWith('⚠ Guardado localmente', expect.any(String), 'amber');
    expect(localStorage.getItem(PENDING_KEY)).toBe('true');
  });

  it('reports a cancelled sign-in popup', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.google.accounts.oauth2.initTokenClient = config => ({
      requestAccessToken: () => config.error_callback({ type: 'popup_closed' })
    });
    const sync = await loadSync();

    await sync.loginWithGoogle();

    expect(window.showToast).toHaveBeenCalledWith('No se pudo iniciar sesión', 'Se canceló el inicio de sesión.', 'rose');
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('ignores a second sign-in while one is in progress', async () => {
    const openRequests = [];
    window.google.accounts.oauth2.initTokenClient = () => ({
      requestAccessToken: () => openRequests.push(1)
    });
    const sync = await loadSync();

    sync.loginWithGoogle();
    await sync.loginWithGoogle();

    // El segundo intento se descarta: solo se abre un flujo de Google.
    await vi.waitFor(() => expect(openRequests).toHaveLength(1));
  });
});
