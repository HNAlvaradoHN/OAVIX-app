import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(), 'src/core/stability-guards.js'), 'utf8');

function loadGuards() {
  new Function(source)();
}

describe('guardas visuales de estabilidad', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    window.showToast = vi.fn();
    window.formatMoney = (amount, currency) => `${currency} ${amount}`;
  });

  it('separa totales cuando existen monedas diferentes', () => {
    document.body.innerHTML = '<div id="stats-container"><div class="animated-glass-card"><p></p><p class="text-lg"></p></div></div>';
    localStorage.setItem('oavix_auto_records', JSON.stringify([
      { amount: 1000, currency: 'HNL' },
      { amount: 50, currency: 'USD' }
    ]));
    window.renderStats = vi.fn();
    window.previewImageUrl = vi.fn();
    window.safeImageSource = value => value;
    window.openCalendarEntryDetails = vi.fn();

    loadGuards();
    window.renderStats();

    expect(document.querySelector('#stats-container p:first-child').textContent).toBe('Inversión por Moneda');
    expect(document.querySelector('#stats-container p:nth-child(2)').textContent).toContain('HNL 1000');
    expect(document.querySelector('#stats-container p:nth-child(2)').textContent).toContain('USD 50');
  });

  it('limpia una URL no HTTPS antes de enviarla a la vista previa', () => {
    const originalPreview = vi.fn();
    window.renderStats = vi.fn();
    window.previewImageUrl = originalPreview;
    window.safeImageSource = value => value.startsWith('https://') ? value : '';
    window.openCalendarEntryDetails = vi.fn();

    loadGuards();
    window.previewImageUrl('http://ejemplo.test/foto.jpg');

    expect(originalPreview).toHaveBeenCalledWith('');
    expect(window.showToast).toHaveBeenCalledWith('Enlace no permitido', expect.any(String), 'amber');
  });

  it('corrige la codificación de Categoría en el detalle del calendario', () => {
    document.body.innerHTML = '<div id="calendar-detail-content"></div>';
    window.renderStats = vi.fn();
    window.previewImageUrl = vi.fn();
    window.safeImageSource = value => value;
    window.openCalendarEntryDetails = vi.fn(() => {
      document.getElementById('calendar-detail-content').textContent = 'CategorÃ­a: General';
    });

    loadGuards();
    window.openCalendarEntryDetails('registro-1');

    expect(document.getElementById('calendar-detail-content').textContent).toBe('Categoría: General');
  });
});
