const CITY_NAMES = [
  'Tegucigalpa', 'San Pedro Sula', 'La Ceiba', 'Choloma',
  'Danlí', 'Danli', 'Juticalpa', 'Comayagua', 'Trujillo'
];

const FUEL_NAMES = [
  'Gasolina Súper', 'Gasolina Superior', 'Gasolina Regular',
  'Diésel', 'Diesel', 'Kerosene', 'GLP'
];

export const SOURCE_HOSTS = new Set(['sen.hn', 'www.sen.hn', 'app.powerbi.com']);

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function cityKey(city) {
  return normalizeText(city).replace(/\s+/g, '_');
}

export function normalizeFuelName(name) {
  const value = normalizeText(name);
  if (value.includes('superior') || value.includes('super')) return 'Gasolina Súper';
  if (value.includes('regular')) return 'Gasolina Regular';
  if (value.includes('diesel')) return 'Diésel';
  if (value.includes('kerosene') || value.includes('keroseno')) return 'Kerosene';
  if (value.includes('glp') || value.includes('gas licuado')) return 'GLP';
  return null;
}

function parsePrice(line) {
  const match = String(line).match(/(?:^|\bL\.?\s*)(\d{1,3}(?:[,.]\d{2}))\b/);
  if (!match) return null;
  const value = Number(match[1].replace(',', '.'));
  return Number.isFinite(value) && value > 0 && value < 500 ? value : null;
}

export function extractPrices(text, cityNames = CITY_NAMES) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const prices = {};
  let currentCity = null;

  for (const line of lines) {
    const city = cityNames.find(name => normalizeText(line).includes(normalizeText(name)));
    if (city) {
      currentCity = cityKey(city);
      if (!prices[currentCity]) prices[currentCity] = {};
      continue;
    }

    if (!currentCity) continue;

    const fuelName = FUEL_NAMES.find(name => normalizeText(line).includes(normalizeText(name)));
    if (!fuelName) continue;

    const fuel = normalizeFuelName(fuelName);
    const value = parsePrice(line);
    if (!fuel || value === null) continue;

    prices[currentCity][fuel] = value;
  }

  return Object.fromEntries(
    Object.entries(prices).filter(([, cityPrices]) => Object.keys(cityPrices).length > 0)
  );
}

export function countPriceValues(prices) {
  return Object.values(prices ?? {}).reduce(
    (total, cityPrices) => total + Object.keys(cityPrices ?? {}).length,
    0
  );
}

export function validateOfficialPayload(prices) {
  const cityCount = Object.keys(prices ?? {}).length;
  const valueCount = countPriceValues(prices);
  const fuelTypes = new Set(
    Object.values(prices ?? {}).flatMap(cityPrices => Object.keys(cityPrices ?? {}))
  );

  if (cityCount < 3) {
    throw new Error(`Datos insuficientes: solo ${cityCount} ciudades detectadas.`);
  }
  if (fuelTypes.size < 2) {
    throw new Error(`Datos insuficientes: solo ${fuelTypes.size} tipos de combustible detectados.`);
  }
  if (valueCount < 5) {
    throw new Error(`Datos insuficientes: solo ${valueCount} precios detectados.`);
  }

  return { cityCount, valueCount, fuelTypeCount: fuelTypes.size };
}

export function isAllowedSource(url) {
  try {
    return SOURCE_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

export { CITY_NAMES, FUEL_NAMES };
