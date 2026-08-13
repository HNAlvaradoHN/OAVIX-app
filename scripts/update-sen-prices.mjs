import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SOURCE_URL = 'https://app.powerbi.com/view?r=eyJrIjoiZDdmNzNjMmYtNzMzYy00ZDQ2LTg0MzctYWRlNDQ5MWIzNGYxIiwidCI6Ijk0MDNiYTRiLWJjNTQtNDAzZS05NTg4LWI1NTJkMThhODI3YiJ9';
const FALLBACK_RESOURCE_KEY = 'd7f73c2f-733c-4d46-8437-ade4491b34f1';
const FALLBACK_CLUSTER = 'https://wabi-paas-1-scus-api.analysis.windows.net/';
const OUTPUT = path.resolve(process.cwd(), 'data/sen-prices.json');
const ENTITY = 'PRECIOS CIUDADES';
const GALLON_LITERS = 3.785411784;
const PERIOD_FIELDS = ['AÑO', 'MES', 'SEMANA'];
const PRICE_FIELDS = [
  'AÑO', 'MES', 'SEMANA', 'DEPARTAMENTO', 'MUNICIPIO',
  'PRODUCTO', 'PRECIO', 'PRECIO LITROS', 'LATITUD', 'LONGITUD'
];
const MONTHS = Object.freeze({
  ENERO: 1,
  FEBRERO: 2,
  MARZO: 3,
  ABRIL: 4,
  MAYO: 5,
  JUNIO: 6,
  JULIO: 7,
  AGOSTO: 8,
  SEPTIEMBRE: 9,
  SETIEMBRE: 9,
  OCTUBRE: 10,
  NOVIEMBRE: 11,
  DICIEMBRE: 12
});

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function finiteNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const normalized = String(value).trim().replace(/\s/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function canonicalProduct(value) {
  const product = normalize(value);
  if (product.includes('SUPER')) return 'SUPERIOR';
  if (product.includes('REGULAR')) return 'REGULAR';
  if (product.includes('DIESEL')) return 'DIÉSEL';
  if (product.includes('KEROS')) return 'KEROSENE';
  if (product.includes('GLP') || product.includes('GAS LICUADO')) return 'GLP VEHICULAR';
  return null;
}

function displayLocation(value) {
  const lower = String(value ?? '').trim().toLocaleLowerCase('es-HN');
  if (!lower) return '';
  const minorWords = new Set(['de', 'del', 'la', 'las', 'los', 'y']);
  return lower.split(/([\s-]+)/).map((part, index) => {
    if (/^[\s-]+$/.test(part)) return part;
    const word = part.replace(/^[^\p{L}]*/u, '');
    if (index > 0 && minorWords.has(word)) return part;
    return part.replace(/\p{L}/u, letter => letter.toLocaleUpperCase('es-HN'));
  }).join('');
}

function parseResourceDescriptor(html) {
  const descriptorMatch = html.match(/resourceDescriptor\s*=\s*JSON\.parse\('([^']+)'\)/i);
  let resourceKey = FALLBACK_RESOURCE_KEY;
  if (descriptorMatch) {
    try {
      const descriptor = JSON.parse(descriptorMatch[1].replace(/\\"/g, '"'));
      resourceKey = descriptor.k || resourceKey;
    } catch {}
  }

  const clusterMatch = html.match(/resolvedClusterUri\s*=\s*['"]([^'"]+)['"]/i);
  const cluster = clusterMatch ? clusterMatch[1] : FALLBACK_CLUSTER;
  const apiCluster = cluster
    .replace('-redirect.analysis.windows.net', '-api.analysis.windows.net')
    .replace(/\/+$/, '') + '/';
  return { resourceKey, apiCluster };
}

function requestHeaders(resourceKey, json = false) {
  return {
    Accept: 'application/json, text/plain, */*',
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ActivityId: crypto.randomUUID(),
    RequestId: crypto.randomUUID(),
    'X-PowerBI-ResourceKey': resourceKey
  };
}

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} al consultar ${url}`);
  return response.text();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(90_000) });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Power BI respondió HTTP ${response.status}: ${detail}`);
  }
  return response.json();
}

function column(property) {
  return {
    Column: { Expression: { SourceRef: { Source: 'p' } }, Property: property },
    Name: `p.${property}`
  };
}

function inCondition(property, literal) {
  return {
    Condition: {
      In: {
        Expressions: [{ Column: { Expression: { SourceRef: { Source: 'p' } }, Property: property } }],
        Values: [[{ Literal: { Value: literal } }]]
      }
    }
  };
}

function powerBIQuery(modelId, fields, where = []) {
  return {
    version: '1.0.0',
    queries: [{
      Query: {
        Commands: [{
          SemanticQueryDataShapeCommand: {
            Query: {
              Version: 2,
              From: [{ Name: 'p', Entity: ENTITY, Type: 0 }],
              Select: fields.map(column),
              ...(where.length ? { Where: where } : {})
            },
            Binding: {
              DataReduction: { DataVolume: 6, Primary: { Window: { Count: 5000 } } },
              Primary: { Groupings: [{ Projections: fields.map((_, index) => index), Subtotal: 1 }] },
              Version: 1
            },
            ExecutionMetricsKind: 1
          }
        }]
      }
    }],
    cancelQueries: [],
    modelId
  };
}

function dictionaryValue(dictionary, raw) {
  if (!dictionary) return raw;
  if (Array.isArray(dictionary) && Number.isInteger(raw) && raw >= 0 && raw < dictionary.length) {
    return dictionary[raw];
  }
  if (typeof dictionary === 'object' && Object.prototype.hasOwnProperty.call(dictionary, String(raw))) {
    return dictionary[String(raw)];
  }
  return raw;
}

/** Decodifica la compresión DSR usada por el API semántico público de Power BI. */
function decodePowerBIData(payload) {
  const data = payload?.results?.[0]?.result?.data;
  if (!data || !data.dsr || !Array.isArray(data.dsr.DS)) {
    const errors = payload?.results?.flatMap(result => result?.result?.error ? [result.result.error] : []) || [];
    throw new Error(`Power BI no devolvió datos DSR${errors.length ? `: ${JSON.stringify(errors).slice(0, 300)}` : ''}`);
  }

  const descriptors = Array.isArray(data.descriptor?.Select) ? data.descriptor.Select : [];
  const names = descriptors.map((descriptor, index) => {
    const fullName = String(descriptor.Name || descriptor.Value || `column_${index}`);
    return fullName.includes('.') ? fullName.slice(fullName.lastIndexOf('.') + 1) : fullName;
  });
  const output = [];

  data.dsr.DS.forEach(dataset => {
    const dictionaries = dataset.ValueDicts || {};
    (dataset.PH || []).forEach(partition => {
      Object.keys(partition).filter(key => /^DM\d+$/.test(key)).forEach(member => {
        let schema = [];
        let previous = [];
        (partition[member] || []).forEach(encoded => {
          if (Array.isArray(encoded.S)) schema = encoded.S;
          const width = Math.max(names.length, schema.length, previous.length);
          const compressed = Array.isArray(encoded.C)
            ? encoded.C
            : Array.isArray(encoded.D) ? encoded.D : [];
          const repeatMask = Number(encoded.R || 0);
          const nullMask = Number(encoded['Ø'] || encoded.O || 0);
          const decoded = new Array(width);
          let cursor = 0;

          for (let index = 0; index < width; index += 1) {
            const bit = 2 ** index;
            if (repeatMask & bit) {
              decoded[index] = previous[index];
            } else if (nullMask & bit) {
              decoded[index] = null;
            } else {
              const raw = compressed[cursor];
              cursor += 1;
              const dictionaryName = schema[index]?.DN;
              decoded[index] = dictionaryValue(dictionaries[dictionaryName], raw);
            }
          }

          previous = decoded;
          const record = {};
          decoded.forEach((value, index) => {
            record[names[index] || schema[index]?.N || `column_${index}`] = value;
          });
          output.push(record);
        });
      });
    });
  });

  return output;
}

function nthMonday(year, month, week) {
  const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const firstMonday = 1 + ((8 - firstDay) % 7);
  const day = firstMonday + (week - 1) * 7;
  const result = new Date(Date.UTC(year, month - 1, day, 12));
  return result.getUTCMonth() === month - 1 ? result : null;
}

function hondurasToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Tegucigalpa', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date()).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = Number(part.value);
    return result;
  }, {});
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 23, 59, 59));
}

function selectCurrentPeriod(rows, today = hondurasToday()) {
  const periods = rows.map(row => {
    const year = finiteNumber(row['AÑO']);
    const monthName = normalize(row.MES);
    const month = MONTHS[monthName];
    const week = finiteNumber(row.SEMANA);
    const effective = year && month && week ? nthMonday(year, month, week) : null;
    return effective ? { year, month, monthName, week, effective } : null;
  }).filter(Boolean);

  const unique = [...new Map(periods.map(period => [
    `${period.year}-${period.month}-${period.week}`,
    period
  ])).values()];
  const eligible = unique.filter(period => period.effective <= today);
  const candidates = eligible.length ? eligible : unique;
  candidates.sort((first, second) => first.effective - second.effective);
  const current = candidates.at(-1);
  if (!current) throw new Error('No se encontró un periodo vigente en el modelo de la SEN.');
  return current;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function periodMetadata(period) {
  const until = new Date(period.effective);
  until.setUTCDate(until.getUTCDate() + 6);
  const monthLabel = period.monthName.charAt(0) + period.monthName.slice(1).toLocaleLowerCase('es-HN');
  return {
    key: `${period.year}-${String(period.month).padStart(2, '0')}-W${period.week}`,
    label: `Semana ${period.week} de ${monthLabel} ${period.year}`,
    year: period.year,
    month: period.month,
    monthName: period.monthName,
    week: period.week,
    effectiveFrom: isoDate(period.effective),
    effectiveUntil: isoDate(until)
  };
}

function normalizePriceRows(rows) {
  const unique = new Map();
  rows.forEach(row => {
    const department = displayLocation(row.DEPARTAMENTO);
    const municipality = displayLocation(row.MUNICIPIO);
    const product = canonicalProduct(row.PRODUCTO);
    const pricePerGallon = finiteNumber(row.PRECIO);
    const publishedLiter = finiteNumber(row['PRECIO LITROS']);
    const lat = finiteNumber(row.LATITUD);
    const lng = finiteNumber(row.LONGITUD);
    if (!department || !municipality || !product || !pricePerGallon) return;
    if (pricePerGallon < 20 || pricePerGallon > 300) return;
    const pricePerLiter = publishedLiter && publishedLiter > 3 && publishedLiter < 100
      ? publishedLiter
      : pricePerGallon / GALLON_LITERS;
    const normalized = {
      department,
      municipality,
      product,
      pricePerGallon: Number(pricePerGallon.toFixed(2)),
      pricePerLiter: Number(pricePerLiter.toFixed(2)),
      lat: lat !== null && lat >= 12 && lat <= 18 ? lat : null,
      lng: lng !== null && lng >= -90.5 && lng <= -82 ? lng : null
    };
    unique.set(`${normalize(department)}|${normalize(municipality)}|${product}`, normalized);
  });
  return [...unique.values()].sort((first, second) =>
    first.department.localeCompare(second.department, 'es') ||
    first.municipality.localeCompare(second.municipality, 'es') ||
    first.product.localeCompare(second.product, 'es')
  );
}

function validateSnapshot(snapshot) {
  const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
  const departments = new Set(rows.map(row => row.department));
  const municipalities = new Set(rows.map(row => `${row.department}|${row.municipality}`));
  const products = new Set(rows.map(row => row.product));
  if (rows.length < 100 || departments.size < 10 || municipalities.size < 25 || products.size < 4) {
    throw new Error(
      `La SEN devolvió una tabla incompleta (filas=${rows.length}, departamentos=${departments.size}, municipios=${municipalities.size}, combustibles=${products.size}). El archivo anterior no fue reemplazado.`
    );
  }
  return snapshot;
}

function stableRows(rows) {
  return JSON.stringify((rows || []).map(row => ({
    department: row.department,
    municipality: row.municipality,
    product: row.product,
    pricePerGallon: row.pricePerGallon,
    pricePerLiter: row.pricePerLiter,
    lat: row.lat ?? null,
    lng: row.lng ?? null
  })));
}

function parsePowerBIDate(value) {
  const milliseconds = String(value || '').match(/\/Date\((\d+)\)\//)?.[1];
  const date = milliseconds ? new Date(Number(milliseconds)) : new Date(value || '');
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

async function readExisting() {
  try {
    return JSON.parse(await fs.readFile(OUTPUT, 'utf8'));
  } catch {
    return null;
  }
}

async function queryData(apiCluster, resourceKey, modelId, fields, where = []) {
  const endpoint = `${apiCluster}public/reports/querydata?synchronous=true`;
  const payload = await fetchJson(endpoint, {
    method: 'POST',
    headers: requestHeaders(resourceKey, true),
    body: JSON.stringify(powerBIQuery(modelId, fields, where))
  });
  return decodePowerBIData(payload);
}

async function updateSENPrices() {
  const html = await fetchText(SOURCE_URL);
  const { resourceKey, apiCluster } = parseResourceDescriptor(html);
  const modelEndpoint = `${apiCluster}public/reports/${resourceKey}/modelsAndExploration?preferReadOnlySession=true`;
  const modelPayload = await fetchJson(modelEndpoint, { headers: requestHeaders(resourceKey) });
  const model = modelPayload.models?.[0];
  if (!model?.id) throw new Error('No se encontró el modelo público de precios de la SEN.');

  const periodRows = await queryData(apiCluster, resourceKey, model.id, PERIOD_FIELDS);
  const currentPeriod = selectCurrentPeriod(periodRows);
  const period = periodMetadata(currentPeriod);
  const where = [
    inCondition('AÑO', `'${currentPeriod.year}'`),
    inCondition('MES', `'${currentPeriod.monthName}'`),
    inCondition('SEMANA', `${currentPeriod.week}L`)
  ];
  const officialRows = await queryData(apiCluster, resourceKey, model.id, PRICE_FIELDS, where);
  const rows = normalizePriceRows(officialRows);
  const existing = await readExisting();

  if (existing?.status === 'official' && existing.period?.key === period.key &&
      stableRows(existing.rows) === stableRows(rows)) {
    console.log(`SEN sin cambios: ${period.label}, ${rows.length} precios.`);
    return { changed: false, snapshot: existing };
  }

  const previous = existing?.status === 'official' && Array.isArray(existing.rows) && existing.rows.length >= 100
    ? existing.period?.key === period.key
      ? existing.previous || null
      : {
          period: existing.period || null,
          effectiveFrom: existing.effectiveFrom || null,
          effectiveUntil: existing.effectiveUntil || null,
          rows: existing.rows
        }
    : null;

  const snapshot = validateSnapshot({
    status: 'official',
    source: 'Secretaría de Energía de Honduras (SEN)',
    sourceUrl: SOURCE_URL,
    updatedAt: parsePowerBIDate(model.lastRefreshTime || model.LastRefreshTime),
    checkedAt: new Date().toISOString(),
    effectiveFrom: period.effectiveFrom,
    effectiveUntil: period.effectiveUntil,
    period,
    rowCount: rows.length,
    rows,
    previous,
    extraction: 'API semántica del tablero Power BI público de la SEN; validación nacional antes de reemplazar la copia anterior.'
  });

  await fs.writeFile(OUTPUT, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  console.log(`SEN actualizado: ${period.label}, ${rows.length} precios, ${new Set(rows.map(row => row.department)).size} departamentos.`);
  return { changed: true, snapshot };
}

export {
  canonicalProduct,
  decodePowerBIData,
  normalizePriceRows,
  nthMonday,
  parseResourceDescriptor,
  periodMetadata,
  powerBIQuery,
  selectCurrentPeriod,
  updateSENPrices,
  validateSnapshot
};

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  updateSENPrices().catch(error => {
    console.error(`[SEN] ${error.message}`);
    process.exitCode = 1;
  });
}
