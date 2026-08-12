import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const FUEL_STORAGE_KEY = 'oavix_fuel_data';
const FUEL_HISTORY_KEY = 'oavix_fuel_history';
const FUEL_VEHICLE_KEY = 'oavix_fuel_vehicle_config';

async function loadFuelModule() {
  delete window.__OAVIX_FUEL_MODULE__;
  delete window.FuelModule;
  vi.resetModules();
  await import('../oavix-fuel-module.js');
  return window.FuelModule;
}

function seedPrices(fuel) {
  fuel.updatePricesManually({
    tegucigalpa: { 'Gasolina Regular': 55.2, 'Diésel': 52.15 },
    sps: { 'Gasolina Regular': 55.2 }
  });
}

describe('FuelModule', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exposes the public API only once per page', async () => {
    const fuel = await loadFuelModule();
    expect(window.__OAVIX_FUEL_MODULE__).toBe(true);

    const marker = { marker: true };
    window.FuelModule = marker;
    vi.resetModules();
    await import('../oavix-fuel-module.js');
    expect(window.FuelModule).toBe(marker);
    expect(typeof fuel.getCurrentPrice).toBe('function');
  });

  describe('stored state', () => {
    it('restores prices, vehicle config and history from localStorage', async () => {
      localStorage.setItem(
        FUEL_STORAGE_KEY,
        JSON.stringify({ lastUpdate: '2025-01-03T00:00:00.000Z', prices: { sps: { Diésel: 50 } }, nextUpdate: '2025-01-10T00:00:00.000Z' })
      );
      localStorage.setItem(FUEL_VEHICLE_KEY, JSON.stringify({ tankCapacity: 20, city: 'sps', fuelType: 'Diésel', avgConsumption: 10 }));
      localStorage.setItem(FUEL_HISTORY_KEY, JSON.stringify([{ id: '1', gallons: 5, amountPaid: 250, odometer: 100, date: '2025-01-01T00:00:00.000Z' }]));

      const fuel = await loadFuelModule();

      expect(fuel.getCurrentPrice('sps', 'Diésel')).toBe(50);
      expect(fuel.getLastUpdate()).toBe('2025-01-03T00:00:00.000Z');
      expect(fuel.getNextUpdate()).toBe('2025-01-10T00:00:00.000Z');
      expect(fuel.getVehicleConfig()).toEqual({ tankCapacity: 20, city: 'sps', fuelType: 'Diésel', avgConsumption: 10 });
      expect(fuel.getFuelHistory()).toHaveLength(1);
    });

    it('falls back to defaults when stored data is corrupt', async () => {
      localStorage.setItem(FUEL_STORAGE_KEY, '{not json');
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const fuel = await loadFuelModule();

      expect(errorSpy).toHaveBeenCalled();
      expect(fuel.getCurrentPrices()).toEqual({});
      expect(fuel.getVehicleConfig()).toEqual({
        tankCapacity: 15,
        city: 'tegucigalpa',
        fuelType: 'Gasolina Regular',
        avgConsumption: 8
      });
    });

    it('reports a save failure without throwing', async () => {
      const fuel = await loadFuelModule();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota exceeded');
      });

      expect(() => fuel.updateVehicleConfig({ tankCapacity: 12 })).not.toThrow();
      expect(errorSpy).toHaveBeenCalledWith('[OAVIX Fuel Save]', expect.any(Error));
    });
  });

  describe('price lookups and cost calculations', () => {
    it('returns null for unknown cities and fuel types', async () => {
      const fuel = await loadFuelModule();
      seedPrices(fuel);

      expect(fuel.getCurrentPrice('roatan', 'Diésel')).toBeNull();
      expect(fuel.getCurrentPrice('tegucigalpa', 'GLP')).toBeNull();
      expect(fuel.calculateFullTank(10, 'roatan', 'Diésel')).toBeNull();
      expect(fuel.calculateCostPerKm(100, 'roatan', 'Diésel', 8)).toBeNull();
      expect(fuel.getAutoFillAmount(10, 'roatan', 'Diésel')).toBeNull();
    });

    it('computes tank cost, trip cost and rounded autofill amount', async () => {
      const fuel = await loadFuelModule();
      seedPrices(fuel);

      expect(fuel.getCurrentPrice('tegucigalpa', 'Gasolina Regular')).toBe(55.2);
      expect(fuel.calculateFullTank(10, 'tegucigalpa', 'Gasolina Regular')).toBeCloseTo(552, 5);
      expect(fuel.calculateCostPerKm(80, 'tegucigalpa', 'Gasolina Regular', 8)).toBeCloseTo(552, 5);
      expect(fuel.getAutoFillAmount(3.333, 'tegucigalpa', 'Gasolina Regular')).toBe(183.98);
    });

    it('lists the supported cities and fuel types', async () => {
      const fuel = await loadFuelModule();

      const cities = fuel.getCities();
      expect(cities).toHaveLength(8);
      expect(cities.map(c => c.id)).toContain('tegucigalpa');
      expect(cities.every(c => c.name && c.region && typeof c.lat === 'number' && typeof c.lng === 'number')).toBe(true);
      expect(fuel.getFuelTypes()).toEqual(['Gasolina Súper', 'Gasolina Regular', 'Diésel', 'Kerosene', 'GLP']);
    });
  });

  describe('vehicle configuration', () => {
    it('merges updates and persists them', async () => {
      const fuel = await loadFuelModule();

      fuel.updateVehicleConfig({ city: 'laceiba', tankCapacity: 18 });

      expect(fuel.getVehicleConfig()).toEqual({
        tankCapacity: 18,
        city: 'laceiba',
        fuelType: 'Gasolina Regular',
        avgConsumption: 8
      });
      expect(JSON.parse(localStorage.getItem(FUEL_VEHICLE_KEY)).city).toBe('laceiba');
    });

    it('returns a copy so callers cannot mutate internal state', async () => {
      const fuel = await loadFuelModule();

      const config = fuel.getVehicleConfig();
      config.city = 'trujillo';

      expect(fuel.getVehicleConfig().city).toBe('tegucigalpa');
    });
  });

  describe('recordFuelFill', () => {
    it('fills missing fields from the vehicle config and persists the record', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-03-05T10:00:00.000Z'));
      const fuel = await loadFuelModule();

      const record = fuel.recordFuelFill({ gallons: '4.5', amountPaid: '248.4', odometer: 12345, notes: 'lleno' });

      expect(record).toMatchObject({
        city: 'tegucigalpa',
        fuelType: 'Gasolina Regular',
        gallons: 4.5,
        amountPaid: 248.4,
        odometer: 12345,
        notes: 'lleno',
        date: '2025-03-05T10:00:00.000Z'
      });
      expect(JSON.parse(localStorage.getItem(FUEL_HISTORY_KEY))).toEqual([record]);
    });

    it('defaults invalid numbers to zero and empty notes', async () => {
      const fuel = await loadFuelModule();

      const record = fuel.recordFuelFill({ city: 'sps', fuelType: 'Diésel', gallons: 'abc' });

      expect(record.gallons).toBe(0);
      expect(record.amountPaid).toBe(0);
      expect(record.odometer).toBe(0);
      expect(record.notes).toBe('');
      expect(record.city).toBe('sps');
    });

    it('returns the most recent fills first and honours the limit', async () => {
      const fuel = await loadFuelModule();
      for (let i = 1; i <= 4; i++) fuel.recordFuelFill({ gallons: i, odometer: i * 100 });

      const history = fuel.getFuelHistory(2);

      expect(history.map(r => r.gallons)).toEqual([4, 3]);
      expect(fuel.getFuelHistory()).toHaveLength(4);
    });
  });

  describe('getConsumptionStats', () => {
    it('needs at least two fills', async () => {
      const fuel = await loadFuelModule();
      expect(fuel.getConsumptionStats()).toBeNull();

      fuel.recordFuelFill({ gallons: 5, amountPaid: 275, odometer: 1000 });
      expect(fuel.getConsumptionStats()).toBeNull();
    });

    it('aggregates gallons, distance and average price across fills', async () => {
      localStorage.setItem(
        FUEL_HISTORY_KEY,
        JSON.stringify([
          { id: '1', date: '2025-01-01T00:00:00.000Z', gallons: 5, amountPaid: 250, odometer: 1000 },
          { id: '2', date: '2025-01-08T00:00:00.000Z', gallons: 4, amountPaid: 240, odometer: 1400 },
          { id: '3', date: '2025-01-15T00:00:00.000Z', gallons: 6, amountPaid: 300, odometer: 1900 }
        ])
      );
      const fuel = await loadFuelModule();

      const stats = fuel.getConsumptionStats();

      // El primer registro solo aporta el odómetro base, no galones.
      expect(stats.totalGallons).toBe(10);
      expect(stats.totalKm).toBe(900);
      expect(stats.avgConsumption).toBe(90);
      expect(stats.avgPrice).toBe('53.33');
    });
  });

  describe('updatePricesManually', () => {
    it('rejects payloads that are not objects', async () => {
      const fuel = await loadFuelModule();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(fuel.updatePricesManually(null)).toBe(false);
      expect(fuel.updatePricesManually('55.20')).toBe(false);
      expect(errorSpy).toHaveBeenCalledWith('[OAVIX Fuel] Formato inválido para precios');
      expect(fuel.getCurrentPrices()).toEqual({});
    });

    it('stores prices, keeps the provided date and schedules the next Friday', async () => {
      vi.useFakeTimers();
      // Miércoles 2025-03-05 -> el próximo viernes es 2025-03-07.
      vi.setSystemTime(new Date('2025-03-05T12:00:00.000Z'));
      const fuel = await loadFuelModule();
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const ok = fuel.updatePricesManually({ tegucigalpa: { 'Diésel': 52.15 } }, '2025-03-04T00:00:00.000Z');

      expect(ok).toBe(true);
      expect(fuel.getLastUpdate()).toBe('2025-03-04T00:00:00.000Z');
      expect(fuel.getNextUpdate()).toBe('2025-03-07T12:00:00.000Z');
      expect(JSON.parse(localStorage.getItem(FUEL_STORAGE_KEY)).prices).toEqual({ tegucigalpa: { 'Diésel': 52.15 } });
    });

    it('schedules a full week ahead when today is Friday', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-03-07T12:00:00.000Z'));
      const fuel = await loadFuelModule();
      vi.spyOn(console, 'log').mockImplementation(() => {});

      fuel.updatePricesManually({ sps: { 'Diésel': 52 } });

      expect(fuel.getNextUpdate()).toBe('2025-03-14T12:00:00.000Z');
    });

    it('re-renders the UI when the page exposes a renderer', async () => {
      const fuel = await loadFuelModule();
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const render = vi.fn();
      window.renderFuelPrices = render;

      fuel.updatePricesManually({ sps: { 'Diésel': 52 } });
      delete window.renderFuelPrices;

      expect(render).toHaveBeenCalledTimes(1);
    });
  });

  describe('export / import', () => {
    it('exports a versioned snapshot of the current data', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-03-05T12:00:00.000Z'));
      const fuel = await loadFuelModule();
      vi.spyOn(console, 'log').mockImplementation(() => {});
      fuel.updatePricesManually({ sps: { 'Diésel': 52 } });

      const exported = fuel.exportPrices();

      expect(exported.version).toBe('1.0');
      expect(exported.timestamp).toBe('2025-03-05T12:00:00.000Z');
      expect(exported.data.prices).toEqual({ sps: { 'Diésel': 52 } });
    });

    it('imports a previously exported snapshot', async () => {
      const fuel = await loadFuelModule();
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const ok = fuel.importPrices({
        timestamp: '2025-02-01T00:00:00.000Z',
        data: { prices: { laceiba: { 'Kerosene': 51.55 } } }
      });

      expect(ok).toBe(true);
      expect(fuel.getCurrentPrice('laceiba', 'Kerosene')).toBe(51.55);
      expect(fuel.getLastUpdate()).toBe('2025-02-01T00:00:00.000Z');
    });

    it('rejects snapshots without price data', async () => {
      const fuel = await loadFuelModule();

      expect(fuel.importPrices({})).toBe(false);
      expect(fuel.importPrices({ data: {} })).toBe(false);
      expect(fuel.getCurrentPrices()).toEqual({});
    });

    it('reports an error instead of throwing on malformed input', async () => {
      const fuel = await loadFuelModule();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(fuel.importPrices(null)).toBe(false);
      expect(errorSpy).toHaveBeenCalledWith('[OAVIX Fuel Import]', expect.any(Error));
    });
  });

  describe('refreshPrices', () => {
    it('loads the fallback SEN table for every city and persists it', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-03-05T12:00:00.000Z'));
      const fuel = await loadFuelModule();

      const ok = await fuel.refreshPrices();

      expect(ok).toBe(true);
      const prices = fuel.getCurrentPrices();
      expect(Object.keys(prices).sort()).toEqual(fuel.getCities().map(c => c.id).sort());
      expect(prices.tegucigalpa['Gasolina Súper']).toBe(57.85);
      expect(fuel.getLastUpdate()).toBe('2025-03-05T12:00:00.000Z');
      expect(fuel.getNextUpdate()).toBe('2025-03-07T12:00:00.000Z');
      expect(JSON.parse(localStorage.getItem(FUEL_STORAGE_KEY)).prices.trujillo['GLP']).toBe(36.1);
    });

    it('returns false when building the price table fails', async () => {
      const fuel = await loadFuelModule();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(Date.prototype, 'toISOString').mockImplementation(() => {
        throw new Error('clock unavailable');
      });

      await expect(fuel.refreshPrices()).resolves.toBe(false);
      expect(errorSpy).toHaveBeenCalledWith('[OAVIX Fuel API]', expect.any(Error));
    });

    it('returns false when the manual update cannot be applied', async () => {
      const fuel = await loadFuelModule();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      window.renderFuelPrices = () => {
        throw new Error('render failed');
      };

      expect(fuel.updatePricesManually({ sps: { 'Diésel': 52 } })).toBe(false);
      delete window.renderFuelPrices;
      expect(errorSpy).toHaveBeenCalledWith('[OAVIX Fuel Admin]', expect.any(Error));
    });

    it('fetches prices on DOMContentLoaded only when none are stored', async () => {
      const fuel = await loadFuelModule();
      document.dispatchEvent(new window.Event('DOMContentLoaded'));
      await vi.waitFor(() => expect(fuel.getLastUpdate()).toBeTruthy());

      const stamp = fuel.getLastUpdate();
      const reloaded = await loadFuelModule();
      document.dispatchEvent(new window.Event('DOMContentLoaded'));
      await Promise.resolve();

      expect(reloaded.getLastUpdate()).toBe(stamp);
    });

    it('refreshes automatically on the hourly tick at midnight on Friday', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-03-05T12:00:00.000Z'));
      const fuel = await loadFuelModule();

      await vi.advanceTimersByTimeAsync(3600000);
      expect(fuel.getCurrentPrices()).toEqual({});

      // Jueves 23:30 -> el siguiente tick cae el viernes a las 00:30.
      vi.setSystemTime(new Date('2025-03-06T23:30:00.000Z'));
      await vi.advanceTimersByTimeAsync(3600000);
      expect(fuel.getCurrentPrice('tegucigalpa', 'Diésel')).toBe(52.15);
    });
  });
});
