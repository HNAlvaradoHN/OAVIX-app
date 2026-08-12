import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import {
  extractPrices,
  validateOfficialPayload,
  isAllowedSource
} from './sen-price-adapter.mjs';

const OFFICIAL_PAGES = [
  'https://sen.hn/',
  'https://sen.hn/prueba-sc/'
];
const OUTPUT = 'data/sen-prices.json';
const TEMP_OUTPUT = `${OUTPUT}.tmp`;

async function collectSourceLinks(page) {
  const links = await page.locator('a[href]').evaluateAll(anchors =>
    anchors.map(anchor => ({
      href: anchor.href,
      text: (anchor.textContent || '').trim()
    }))
  );

  return links
    .map(link => link.href)
    .filter(url => isAllowedSource(url))
    .filter((url, index, list) => list.indexOf(url) === index);
}

async function collectText(page) {
  await page.waitForTimeout(12000);

  const texts = [];
  for (const frame of page.frames()) {
    try {
      const text = await frame.locator('body').innerText({ timeout: 7000 });
      if (text && /combustible|gasolina|diesel|di[eé]sel/i.test(text)) {
        texts.push(text);
      }
    } catch {
      // Un frame puede bloquear lectura por cross-origin; no invalida los demás.
    }
  }

  return texts.join('\n');
}

const browser = await chromium.launch({ headless: true });
try {
  let best = null;

  for (const sourcePage of OFFICIAL_PAGES) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    try {
      await page.goto(sourcePage, {
        waitUntil: 'domcontentloaded',
        timeout: 90000
      });

      const discoveredLinks = await collectSourceLinks(page);
      const candidates = [sourcePage, ...discoveredLinks];

      for (const candidate of candidates) {
        if (!isAllowedSource(candidate)) continue;

        const target = candidate === sourcePage
          ? page
          : await browser.newPage({ viewport: { width: 1440, height: 1000 } });

        try {
          if (target !== page) {
            await target.goto(candidate, {
              waitUntil: 'domcontentloaded',
              timeout: 90000
            });
          }

          const text = await collectText(target);
          const prices = extractPrices(text);

          try {
            const stats = validateOfficialPayload(prices);
            best = {
              prices,
              sourceUrl: candidate,
              ...stats
            };
            break;
          } catch {
            // Esta fuente no tiene suficientes datos. Probamos la siguiente.
          }
        } finally {
          if (target !== page) await target.close();
        }
      }
    } catch (error) {
      console.warn(`No se pudo consultar ${sourcePage}: ${error.message}`);
    } finally {
      await page.close();
    }

    if (best) break;
  }

  if (!best) {
    throw new Error(
      'No se pudo validar una fuente oficial de precios SEN. Se conserva data/sen-prices.json sin modificar.'
    );
  }

  const payload = {
    schemaVersion: 1,
    source: 'Secretaría de Energía de Honduras (SEN)',
    sourceUrl: best.sourceUrl,
    checkedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'official',
    prices: best.prices,
    validation: {
      cities: best.cityCount,
      values: best.valueCount,
      fuelTypes: best.fuelTypeCount
    },
    extraction: 'Datos publicados por SEN obtenidos mediante Playwright. Si cambia la estructura o los datos no pasan validación, el archivo anterior se conserva.'
  };

  // Escritura atómica: nunca dejamos un JSON parcialmente escrito.
  await fs.writeFile(TEMP_OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  await fs.rename(TEMP_OUTPUT, OUTPUT);

  console.log(
    `SEN actualizado correctamente: ${best.cityCount} ciudades, ${best.valueCount} valores, fuente=${best.sourceUrl}`
  );
} finally {
  await browser.close();
  try { await fs.unlink(TEMP_OUTPUT); } catch {}
}
