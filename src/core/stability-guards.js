(function installOavixStabilityGuards(root) {
  'use strict';

  function maintenanceTotalsByCurrency() {
    let records = [];
    try {
      const parsed = JSON.parse(root.localStorage.getItem('oavix_auto_records') || '[]');
      records = Array.isArray(parsed) ? parsed : [];
    } catch (_) {}

    return records.reduce((totals, record) => {
      const currency = String(record && record.currency || 'HNL').toUpperCase();
      const amount = Number(record && record.amount || 0);
      if (!Number.isFinite(amount)) return totals;
      totals[currency] = (totals[currency] || 0) + amount;
      return totals;
    }, {});
  }

  function formatCurrencyTotals(totals) {
    const entries = Object.entries(totals).filter(([, total]) => Number.isFinite(total));
    if (!entries.length) return 'Sin gastos registrados';
    return entries.map(([currency, total]) => {
      if (typeof root.formatMoney === 'function') return root.formatMoney(total, currency);
      return `${currency} ${Number(total).toLocaleString('es-HN', { maximumFractionDigits: 2 })}`;
    }).join(' · ');
  }

  if (typeof root.renderStats === 'function' && !root.renderStats.__oavixCurrencySafe) {
    const originalRenderStats = root.renderStats;
    const wrappedRenderStats = function renderStatsCurrencySafe(...args) {
      const result = originalRenderStats.apply(this, args);
      const firstCard = document.querySelector('#stats-container .animated-glass-card:first-child');
      if (!firstCard) return result;
      const label = firstCard.querySelector('p:first-child');
      const value = firstCard.querySelector('p:nth-child(2)');
      const totals = maintenanceTotalsByCurrency();
      const display = formatCurrencyTotals(totals);
      if (label) label.textContent = Object.keys(totals).length > 1 ? 'Inversión por Moneda' : 'Inversión Total';
      if (value) {
        value.textContent = display;
        value.title = display;
        if (Object.keys(totals).length > 1) {
          value.classList.remove('text-lg');
          value.classList.add('text-sm');
        }
      }
      return result;
    };
    wrappedRenderStats.__oavixCurrencySafe = true;
    root.renderStats = wrappedRenderStats;
  }

  if (typeof root.previewImageUrl === 'function' && !root.previewImageUrl.__oavixUrlSafe) {
    const originalPreviewImageUrl = root.previewImageUrl;
    const wrappedPreviewImageUrl = function previewImageUrlSafe(value) {
      const source = String(value || '').trim();
      if (!source) return originalPreviewImageUrl.call(this, '');
      const safe = typeof root.safeImageSource === 'function' ? root.safeImageSource(source) : '';
      if (!safe) {
        root.showToast?.('Enlace no permitido', 'Usa una dirección HTTPS válida para la imagen.', 'amber');
        return originalPreviewImageUrl.call(this, '');
      }
      return originalPreviewImageUrl.call(this, safe);
    };
    wrappedPreviewImageUrl.__oavixUrlSafe = true;
    root.previewImageUrl = wrappedPreviewImageUrl;
  }

  if (typeof root.openCalendarEntryDetails === 'function' && !root.openCalendarEntryDetails.__oavixTextFixed) {
    const originalCalendarDetails = root.openCalendarEntryDetails;
    const wrappedCalendarDetails = function openCalendarEntryDetailsFixed(...args) {
      const result = originalCalendarDetails.apply(this, args);
      const container = document.getElementById('calendar-detail-content');
      if (container) {
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          node.nodeValue = node.nodeValue
            .replaceAll('CategorÃ­a', 'Categoría')
            .replaceAll('categorÃ­a', 'categoría');
        }
      }
      return result;
    };
    wrappedCalendarDetails.__oavixTextFixed = true;
    root.openCalendarEntryDetails = wrappedCalendarDetails;
  }
})(window);
