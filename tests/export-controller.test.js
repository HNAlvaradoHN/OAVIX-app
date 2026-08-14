import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(), 'src/features/export/controller.js'), 'utf8');

function loadController() {
  return new Function(`${source}; return {
    buildOavixExportData, exportOavixExcel, exportOavixPdf,
    openOavixExportPicker, closeOavixExportPicker, setAllOavixExportMaintenance,
    confirmOavixExport, updateOavixExportPickerCount
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
  document.body.innerHTML = `<div id="oavix-export-picker" class="hidden"><h2 id="oavix-export-picker-title"></h2><p id="oavix-export-picker-caption"></p><div id="oavix-export-maintenance-list"></div><span id="oavix-export-picker-count"></span><button id="oavix-export-confirm"></button></div>`;
  document.title = 'OAVIX';
  window.showToast = vi.fn();
  window.closeSettingsMenu = vi.fn();
  localStorage.setItem('oavix_auto_mileage', '54321');
  localStorage.setItem('oavix_auto_unit', 'km');
  localStorage.setItem('oavix_auto_records', JSON.stringify([{
    id: 'maintenance', title: '=Cambio de aceite', category: 'Aceite', amount: 800,
    currency: 'HNL', date: '2026-08-13', mileage: 54000,
    photo: `data:image/webp;base64,${'A'.repeat(200)}`, validated: false
  }, {
    id: 'brakes', title: 'Cambio de frenos', category: 'Frenos', amount: 1200,
    currency: 'HNL', date: '2026-08-10', mileage: 53000, validated: true
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

    expect(data.maintenance).toHaveLength(2);
    expect(data.fills).toHaveLength(1);
    expect(data.vehicles).toHaveLength(1);
    expect(data.maintenanceTotals.HNL).toBe(2000);
    expect(data.maintenance[0][1]).toBe("'=Cambio de aceite");
    expect(JSON.stringify(data)).not.toContain('data:image/webp');
    expect(data.fills[0][1]).toBe('Auto familiar');
  });

  it('permite elegir los mantenimientos antes de exportar', () => {
    const controller = loadController();
    window.closeSettingsMenu = vi.fn();
    window.XLSX = xlsxStub().api;

    expect(controller.openOavixExportPicker('excel')).toBe(true);
    const options = document.querySelectorAll('#oavix-export-maintenance-list input');
    expect(options).toHaveLength(2);
    options[1].checked = false;
    controller.updateOavixExportPickerCount();
    expect(document.getElementById('oavix-export-picker-count').textContent).toBe('1 seleccionado');

    const data = controller.buildOavixExportData({ maintenanceKeys: ['maintenance'] });
    expect(data.maintenance).toHaveLength(1);
    expect(data.maintenance[0][1]).toBe("'=Cambio de aceite");
    expect(data.maintenanceTotals.HNL).toBe(800);
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
