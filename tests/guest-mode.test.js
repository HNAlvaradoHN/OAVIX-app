import { beforeEach, describe, expect, it, vi } from 'vitest';

const SESSION_KEY = 'oavix_google_session';
const RECORDS_KEY = 'oavix_auto_records';

async function loadGuestRuntime() {
  delete window.OAVIXSyncInternal;
  vi.resetModules();
  await import('../src/services/sync/context.js');
  await import('../src/services/sync/merge-engine.js');
  await import('../src/services/sync/account-storage.js');
  await import('../src/services/sync/feedback.js');
  await import('../src/services/sync/google-auth.js');
  window.OAVIXSyncInternal.ui = {
    hideLogin: vi.fn(),
    cleanHeader: vi.fn()
  };
  return window.OAVIXSyncInternal;
}

describe('modo invitado', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    window.showToast = vi.fn();
  });

  it('guarda una sesión local sin exigir Google', async () => {
    const runtime = await loadGuestRuntime();

    runtime.auth.enterGuestMode();

    expect(JSON.parse(localStorage.getItem(SESSION_KEY))).toEqual({ mode: 'guest' });
    expect(runtime.context.state.guestMode).toBe(true);
    expect(runtime.context.state.accountEmail).toBe('');
  });

  it('conserva los datos locales del invitado al volver a cargar', async () => {
    let runtime = await loadGuestRuntime();
    runtime.auth.enterGuestMode();
    localStorage.setItem(RECORDS_KEY, JSON.stringify([{ id: 'local-1', title: 'Aceite' }]));

    runtime = await loadGuestRuntime();
    runtime.storage.initializeSession();

    expect(runtime.context.state.guestMode).toBe(true);
    expect(JSON.parse(localStorage.getItem(RECORDS_KEY))).toEqual([
      { id: 'local-1', title: 'Aceite' }
    ]);
  });

  it('no marca cambios del invitado como pendientes de sincronización', async () => {
    const runtime = await loadGuestRuntime();
    runtime.auth.enterGuestMode();
    runtime.storage.installMutationHooks(vi.fn());

    localStorage.setItem(RECORDS_KEY, JSON.stringify([{ id: 'local-2' }]));

    expect(localStorage.getItem('oavix_sync_pending')).toBeNull();
  });
});
