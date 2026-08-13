function formatNumber(num, decimals = 0) {
      const n = Number(num || 0);
      return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    }

    function formatMoney(amount, currency = 'USD') {
      const num = Number(amount || 0);
      const symbols = {
        USD: '$', EUR: '€', HNL: 'L ', MXN: '$', GTQ: 'Q ',
        NIO: 'C$ ', CRC: '₡', PAB: 'B/. ', CAD: '$'
      };
      const sym = symbols[currency] || '$';
      const formatted = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return (num < 0 ? '-' : '') + sym + formatted;
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[character]));
    }
