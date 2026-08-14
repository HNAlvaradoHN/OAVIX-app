    function showToast(title, body, color, duration = 4000) {
      const container = document.getElementById('toast-container');
      if (!container) return;

      const visibleToasts = Array.from(container.querySelectorAll('[data-oavix-toast]'));
      while (visibleToasts.length >= 2) visibleToasts.shift().remove();

      const toast = document.createElement('div');
      toast.dataset.oavixToast = 'true';
      toast.setAttribute('role', 'status');
      toast.className = 'oavix-toast pointer-events-none p-3 rounded-xl bg-slate-900 border border-cyan-500/50 text-white text-xs shadow-xl flex items-center space-x-2 font-bold max-w-sm';
      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-circle-info text-cyan-400';
      const copy = document.createElement('div');
      copy.className = 'max-h-[60vh] overflow-y-auto';
      const heading = document.createElement('b');
      heading.textContent = String(title || 'OAVIX');
      const message = document.createElement('p');
      message.className = 'text-[10px] opacity-90 font-extrabold whitespace-pre-line';
      message.textContent = String(body || '');
      copy.append(heading, message);
      toast.append(icon, copy);
      container.appendChild(toast);
      setTimeout(() => toast.remove(), duration);
    }
