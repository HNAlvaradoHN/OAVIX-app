import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = file => readFileSync(resolve(process.cwd(), file), 'utf8');
const viewSource = read('src/features/fuel/view.html');
const controller = read('src/features/fuel/controller.js');
const styles = read('src/styles/app.css');
const official = JSON.parse(read('data/sen-prices.json'));

describe('interfaz adaptable de Combustibles', () => {
  it('separa resumen, precios e historial dentro de una sola pestaña', () => {
    const view = new DOMParser().parseFromString(viewSource, 'text/html');

    expect(view.getElementById('subtab-fuel')).not.toBeNull();
    expect(view.querySelectorAll('[role="tab"]')).toHaveLength(3);
    expect(view.querySelectorAll('[role="tabpanel"]')).toHaveLength(3);
    expect(view.getElementById('fuel-panel-overview')).not.toBeNull();
    expect(view.getElementById('fuel-panel-prices')).not.toBeNull();
    expect(view.getElementById('fuel-panel-history')).not.toBeNull();
    expect(view.body.textContent).toContain('Combustibles');
  });

  it('incluye varios vehículos, cargas, cálculos, precios, mapa y fuente oficial', () => {
    const view = new DOMParser().parseFromString(viewSource, 'text/html');
    const required = [
      'fuel-active-vehicle', 'fuel-fill-modal', 'fuel-vehicle-modal',
      'fuel-trip-distance', 'fuel-budget-amount', 'fuel-price-department',
      'fuel-price-product', 'fuel-price-search', 'fuel-prices-grid',
      'fuel-map-frame', 'fuel-official-frame', 'fuel-history-list'
    ];

    for (const id of required) expect(view.getElementById(id), id).not.toBeNull();
    expect(controller).toMatch(/function\s+saveFuelVehicle\s*\(/);
    expect(controller).toMatch(/function\s+saveFuelFill\s*\(/);
    expect(controller).toMatch(/function\s+calculateFuelTrip\s*\(/);
    expect(controller).toMatch(/function\s+calculateFuelBudget\s*\(/);
    expect(controller).toContain('openstreetmap.org/export/embed.html');
    expect(controller).not.toContain('updatePricesManually');
    expect(viewSource).not.toMatch(/administrador|pegar\s+json|actualizar\s+manualmente/i);
  });

  it('usa teclados numéricos, límites y etiquetas accesibles en formularios', () => {
    const view = new DOMParser().parseFromString(viewSource, 'text/html');
    const numericIds = [
      'fuel-trip-distance', 'fuel-budget-amount', 'fuel-fill-odometer',
      'fuel-fill-volume', 'fuel-fill-amount', 'fuel-vehicle-tank', 'fuel-vehicle-efficiency'
    ];

    numericIds.forEach(id => {
      const input = view.getElementById(id);
      expect(input.getAttribute('type'), id).toBe('number');
      expect(input.getAttribute('inputmode'), id).toBe('decimal');
      expect(Number(input.getAttribute('min')), id).toBeGreaterThanOrEqual(0);
      expect(view.querySelector(`label[for="${id}"]`), id).not.toBeNull();
    });
    expect(view.querySelectorAll('[role="dialog"][aria-modal="true"]')).toHaveLength(2);
  });

  it('protege pantallas pequeñas y amplía la densidad en tableta y PC', () => {
    expect(styles).toMatch(/\.fuel-shell\.hidden[\s\S]*display:\s*none\s*!important/);
    expect(styles).toMatch(/@media\s*\(max-width:\s*379px\)/);
    expect(styles).toMatch(/@media\s*\(min-width:\s*540px\)/);
    expect(styles).toMatch(/@media\s*\(min-width:\s*640px\)/);
    expect(styles).toMatch(/@media\s*\(min-width:\s*760px\)/);
    expect(styles).toMatch(/@media\s*\(min-width:\s*1024px\)/);
    expect(styles).toMatch(/\.fuel-modal-sheet[\s\S]*max-height:\s*min\(92dvh/);
    expect(styles).toMatch(/padding-bottom:\s*max\(1\.2rem,\s*env\(safe-area-inset-bottom/);
    expect(styles).toMatch(/minmax\(0,\s*1fr\)/);
  });

  it('incluye una copia oficial nacional suficientemente completa', () => {
    expect(official.status).toBe('official');
    expect(official.rows.length).toBeGreaterThanOrEqual(100);
    expect(new Set(official.rows.map(row => row.department)).size).toBeGreaterThanOrEqual(10);
    expect(new Set(official.rows.map(row => row.product)).size).toBeGreaterThanOrEqual(4);
    expect(official.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(official.sourceUrl).toContain('app.powerbi.com');
  });

  it('monta la vista completa, registra una carga y actualiza el historial', () => {
    document.body.innerHTML = viewSource;
    localStorage.clear();
    localStorage.setItem('oavix_fuel_data', JSON.stringify(official));
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('sin red durante la prueba'); }));
    window.formatMoney = value => `L ${Number(value).toFixed(2)}`;
    window.showToast = vi.fn();
    window.confirm = vi.fn(() => true);
    delete window.__OAVIX_FUEL_MODULE_V2__;
    delete window.FuelModule;
    new Function(read('src/features/fuel/module.js'))();
    new Function(controller)();

    window.renderFuelModule();
    expect(document.getElementById('fuel-source-badge').textContent).toContain('SEN');
    expect(document.querySelectorAll('#fuel-prices-grid .fuel-price-card').length).toBeGreaterThan(0);

    window.openFuelVehicleModal();
    document.getElementById('fuel-vehicle-volume-unit').value = 'l';
    window.updateFuelVehicleUnitLabels();
    expect(Number(document.getElementById('fuel-vehicle-tank').value)).toBeCloseTo(56.78, 2);
    expect(document.getElementById('fuel-vehicle-tank-unit').textContent).toBe('L');
    window.closeFuelVehicleModal();

    window.openFuelFillModal();
    document.getElementById('fuel-fill-date').value = '2026-08-13';
    document.getElementById('fuel-fill-volume').value = '8';
    document.getElementById('fuel-fill-amount').value = '800';
    document.getElementById('fuel-fill-odometer').value = '50000';
    document.getElementById('fuel-fill-full-tank').checked = true;
    window.saveFuelFill({ preventDefault: vi.fn() });
    window.switchFuelPanel('history');

    expect(window.FuelModule.getFuelHistory()).toHaveLength(1);
    expect(document.getElementById('fuel-history-list').textContent).toContain('L 800.00');
    expect(document.getElementById('fuel-fill-modal').classList.contains('hidden')).toBe(true);
    vi.unstubAllGlobals();
  });
});
