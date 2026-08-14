    function renderCalendar() {
      const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      document.getElementById('calendar-month-year').textContent = `${monthNames[selectedCalendarMonth]} ${selectedCalendarYear}`;
      const grid = document.getElementById('calendar-grid');
      grid.innerHTML = '';

      const firstDay = new Date(selectedCalendarYear, selectedCalendarMonth, 1).getDay();
      const totalDays = new Date(selectedCalendarYear, selectedCalendarMonth + 1, 0).getDate();

      for (let i = 0; i < firstDay; i++) {
        grid.innerHTML += `<div class="h-20 bg-slate-900/10 rounded-xl opacity-20"></div>`;
      }

      for (let day = 1; day <= totalDays; day++) {
        const dayStr = `${selectedCalendarYear}-${String(selectedCalendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayEntries = autoRecords.filter(r => r.date === dayStr || r.alertDate === dayStr);

        grid.innerHTML += `
          <div onclick="openDayEntriesModal('${dayStr}')" class="h-20 bg-slate-900/60 dark:bg-slate-900/85 border border-slate-600 rounded-xl p-1.5 flex flex-col justify-between cursor-pointer hover:border-cyan-500 transition">
            <div class="flex items-center justify-between">
              <span class="text-xs font-black">${day}</span>
              ${dayEntries.length > 0 ? `<span class="w-2 h-2 rounded-full bg-cyan-500"></span>` : ''}
            </div>
            <div class="space-y-0.5 overflow-hidden">
              ${dayEntries.slice(0, 1).map(e => `<div class="text-[8px] truncate bg-slate-950/40 px-1 py-0.5 rounded font-bold">${e.title}</div>`).join('')}
            </div>
          </div>
        `;
      }
    }

    function openDayEntriesModal(dateStr) {
      const dayEntries = autoRecords.filter(r => r.date === dateStr || r.alertDate === dateStr);
      if (dayEntries.length === 0) {
        showToast('Sin eventos', `No hay registros en la fecha ${dateStr}`, 'amber');
        return;
      }
      if (dayEntries.length === 1) {
        openCalendarEntryDetails(dayEntries[0].id);
        return;
      }

      let modal = document.getElementById('modal-day-entries');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-day-entries';
        modal.className = 'fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4';
        modal.innerHTML = `
          <div class="animated-glass-card w-full max-w-sm p-4 space-y-3">
            <div class="flex justify-between items-center">
              <h3 id="day-entries-title" class="font-black text-sm"></h3>
              <button onclick="document.getElementById('modal-day-entries').classList.add('hidden')" class="px-2 py-1 rounded-lg bg-rose-600/30 hover:bg-rose-600/50 text-rose-300 text-xs font-black">✕</button>
            </div>
            <div id="day-entries-list" class="space-y-2 max-h-60 overflow-y-auto"></div>
          </div>
        `;
        document.body.appendChild(modal);
      }

      document.getElementById('day-entries-title').textContent = `Registros del ${dateStr}`;
      document.getElementById('day-entries-list').innerHTML = dayEntries.map(entry => `
        <button onclick="document.getElementById('modal-day-entries').classList.add('hidden'); openCalendarEntryDetails('${entry.id}')" class="w-full text-left p-3 rounded-xl border border-slate-600 bg-slate-900/60 hover:border-cyan-500 transition text-xs">
          <span class="font-black">${escapeHtml(entry.title)}</span>
          <p class="text-[10px] opacity-80 font-bold">${escapeHtml(entry.category)} • ${formatMoney(entry.amount, entry.currency || 'USD')}</p>
        </button>
      `).join('');
      modal.classList.remove('hidden');
    }

    function openCalendarEntryDetails(id) {
      const entry = autoRecords.find(record => String(record.id) === String(id));
      if (!entry) return;

      let modal = document.getElementById('modal-calendar-details');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-calendar-details';
        modal.className = 'fixed inset-0 z-[65] hidden bg-black/75 backdrop-blur-sm flex items-center justify-center p-4';
        modal.innerHTML = `
          <article class="animated-glass-card w-full max-w-md rounded-2xl p-5 shadow-2xl">
            <div class="flex items-start justify-between gap-3 border-b border-slate-700 pb-3">
              <div>
                <p class="text-[10px] font-black uppercase tracking-widest text-cyan-400">Detalle del mantenimiento</p>
                <h3 id="calendar-detail-title" class="mt-1 text-base font-black"></h3>
              </div>
              <button type="button" onclick="closeCalendarEntryDetails()" class="p-2 opacity-70 hover:opacity-100" aria-label="Cerrar detalles"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div id="calendar-detail-content" class="mt-4 space-y-3 text-xs"></div>
            <div class="mt-5 flex justify-end gap-2 border-t border-slate-700 pt-3">
              <button type="button" onclick="closeCalendarEntryDetails()" class="px-3 py-1.5 rounded-lg bg-slate-800 font-extrabold">Cerrar</button>
              <button id="calendar-detail-edit" type="button" class="px-3 py-1.5 rounded-lg bg-indigo-600/35 text-indigo-200 font-black"><i class="fa-solid fa-pen mr-1"></i>Editar</button>
            </div>
          </article>
        `;
        document.body.appendChild(modal);
      }

      document.getElementById('calendar-detail-title').textContent = entry.title || 'Mantenimiento';
      document.getElementById('calendar-detail-content').innerHTML = `
        ${entry.photo ? `<button type="button" onclick="openImageViewer('${entry.photo}')" class="block w-20 h-20 overflow-hidden rounded-xl border border-slate-600 cursor-zoom-in"><img src="${entry.photo}" alt="Vista previa" class="w-full h-full object-cover"></button>` : ''}
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
          <dt class="font-black opacity-70">CategorÃ­a</dt><dd>${escapeHtml(entry.category || 'Sin categorÃ­a')}</dd>
          <dt class="font-black opacity-70">Fecha</dt><dd>${escapeHtml(entry.date || 'Sin fecha')}</dd>
          <dt class="font-black opacity-70">Alarma</dt><dd>${entry.alertDate ? `${escapeHtml(entry.alertDate)} ${escapeHtml(entry.alertTime || '')}` : 'No programada'}</dd>
          <dt class="font-black opacity-70">Costo</dt><dd>${formatMoney(entry.amount, entry.currency || 'USD')}</dd>
          <dt class="font-black opacity-70">Objetivo</dt><dd>${entry.mileage ? `${formatNumber(entry.mileage)} ${currentUnit.toUpperCase()}` : 'No definido'}</dd>
          <dt class="font-black opacity-70">Proveedor</dt><dd>${escapeHtml(entry.provider || 'No indicado')}</dd>
        </dl>
        ${entry.notes ? `<div class="rounded-xl bg-slate-900/40 p-3"><p class="mb-1 font-black opacity-70">Notas</p><p class="whitespace-pre-wrap">${escapeHtml(entry.notes)}</p></div>` : ''}
      `;
      document.getElementById('calendar-detail-edit').onclick = () => {
        closeCalendarEntryDetails();
        openFormModal(entry.id);
      };
      modal.classList.remove('hidden');
    }

    function closeCalendarEntryDetails() {
      document.getElementById('modal-calendar-details')?.classList.add('hidden');
    }

    function changeMonth(d) {
      selectedCalendarMonth += d;
      if (selectedCalendarMonth < 0) { selectedCalendarMonth = 11; selectedCalendarYear--; }
      else if (selectedCalendarMonth > 11) { selectedCalendarMonth = 0; selectedCalendarYear++; }
      renderCalendar();
    }
