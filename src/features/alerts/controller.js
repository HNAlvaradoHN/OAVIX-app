    const MAINTENANCE_WARNING_DAYS = 7;

    function maintenanceReminderState(record, now = new Date()) {
      if (!record || record.validated || !/^\d{4}-\d{2}-\d{2}$/.test(String(record.alertDate || ''))) return null;
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const due = new Date(`${record.alertDate}T00:00:00`);
      if (!Number.isFinite(due.getTime())) return null;
      const days = Math.ceil((due.getTime() - today.getTime()) / 86400000);
      if (days < 0) return { level: 'overdue', days, label: `Vencido hace ${Math.abs(days)} día${Math.abs(days) === 1 ? '' : 's'}` };
      if (days <= MAINTENANCE_WARNING_DAYS) return { level: 'near', days, label: days === 0 ? 'Programado para hoy' : `Faltan ${days} día${days === 1 ? '' : 's'}` };
      return { level: 'future', days, label: `Faltan ${days} días` };
    }

    function warningDismissKey(record, state) {
      return `oavix_warning_${record.id}_${record.alertDate}_${state.level}`;
    }

    function dismissMaintenanceWarning(button) {
      const key = button && button.dataset.dismissKey;
      if (key) sessionStorage.setItem(key, 'true');
      button?.closest('[data-maintenance-warning]')?.remove();
    }

    function openReminderFromButton(button) {
      const id = decodeHtmlData(button && button.dataset.recordId);
      if (!id) return;
      switchSubTab('records');
      revealMaintenanceRecord(id);
    }

    function showMaintenanceWarnings() {
      document.getElementById('maintenance-warning-stack')?.remove();
      const warnings = autoRecords
        .map(record => ({ record, state: maintenanceReminderState(record) }))
        .filter(item => item.state && item.state.level !== 'future')
        .filter(item => sessionStorage.getItem(warningDismissKey(item.record, item.state)) !== 'true')
        .sort((a, b) => a.state.days - b.state.days)
        .slice(0, 3);
      if (!warnings.length) return;

      const stack = document.createElement('aside');
      stack.id = 'maintenance-warning-stack';
      stack.className = 'fixed right-3 bottom-20 z-40 w-[min(22rem,calc(100vw-1.5rem))] space-y-2';
      stack.setAttribute('aria-label', 'Avisos de mantenimiento');
      warnings.forEach(({ record, state }) => {
        const notice = document.createElement('div');
        notice.dataset.maintenanceWarning = 'true';
        notice.className = `rounded-2xl border p-3 shadow-2xl backdrop-blur-xl ${state.level === 'overdue' ? 'border-rose-500/70 bg-rose-950/95' : 'border-amber-500/70 bg-amber-950/95'} text-white`;

        const row = document.createElement('div');
        row.className = 'flex items-start gap-3';
        const icon = document.createElement('i');
        icon.className = `fa-solid ${state.level === 'overdue' ? 'fa-circle-exclamation text-rose-300' : 'fa-triangle-exclamation text-amber-300'} mt-0.5`;
        const copy = document.createElement('div');
        copy.className = 'min-w-0 flex-1';
        const title = document.createElement('strong');
        title.className = 'block truncate text-xs';
        title.textContent = record.title || 'Mantenimiento pendiente';
        const detail = document.createElement('p');
        detail.className = 'mt-0.5 text-[10px] font-bold opacity-90';
        detail.textContent = `${state.label} · ${record.alertDate}`;
        const view = document.createElement('button');
        view.type = 'button';
        view.dataset.recordId = String(record.id);
        view.className = 'mt-2 text-[10px] font-black underline underline-offset-2';
        view.textContent = 'Ver mantenimiento';
        view.onclick = () => openReminderFromButton(view);
        copy.append(title, detail, view);

        const close = document.createElement('button');
        close.type = 'button';
        close.dataset.dismissKey = warningDismissKey(record, state);
        close.className = 'shrink-0 rounded-lg px-2 py-1 text-sm opacity-75 hover:bg-white/10 hover:opacity-100';
        close.setAttribute('aria-label', 'Cerrar aviso');
        close.textContent = '×';
        close.onclick = () => dismissMaintenanceWarning(close);
        row.append(icon, copy, close);
        notice.appendChild(row);
        stack.appendChild(notice);
      });
      document.body.appendChild(stack);
    }

    function renderAlerts() {
      const container = document.getElementById('alerts-list');
      const navBadge = document.getElementById('nav-alerts-badge');
      if (!container) return;
      const reminders = autoRecords
        .filter(record => !record.validated && record.alertDate)
        .sort((a, b) => String(a.alertDate).localeCompare(String(b.alertDate)));

      if (navBadge) {
        navBadge.classList.toggle('hidden', reminders.length === 0);
        navBadge.textContent = reminders.length;
      }
      if (!reminders.length) {
        container.innerHTML = '<div class="py-10 text-center opacity-60"><i class="fa-solid fa-calendar-check mb-3 text-4xl"></i><p class="text-sm font-black">No tienes avisos pendientes</p><p class="text-[10px] font-bold">Puedes elegir una fecha de aviso al crear un mantenimiento.</p></div>';
        return;
      }

      container.innerHTML = reminders.map(record => {
        const state = maintenanceReminderState(record);
        const tone = state?.level === 'overdue' ? 'text-rose-300' : state?.level === 'near' ? 'text-amber-300' : 'text-emerald-300';
        return `
          <article class="rounded-xl border border-slate-600 bg-slate-900/80 p-3 text-xs">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0"><strong class="block truncate">${escapeHtml(record.title || 'Mantenimiento')}</strong><p class="mt-1 text-[10px] font-bold ${tone}">${escapeHtml(state?.label || record.alertDate)} · ${escapeHtml(record.alertDate)}</p></div>
              <button type="button" data-record-id="${encodeHtmlData(record.id)}" onclick="openReminderFromButton(this)" class="rounded bg-cyan-600/30 px-2 py-1 text-[10px] font-black text-cyan-200">Ver</button>
            </div>
          </article>`;
      }).join('');
    }
