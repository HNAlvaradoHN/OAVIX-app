import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(), 'src/features/export/controller.js'), 'utf8');

function loadController() {
  return new Function(`${source}; return {
    buildOavixExportData, exportOavixExcel, exportOavixPdf
  };`)();
}

function xlsxStub() {
  const workbooks = [];
  const api = {
    utils: {
      aoa_to_sheet: vi.fn(rows => ({ rows, '!ref': rows.length ? 'A1:B2' : undefined })),
      book_new: vi.fn(() => ({ sheets: [] })),
      book_append_sheet: vi.fn((workbook, sheet, name) => workbook.sheets.push({ sheet, name }))
    },
    writeFile: vi.fn(workbook => workbooks.push(workbook))
  };
  return { api, workbooks };
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  document.title = 'OAVIX';
  window.showToast = vi.fn();
  window.closeSettingsMenu = vi.fn();
  localStorage.setItem('oavix_auto_mileage', '54321');
  localStorage.setItem('oavix_auto_unit', 'km');
  localStorage.setItem('oavix_auto_records', JSON.stringify([{
    id: 'maintenance', title: '=Cambio de aceite', category: 'Aceite', amount: 800,
    currency: 'HNL', date: '2026-08-13', mileage: 54000,
    photo: `data:image/webp;base64,${'A'.repeat(200)}`, validated: false
  }]));
  localStorage.setItem('oavix_fuel_vehicles', JSON.stringify([{
    id: 'car', name: 'Auto familiar', type: 'car', fuelType: 'REGULAR',
    department: 'Cortés', municipality: 'San Pedro Sula'
  }]));
  localStorage.setItem('oavix_fuel_history', JSON.stringify([{
    id: 'fill', vehicleId: 'car', date: '2026-08-12', fuelType: 'REGULAR',
    volume: 8, volumeUnit: 'gal', amountPaid: 1000
  }]));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('exportaciones OAVIX', () => {
  it('prepara datos completos sin incluir la fotografía ni ejecutar fórmulas', () => {
    const controller = loadController();
    const data = controller.buildOavixExportData();

    expect(data.maintenance).toHaveLength(1);
    expect(data.fills).toHaveLength(1);
    expect(data.vehicles).toHaveLength(1);
    expect(data.maintenanceTotals.HNL).toBe(800);
    expect(data.maintenance[0][1]).toBe("'=Cambio de aceite");
    expect(JSON.stringify(data)).not.toContain('data:image/webp');
    expect(data.fills[0][1]).toBe('Auto familiar');
  });

  it('crea un libro Excel con resumen, mantenimientos, combustibles y vehículos', () => {
    const controller = loadController();
    const stub = xlsxStub();
    window.XLSX = stub.api;

    expect(controller.exportOavixExcel()).toBe(true);
    expect(stub.api.utils.book_append_sheet).toHaveBeenCalledTimes(4);
    expect(stub.workbooks[0].sheets.map(entry => entry.name)).toEqual([
      'Resumen', 'Mantenimientos', 'Combustibles', 'Vehículos'
    ]);
    expect(stub.api.writeFile.mock.calls[0][1]).toMatch(/^OAVIX-informe-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it('genera un informe imprimible y abre el guardado PDF del navegador', async () => {
    vi.useFakeTimers();
    const controller = loadController();
    const print = vi.fn();
    window.print = print;

    expect(controller.exportOavixPdf()).toBe(true);
    expect(document.getElementById('oavix-print-report').textContent).toContain('Cambio de aceite');
    expect(document.body.classList.contains('oavix-printing')).toBe(true);

    await vi.advanceTimersByTimeAsync(100);
    expect(print).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event('afterprint'));
    expect(document.getElementById('oavix-print-report')).toBeNull();
    expect(document.body.classList.contains('oavix-printing')).toBe(false);
    expect(document.title).toBe('OAVIX');
  });
});
