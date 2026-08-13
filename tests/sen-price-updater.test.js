import { describe, expect, it } from 'vitest';
import {
  canonicalProduct,
  decodePowerBIData,
  normalizePriceRows,
  nthMonday,
  parseResourceDescriptor,
  periodMetadata,
  selectCurrentPeriod,
  validateSnapshot
} from '../scripts/update-sen-prices.mjs';

describe('actualizador oficial SEN', () => {
  it('descubre la llave y el clúster actual desde el tablero público', () => {
    const html = `
      var resolvedClusterUri = 'https://wabi-demo-redirect.analysis.windows.net/';
      var resourceDescriptor = JSON.parse('{\\"k\\":\\"resource-123\\",\\"t\\":\\"tenant\\"}');
    `;

    expect(parseResourceDescriptor(html)).toEqual({
      resourceKey: 'resource-123',
      apiCluster: 'https://wabi-demo-api.analysis.windows.net/'
    });
  });

  it('decodifica diccionarios, repeticiones y valores nulos del formato DSR', () => {
    const payload = {
      results: [{ result: { data: {
        descriptor: { Select: [
          { Name: 'p.AÑO' }, { Name: 'p.MES' }, { Name: 'p.SEMANA' }, { Name: 'p.PRODUCTO' }
        ] },
        dsr: { DS: [{
          ValueDicts: { D0: ['2026'], D1: ['AGOSTO'], D2: ['REGULAR', 'DIÉSEL'] },
          PH: [{ DM0: [
            { S: [{ DN: 'D0' }, { DN: 'D1' }, {}, { DN: 'D2' }], C: [0, 0, 2, 0] },
            { C: [1], R: 7 },
            { C: [3], R: 3, 'Ø': 8 }
          ] }]
        }] }
      } } }]
    };

    expect(decodePowerBIData(payload)).toEqual([
      { 'AÑO': '2026', MES: 'AGOSTO', SEMANA: 2, PRODUCTO: 'REGULAR' },
      { 'AÑO': '2026', MES: 'AGOSTO', SEMANA: 2, PRODUCTO: 'DIÉSEL' },
      { 'AÑO': '2026', MES: 'AGOSTO', SEMANA: 3, PRODUCTO: null }
    ]);
  });

  it('elige el periodo que ya entró en vigencia y calcula su semana', () => {
    const rows = [
      { 'AÑO': '2026', MES: 'JULIO', SEMANA: 5 },
      { 'AÑO': '2026', MES: 'AGOSTO', SEMANA: 1 },
      { 'AÑO': '2026', MES: 'AGOSTO', SEMANA: 2 },
      { 'AÑO': '2026', MES: 'AGOSTO', SEMANA: 3 }
    ];
    const period = selectCurrentPeriod(rows, new Date('2026-08-13T23:59:59Z'));

    expect(nthMonday(2026, 8, 2).toISOString().slice(0, 10)).toBe('2026-08-10');
    expect(periodMetadata(period)).toMatchObject({
      key: '2026-08-W2',
      effectiveFrom: '2026-08-10',
      effectiveUntil: '2026-08-16'
    });
  });

  it('normaliza nombres, productos, precios y coordenadas sin inventar valores', () => {
    const rows = normalizePriceRows([
      {
        DEPARTAMENTO: 'FRANCISCO MORAZÁN',
        MUNICIPIO: 'ZAMBRANO (DISTRITO CENTRAL)',
        PRODUCTO: 'GASOLINA REGULAR',
        PRECIO: 127.42,
        'PRECIO LITROS': 33.66,
        LATITUD: '14.279147',
        LONGITUD: '-87.404885'
      },
      {
        DEPARTAMENTO: 'CORTÉS', MUNICIPIO: 'CHOLOMA', PRODUCTO: 'DIESEL',
        PRECIO: 130, 'PRECIO LITROS': 34.34, LATITUD: 0, LONGITUD: 0
      }
    ]);

    expect(rows[0]).toMatchObject({
      department: 'Cortés', municipality: 'Choloma', product: 'DIÉSEL', lat: null, lng: null
    });
    expect(rows[1]).toMatchObject({
      department: 'Francisco Morazán',
      municipality: 'Zambrano (Distrito Central)',
      product: 'REGULAR',
      pricePerGallon: 127.42
    });
    expect(canonicalProduct('GLP vehicular')).toBe('GLP VEHICULAR');
  });

  it('impide reemplazar la copia nacional con una respuesta incompleta', () => {
    expect(() => validateSnapshot({ rows: [{ department: 'Cortés', municipality: 'Choloma', product: 'REGULAR' }] }))
      .toThrow(/tabla incompleta/i);
  });
});
