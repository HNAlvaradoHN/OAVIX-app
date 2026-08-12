import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const FUEL_STORAGE_KEY = 'oavix_fuel_data';
const FUEL_HISTORY_KEY = 'oavix_fuel_history';
const FUEL_VEHICLE_KEY = 'oavix_fuel_vehicle_config';

const OFFICIAL_PRICES = {
  tegucigalpa: { 'Gasolina Súper': 57.85, 'Gasolina Regular': 55.2, 'Diésel': 52.15 },
  sps: { 'Gasolina Súper': 57.85, 'Gasolina Regular': 55.2, 'Diésel': 52.15 },
  laceiba: { 'Gasolina Regular': 56.1, 'Diésel': 53.2 },
  choloma: { 'Gasolina Regular': 55.8, 'Diésel': 52.9 },
  danli: { 'Gasolina Regular': 56.4, 'Diésel': 53.4 },
  juticalpa: { 'Gasolina Regular': 56.7, 'Diésel': 53.7 },
  comayagua: { 'Gasolina Regular': 55.9, 'Diésel': 52.8 },
  trujillo: { 'Gasolina Regular': 56.8, 'GLP': 36.1 }
};

const OFFICIAL_PAYLOAD = {
  schemaVersion: 1,
  source: 'Secretaría de Energía de Honduras (SEN)',
  sourceUrl: 'https://app.powerbi.com/view?r=test',
  checkedAt: '2025-03-05T12:00:00.000Z',
  updatedAt: '2025-03-05T12:00:00.000Z',
  status: 'official',
  prices: OFFICIAL_PRICES
};

async function loadFuelModule() {
  delete window.__OAVIX_FUEL_MODULE__;
  delete window.FuelModule;
  delete window.renderFuelPrices;
  vi.resetModules();
  await import('../oavix-fuel-module.js');
  return window.FuelModule;
}

function mockOfficialFetch(payload = OFFICIAL_PAYLOAD) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => payload }));
}

function seedOfficialCache() {
  localStorage.setItem(FUEL_STORAGE_KEY, JSON.stringify({
    lastUpdate: OFFICIAL_PAYLOAD.updatedAt,
    prices: OFFICIAL_PRICES,
    nextUpdate: '2025-03-07T00:00:00.000Z',
    source: 'official',
    sourceUrl: OFFICIAL_PAYLOAD.sourceUrl,
    status: 'official'
  }));
}

describe('FuelModule', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    mockOfficialFetch();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
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
      localStorage.setItem(FUEL_STORAGE_KEY, JSON.stringify({ lastUpdate: '2025-01-03T00:00:00.000Z', prices: { sps: { Diésel: 50 } }, nextUpdate: '2025-01-10T00:00:00.000Z' }));
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
      expect(fuel.getVehicleConfig()).toEqual({ tankCapacity: 15, city: 'tegucigalpa', fuelType: 'Gasolina Regular', avgConsumption: 8 });
    });

    it('reports a save failure without throwing', async () => {
      const fuel = await loadFuelModule();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota exceeded'); });
      expect(() => fuel.updateVehicleConfig({ tankCapacity: 12 })).not.toThrow();
      expect(errorSpy).toHaveBeenCalledWith('[OAVIX Fuel Save]', expect.any(Error));
    });
  });

  describe('price lookups and cost calculations', () => {
    it('returns null for unknown cities and fuel types', async () => {
      seedOfficialCache();
      const fuel = await loadFuelModule();
      expect(fuel.getCurrentPrice('roatan', 'Diésel')).toBeNull();
      expect(fuel.getCurrentPrice('tegucigalpa', 'Kerosene')).toBeNull();
      expect(fuel.calculateFullTank(10, 'roatan', 'Diésel')).toBeNull();
      expect(fuel.calculateCostPerKm(100, 'roatan', 'Diésel', 8)).toBeNull();
      expect(fuel.getAutoFillAmount(10, 'roatan', 'Diésel')).toBeNull();
    });

    it('computes tank cost, trip cost and rounded autofill amount', async () => {
      seedOfficialCache();
      const fuel = await loadFuelModule();
      expect(fuel.getCurrentPrice('tegucigalpa', 'Gasolina Regular')).toBe(55.2);
      expect(fuel.calculateFullTank(10, 'tegucigalpa', 'Gasolina Regular')).toBeCloseTo(552, 5);
      expect(fuel.calculateCostPerKm(80, 'tegucigalpa', 'Gasolina Regular', 8)).toBeCloseTo(552, 5);
      expect(fuel.getAutoFillAmount(3.333, 'tegucigalpa', 'Gasolina Regular')).toBe(183.98);
    });

    it('lists the supported cities and fuel types', async () => {
      const fuel = await loadFuelModule();
      expect(fuel.getCities()).toHaveLength(8);
      expect(fuel.getCities().map(c => c.id)).toContain('tegucigalpa');
      expect(fuel.getCities().every(c => c.name && c.region && typeof c.lat === 'number' && typeof c.lng === 'number')).toBe(true);
      expect(fuel.getFuelTypes()).toEqual(['Gasolina Súper', 'Gasolina Regular', 'Diésel', 'Kerosene', 'GLP']);
    });
  });

  describe('vehicle configuration', () => {
    it('merges updates and persists them', async () => {
      const fuel = await loadFuelModule();
      fuel.updateVehicleConfig({ city: 'laceiba', tankCapacity: 18 });
      expect(fuel.getVehicleConfig()).toEqual({ tankCapacity: 18, city: 'laceiba', fuelType: 'Gasolina Regular', avgConsumption: 8 });
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
      expect(record).toMatchObject({ city: 'tegucigalpa', fuelType: 'Gasolina Regular', gallons: 4.5, amountPaid: 248.4, odometer: 12345, notes: 'lleno', date: '2025-03-05T10:00:00.000Z' });
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
      expect(fuel.getFuelHistory(2).map(r => r.gallons)).toEqual([4, 3]);
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
      localStorage.setItem(FUEL_HISTORY_KEY, JSON.stringify([
        { id: '1', date: '2025-01-01T00:00:00.000Z', gallons: 5, amountPaid: 250, odometer: 1000 },
        { id: '2', date: '2025-01-08T00:00:00.000Z', gallons: 4, amountPaid: 240, odometer: 1400 },
        { id: '3', date: '2025-01-15T00:00:00.000Z', gallons: 6, amountPaid: 300, odometer: 1900 }
      ]));
      const fuel = await loadFuelModule();
      const stats = fuel.getConsumptionStats();
      expect(stats.totalGallons).toBe(10);
      expect(stats.totalKm).toBe(900);
      expect(stats.avgConsumption).toBe(90);
      expect(stats.avgPrice).toBe('53.33');
    });
  });

  describe('legacy compatibility API', () => {
    it('rejects invalid manual payloads without changing data', async () => {
      const fuel = await loadFuelModule();
      expect(fuel.updatePricesManually(null)).toBe(false);
      expect(fuel.updatePricesManually('55.20')).toBe(false);
      expect(fuel.getCurrentPrices()).toEqual({});
    });

    it('keeps the provided date and schedules the next Friday at midnight', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-03-05T12:00:00.000Z'));
      const fuel = await loadFuelModule();
      expect(fuel.updatePricesManually({ tegucigalpa: { 'Diésel': 52.15 } }, '2025-03-04T00:00:00.000Z')).toBe(true);
      expect(fuel.getLastUpdate()).toBe('2025-03-04T00:00:00.000Z');
      expect(fuel.getNextUpdate()).toBe('2025-03-07T00:00:00.000Z');
    });

    it('does not let a renderer failure break a price update', async () => {
      const fuel = await loadFuelModule();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      window.renderFuelPrices = () => { throw new Error('render failed'); };
      expect(fuel.updatePricesManually({ sps: { 'Diésel': 52 } })).toBe(true);
      expect(errorSpy).toHaveBeenCalledWith('[OAVIX Fuel Render]', expect.any(Error));
    });
  });

  describe('export / import', () => {
    it('exports a versioned snapshot of the current data', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-03-05T12:00:00.000Z'));
      const fuel = await loadFuelModule();
      fuel.updatePricesManually({ sps: { 'Diésel': 52 } });
      const exported = fuel.exportPrices();
      expect(exported.version).toBe('1.2');
      expect(exported.timestamp).toBe('2025-03-05T12:00:00.000Z');
      expect(exported.data.prices).toEqual({ sps: { 'Diésel': 52 } });
    });

    it('imports a previously exported snapshot', async () => {
      const fuel = await loadFuelModule();
      const ok = fuel.importPrices({ timestamp: '2025-02-01T00:00:00.000Z', data: { prices: { laceiba: { Kerosene: 51.55 } } } });
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

    it('does not throw on malformed import input', async () => {
      const fuel = await loadFuelModule();
      expect(() => fuel.importPrices(null)).not.toThrow();
      expect(fuel.importPrices(null)).toBe(false);
    });
  });

  describe('automatic SEN refresh', () => {
    it('loads verified official SEN data and persists it', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-03-05T12:00:00.000Z'));
      const fuel = await loadFuelModule();
      expect(await fuel.refreshPrices()).toBe(true);
      expect(Object.keys(fuel.getCurrentPrices()).sort()).toEqual(fuel.getCities().map(c => c.id).sort());
      expect(fuel.getCurrentPrice('tegucigalpa', 'Gasolina Súper')).toBe(57.85);
      expect(fuel.getLastUpdate()).toBe('2025-03-05T12:00:00.000Z');
      expect(fuel.getNextUpdate()).toBe('2025-03-07T00:00:00.000Z');
      expect(fuel.getPriceSource()).toMatchObject({ type: 'official', status: 'official' });
      expect(JSON.parse(localStorage.getItem(FUEL_STORAGE_KEY)).source).toBe('official');
    });

    it('keeps the last official cache when SEN data cannot be fetched', async () => {
      seedOfficialCache();
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));
      const fuel = await loadFuelModule();
      expect(await fuel.refreshPrices()).toBe(true);
      expect(fuel.getCurrentPrice('tegucigalpa', 'Diésel')).toBe(52.15);
      expect(fuel.getPriceSource().status).toBe('offline-cache');
    });

    it('returns unavailable when neither SEN nor an official cache is available', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));
      const fuel = await loadFuelModule();
      expect(await fuel.refreshPrices()).toBe(false);
      expect(fuel.getCurrentPrices()).toEqual({});
      expect(fuel.getPriceSource().status).toBe('unavailable');
    });

    it('refreshes automatically once when DOMContentLoaded fires', async () => {
      const fuel = await loadFuelModule();
      document.dispatchEvent(new window.Event('DOMContentLoaded'));
      await vi.waitFor(() => expect(fuel.getLastUpdate()).toBe('2025-03-05T12:00:00.000Z'));
      expect(fuel.getPriceSource().type).toBe('official');
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('does not break when rendering fails after an official update', async () => {
      const fuel = await loadFuelModule();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      window.renderFuelPrices = () => { throw new Error('render failed'); };
      expect(await fuel.refreshPrices()).toBe(true);
      expect(fuel.getPriceSource().status).toBe('official');
      expect(errorSpy).toHaveBeenCalledWith('[OAVIX Fuel Render]', expect.any(Error));
    });
  });
});
