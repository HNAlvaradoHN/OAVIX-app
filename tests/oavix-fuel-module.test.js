/* OAVIX — tests alineados con oavix-fuel-module.js v1.3 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SOURCE = fs.readFileSync(path.resolve(process.cwd(), 'oavix-fuel-module.js'), 'utf8');

const OFFICIAL = {
  status: 'official',
  updatedAt: '2026-01-02T03:04:05.000Z',
  sourceUrl: 'https://sen.hn/',
  prices: {
    tegucigalpa: { 'Gasolina Súper': 57.85, 'Gasolina Regular': 55.2, 'Diésel': 52.15, 'Kerosene': 51.3, 'GLP': 35.9 },
    sps: { 'Gasolina Súper': 56.1, 'Gasolina Regular': 53.4, 'Diésel': 50.2, 'Kerosene': 49.1, 'GLP': 34.0 }
  }
};

function stubFetchOfficial() {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => JSON.parse(JSON.stringify(OFFICIAL)) })));
}

function stubFetchFail() {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
}

function loadModule() {
  delete window.__OAVIX_FUEL_MODULE__;
  const run = new Function(SOURCE);
  run();
  return window.FuelModule;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  delete window.__OAVIX_FUEL_MODULE__;
  delete window.FuelModule;
  delete window.renderFuelPrices;
});

describe('FuelModule', () => {
  it('aplica precios manuales y calcula costos', () => {
    const fuel = loadModule();
    expect(fuel.updatePricesManually({ tegucigalpa: { 'Gasolina Regular': 100 } })).toBe(true);
    expect(fuel.getCurrentPrice('tegucigalpa', 'Gasolina Regular')).toBe(100);
    expect(fuel.calculateFullTank(10, 'tegucigalpa', 'Gasolina Regular')).toBe(1000);
    expect(fuel.calculateCostPerKm(80, 'tegucigalpa', 'Gasolina Regular', 8)).toBe(1000);
    expect(fuel.getAutoFillAmount(5, 'tegucigalpa', 'Gasolina Regular')).toBe(500);
  });

  it('rechaza entradas inválidas sin romper el estado', () => {
    const fuel = loadModule();
    expect(fuel.updatePricesManually('nope')).toBe(false);
    expect(fuel.updatePricesManually({})).toBe(false);
    expect(fuel.getCurrentPrice('tegucigalpa', 'Diésel')).toBe(null);
    expect(fuel.calculateFullTank(5, 'tegucigalpa', 'Diésel')).toBe(null);
  });

  it('exporta un snapshot versionado y lo reimporta', () => {
    const fuel = loadModule();
    fuel.updatePricesManually({ tegucigalpa: { 'Diésel': 52.15 } });
    const exported = fuel.exportPrices();
    expect(exported.version).toBe('1.3');
    const fuel2 = loadModule();
    expect(fuel2.importPrices(exported)).toBe(true);
    expect(fuel2.getCurrentPrice('tegucigalpa', 'Diésel')).toBe(52.15);
  });

  it('un render que falla no impide actualizar precios', async () => {
    window.renderFuelPrices = () => { throw new Error('render failed'); };
    stubFetchOfficial();
    const fuel = loadModule();
    const ok = await fuel.refreshPrices();
    expect(ok).toBe(true);
    expect(fuel.getCurrentPrice('tegucigalpa', 'Diésel')).toBe(52.15);
  });

  it('sin SEN y sin copia local queda unavailable', async () => {
    stubFetchFail();
    const fuel = loadModule();
    const ok = await fuel.refreshPrices();
    expect(ok).toBe(false);
    expect(fuel.getPriceSource().status).toBe('unavailable');
  });

  it('descarga precios oficiales en DOMContentLoaded', async () => {
    stubFetchOfficial();
    const fuel = loadModule();
    document.dispatchEvent(new window.Event('DOMContentLoaded'));
    await vi.waitFor(() => expect(fuel.getLastUpdate()).toBe('2026-01-02T03:04:05.000Z'));
    expect(fuel.getPriceSource().type).toBe('official');
  });

  it('registra cargas de combustible y calcula consumo', () => {
    const fuel = loadModule();
    fuel.recordFuelFill({ gallons: 10, amountPaid: 500, odometer: 100 });
    fuel.recordFuelFill({ gallons: 10, amountPaid: 600, odometer: 200 });
    const stats = fuel.getConsumptionStats();
    // El primer registro fija el odómetro base; el consumo medible ocurre
    // entre la primera y la segunda carga, por eso solo cuenta 10 galones.
    expect(stats.totalGallons).toBe(10);
    expect(stats.totalKm).toBe(100);
    expect(fuel.getFuelHistory().length).toBe(2);
  });
});
