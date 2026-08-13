/* OAVIX Combustibles v2.0 — vehículos, cargas, consumo y precios oficiales SEN. */
(function initializeFuelModule(root) {
  'use strict';

  if (root.__OAVIX_FUEL_MODULE_V2__) return;
  root.__OAVIX_FUEL_MODULE_V2__ = true;

  const GALLON_LITERS = 3.785411784;
  const KM_PER_MILE = 1.609344;
  const OFFICIAL_DATA_URL = 'data/sen-prices.json';
  const OFFICIAL_SOURCE_URL = 'https://app.powerbi.com/view?r=eyJrIjoiZDdmNzNjMmYtNzMzYy00ZDQ2LTg0MzctYWRlNDQ5MWIzNGYxIiwidCI6Ijk0MDNiYTRiLWJjNTQtNDAzZS05NTg4LWI1NTJkMThhODI3YiJ9';
  const STORAGE = Object.freeze({
    prices: 'oavix_fuel_data',
    vehicles: 'oavix_fuel_vehicles',
    history: 'oavix_fuel_history',
    preferences: 'oavix_fuel_preferences',
    legacyVehicle: 'oavix_fuel_vehicle_config'
  });
  const PRODUCTS = Object.freeze([
    { id: 'REGULAR', label: 'Gasolina regular', icon: 'fa-droplet', tone: 'cyan' },
    { id: 'SUPERIOR', label: 'Gasolina superior', icon: 'fa-gem', tone: 'violet' },
    { id: 'DIÉSEL', label: 'Diésel', icon: 'fa-truck', tone: 'amber' },
    { id: 'GLP VEHICULAR', label: 'GLP vehicular', icon: 'fa-fire-flame-simple', tone: 'emerald' },
    { id: 'KEROSENE', label: 'Kerosene', icon: 'fa-oil-can', tone: 'slate' }
  ]);
  const LEGACY_LOCATIONS = Object.freeze({
    tegucigalpa: ['Francisco Morazán', 'Tegucigalpa'],
    sps: ['Cortés', 'San Pedro Sula'],
    laceiba: ['Atlántida', 'La Ceiba'],
    choloma: ['Cortés', 'Choloma'],
    danli: ['El Paraíso', 'Danlí'],
    juticalpa: ['Olancho', 'Juticalpa'],
    comayagua: ['Comayagua', 'Comayagua'],
    trujillo: ['Colón', 'Trujillo']
  });

  const defaultPreferences = Object.freeze({
    activeVehicleId: 'default-vehicle',
    panel: 'overview',
    priceDepartment: 'Francisco Morazán',
    priceMunicipality: 'Distrito Central',
    priceProduct: 'REGULAR',
    historyRange: 'all'
  });

  let vehicles = [];
  let history = [];
  let preferences = { ...defaultPreferences };
  let fuelData = emptyFuelData();

  function emptyFuelData() {
    return {
      status: 'unavailable',
      source: 'none',
      sourceUrl: OFFICIAL_SOURCE_URL,
      updatedAt: null,
      checkedAt: null,
      effectiveFrom: null,
      effectiveUntil: null,
      period: null,
      rows: [],
      previous: null
    };
  }

  function safeParse(raw, fallback) {
    try {
      return raw === null || raw === undefined ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function number(value, fallback = 0) {
    const parsed = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function nullableNumber(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    return number(value, null);
  }

  function positive(value, fallback = 0) {
    const parsed = number(value, fallback);
    return parsed > 0 ? parsed : fallback;
  }

  function uid(prefix) {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') {
      return `${prefix}-${root.crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function canonicalProduct(value) {
    const normalized = normalizeText(value);
    if (normalized.includes('super')) return 'SUPERIOR';
    if (normalized.includes('regular')) return 'REGULAR';
    if (normalized.includes('diesel')) return 'DIÉSEL';
    if (normalized.includes('keros')) return 'KEROSENE';
    if (normalized.includes('glp') || normalized.includes('gas licuado')) return 'GLP VEHICULAR';
    return PRODUCTS.some(product => product.id === value) ? value : 'REGULAR';
  }

  function productInfo(value) {
    const id = canonicalProduct(value);
    return PRODUCTS.find(product => product.id === id) || PRODUCTS[0];
  }

  function defaultVehicle(overrides = {}) {
    return normalizeVehicle({
      id: 'default-vehicle',
      name: 'Mi vehículo',
      type: 'car',
      fuelType: 'REGULAR',
      distanceUnit: 'km',
      volumeUnit: 'gal',
      tankCapacity: 15,
      targetEfficiency: 35,
      department: 'Francisco Morazán',
      municipality: 'Distrito Central',
      archived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...overrides
    });
  }

  function normalizeVehicle(vehicle) {
    const source = vehicle && typeof vehicle === 'object' ? vehicle : {};
    const type = source.type === 'motorcycle' ? 'motorcycle' : 'car';
    const distanceUnit = source.distanceUnit === 'mi' ? 'mi' : 'km';
    const volumeUnit = source.volumeUnit === 'l' ? 'l' : 'gal';
    return {
      id: String(source.id || uid('vehicle')),
      name: String(source.name || (type === 'motorcycle' ? 'Mi motocicleta' : 'Mi vehículo')).trim().slice(0, 60),
      type,
      fuelType: canonicalProduct(source.fuelType),
      distanceUnit,
      volumeUnit,
      tankCapacity: positive(source.tankCapacity, type === 'motorcycle' ? 4 : 15),
      targetEfficiency: positive(source.targetEfficiency, type === 'motorcycle' ? 120 : 35),
      department: String(source.department || 'Francisco Morazán'),
      municipality: String(source.municipality || 'Distrito Central'),
      archived: Boolean(source.archived),
      createdAt: source.createdAt || new Date().toISOString(),
      updatedAt: source.updatedAt || new Date().toISOString()
    };
  }

  function vehicleFromLegacy(config) {
    const legacy = config && typeof config === 'object' ? config : {};
    const location = LEGACY_LOCATIONS[legacy.city] || LEGACY_LOCATIONS.tegucigalpa;
    return defaultVehicle({
      tankCapacity: positive(legacy.tankCapacity, 15),
      targetEfficiency: positive(legacy.avgConsumption, 35),
      fuelType: canonicalProduct(legacy.fuelType),
      department: location[0],
      municipality: location[1]
    });
  }

  function normalizeRecord(record, fallbackVehicleId) {
    const source = record && typeof record === 'object' ? record : {};
    const legacyGallons = positive(source.gallons);
    const volumeUnit = source.volumeUnit === 'l' ? 'l' : 'gal';
    const volume = positive(source.volume, legacyGallons);
    const date = String(source.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    return {
      id: String(source.id || uid('fill')),
      vehicleId: String(source.vehicleId || fallbackVehicleId),
      date,
      odometer: positive(source.odometer),
      distanceUnit: source.distanceUnit === 'mi' ? 'mi' : 'km',
      volume,
      volumeUnit,
      amountPaid: positive(source.amountPaid),
      fullTank: source.fullTank === true,
      department: String(source.department || ''),
      municipality: String(source.municipality || source.city || ''),
      station: String(source.station || '').trim().slice(0, 80),
      notes: String(source.notes || '').trim().slice(0, 500),
      fuelType: canonicalProduct(source.fuelType),
      createdAt: source.createdAt || new Date().toISOString(),
      updatedAt: source.updatedAt || new Date().toISOString()
    };
  }

  function normalizePriceRow(row) {
    const source = row && typeof row === 'object' ? row : {};
    const pricePerGallon = positive(source.pricePerGallon ?? source.price ?? source.gallon);
    const pricePerLiter = positive(source.pricePerLiter ?? source.liter, pricePerGallon / GALLON_LITERS);
    return {
      department: String(source.department || source.region || '').trim(),
      municipality: String(source.municipality || source.city || '').trim(),
      product: canonicalProduct(source.product || source.fuelType),
      pricePerGallon,
      pricePerLiter,
      lat: nullableNumber(source.lat ?? source.latitude),
      lng: nullableNumber(source.lng ?? source.longitude)
    };
  }

  function legacyPriceRows(data) {
    const rows = [];
    const prices = data && data.prices;
    if (!prices || typeof prices !== 'object') return rows;
    Object.entries(prices).forEach(([cityId, products]) => {
      const location = LEGACY_LOCATIONS[cityId] || ['', cityId];
      Object.entries(products || {}).forEach(([product, price]) => {
        rows.push(normalizePriceRow({
          department: location[0],
          municipality: location[1],
          product,
          pricePerGallon: price
        }));
      });
    });
    return rows;
  }

  function normalizeFuelData(data) {
    const source = data && typeof data === 'object' ? data : {};
    const rows = (Array.isArray(source.rows) ? source.rows : legacyPriceRows(source))
      .map(normalizePriceRow)
      .filter(row => row.department && row.municipality && row.pricePerGallon > 0);
    const previousRows = source.previous && Array.isArray(source.previous.rows)
      ? source.previous.rows.map(normalizePriceRow).filter(row => row.pricePerGallon > 0)
      : [];
    const isOfficialCopy = rows.length > 0 && (
      source.status === 'official' ||
      source.status === 'offline-cache' ||
      source.source === 'official' ||
      /secretar[ií]a|\bsen\b/i.test(String(source.source || ''))
    );
    return {
      status: source.status || (rows.length ? 'official' : 'unavailable'),
      source: isOfficialCopy ? 'official' : 'none',
      sourceUrl: source.sourceUrl || OFFICIAL_SOURCE_URL,
      updatedAt: source.updatedAt || null,
      checkedAt: source.checkedAt || source.retrievedAt || null,
      effectiveFrom: source.effectiveFrom || null,
      effectiveUntil: source.effectiveUntil || null,
      period: source.period || null,
      rows,
      previous: previousRows.length ? {
        period: source.previous.period || null,
        effectiveFrom: source.previous.effectiveFrom || null,
        rows: previousRows
      } : null
    };
  }

  function officialDataIsValid(data) {
    if (!data || data.status !== 'official' || !Array.isArray(data.rows)) return false;
    const normalized = normalizeFuelData(data);
    const departments = new Set(normalized.rows.map(row => row.department));
    const products = new Set(normalized.rows.map(row => row.product));
    return normalized.rows.length >= 100 && departments.size >= 10 && products.size >= 4;
  }

  function loadState() {
    const storedVehicles = safeParse(localStorage.getItem(STORAGE.vehicles), null);
    const legacyVehicle = safeParse(localStorage.getItem(STORAGE.legacyVehicle), null);
    vehicles = Array.isArray(storedVehicles) && storedVehicles.length
      ? storedVehicles.map(normalizeVehicle)
      : [vehicleFromLegacy(legacyVehicle)];

    preferences = {
      ...defaultPreferences,
      ...safeParse(localStorage.getItem(STORAGE.preferences), {})
    };
    if (!vehicles.some(vehicle => vehicle.id === preferences.activeVehicleId && !vehicle.archived)) {
      preferences.activeVehicleId = vehicles.find(vehicle => !vehicle.archived)?.id || vehicles[0].id;
    }

    const storedHistory = safeParse(localStorage.getItem(STORAGE.history), []);
    history = Array.isArray(storedHistory)
      ? storedHistory.map(record => normalizeRecord(record, preferences.activeVehicleId))
      : [];
    fuelData = normalizeFuelData(safeParse(localStorage.getItem(STORAGE.prices), emptyFuelData()));

    if (!storedVehicles && legacyVehicle) {
      saveVehicles();
      savePreferences();
    }
  }

  function saveVehicles() {
    localStorage.setItem(STORAGE.vehicles, JSON.stringify(vehicles));
  }

  function saveHistory() {
    localStorage.setItem(STORAGE.history, JSON.stringify(history));
  }

  function savePreferences() {
    localStorage.setItem(STORAGE.preferences, JSON.stringify(preferences));
  }

  function saveFuelData() {
    try {
      localStorage.setItem(STORAGE.prices, JSON.stringify(fuelData));
    } catch (error) {
      console.warn('[OAVIX Fuel] No se pudo guardar la copia de precios:', error && error.message);
    }
  }

  function ensureVehiclesPersisted() {
    if (localStorage.getItem(STORAGE.vehicles) === null) saveVehicles();
    if (localStorage.getItem(STORAGE.preferences) === null) savePreferences();
  }

  function getVehicles(includeArchived = false) {
    return vehicles
      .filter(vehicle => includeArchived || !vehicle.archived)
      .map(vehicle => ({ ...vehicle }));
  }

  function getVehicle(id) {
    const vehicle = vehicles.find(candidate => candidate.id === String(id));
    return vehicle ? { ...vehicle } : null;
  }

  function getActiveVehicle() {
    return getVehicle(preferences.activeVehicleId) || getVehicles()[0] || null;
  }

  function setActiveVehicle(id) {
    const vehicle = vehicles.find(candidate => candidate.id === String(id) && !candidate.archived);
    if (!vehicle) return false;
    preferences.activeVehicleId = vehicle.id;
    preferences.priceDepartment = vehicle.department;
    preferences.priceMunicipality = vehicle.municipality;
    preferences.priceProduct = vehicle.fuelType;
    savePreferences();
    return true;
  }

  function saveVehicle(input) {
    const existing = input && input.id
      ? vehicles.find(vehicle => vehicle.id === String(input.id))
      : null;
    const now = new Date().toISOString();
    const normalized = normalizeVehicle({
      ...(existing || {}),
      ...(input || {}),
      id: existing ? existing.id : uid('vehicle'),
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
      archived: false
    });
    if (!normalized.name) return null;
    if (existing) vehicles = vehicles.map(vehicle => vehicle.id === existing.id ? normalized : vehicle);
    else vehicles.push(normalized);
    preferences.activeVehicleId = normalized.id;
    preferences.priceDepartment = normalized.department;
    preferences.priceMunicipality = normalized.municipality;
    preferences.priceProduct = normalized.fuelType;
    saveVehicles();
    savePreferences();
    return { ...normalized };
  }

  function archiveVehicle(id) {
    const active = vehicles.filter(vehicle => !vehicle.archived);
    if (active.length <= 1) return false;
    const target = vehicles.find(vehicle => vehicle.id === String(id) && !vehicle.archived);
    if (!target) return false;
    target.archived = true;
    target.updatedAt = new Date().toISOString();
    if (preferences.activeVehicleId === target.id) {
      preferences.activeVehicleId = vehicles.find(vehicle => !vehicle.archived).id;
    }
    saveVehicles();
    savePreferences();
    return true;
  }

  function restoreVehicle(id) {
    const target = vehicles.find(vehicle => vehicle.id === String(id) && vehicle.archived);
    if (!target) return false;
    target.archived = false;
    target.updatedAt = new Date().toISOString();
    preferences.activeVehicleId = target.id;
    preferences.priceDepartment = target.department;
    preferences.priceMunicipality = target.municipality;
    preferences.priceProduct = target.fuelType;
    saveVehicles();
    savePreferences();
    return true;
  }

  function setPreferences(next) {
    preferences = { ...preferences, ...(next || {}) };
    savePreferences();
    return { ...preferences };
  }

  function getPreferences() {
    return { ...preferences };
  }

  function saveFuelRecord(input) {
    const existing = input && input.id
      ? history.find(record => record.id === String(input.id))
      : null;
    const active = getActiveVehicle();
    if (!active) return null;
    const now = new Date().toISOString();
    const normalized = normalizeRecord({
      ...(existing || {}),
      ...(input || {}),
      id: existing ? existing.id : uid('fill'),
      vehicleId: input && input.vehicleId || active.id,
      fuelType: input && input.fuelType || active.fuelType,
      distanceUnit: input && input.distanceUnit || active.distanceUnit,
      volumeUnit: input && input.volumeUnit || active.volumeUnit,
      department: input && input.department || active.department,
      municipality: input && input.municipality || active.municipality,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    }, active.id);
    if (!normalized.date || normalized.volume <= 0 || normalized.amountPaid <= 0) return null;
    if (existing) history = history.map(record => record.id === existing.id ? normalized : record);
    else history.push(normalized);
    ensureVehiclesPersisted();
    saveHistory();
    return { ...normalized };
  }

  function deleteFuelRecord(id) {
    const before = history.length;
    history = history.filter(record => record.id !== String(id));
    if (history.length === before) return false;
    saveHistory();
    return true;
  }

  function recordFuelFill(input) {
    return saveFuelRecord(input);
  }

  function sortRecords(records) {
    return [...records].sort((first, second) => {
      const byDate = String(first.date).localeCompare(String(second.date));
      if (byDate) return byDate;
      const byOdometer = toKilometers(first.odometer, first.distanceUnit) -
        toKilometers(second.odometer, second.distanceUnit);
      if (byOdometer) return byOdometer;
      return String(first.createdAt).localeCompare(String(second.createdAt));
    });
  }

  function getFuelHistory(options = {}) {
    const normalized = typeof options === 'number' ? { limit: options } : options || {};
    const vehicleId = normalized.vehicleId || preferences.activeVehicleId;
    let records = sortRecords(history.filter(record => !vehicleId || record.vehicleId === vehicleId)).reverse();
    if (normalized.from) records = records.filter(record => record.date >= normalized.from);
    if (normalized.to) records = records.filter(record => record.date <= normalized.to);
    if (normalized.limit) records = records.slice(0, normalized.limit);
    return records.map(record => ({ ...record }));
  }

  function getFuelRecord(id) {
    const record = history.find(candidate => candidate.id === String(id));
    return record ? { ...record } : null;
  }

  function toGallons(value, unit) {
    return unit === 'l' ? number(value) / GALLON_LITERS : number(value);
  }

  function fromGallons(value, unit) {
    return unit === 'l' ? number(value) * GALLON_LITERS : number(value);
  }

  function toKilometers(value, unit) {
    return unit === 'mi' ? number(value) * KM_PER_MILE : number(value);
  }

  function fromKilometers(value, unit) {
    return unit === 'mi' ? number(value) / KM_PER_MILE : number(value);
  }

  function efficiencyToKmPerGallon(value, distanceUnit, volumeUnit) {
    const distanceKm = distanceUnit === 'mi' ? number(value) * KM_PER_MILE : number(value);
    return volumeUnit === 'l' ? distanceKm * GALLON_LITERS : distanceKm;
  }

  function efficiencyFromKmPerGallon(value, distanceUnit, volumeUnit) {
    let converted = distanceUnit === 'mi' ? number(value) / KM_PER_MILE : number(value);
    if (volumeUnit === 'l') converted /= GALLON_LITERS;
    return converted;
  }

  function targetEfficiency(vehicle) {
    return efficiencyToKmPerGallon(
      vehicle && vehicle.targetEfficiency,
      vehicle && vehicle.distanceUnit,
      vehicle && vehicle.volumeUnit
    );
  }

  function getConsumptionStats(vehicleId = preferences.activeVehicleId) {
    const vehicle = getVehicle(vehicleId) || getActiveVehicle();
    const records = sortRecords(history.filter(record => record.vehicleId === vehicleId));
    let previousFull = null;
    let intervalGallons = 0;
    let intervalCost = 0;
    let totalGallons = 0;
    let totalKm = 0;
    let totalCost = 0;
    let completedIntervals = 0;

    records.forEach(record => {
      if (!previousFull) {
        if (record.fullTank && record.odometer > 0) previousFull = record;
        return;
      }

      intervalGallons += toGallons(record.volume, record.volumeUnit);
      intervalCost += record.amountPaid;
      if (!record.fullTank || record.odometer <= 0) return;

      const distance = toKilometers(record.odometer, record.distanceUnit) -
        toKilometers(previousFull.odometer, previousFull.distanceUnit);
      if (distance > 0 && intervalGallons > 0) {
        totalKm += distance;
        totalGallons += intervalGallons;
        totalCost += intervalCost;
        completedIntervals += 1;
      }
      previousFull = record;
      intervalGallons = 0;
      intervalCost = 0;
    });

    const measuredEfficiency = totalGallons > 0 ? totalKm / totalGallons : 0;
    const fallbackEfficiency = targetEfficiency(vehicle || {});
    const efficiency = measuredEfficiency || fallbackEfficiency;
    const allGallons = records.reduce((sum, record) => sum + toGallons(record.volume, record.volumeUnit), 0);
    const allCost = records.reduce((sum, record) => sum + record.amountPaid, 0);
    return {
      totalGallons,
      totalKm,
      totalCost,
      completedIntervals,
      avgConsumption: efficiency,
      measuredEfficiency,
      estimatedEfficiency: fallbackEfficiency,
      source: measuredEfficiency ? 'measured' : 'estimate',
      costPerKm: totalKm > 0 ? totalCost / totalKm : 0,
      avgPrice: allGallons > 0 ? allCost / allGallons : 0,
      rangeKm: vehicle && efficiency > 0
        ? toGallons(vehicle.tankCapacity, vehicle.volumeUnit) * efficiency
        : 0
    };
  }

  function dateAtNoon(value) {
    const parsed = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    return Number.isFinite(parsed.getTime()) ? parsed : new Date(0);
  }

  function startOfWeek(date) {
    const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
    const offset = (copy.getDay() + 6) % 7;
    copy.setDate(copy.getDate() - offset);
    return copy;
  }

  function periodTotal(records, start, end) {
    return records.reduce((total, record) => {
      const date = dateAtNoon(record.date);
      if (date < start || date >= end) return total;
      total.amount += record.amountPaid;
      total.gallons += toGallons(record.volume, record.volumeUnit);
      total.count += 1;
      return total;
    }, { amount: 0, gallons: 0, count: 0 });
  }

  function getDashboardStats(referenceDate = new Date(), vehicleId = preferences.activeVehicleId) {
    const records = history.filter(record => record.vehicleId === vehicleId);
    const now = new Date(referenceDate);
    const weekStart = startOfWeek(now);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const yearEnd = new Date(now.getFullYear() + 1, 0, 1);
    const week = periodTotal(records, weekStart, weekEnd);
    const month = periodTotal(records, monthStart, monthEnd);
    const previousMonth = periodTotal(records, previousMonthStart, monthStart);
    const year = periodTotal(records, yearStart, yearEnd);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const elapsedDays = Math.max(1, now.getDate());
    return {
      week,
      month,
      year,
      previousMonth,
      monthProjection: month.amount / elapsedDays * daysInMonth,
      monthTrend: previousMonth.amount > 0
        ? (month.amount - previousMonth.amount) / previousMonth.amount * 100
        : null,
      consumption: getConsumptionStats(vehicleId)
    };
  }

  function getMonthlySeries(count = 6, referenceDate = new Date(), vehicleId = preferences.activeVehicleId) {
    const records = history.filter(record => record.vehicleId === vehicleId);
    const formatter = new Intl.DateTimeFormat('es-HN', { month: 'short' });
    const series = [];
    for (let offset = count - 1; offset >= 0; offset -= 1) {
      const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - offset, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      const total = periodTotal(records, start, end);
      series.push({
        key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
        label: formatter.format(start).replace('.', ''),
        amount: total.amount,
        gallons: total.gallons,
        count: total.count
      });
    }
    return series;
  }

  function rowKey(row) {
    return [normalizeText(row.department), normalizeText(row.municipality), canonicalProduct(row.product)].join('|');
  }

  function priceDelta(row) {
    if (!fuelData.previous || !Array.isArray(fuelData.previous.rows)) return null;
    const previous = fuelData.previous.rows.find(candidate => rowKey(candidate) === rowKey(row));
    return previous ? row.pricePerGallon - previous.pricePerGallon : null;
  }

  function getDepartments() {
    return [...new Set(fuelData.rows.map(row => row.department))]
      .sort((first, second) => first.localeCompare(second, 'es'));
  }

  function getMunicipalities(department) {
    return [...new Set(fuelData.rows
      .filter(row => !department || normalizeText(row.department) === normalizeText(department))
      .map(row => row.municipality))]
      .sort((first, second) => first.localeCompare(second, 'es'));
  }

  function getPriceRows(filters = {}) {
    const department = normalizeText(filters.department);
    const municipality = normalizeText(filters.municipality);
    const municipalityAliases = municipality === 'tegucigalpa' || municipality === 'distrito central'
      ? ['tegucigalpa', 'distrito central']
      : [municipality];
    const product = filters.product ? canonicalProduct(filters.product) : '';
    return fuelData.rows
      .filter(row => !department || normalizeText(row.department) === department)
      .filter(row => !municipality || municipalityAliases.includes(normalizeText(row.municipality)))
      .filter(row => !product || row.product === product)
      .map(row => ({ ...row, delta: priceDelta(row) }))
      .sort((first, second) => first.municipality.localeCompare(second.municipality, 'es'));
  }

  function getOfficialPrice(department, municipality, product) {
    return getPriceRows({ department, municipality, product })[0] || null;
  }

  function getVehicleOfficialPrice(vehicleId = preferences.activeVehicleId) {
    const vehicle = getVehicle(vehicleId) || getActiveVehicle();
    return vehicle
      ? getOfficialPrice(vehicle.department, vehicle.municipality, vehicle.fuelType)
      : null;
  }

  function getCurrentPrice(location, product) {
    const legacyLocation = LEGACY_LOCATIONS[location];
    if (legacyLocation) {
      return getOfficialPrice(legacyLocation[0], legacyLocation[1], product)?.pricePerGallon ?? null;
    }
    const row = getPriceRows({ municipality: location, product })[0];
    return row ? row.pricePerGallon : null;
  }

  function calculateTrip(input = {}) {
    const vehicle = getVehicle(input.vehicleId || preferences.activeVehicleId) || getActiveVehicle();
    if (!vehicle) return null;
    const consumption = getConsumptionStats(vehicle.id);
    const efficiency = consumption.avgConsumption;
    const distanceKm = toKilometers(positive(input.distance), input.distanceUnit || vehicle.distanceUnit) *
      (input.roundTrip ? 2 : 1);
    const priceRow = input.pricePerGallon
      ? { pricePerGallon: positive(input.pricePerGallon) }
      : getVehicleOfficialPrice(vehicle.id);
    if (!distanceKm || !efficiency || !priceRow || !priceRow.pricePerGallon) return null;
    const gallons = distanceKm / efficiency;
    return {
      distanceKm,
      distance: fromKilometers(distanceKm, vehicle.distanceUnit),
      distanceUnit: vehicle.distanceUnit,
      gallons,
      volume: fromGallons(gallons, vehicle.volumeUnit),
      volumeUnit: vehicle.volumeUnit,
      cost: gallons * priceRow.pricePerGallon,
      pricePerGallon: priceRow.pricePerGallon,
      efficiency,
      source: consumption.source
    };
  }

  function calculateBudget(input = {}) {
    const vehicle = getVehicle(input.vehicleId || preferences.activeVehicleId) || getActiveVehicle();
    if (!vehicle) return null;
    const priceRow = input.pricePerGallon
      ? { pricePerGallon: positive(input.pricePerGallon) }
      : getVehicleOfficialPrice(vehicle.id);
    const budget = positive(input.budget);
    const consumption = getConsumptionStats(vehicle.id);
    if (!budget || !priceRow || !priceRow.pricePerGallon || !consumption.avgConsumption) return null;
    const gallons = budget / priceRow.pricePerGallon;
    const distanceKm = gallons * consumption.avgConsumption;
    return {
      budget,
      gallons,
      volume: fromGallons(gallons, vehicle.volumeUnit),
      volumeUnit: vehicle.volumeUnit,
      distanceKm,
      distance: fromKilometers(distanceKm, vehicle.distanceUnit),
      distanceUnit: vehicle.distanceUnit,
      source: consumption.source
    };
  }

  function calculateFullTank(vehicleId = preferences.activeVehicleId) {
    const vehicle = getVehicle(vehicleId) || getActiveVehicle();
    const price = getVehicleOfficialPrice(vehicle && vehicle.id);
    if (!vehicle || !price) return null;
    const gallons = toGallons(vehicle.tankCapacity, vehicle.volumeUnit);
    return {
      cost: gallons * price.pricePerGallon,
      gallons,
      capacity: vehicle.tankCapacity,
      volumeUnit: vehicle.volumeUnit,
      price
    };
  }

  function calculateCostPerKm(distance, location, product, efficiency) {
    const price = getCurrentPrice(location, product);
    return price && positive(efficiency) ? positive(distance) / positive(efficiency) * price : null;
  }

  function getAutoFillAmount(gallons, location, product) {
    const price = getCurrentPrice(location, product);
    return price && positive(gallons) ? Number((positive(gallons) * price).toFixed(2)) : null;
  }

  function safeRender() {
    try {
      if (typeof root.renderFuelModule === 'function') root.renderFuelModule({ preservePanel: true });
    } catch (error) {
      console.warn('[OAVIX Fuel] render omitido:', error && error.message);
    }
  }

  function announcePriceUpdate() {
    try {
      document.dispatchEvent(new CustomEvent('oavix:fuel-prices', { detail: getPriceSource() }));
    } catch {}
  }

  async function loadOfficialSEN() {
    try {
      const response = await fetch(OFFICIAL_DATA_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error(`SEN HTTP ${response.status}`);
      const data = await response.json();
      if (!officialDataIsValid(data)) throw new Error('La respuesta oficial está incompleta');
      fuelData = { ...normalizeFuelData(data), source: 'official', status: 'official' };
      saveFuelData();
      announcePriceUpdate();
      safeRender();
      return true;
    } catch (error) {
      console.warn('[OAVIX Fuel] SEN no disponible:', error && error.message);
      if (fuelData.rows.length && (fuelData.source === 'official' || fuelData.status === 'official')) {
        fuelData.status = 'offline-cache';
      } else {
        fuelData = { ...emptyFuelData(), ...fuelData, source: 'none', status: 'unavailable' };
      }
      saveFuelData();
      announcePriceUpdate();
      safeRender();
      return false;
    }
  }

  function getPriceSource() {
    return {
      type: fuelData.source,
      status: fuelData.status,
      url: fuelData.sourceUrl || OFFICIAL_SOURCE_URL,
      updatedAt: fuelData.updatedAt,
      checkedAt: fuelData.checkedAt,
      effectiveFrom: fuelData.effectiveFrom,
      effectiveUntil: fuelData.effectiveUntil,
      period: fuelData.period,
      rowCount: fuelData.rows.length,
      hasPrevious: Boolean(fuelData.previous)
    };
  }

  loadState();

  root.FuelModule = {
    constants: { GALLON_LITERS, KM_PER_MILE, STORAGE },
    getProducts: () => PRODUCTS.map(product => ({ ...product })),
    productInfo,
    canonicalProduct,
    getVehicles,
    getVehicle,
    getActiveVehicle,
    setActiveVehicle,
    saveVehicle,
    archiveVehicle,
    restoreVehicle,
    getPreferences,
    setPreferences,
    saveFuelRecord,
    recordFuelFill,
    deleteFuelRecord,
    getFuelRecord,
    getFuelHistory,
    getConsumptionStats,
    getDashboardStats,
    getMonthlySeries,
    getDepartments,
    getMunicipalities,
    getPriceRows,
    getOfficialPrice,
    getVehicleOfficialPrice,
    getCurrentPrice,
    getPriceSource,
    getLastUpdate: () => fuelData.updatedAt,
    getNextUpdate: () => fuelData.effectiveUntil,
    getCurrentPrices: () => getPriceRows(),
    getCities: () => getMunicipalities().map(name => ({ id: name, name })),
    getFuelTypes: () => PRODUCTS.map(product => product.id),
    refreshPrices: loadOfficialSEN,
    calculateTrip,
    calculateBudget,
    calculateFullTank,
    calculateCostPerKm,
    getAutoFillAmount,
    toGallons,
    fromGallons,
    toKilometers,
    fromKilometers,
    efficiencyToKmPerGallon,
    efficiencyFromKmPerGallon,
    getOfficialSourceUrl: () => OFFICIAL_SOURCE_URL,
    reloadLocalState: loadState
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadOfficialSEN, { once: true });
  } else {
    loadOfficialSEN();
  }
})(window);
