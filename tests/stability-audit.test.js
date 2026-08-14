import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = path => readFileSync(resolve(process.cwd(), path), 'utf8');

function loadSettingsLogout() {
  const source = read('src/ui/settings/controller.js');
  return new Function(`${source}; return { confirmSettingsLogout };`)();
}

describe('protecciones de estabilidad', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="oavix-settings-panel"></div><button id="oavix-settings-toggle"></button><div id="oavix-settings-backdrop"></div><button id="oavix-drive-control"></button><span id="settings-sync-state"></span><span id="settings-sync-caption"></span>';
    window.showToast = vi.fn();
  });

  it('bloquea el cierre de sesión offline cuando hay cambios pendientes', async () => {
    const logoutSession = vi.fn();
    const syncNow = vi.fn();
    window.OAVIXSyncInternal = {
      context: {
        constants: { pendingKey: 'oavix_sync_pending' },
        nativeStorage: { get: key => key === 'oavix_sync_pending' ? 'true' : null }
      },
      auth: { logoutSession },
      synchronizer: { syncNow }
    };
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { confirmSettingsLogout } = loadSettingsLogout();

    const result = await confirmSettingsLogout();

    expect(result).toBe(false);
    expect(syncNow).not.toHaveBeenCalled();
    expect(logoutSession).not.toHaveBeenCalled();
    expect(window.showToast).toHaveBeenCalledWith(
      'Cierre protegido',
      expect.stringMatching(/cambios pendientes/i),
      'amber'
    );
    confirm.mockRestore();
  });

  it('sincroniza primero y solo cierra cuando el respaldo quedó confirmado', async () => {
    let pending = 'true';
    const logoutSession = vi.fn();
    const syncNow = vi.fn(async () => {
      pending = null;
      return { status: 'synced' };
    });
    window.OAVIXSyncInternal = {
      context: {
        constants: { pendingKey: 'oavix_sync_pending' },
        nativeStorage: { get: key => key === 'oavix_sync_pending' ? pending : null }
      },
      auth: { logoutSession },
      synchronizer: { syncNow }
    };
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { confirmSettingsLogout } = loadSettingsLogout();

    const result = await confirmSettingsLogout();

    expect(result).toBe(true);
    expect(syncNow).toHaveBeenCalledWith(true, { reload: false });
    expect(logoutSession).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });

  it('restaura Combustibles si el almacenamiento falla', () => {
    localStorage.setItem('oavix_fuel_vehicles', JSON.stringify([{ id: 'old' }]));
    const reloadLocalState = vi.fn();
    window.OAVIXSyncInternal = {
      context: {
        nativeStorage: {
          get: localStorage.getItem.bind(localStorage),
          set: localStorage.setItem.bind(localStorage),
          remove: localStorage.removeItem.bind(localStorage)
        }
      }
    };
    window.FuelModule = {
      constants: { STORAGE: { vehicles: 'oavix_fuel_vehicles', history: 'oavix_fuel_history', preferences: 'oavix_fuel_preferences', legacyVehicle: 'oavix_fuel_vehicle_config' } },
      saveVehicle: () => {
        localStorage.setItem('oavix_fuel_vehicles', JSON.stringify([{ id: 'new' }]));
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      },
      reloadLocalState
    };

    new Function(read('src/features/fuel/storage-guard.js'))();
    const result = window.FuelModule.saveVehicle({ name: 'Prueba' });

    expect(result).toBe(false);
    expect(JSON.parse(localStorage.getItem('oavix_fuel_vehicles'))).toEqual([{ id: 'old' }]);
    expect(reloadLocalState).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith('No se pudo guardar', expect.any(String), 'rose');
  });

  it('rechaza una URL de imagen no HTTPS antes de previsualizarla', () => {
    const original = vi.fn();
    window.previewImageUrl = original;
    window.safeImageSource = value => value.startsWith('https://') ? value : '';
    window.renderStats = vi.fn();
    window.openCalendarEntryDetails = vi.fn();

    new Function(read('src/core/stability-guards.js'))();
    window.previewImageUrl('http://sitio-inseguro.test/foto.jpg');

    expect(original).toHaveBeenCalledWith('');
    expect(window.showToast).toHaveBeenCalledWith('Enlace no permitido', expect.any(String), 'amber');
  });

  it('corrige el texto del detalle de calendario sin alterar los registros', () => {
    document.body.innerHTML = '<div id="calendar-detail-content"></div>';
    window.renderStats = vi.fn();
    window.previewImageUrl = vi.fn();
    window.safeImageSource = value => value;
    window.openCalendarEntryDetails = vi.fn(() => {
      document.getElementById('calendar-detail-content').textContent = 'CategorÃ­a: Cambio de Aceite';
    });

    new Function(read('src/core/stability-guards.js'))();
    window.openCalendarEntryDetails('1');

    expect(document.getElementById('calendar-detail-content').textContent).toBe('Categoría: Cambio de Aceite');
  });

  it('separa la inversión cuando existen monedas distintas', () => {
    document.body.innerHTML = '<div id="stats-container"><div class="animated-glass-card"><p></p><p class="text-lg"></p></div></div>';
    localStorage.setItem('oavix_auto_records', JSON.stringify([
      { amount: 1000, currency: 'HNL' },
      { amount: 50, currency: 'USD' }
    ]));
    window.formatMoney = (amount, currency) => `${currency} ${amount}`;
    window.renderStats = vi.fn();
    window.previewImageUrl = vi.fn();
    window.safeImageSource = value => value;
    window.openCalendarEntryDetails = vi.fn();

    new Function(read('src/core/stability-guards.js'))();
    window.renderStats();

    expect(document.querySelector('#stats-container p:first-child').textContent).toBe('Inversión por Moneda');
    expect(document.querySelector('#stats-container p:nth-child(2)').textContent).toContain('HNL 1000');
    expect(document.querySelector('#stats-container p:nth-child(2)').textContent).toContain('USD 50');
  });
});

describe('privacidad de Google', () => {
  it('usa el alcance privado appData y explica el uso antes de vincular', () => {
    const context = read('src/services/sync/context.js');
    const ui = read('src/services/sync/ui.js');

    expect(context).toContain('https://www.googleapis.com/auth/drive.appdata');
    expect(ui).toContain('OAVIX no solicita acceso general a tus archivos personales de Drive.');
    expect(ui).toContain('OAVIX no recibe tu contraseña.');
    expect(ui).toContain('no se crea respaldo en Drive');
  });
});
