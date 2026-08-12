import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const SOURCE = 'https://sen.hn/';
const OUTPUT = 'data/sen-prices.json';
const CITY_NAMES = [
  'Tegucigalpa', 'San Pedro Sula', 'La Ceiba', 'Choloma',
  'Danlí', 'Danli', 'Juticalpa', 'Comayagua', 'Trujillo'
];
const FUEL_NAMES = ['Gasolina Súper', 'Gasolina Superior', 'Gasolina Regular', 'Diésel', 'Diesel', 'Kerosene', 'GLP'];

function normalize(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function extractPrices(text) {
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const prices = {};
  let currentCity = null;

  for (const line of lines) {
    const city = CITY_NAMES.find(c => normalize(line).includes(normalize(c)));
    if (city) {
      currentCity = normalize(city).replaceAll(' ', '_');
      if (!prices[currentCity]) prices[currentCity] = {};
      continue;
    }
    if (!currentCity) continue;

    const fuel = FUEL_NAMES.find(f => normalize(line).includes(normalize(f)));
    if (!fuel) continue;

    const match = line.match(/(?:L\.?\s*)?(\d{1,3}(?:[,.]\d{2}))/);
    if (!match) continue;
    const value = Number(match[1].replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) continue;

    let key = fuel;
    if (normalize(fuel).includes('superior')) key = 'Gasolina Súper';
    if (normalize(fuel) === 'diesel') key = 'Diésel';
    prices[currentCity][key] = value;
  }

  return prices;
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(SOURCE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(15000);

  const frames = page.frames();
  const texts = [];
  for (const frame of frames) {
    try {
      const text = await frame.locator('body').innerText({ timeout: 5000 });
      if (text && /combustible|gasolina|diesel|di[eé]sel/i.test(text)) texts.push(text);
    } catch {}
  }

  const combined = texts.join('\n');
  const prices = extractPrices(combined);
  const cityCount = Object.keys(prices).length;
  const valueCount = Object.values(prices).reduce((n, city) => n + Object.keys(city).length, 0);

  if (cityCount === 0 || valueCount < 5) {
    throw new Error(`No se pudieron extraer datos suficientes del tablero oficial (ciudades=${cityCount}, valores=${valueCount}). Se conserva el archivo anterior.`);
  }

  const payload = {
    source: 'Secretaría de Energía de Honduras (SEN)',
    sourceUrl: SOURCE,
    updatedAt: new Date().toISOString(),
    status: 'official',
    prices,
    extraction: 'Power BI público de SEN mediante Playwright; el workflow falla si no obtiene datos suficientes.'
  };

  await fs.writeFile(OUTPUT, JSON.stringify(payload, null, 2) + '\n');
  console.log(`SEN actualizado: ${cityCount} ciudades, ${valueCount} valores.`);
} finally {
  await browser.close();
}
