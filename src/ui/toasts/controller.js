    function showToast(title, body, color, duration = 4000) {
      const container = document.getElementById('toast-container');
      const toast = document.createElement('div');
      toast.className = 'pointer-events-auto p-3 rounded-xl bg-slate-900 border border-cyan-500/50 text-white text-xs shadow-xl flex items-center space-x-2 font-bold max-w-sm';
      toast.innerHTML = `<i class="fa-solid fa-bell text-cyan-400"></i><div class="max-h-[60vh] overflow-y-auto"><b>${title}</b><p class="text-[10px] opacity-90 font-extrabold whitespace-pre-line">${body}</p></div>`;
      container.appendChild(toast);
      setTimeout(() => toast.remove(), duration);
    }
