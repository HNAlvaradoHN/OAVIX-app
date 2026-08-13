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
        openFormModal(dayEntries[0].id);
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
        <button onclick="document.getElementById('modal-day-entries').classList.add('hidden'); openFormModal('${entry.id}')" class="w-full text-left p-3 rounded-xl border border-slate-600 bg-slate-900/60 hover:border-cyan-500 transition text-xs">
          <span class="font-black">${escapeHtml(entry.title)}</span>
          <p class="text-[10px] opacity-80 font-bold">${escapeHtml(entry.category)} • ${formatMoney(entry.amount, entry.currency || 'USD')}</p>
        </button>
      `).join('');
      modal.classList.remove('hidden');
    }

    function changeMonth(d) {
      selectedCalendarMonth += d;
      if (selectedCalendarMonth < 0) { selectedCalendarMonth = 11; selectedCalendarYear--; }
      else if (selectedCalendarMonth > 11) { selectedCalendarMonth = 0; selectedCalendarYear++; }
      renderCalendar();
    }
