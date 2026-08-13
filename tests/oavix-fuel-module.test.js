/* OAVIX — protección del modelo autónomo de Combustibles v2. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
const PRODUCTS = ['REGULAR', 'SUPERIOR', 'DIÉSEL', 'KEROSENE', 'GLP VEHICULAR'];
const DEPARTMENTS = [
  'Francisco Morazán', 'Cortés', 'Atlántida', 'Choluteca', 'Colón',
  'Comayagua', 'Copán', 'El Paraíso', 'Olancho', 'Yoro'
];

function officialSnapshot() {
  const rows = [];
  DEPARTMENTS.forEach((department, departmentIndex) => {
    for (let municipalityIndex = 0; municipalityIndex < 3; municipalityIndex += 1) {
      const municipality = departmentIndex === 0 && municipalityIndex === 0
        ? 'Distrito Central'
        : `Municipio ${departmentIndex + 1}-${municipalityIndex + 1}`;
      PRODUCTS.forEach((product, productIndex) => {
        const price = departmentIndex === 0 && municipalityIndex === 0 && product === 'REGULAR'
          ? 100
          : 90 + departmentIndex + productIndex;
        rows.push({
          department,
          municipality,
          product,
          pricePerGallon: price,
          pricePerLiter: Number((price / 3.785411784).toFixed(2)),
          lat: 14 + departmentIndex / 10,
          lng: -87 - municipalityIndex / 10
        });
      });
    }
  });
  return {
    status: 'official',
    source: 'Secretaría de Energía de Honduras (SEN)',
    sourceUrl: 'https://app.powerbi.com/view?r=oficial',
    updatedAt: '2026-08-10T12:00:00.000Z',
    checkedAt: '2026-08-13T12:00:00.000Z',
    effectiveFrom: '2026-08-10',
    effectiveUntil: '2026-08-16',
    period: { key: '2026-08-W2', label: 'Semana 2 de Agosto 2026' },
    rows
  };
}

function stubFetch(data = officialSnapshot()) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => structuredClone(data)
  })));
}

function stubFetchFail() {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
}

async function loadModule() {
  delete window.__OAVIX_FUEL_MODULE_V2__;
  delete window.FuelModule;
  vi.resetModules();
  await import('../src/features/fuel/module.js');
  return window.FuelModule;
}

function fill(fuel, input) {
  return fuel.saveFuelRecord({
    vehicleId: 'default-vehicle',
    date: '2026-08-10',
    volume: 5,
    volumeUnit: 'gal',
    amountPaid: 500,
    distanceUnit: 'km',
    fuelType: 'REGULAR',
    ...input
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  delete window.__OAVIX_FUEL_MODULE_V2__;
  delete window.FuelModule;
  delete window.renderFuelModule;
  stubFetchFail();
});

describe('FuelModule v2', () => {
  it('crea un vehículo seguro y migra la configuración antigua', async () => {
    localStorage.setItem('oavix_fuel_vehicle_config', JSON.stringify({
      city: 'sps',
      tankCapacity: 12,
      avgConsumption: 42,
      fuelType: 'Gasolina Súper'
    }));

    const fuel = await loadModule();
    const vehicle = fuel.getActiveVehicle();

    expect(vehicle).toMatchObject({
      id: 'default-vehicle',
      department: 'Cortés',
      municipality: 'San Pedro Sula',
      tankCapacity: 12,
      targetEfficiency: 42,
      fuelType: 'SUPERIOR'
    });
    expect(JSON.parse(localStorage.getItem('oavix_fuel_vehicles'))).toHaveLength(1);
  });

  it('administra varios vehículos sin mezclar sus historiales', async () => {
    const fuel = await loadModule();
    const motorcycle = fuel.saveVehicle({
      name: 'Moto de trabajo',
      type: 'motorcycle',
      fuelType: 'SUPERIOR',
      distanceUnit: 'mi',
      volumeUnit: 'l',
      tankCapacity: 14,
      targetEfficiency: 30,
      department: 'Cortés',
      municipality: 'San Pedro Sula'
    });
    fill(fuel, { vehicleId: motorcycle.id, distanceUnit: 'mi', volumeUnit: 'l', volume: 8 });
    fill(fuel, { vehicleId: 'default-vehicle', id: 'car-fill' });

    expect(fuel.getVehicles()).toHaveLength(2);
    expect(fuel.getFuelHistory({ vehicleId: motorcycle.id })).toHaveLength(1);
    expect(fuel.getFuelHistory({ vehicleId: 'default-vehicle' })).toHaveLength(1);
    expect(fuel.toKilometers(10, 'mi')).toBeCloseTo(16.09344, 5);
    expect(fuel.toGallons(3.785411784, 'l')).toBeCloseTo(1, 8);
  });

  it('mide consumo real entre dos tanques llenos y acumula cargas parciales', async () => {
    const fuel = await loadModule();
    fill(fuel, { id: 'full-one', date: '2026-08-01', odometer: 1000, volume: 10, amountPaid: 1000, fullTank: true });
    fill(fuel, { id: 'partial', date: '2026-08-05', odometer: 1100, volume: 5, amountPaid: 500, fullTank: false });
    fill(fuel, { id: 'full-two', date: '2026-08-10', odometer: 1200, volume: 5, amountPaid: 500, fullTank: true });

    const stats = fuel.getConsumptionStats();

    expect(stats.source).toBe('measured');
    expect(stats.completedIntervals).toBe(1);
    expect(stats.totalGallons).toBe(10);
    expect(stats.totalKm).toBe(200);
    expect(stats.avgConsumption).toBe(20);
    expect(stats.costPerKm).toBe(5);
  });

  it('usa el rendimiento esperado mientras faltan dos tanques completos', async () => {
    const fuel = await loadModule();
    const current = fuel.getActiveVehicle();
    fuel.saveVehicle({ ...current, targetEfficiency: 40 });
    fill(fuel, { odometer: 1000, fullTank: false });

    const stats = fuel.getConsumptionStats();

    expect(stats.source).toBe('estimate');
    expect(stats.measuredEfficiency).toBe(0);
    expect(stats.avgConsumption).toBe(40);
  });

  it('calcula semana, mes, año, proyección y serie mensual', async () => {
    const fuel = await loadModule();
    fill(fuel, { id: 'july', date: '2026-07-20', amountPaid: 300 });
    fill(fuel, { id: 'august-one', date: '2026-08-10', amountPaid: 500 });
    fill(fuel, { id: 'august-two', date: '2026-08-12', amountPaid: 200 });

    const stats = fuel.getDashboardStats(new Date('2026-08-13T12:00:00Z'));
    const series = fuel.getMonthlySeries(2, new Date('2026-08-13T12:00:00Z'));

    expect(stats.week.amount).toBe(700);
    expect(stats.month.amount).toBe(700);
    expect(stats.year.amount).toBe(1000);
    expect(stats.monthTrend).toBeCloseTo(133.333, 2);
    expect(stats.monthProjection).toBeCloseTo(1669.23, 2);
    expect(series.map(month => month.amount)).toEqual([300, 700]);
  });

  it('acepta editar y borrar una carga conservando el resto', async () => {
    const fuel = await loadModule();
    const saved = fill(fuel, { id: 'editable', notes: 'Antes' });
    fuel.saveFuelRecord({ ...saved, amountPaid: 650, notes: 'Después' });
    fill(fuel, { id: 'keep' });

    expect(fuel.getFuelRecord(saved.id)).toMatchObject({ amountPaid: 650, notes: 'Después' });
    expect(fuel.deleteFuelRecord(saved.id)).toBe(true);
    expect(fuel.getFuelRecord(saved.id)).toBeNull();
    expect(fuel.getFuelHistory()).toHaveLength(1);
  });

  it('valida la tabla nacional y utiliza el precio oficial del vehículo', async () => {
    stubFetch();
    const fuel = await loadModule();

    expect(await fuel.refreshPrices()).toBe(true);
    expect(fuel.getPriceSource()).toMatchObject({ status: 'official', rowCount: 150 });
    expect(fuel.getDepartments()).toHaveLength(10);
    expect(fuel.getVehicleOfficialPrice()).toMatchObject({
      municipality: 'Distrito Central',
      product: 'REGULAR',
      pricePerGallon: 100
    });
    expect(fuel.getOfficialPrice('Francisco Morazán', 'Tegucigalpa', 'regular').pricePerGallon).toBe(100);
  });

  it('conserva la última copia oficial si la SEN no responde', async () => {
    localStorage.setItem('oavix_fuel_data', JSON.stringify(officialSnapshot()));
    stubFetchFail();
    const fuel = await loadModule();

    expect(await fuel.refreshPrices()).toBe(false);
    expect(fuel.getPriceSource()).toMatchObject({ status: 'offline-cache', rowCount: 150 });
    expect(fuel.getVehicleOfficialPrice().pricePerGallon).toBe(100);
  });

  it('rechaza una respuesta incompleta sin borrar la copia válida', async () => {
    localStorage.setItem('oavix_fuel_data', JSON.stringify(officialSnapshot()));
    stubFetch({ ...officialSnapshot(), rows: officialSnapshot().rows.slice(0, 4) });
    const fuel = await loadModule();

    expect(await fuel.refreshPrices()).toBe(false);
    expect(fuel.getPriceSource()).toMatchObject({ status: 'offline-cache', rowCount: 150 });
  });

  it('calcula viaje, presupuesto y tanque completo en las unidades del vehículo', async () => {
    stubFetch();
    const fuel = await loadModule();
    await fuel.refreshPrices();
    const vehicle = fuel.getActiveVehicle();
    fuel.saveVehicle({ ...vehicle, targetEfficiency: 40, tankCapacity: 10 });

    const trip = fuel.calculateTrip({ distance: 200, distanceUnit: 'km' });
    const roundTrip = fuel.calculateTrip({ distance: 100, distanceUnit: 'km', roundTrip: true });
    const budget = fuel.calculateBudget({ budget: 500 });
    const tank = fuel.calculateFullTank();

    expect(trip).toMatchObject({ gallons: 5, cost: 500, source: 'estimate' });
    expect(roundTrip.cost).toBe(500);
    expect(budget).toMatchObject({ gallons: 5, distance: 200 });
    expect(tank).toMatchObject({ cost: 1000, gallons: 10 });
  });

  it('no permite archivar el único vehículo activo', async () => {
    const fuel = await loadModule();
    expect(fuel.archiveVehicle('default-vehicle')).toBe(false);
    expect(fuel.getVehicles()).toHaveLength(1);
  });

  it('permite restaurar un vehículo archivado con su historial', async () => {
    const fuel = await loadModule();
    fuel.saveVehicle({ name: 'Segundo vehículo', type: 'car' });
    const record = fill(fuel, { vehicleId: 'default-vehicle' });

    expect(fuel.archiveVehicle('default-vehicle')).toBe(true);
    expect(fuel.getVehicles()).toHaveLength(1);
    expect(fuel.getVehicles(true).find(vehicle => vehicle.id === 'default-vehicle').archived).toBe(true);
    expect(fuel.restoreVehicle('default-vehicle')).toBe(true);
    expect(fuel.getActiveVehicle().id).toBe('default-vehicle');
    expect(fuel.getFuelRecord(record.id)).not.toBeNull();
  });
});
