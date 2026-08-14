    function renderArchiveRecords() {
      const list = document.getElementById('archive-records-list');
      const archived = autoRecords.filter(record => record.validated);

      if (archived.length === 0) {
        list.innerHTML = '<p class="text-xs font-extrabold col-span-full opacity-90">No hay servicios validados en el historial archivado.</p>';
        return;
      }

      list.innerHTML = archived.map(record => {
        const encodedId = encodeHtmlData(record.id);
        return `
          <div class="animated-glass-card rounded-2xl p-4 shadow-lg space-y-2 border-dashed">
            <div class="flex justify-between items-start">
              <h4 class="font-black text-sm line-through opacity-80">${escapeHtml(record.title)}</h4>
              <span class="font-black text-emerald-400 text-sm">${formatMoney(record.amount, record.currency || 'USD')}</span>
            </div>
            <p class="text-xs font-extrabold opacity-90"><i class="fa-regular fa-calendar mr-1"></i>${escapeHtml(record.date)} | ${escapeHtml(record.category)}</p>
            ${record.notes ? `<p class="text-[11px] font-bold italic p-2 rounded-lg bg-slate-900/20">${escapeHtml(record.notes)}</p>` : ''}
            <div class="pt-2 border-t border-slate-600/60 flex justify-end space-x-2">
              <button data-record-id="${encodedId}" onclick="maintenanceActionFromButton(this, 'edit')" class="px-2.5 py-1 rounded-lg bg-indigo-600/20 text-indigo-300 text-xs font-black">Editar</button>
              <button data-record-id="${encodedId}" onclick="maintenanceActionFromButton(this, 'validate')" class="px-2.5 py-1 rounded-lg bg-cyan-600/20 text-cyan-300 text-xs font-black">Restaurar</button>
              <button data-record-id="${encodedId}" onclick="maintenanceActionFromButton(this, 'delete')" class="px-2.5 py-1 rounded-lg bg-rose-600/20 text-rose-300 text-xs font-black">Eliminar</button>
            </div>
          </div>`;
      }).join('');
    }
