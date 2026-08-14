import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(), 'src/features/fuel/storage-guard.js'), 'utf8');

describe('guardia de almacenamiento de Combustibles', () => {
  beforeEach(() => {
    localStorage.clear();
    window.showToast = vi.fn();
    delete window.FuelModule;
    delete window.OAVIXSyncInternal;
  });

  it('revierte la copia persistida si una mutación falla por cuota', () => {
    localStorage.setItem('oavix_fuel_vehicles', JSON.stringify([{ id: 'anterior' }]));
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
      constants: { STORAGE: {
        vehicles: 'oavix_fuel_vehicles',
        history: 'oavix_fuel_history',
        preferences: 'oavix_fuel_preferences',
        legacyVehicle: 'oavix_fuel_vehicle_config'
      } },
      saveVehicle() {
        localStorage.setItem('oavix_fuel_vehicles', JSON.stringify([{ id: 'nuevo' }]));
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      },
      reloadLocalState
    };

    new Function(source)();
    const result = window.FuelModule.saveVehicle({ name: 'Prueba' });

    expect(result).toBe(false);
    expect(JSON.parse(localStorage.getItem('oavix_fuel_vehicles'))).toEqual([{ id: 'anterior' }]);
    expect(reloadLocalState).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith('No se pudo guardar', expect.any(String), 'rose');
  });
});
