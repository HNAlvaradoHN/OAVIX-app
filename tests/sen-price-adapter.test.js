import { describe, expect, it } from 'vitest';
import {
  extractPrices,
  validateOfficialPayload,
  normalizeFuelName,
  isAllowedSource
} from '../scripts/sen-price-adapter.mjs';

describe('SEN price adapter', () => {
  it('normalizes fuel aliases without depending on accents', () => {
    expect(normalizeFuelName('Gasolina Superior')).toBe('Gasolina Súper');
    expect(normalizeFuelName('GASOLINA SUPER')).toBe('Gasolina Súper');
    expect(normalizeFuelName('Diesel')).toBe('Diésel');
    expect(normalizeFuelName('Gas licuado de petróleo')).toBe('GLP');
  });

  it('extracts valid prices by city and fuel type', () => {
    const text = `
      Tegucigalpa
      Gasolina Superior L 95.20
      Gasolina Regular L 88.40
      Diésel L 82.10
      San Pedro Sula
      Gasolina Superior L 94.90
      Gasolina Regular L 88.10
      Diésel L 81.90
      La Ceiba
      Gasolina Regular L 89.00
    `;

    const prices = extractPrices(text);

    expect(prices.tegucigalpa).toEqual({
      'Gasolina Súper': 95.2,
      'Gasolina Regular': 88.4,
      'Diésel': 82.1
    });
    expect(prices.san_pedro_sula['Gasolina Súper']).toBe(94.9);
    expect(prices.la_ceiba['Gasolina Regular']).toBe(89);
  });

  it('rejects suspicious values instead of publishing them', () => {
    const prices = extractPrices(`
      Tegucigalpa
      Gasolina Regular L 950000.00
      San Pedro Sula
      Diésel L -20.00
      La Ceiba
      Gasolina Regular L 89.00
    `);

    expect(prices).toEqual({ la_ceiba: { 'Gasolina Regular': 89 } });
    expect(() => validateOfficialPayload(prices)).toThrow(/Datos insuficientes/);
  });

  it('requires enough independent data before an official update', () => {
    const prices = {
      tegucigalpa: { 'Gasolina Regular': 88 },
      san_pedro_sula: { 'Gasolina Regular': 87 },
      la_ceiba: { 'Gasolina Regular': 89 }
    };

    expect(() => validateOfficialPayload(prices)).toThrow(/tipos de combustible/);
  });

  it('allows only SEN or the public Power BI host as extraction sources', () => {
    expect(isAllowedSource('https://sen.hn/')).toBe(true);
    expect(isAllowedSource('https://www.sen.hn/prueba-sc/')).toBe(true);
    expect(isAllowedSource('https://app.powerbi.com/view?r=test')).toBe(true);
    expect(isAllowedSource('https://example.com/fake-sen-data')).toBe(false);
  });
});
