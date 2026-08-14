import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const settingsSource = readFileSync(resolve(process.cwd(), 'src/ui/settings/controller.js'), 'utf8');

function getLogoutController() {
  return new Function(`${settingsSource}; return { confirmSettingsLogout };`)();
}

describe('cierre de sesión protegido', () => {
  it('no cierra offline si hay cambios sin respaldar', async () => {
    document.body.innerHTML = '<div id="oavix-settings-panel"></div><button id="oavix-settings-toggle"></button><div id="oavix-settings-backdrop"></div><button id="oavix-drive-control"></button><span id="settings-sync-state"></span><span id="settings-sync-caption"></span>';
    let pending = 'true';
    const logoutSession = vi.fn();
    const syncNow = vi.fn();
    window.showToast = vi.fn();
    window.OAVIXSyncInternal = {
      context: {
        constants: { pendingKey: 'oavix_sync_pending' },
        nativeStorage: { get: () => pending }
      },
      auth: { logoutSession },
      synchronizer: { syncNow }
    };
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const result = await getLogoutController().confirmSettingsLogout();

    expect(result).toBe(false);
    expect(syncNow).not.toHaveBeenCalled();
    expect(logoutSession).not.toHaveBeenCalled();
    expect(window.showToast).toHaveBeenCalledWith('Cierre protegido', expect.any(String), 'amber');
    confirm.mockRestore();
    pending = null;
  });

  it('sincroniza primero y cierra solamente si desaparece el pendiente', async () => {
    document.body.innerHTML = '<div id="oavix-settings-panel"></div><button id="oavix-settings-toggle"></button><div id="oavix-settings-backdrop"></div><button id="oavix-drive-control"></button><span id="settings-sync-state"></span><span id="settings-sync-caption"></span>';
    let pending = 'true';
    const logoutSession = vi.fn();
    const syncNow = vi.fn(async () => {
      pending = null;
      return { status: 'synced' };
    });
    window.showToast = vi.fn();
    window.OAVIXSyncInternal = {
      context: {
        constants: { pendingKey: 'oavix_sync_pending' },
        nativeStorage: { get: () => pending }
      },
      auth: { logoutSession },
      synchronizer: { syncNow }
    };
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const result = await getLogoutController().confirmSettingsLogout();

    expect(result).toBe(true);
    expect(syncNow).toHaveBeenCalledWith(true, { reload: false });
    expect(logoutSession).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });
});
