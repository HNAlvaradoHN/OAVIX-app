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

    let currentUnit = localStorage.getItem('oavix_auto_unit') || 'km';
    let currentVehicleMileage = Number(localStorage.getItem('oavix_auto_mileage')) || 85400;

    let autoCategories = JSON.parse(localStorage.getItem('oavix_auto_categories')) || [
      'Mantenimiento General', 'Cambio de Aceite', 'Llantas / Frenos', 'Combustible', 'Reparaciones'
    ];
    let autoRecords = JSON.parse(localStorage.getItem('oavix_auto_records')) || [];
    let isAlarmRinging = false;
    let alarmAudioInterval = null;
    let currentBase64Image = '';

    let selectedCalendarMonth = new Date().getMonth();
    let selectedCalendarYear = new Date().getFullYear();

    function initializeOavixApp() {
      if (autoRecords.length === 0) seedData();
      document.getElementById('current-mileage-input').value = formatNumber(currentVehicleMileage);
      updateUnitUI();
      setupCategoryDropdowns();
      renderMileageComparison();
      renderStats();
      renderRecords();
      renderCalendar();
      renderAlerts();
      renderArchiveRecords();
      checkNotifPermissionState();

      const savedBg = localStorage.getItem('oavix_custom_bg');
      const savedNeon = localStorage.getItem('oavix_custom_neon');
      const savedIsLight = localStorage.getItem('oavix_is_light') === 'true';

      if (savedIsLight) {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light-theme');
        document.getElementById('theme-icon').className = 'fa-solid fa-sun text-xs text-amber-400';
      }

      if (savedBg) {
        document.getElementById('picker-bg-color').value = savedBg;
        applyCustomThemeColors(savedBg, savedNeon || (savedIsLight ? '#8b5cf6' : '#06b6d4'));
      }

      setInterval(checkScheduledAlarms, 10000);
      checkScheduledAlarms();
    }

    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', initializeOavixApp, { once: true });
    } else {
      initializeOavixApp();
    }

    function setDistanceUnit(u) {
      currentUnit = u;
      localStorage.setItem('oavix_auto_unit', u);
      updateUnitUI();
      renderMileageComparison();
    }

    function updateUnitUI() {
      const isKm = currentUnit === 'km';
      document.getElementById('btn-unit-km').className = isKm ? 'px-2 py-1 rounded-lg transition bg-cyan-600 text-white font-extrabold' : 'px-2 py-1 rounded-lg transition opacity-80 hover:opacity-100 font-extrabold';
      document.getElementById('btn-unit-mi').className = !isKm ? 'px-2 py-1 rounded-lg transition bg-cyan-600 text-white font-extrabold' : 'px-2 py-1 rounded-lg transition opacity-80 hover:opacity-100 font-extrabold';
      document.getElementById('unit-label-badge').textContent = isKm ? 'KM' : 'MI';
    }

    function saveCurrentMileageInput(elem) {
      const raw = elem.value.replace(/,/g, '');
      const val = Number(raw || 0);
      currentVehicleMileage = val;
      localStorage.setItem('oavix_auto_mileage', currentVehicleMileage);
      renderMileageComparison();
      renderStats();
    }

    function setupCategoryDropdowns() {
      const filterSel = document.getElementById('filter-category');
      const formSel = document.getElementById('form-category');

      if (filterSel) {
        filterSel.innerHTML = '<option value="ALL">Todas las Categorías</option>';
        autoCategories.forEach(c => filterSel.innerHTML += `<option value="${c}">${c}</option>`);
      }

      if (formSel) {
        formSel.innerHTML = '';
        autoCategories.forEach(c => formSel.innerHTML += `<option value="${c}">${c}</option>`);
        formSel.innerHTML += `<option value="__ADD_NEW__" class="text-cyan-400 font-black">+ Agregar / Gestionar Categorías...</option>`;
      }
    }

    function onCategoryChange(sel) {
      if (sel.value === '__ADD_NEW__') {
        openCategoryModal();
        sel.selectedIndex = 0;
      }
    }

    function openCategoryModal() {
      renderCategoryManageList();
      document.getElementById('modal-categories').classList.remove('hidden');
    }

    function closeCategoryModal() {
      document.getElementById('modal-categories').classList.add('hidden');
      setupCategoryDropdowns();
    }

    function renderCategoryManageList() {
      const container = document.getElementById('categories-manage-list');
      container.innerHTML = autoCategories.map((cat, idx) => `
        <div class="flex items-center justify-between bg-slate-800 p-2 rounded-xl text-xs font-extrabold">
          <span>${cat}</span>
          <button type="button" onclick="deleteCategory(${idx})" class="text-rose-400 hover:text-rose-300 px-2 py-1"><i class="fa-solid fa-trash"></i></button>
        </div>
      `).join('');
    }

    function addNewCategory() {
      const input = document.getElementById('new-category-input');
      const val = input.value.trim();
      if (!val) return;
      if (!autoCategories.includes(val)) {
        autoCategories.push(val);
        localStorage.setItem('oavix_auto_categories', JSON.stringify(autoCategories));
      }
      input.value = '';
      renderCategoryManageList();
      setupCategoryDropdowns();
    }

    function deleteCategory(idx) {
      autoCategories.splice(idx, 1);
      localStorage.setItem('oavix_auto_categories', JSON.stringify(autoCategories));
      renderCategoryManageList();
      setupCategoryDropdowns();
    }

    function previewImageFile(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(evt) {
        currentBase64Image = evt.target.result;
        document.getElementById('photo-preview').src = currentBase64Image;
        document.getElementById('photo-preview-container').classList.remove('hidden');
      };
      reader.readAsDataURL(file);
    }

    function previewImageUrl(url) {
      if (!url) return;
      currentBase64Image = url;
      document.getElementById('photo-preview').src = url;
      document.getElementById('photo-preview-container').classList.remove('hidden');
    }

    function removePhoto() {
      currentBase64Image = '';
      document.getElementById('form-photo-input').value = '';
      document.getElementById('form-photo-url').value = '';
      document.getElementById('photo-preview-container').classList.add('hidden');
    }

    function openImageViewer(src) {
      document.getElementById('image-viewer-src').src = src;
      document.getElementById('modal-image-viewer').classList.remove('hidden');
    }

    function requestNotificationPermission() {
      if (!('Notification' in window)) return;
      Notification.requestPermission().then(permission => {
        checkNotifPermissionState();
        if (permission === 'granted') {
          showToast('Alertas Activas', 'Recibirás notificaciones flotantes en segundo plano.', 'emerald');
        }
      });
    }

    function checkNotifPermissionState() {
      const btn = document.getElementById('btn-notif-perm');
      if (!btn) return;
      if ('Notification' in window && Notification.permission === 'granted') {
        btn.innerHTML = '<i class="fa-solid fa-bell text-emerald-400"></i><span class="hidden md:inline">Alertas Activas</span>';
      }
    }

    function checkScheduledAlarms() {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const currentTimeStr = `${hours}:${minutes}`;

      let triggeredAlarms = JSON.parse(localStorage.getItem('oavix_triggered_alarms')) || [];

      autoRecords.forEach(r => {
        if (r.validated || !r.alertDate) return;
        const alarmKey = `${r.id}_${r.alertDate}_${r.alertTime || '00:00'}`;
        if (triggeredAlarms.includes(alarmKey)) return;

        const isToday = r.alertDate === todayStr;
        const isPastDate = r.alertDate < todayStr;
        const isTimeReached = !r.alertTime || r.alertTime <= currentTimeStr;

        if (isPastDate || (isToday && isTimeReached)) {
          triggeredAlarms.push(alarmKey);
          localStorage.setItem('oavix_triggered_alarms', JSON.stringify(triggeredAlarms));

          startContinuousAlarm(`¡Servicio Pendiente!: ${r.title}`, `Mantenimiento programado para hoy. Categoría: ${r.category}`);

          if ('Notification' in window && Notification.permission === 'granted') {
            const notification = new Notification(`🔔 OAVIX: ${r.title}`, {
              body: `Fecha de cita: ${r.alertDate} ${r.alertTime || ''}. Toca para abrir.`,
              icon: 'https://cdn-icons-png.flaticon.com/512/744/744465.png',
              requireInteraction: true
            });
            notification.onclick = function() {
              window.focus();
              notification.close();
            };
          }
        }
      });
    }

    function startContinuousAlarm(title, subtitle) {
      if (isAlarmRinging) return;
      isAlarmRinging = true;

      document.getElementById('alarm-screen-title').textContent = title;
      document.getElementById('alarm-screen-subtitle').textContent = subtitle;
      document.getElementById('modal-continuous-alarm').classList.remove('hidden');

      alarmAudioInterval = setInterval(() => {
        playAlarmWakeTone();
      }, 700);
      playAlarmWakeTone();
    }

    function playAlarmWakeTone() {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        if (!playAlarmWakeTone.ctx) playAlarmWakeTone.ctx = new AudioCtx();
        const ctx = playAlarmWakeTone.ctx;
        if (ctx.state === 'suspended') ctx.resume();
        const playT = (f, start, d) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(f, ctx.currentTime + start);
          gain.gain.setValueAtTime(0.35, ctx.currentTime + start);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + d);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + start);
          osc.stop(ctx.currentTime + start + d);
        };
        playT(880, 0, 0.15);
        playT(880, 0.2, 0.15);
        playT(1174.66, 0.4, 0.25);
      } catch (e) {}
    }

    function stopContinuousAlarm() {
      isAlarmRinging = false;
      if (alarmAudioInterval) clearInterval(alarmAudioInterval);
      document.getElementById('modal-continuous-alarm').classList.add('hidden');
      showToast('Alarma Detenida', 'Has apagado la alerta de servicio.', 'cyan');
    }

    function triggerClusterAnim(type) {
      if (type === 'tachometer') {
        const valText = document.getElementById('tacho-val-text');
        const bar = document.getElementById('tacho-progress-bar');
        let val = 2.4; let dir = 1;
        const interval = setInterval(() => {
          if (dir === 1) { val += 0.6; if (val >= 7.2) dir = -1; }
          else { val -= 0.5; if (val <= 2.4) { val = 2.4; clearInterval(interval); } }
          valText.textContent = val.toFixed(1);
          bar.setAttribute('stroke-dasharray', `${Math.min(198, Math.round((val / 8) * 198))} 260`);
        }, 35);
      } else if (type === 'check') {
        const icon = document.getElementById('icon-check');
        icon.classList.add('anim-vibrate');
        setTimeout(() => icon.classList.remove('anim-vibrate'), 1200);
      } else if (type === 'oil') {
        const icon = document.getElementById('icon-oil');
        icon.classList.add('anim-pulse-red');
        setTimeout(() => icon.classList.remove('anim-pulse-red'), 1500);
      } else if (type === 'battery') {
        const icon = document.getElementById('icon-battery');
        icon.classList.add('anim-spark');
        setTimeout(() => icon.classList.remove('anim-spark'), 1400);
      } else if (type === 'fuel') {
        const fBar = document.getElementById('fuel-bar-fill');
        const tBar = document.getElementById('temp-bar-fill');
        fBar.style.width = '100%'; tBar.style.width = '100%';
        setTimeout(() => { fBar.style.width = '75%'; tBar.style.width = '50%'; }, 1200);
      }
    }

    function openThemeModal() { document.getElementById('modal-theme').classList.remove('hidden'); }
    function closeThemeModal() { document.getElementById('modal-theme').classList.add('hidden'); }

    function applyCustomTheme() {
      const bg = document.getElementById('picker-bg-color').value;
      const neon = document.getElementById('picker-border-color').value;
      applyCustomThemeColors(bg, neon);
      localStorage.setItem('oavix_custom_bg', bg);
      localStorage.setItem('oavix_custom_neon', neon);
    }

    function applyCustomThemeColors(bg, neon) {
      document.documentElement.style.setProperty('--bg-dynamic', bg);
      document.documentElement.style.setProperty('--border-neon', neon);

      let r = parseInt(bg.slice(1,3), 16), g = parseInt(bg.slice(3,5), 16), b = parseInt(bg.slice(5,7), 16);
      if (isNaN(r)) { r = 15; g = 23; b = 42; }
      const isLight = document.documentElement.classList.contains('light-theme');
      document.documentElement.style.setProperty('--card-bg', isLight ? 'rgba(255, 255, 255, 0.95)' : `rgba(${r}, ${g}, ${b}, 0.88)`);
    }

    function resetDefaultTheme() {
      const isLight = document.documentElement.classList.contains('light-theme');
      const defBg = isLight ? '#f1f5f9' : '#030712';
      const defNeon = isLight ? '#8b5cf6' : '#06b6d4';
      document.getElementById('picker-bg-color').value = defBg;
      document.getElementById('picker-border-color').value = defNeon;
      applyCustomThemeColors(defBg, defNeon);
      localStorage.setItem('oavix_custom_bg', defBg);
      localStorage.setItem('oavix_custom_neon', defNeon);
      showToast('Tema Restablecido', 'Se aplicó el diseño perfecto.', 'cyan');
    }

    function toggleTheme() {
      const isDark = document.documentElement.classList.toggle('dark');
      document.documentElement.classList.toggle('light-theme', !isDark);
      document.getElementById('theme-icon').className = isDark ? 'fa-solid fa-moon text-xs' : 'fa-solid fa-sun text-xs text-amber-400';
      localStorage.setItem('oavix_is_light', !isDark);
      resetDefaultTheme();
    }

    function seedData() {
      autoRecords = [
        { id: '1', title: 'Cambio de Aceite Sintético', category: 'Cambio de Aceite', amount: 60.00, currency: 'USD', mileage: 86000, provider: 'Taller San Pedro', date: '2026-06-01', notes: 'Filtro nuevo', photo: '', validated: false }
      ];
      saveAll();
    }

    function saveAll() {
      localStorage.setItem('oavix_auto_records', JSON.stringify(autoRecords));
    }

    function renderMileageComparison() {
      const container = document.getElementById('mileage-comparison-list');
      const unitText = currentUnit.toUpperCase();
      const activeRecords = autoRecords.filter(r => !r.validated);

      if (activeRecords.length === 0) {
        container.innerHTML = `<p class="text-xs font-extrabold col-span-full opacity-90">No hay servicios pendientes en el semáforo.</p>`;
        return;
      }

      container.innerHTML = activeRecords.map(r => {
        const target = Number(r.mileage || 0);
        const diff = target - currentVehicleMileage;
        return `
          <div class="p-3 rounded-xl border border-slate-600 bg-slate-900/60 dark:bg-slate-900/80 flex justify-between items-center text-xs">
            <div>
              <span class="font-black">${r.title}</span>
              <p class="text-[10px] font-extrabold opacity-80">Objetivo: ${formatNumber(target)} ${unitText}</p>
            </div>
            <div class="flex items-center space-x-2">
              <span class="font-black ${diff < 0 ? 'text-rose-400' : 'text-emerald-400'}">${diff < 0 ? 'Vencido' : 'Faltan ' + formatNumber(diff) + ' ' + unitText}</span>
              <button onclick="toggleValidateRecord('${r.id}')" class="px-2 py-1 rounded bg-cyan-600/35 hover:bg-cyan-600/60 text-cyan-300 text-[10px] font-black" title="Validar y Archivar">✓</button>
            </div>
          </div>
        `;
      }).join('');
    }

    function renderStats() {
      const container = document.getElementById('stats-container');
      const activeRecords = autoRecords.filter(r => !r.validated);
      const totalUSD = autoRecords.reduce((s, r) => s + (r.currency === 'EUR' ? Number(r.amount)*1.1 : Number(r.amount || 0)), 0);
      container.innerHTML = `
        <div class="animated-glass-card p-3.5 rounded-2xl">
          <p class="text-[11px] font-extrabold opacity-90">Inversión Total (Ref)</p>
          <p class="text-lg font-black mt-0.5">${formatMoney(totalUSD, 'USD')}</p>
        </div>
        <div class="animated-glass-card p-3.5 rounded-2xl">
          <p class="text-[11px] font-extrabold opacity-90">Servicios Activos</p>
          <p class="text-lg font-black text-cyan-400 mt-0.5">${formatNumber(activeRecords.length)}</p>
        </div>
        <div class="animated-glass-card p-3.5 rounded-2xl">
          <p class="text-[11px] font-extrabold opacity-90">Odómetro</p>
          <p class="text-lg font-black text-emerald-400 mt-0.5 font-mono">${formatNumber(currentVehicleMileage)}</p>
        </div>
        <div class="animated-glass-card p-3.5 rounded-2xl">
          <p class="text-[11px] font-extrabold opacity-90">Plataforma</p>
          <p class="text-lg font-black text-cyan-400 mt-0.5">OAVIX PWA</p>
        </div>
      `;
    }

    function renderRecords() {
      const list = document.getElementById('records-list');
      const activeRecords = autoRecords.filter(r => !r.validated);

      if (activeRecords.length === 0) {
        list.innerHTML = `<p class="text-xs font-extrabold col-span-full opacity-90">No hay registros activos en el historial.</p>`;
        return;
      }

      list.innerHTML = activeRecords.map(r => `
        <div class="animated-glass-card rounded-2xl p-4 shadow-lg space-y-2">
          ${r.photo ? `
            <div class="w-full h-28 rounded-xl overflow-hidden mb-2 cursor-pointer border border-slate-600 relative group" onclick="openImageViewer('${r.photo}')">
              <img src="${r.photo}" class="w-full h-full object-cover">
              <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] font-black transition">Ver HD</div>
            </div>
          ` : ''}
          <div class="flex justify-between items-start">
            <h4 class="font-black text-sm">${r.title}</h4>
            <span class="font-black text-cyan-400 text-sm">${formatMoney(r.amount, r.currency || 'USD')}</span>
          </div>
          <p class="text-xs font-extrabold opacity-90"><i class="fa-regular fa-calendar mr-1"></i>${r.date} | ${r.category}</p>
          ${r.notes ? `<p class="text-[11px] font-bold italic p-2 rounded-lg bg-slate-900/20">${r.notes}</p>` : ''}
          <div class="pt-2 border-t border-slate-600/60 flex justify-end space-x-2">
            <button onclick="openFormModal('${r.id}')" class="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 text-xs font-black">Editar</button>
            <button onclick="toggleValidateRecord('${r.id}')" class="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 text-xs font-black">Validar / Archivar</button>
            <button onclick="deleteRecord('${r.id}')" class="px-2.5 py-1 rounded-lg bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 text-xs font-black">Eliminar</button>
          </div>
        </div>
      `).join('');
    }

    function renderArchiveRecords() {
      const list = document.getElementById('archive-records-list');
      const archived = autoRecords.filter(r => r.validated);

      if (archived.length === 0) {
        list.innerHTML = `<p class="text-xs font-extrabold col-span-full opacity-90">No hay servicios validados en el historial archivado.</p>`;
        return;
      }

      list.innerHTML = archived.map(r => `
        <div class="animated-glass-card rounded-2xl p-4 shadow-lg space-y-2 border-dashed">
          <div class="flex justify-between items-start">
            <h4 class="font-black text-sm line-through opacity-80">${r.title}</h4>
            <span class="font-black text-emerald-400 text-sm">${formatMoney(r.amount, r.currency || 'USD')}</span>
          </div>
          <p class="text-xs font-extrabold opacity-90"><i class="fa-regular fa-calendar mr-1"></i>${r.date} | ${r.category}</p>
          ${r.notes ? `<p class="text-[11px] font-bold italic p-2 rounded-lg bg-slate-900/20">${r.notes}</p>` : ''}
          <div class="pt-2 border-t border-slate-600/60 flex justify-end space-x-2">
            <button onclick="openFormModal('${r.id}')" class="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 text-xs font-black">Editar</button>
            <button onclick="toggleValidateRecord('${r.id}')" class="px-2.5 py-1 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 text-xs font-black">Restaurar</button>
            <button onclick="deleteRecord('${r.id}')" class="px-2.5 py-1 rounded-lg bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 text-xs font-black">Eliminar</button>
          </div>
        </div>
      `).join('');
    }

    function toggleValidateRecord(id) {
      const r = autoRecords.find(item => item.id === id);
      if (r) {
        r.validated = !r.validated;
        saveAll();
        renderStats();
        renderRecords();
        renderArchiveRecords();
        renderMileageComparison();
        renderAlerts();
        showToast('Actualizado', r.validated ? 'Servicio validado y archivado.' : 'Servicio restaurado.', 'emerald');
      }
    }

    function deleteRecord(id) {
      autoRecords = autoRecords.filter(r => r.id !== id);
      saveAll();
      renderStats();
      renderRecords();
      renderArchiveRecords();
      renderMileageComparison();
      renderAlerts();
      showToast('Eliminado', 'Registro eliminado correctamente.', 'amber');
    }

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

    function renderAlerts() {
      const container = document.getElementById('alerts-list');
      const navBadge = document.getElementById('nav-alerts-badge');
      const alerts = autoRecords.filter(r => !r.validated && r.alertDate);

      if (alerts.length === 0) {
        container.innerHTML = `
          <div class="flex flex-col items-center justify-center py-10 opacity-60 text-center">
            <i class="fa-solid fa-bell-slash text-4xl mb-3"></i>
            <p class="text-sm font-black">No tienes alarmas ni citas activas</p>
            <p class="text-[10px] font-bold">Cuando programes un recordatorio, aparecerá aquí.</p>
          </div>
        `;
        if (navBadge) navBadge.classList.add('hidden');
        return;
      }

      if (navBadge) {
        navBadge.classList.remove('hidden');
        navBadge.textContent = alerts.length;
      }

      container.innerHTML = alerts.map(a => `
        <div class="p-3 rounded-xl border border-slate-600 bg-slate-900/80 flex justify-between items-center text-xs">
          <div>
            <span class="font-black">${a.title}</span>
            <p class="text-[10px] text-amber-300 font-bold">Fecha: ${a.alertDate} ${a.alertTime || ''}</p>
          </div>
          <div class="flex items-center space-x-2">
            <span class="font-black text-cyan-400">${formatMoney(a.amount, a.currency || 'USD')}</span>
            <button onclick="openFormModal('${a.id}')" class="px-2 py-1 rounded bg-indigo-600/30 text-indigo-300 text-[10px] font-black">Editar</button>
            <button onclick="toggleValidateRecord('${a.id}')" class="px-2 py-1 rounded bg-emerald-600/30 text-emerald-300 text-[10px] font-black">Validar</button>
          </div>
        </div>
      `).join('');
    }

    function switchSubTab(t) {
      // Ocultar todas las sub-pestañas incluyendo el Dashboard
      ['dashboard', 'records', 'calendar', 'fuel', 'alerts', 'archive'].forEach(tab => {
        const element = document.getElementById(`subtab-${tab}`);
        if (element) element.classList.add('hidden');

        // Actualizar estado de los botones del menú flotante
        const navBtn = document.getElementById(`nav-btn-${tab}`);
        if (navBtn) navBtn.classList.remove('active');
      });

      // Mostrar solo la seleccionada
      const activeElement = document.getElementById(`subtab-${t}`);
      if (activeElement) activeElement.classList.remove('hidden');

      const activeNavBtn = document.getElementById(`nav-btn-${t}`);
      if (activeNavBtn) activeNavBtn.classList.add('active');

      if (t === 'archive') renderArchiveRecords();
      if (t === 'fuel') setTimeout(renderFuelModule, 0);
      if (t === 'dashboard') window.scrollTo({top:0, behavior:'smooth'});
    }

    function openFormModal(editId = null) {
      document.getElementById('record-form').reset();
      document.getElementById('record-id').value = '';
      currentBase64Image = '';
      removePhoto();

      if (editId) {
        const item = autoRecords.find(r => r.id === editId);
        if (item) {
          document.getElementById('form-modal-title').textContent = 'Editar Mantenimiento';
          document.getElementById('record-id').value = item.id;
          document.getElementById('form-title').value = item.title;
          document.getElementById('form-category').value = item.category;
          document.getElementById('form-currency').value = item.currency || 'USD';
          document.getElementById('form-amount').value = item.amount;
          document.getElementById('form-mileage').value = item.mileage || '';
          document.getElementById('form-provider').value = item.provider || '';
          document.getElementById('form-date').value = item.date;
          document.getElementById('form-alert-date').value = item.alertDate || '';
          document.getElementById('form-alert-time').value = item.alertTime || '';
          document.getElementById('form-notes').value = item.notes || '';

          if (item.photo) {
            currentBase64Image = item.photo;
            document.getElementById('photo-preview').src = item.photo;
            document.getElementById('photo-preview-container').classList.remove('hidden');
          }
        }
      } else {
        document.getElementById('form-modal-title').textContent = 'Nuevo Mantenimiento';
        document.getElementById('form-date').value = new Date().toISOString().split('T')[0];
      }

      document.getElementById('modal-form').classList.remove('hidden');
    }

    function closeFormModal() { document.getElementById('modal-form').classList.add('hidden'); }

    function handleFormSubmit(e) {
      e.preventDefault();
      const id = document.getElementById('record-id').value || Date.now().toString();
      const r = {
        id,
        title: document.getElementById('form-title').value,
        category: document.getElementById('form-category').value,
        currency: document.getElementById('form-currency').value,
        amount: parseFloat(document.getElementById('form-amount').value || 0),
        mileage: document.getElementById('form-mileage').value,
        provider: document.getElementById('form-provider').value,
        date: document.getElementById('form-date').value,
        alertDate: document.getElementById('form-alert-date').value,
        alertTime: document.getElementById('form-alert-time').value,
        notes: document.getElementById('form-notes').value,
        photo: currentBase64Image,
        validated: false
      };

      const idx = autoRecords.findIndex(item => item.id === id);
      if (idx >= 0) {
        r.validated = autoRecords[idx].validated;
        autoRecords[idx] = r;
      } else {
        autoRecords.unshift(r);
      }

      saveAll();
      closeFormModal();
      removePhoto();
      renderStats();
      renderRecords();
      renderArchiveRecords();
      renderMileageComparison();
      renderCalendar();
      renderAlerts();
      showToast('Guardado', 'Mantenimiento registrado con éxito.', 'emerald');
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[character]));
    }

    function showToast(title, body, color, duration = 4000) {
      const container = document.getElementById('toast-container');
      const toast = document.createElement('div');
      toast.className = 'pointer-events-auto p-3 rounded-xl bg-slate-900 border border-cyan-500/50 text-white text-xs shadow-xl flex items-center space-x-2 font-bold max-w-sm';
      toast.innerHTML = `<i class="fa-solid fa-bell text-cyan-400"></i><div class="max-h-[60vh] overflow-y-auto"><b>${title}</b><p class="text-[10px] opacity-90 font-extrabold whitespace-pre-line">${body}</p></div>`;
      container.appendChild(toast);
      setTimeout(() => toast.remove(), duration);
    }

    // ⛽ FUNCIONES DEL MÓDULO DE COMBUSTIBLE
    function updateVehicleConfig() {
      if(!window.FuelModule) return;
      const config = {
        tankCapacity: parseFloat(document.getElementById('fuel-tank-capacity').value) || 15,
        city: document.getElementById('fuel-city-select').value || 'tegucigalpa',
        fuelType: document.getElementById('fuel-type-select').value || 'Gasolina Regular',
        avgConsumption: parseFloat(document.getElementById('fuel-avg-consumption').value) || 8
      };
      window.FuelModule.updateVehicleConfig(config);
      renderFuelPrices();
    }

    function calculateTankFill() {
      if(!window.FuelModule) return;
      const gallons = parseFloat(document.getElementById('calc-tank-gallons').value);
      if(!gallons || gallons <= 0) {
        showToast('Error', 'Ingresa galones válidos.', 'rose');
        return;
      }
      const config = window.FuelModule.getVehicleConfig();
      const cost = window.FuelModule.calculateFullTank(gallons, config.city, config.fuelType);
      if(!cost) {
        showToast('Error', 'No hay precio para esta combinación.', 'rose');
        return;
      }
      const resultDiv = document.getElementById('tank-result');
      document.getElementById('tank-result-value').textContent = formatMoney(cost, 'HNL');
      resultDiv.classList.remove('hidden');
    }

    function calculateCostPerKm() {
      if(!window.FuelModule) return;
      const km = parseFloat(document.getElementById('calc-km-distance').value);
      if(!km || km <= 0) {
        showToast('Error', 'Ingresa kilómetros válidos.', 'rose');
        return;
      }
      const config = window.FuelModule.getVehicleConfig();
      const cost = window.FuelModule.calculateCostPerKm(km, config.city, config.fuelType, config.avgConsumption);
      if(!cost) {
        showToast('Error', 'No hay precio para esta combinación.', 'rose');
        return;
      }
      const resultDiv = document.getElementById('km-result');
      document.getElementById('km-result-value').textContent = formatMoney(cost, 'HNL');
      resultDiv.classList.remove('hidden');
    }

    function calculateAutoFill() {
      if(!window.FuelModule) return;
      const gallons = parseFloat(document.getElementById('calc-autofill-gallons').value);
      if(!gallons || gallons <= 0) {
        document.getElementById('autofill-result').classList.add('hidden');
        document.getElementById('copy-autofill-btn').classList.add('hidden');
        return;
      }
      const config = window.FuelModule.getVehicleConfig();
      const amount = window.FuelModule.getAutoFillAmount(gallons, config.city, config.fuelType);
      if(!amount) {
        showToast('Error', 'No hay precio para esta combinación.', 'rose');
        return;
      }
      document.getElementById('autofill-result-value').textContent = formatMoney(amount, 'HNL');
      document.getElementById('autofill-result').classList.remove('hidden');
      document.getElementById('copy-autofill-btn').classList.remove('hidden');
    }

    function copyAutoFillToForm() {
      const amount = document.getElementById('autofill-result-value').textContent.replace(/[^\d.]/g, '');
      if(document.getElementById('form-amount')) {
        document.getElementById('form-amount').value = amount;
        showToast('Copiado', 'Monto copiado al formulario.', 'emerald');
      }
    }

    function renderFuelPrices() {
      if(!window.FuelModule) return;
      const prices = window.FuelModule.getCurrentPrices();
      const cities = window.FuelModule.getCities();
      const config = window.FuelModule.getVehicleConfig();
      const lastUpdate = window.FuelModule.getLastUpdate();

      if(lastUpdate) {
        const date = new Date(lastUpdate);
        document.getElementById('fuel-prices-update-date').textContent = `Última actualización: ${date.toLocaleDateString('es-HN')} a las ${date.toLocaleTimeString('es-HN', {hour: '2-digit', minute: '2-digit'})}`;
      }

      const grid = document.getElementById('fuel-prices-grid');
      grid.innerHTML = '';

      cities.forEach(city => {
        const cityPrices = prices[city.id];
        if(!cityPrices) return;

        const fuelType = config.fuelType;
        const price = cityPrices[fuelType];
        const isSelected = city.id === config.city;

        const card = document.createElement('div');
        card.className = `p-3 rounded-lg border transition ${isSelected ? 'bg-cyan-500/20 border-cyan-500/60' : 'bg-slate-900/40 border-slate-700/60'} cursor-pointer hover:border-cyan-400`;
        card.onclick = () => {
          document.getElementById('fuel-city-select').value = city.id;
          updateVehicleConfig();
        };

        card.innerHTML = `
          <p class="text-xs font-black">${city.name}</p>
          <p class="text-[10px] opacity-70 font-bold">${city.region}</p>
          <p class="text-lg font-black text-amber-400 mt-1">${formatMoney(price, 'HNL')}</p>
          <p class="text-[9px] opacity-60">${fuelType}</p>
        `;

        grid.appendChild(card);
      });
    }

    function renderFuelHistory() {
      if(!window.FuelModule) return;
      const history = window.FuelModule.getFuelHistory(5);
      const list = document.getElementById('fuel-history-list');

      if(history.length === 0) {
        list.innerHTML = '<p class="text-xs font-bold opacity-70 text-center py-4">Sin histórico registrado aún</p>';
        return;
      }

      list.innerHTML = history.map(h => `
        <div class="p-2.5 rounded-lg bg-slate-900/40 border border-slate-700/60 text-xs">
          <div class="flex justify-between items-start">
            <div>
              <p class="font-black">${new Date(h.date).toLocaleDateString('es-HN')}</p>
              <p class="text-[10px] opacity-70">${h.fuelType} • ${h.gallons} gal</p>
            </div>
            <p class="font-black text-emerald-400">${formatMoney(h.amountPaid, 'HNL')}</p>
          </div>
        </div>
      `).join('');
    }

    function refreshFuelPrices() {
      if(!window.FuelModule) return;
      showToast('Actualizando', 'Obteniendo precios del SEN...', 'cyan');
      window.FuelModule.refreshPrices().then(success => {
        if(success) {
          renderFuelPrices();
          showToast('✓ Actualizado', 'Precios de combustible sincronizados.', 'emerald');
        } else {
          showToast('⚠ Error', 'No se pudieron obtener los precios.', 'amber');
        }
      });
    }

    function renderFuelModule() {
      renderFuelPrices();
      renderFuelHistory();
      const config = window.FuelModule.getVehicleConfig();
      document.getElementById('fuel-tank-capacity').value = config.tankCapacity;
      document.getElementById('fuel-avg-consumption').value = config.avgConsumption;
      document.getElementById('fuel-city-select').value = config.city;
      document.getElementById('fuel-type-select').value = config.fuelType;

      // Actualizar fecha última actualización en panel admin
      const lastUpdate = window.FuelModule.getLastUpdate();
      if(lastUpdate) {
        document.getElementById('fuel-admin-last-update').textContent =
          new Date(lastUpdate).toLocaleString('es-HN');
      }
    }

    // 🔧 PANEL ADMIN - Importar precios desde JSON
    function importFuelPricesFromJSON() {
      try {
        const jsonInput = document.getElementById('fuel-admin-json-input').value.trim();

        if(!jsonInput) {
          showToast('⚠ Error', 'Pega el JSON de precios primero', 'amber');
          return;
        }

        // Intentar parsear como objeto directo de precios
        let pricesData;
        try {
          pricesData = JSON.parse(jsonInput);
        } catch(e) {
          showToast('⚠ JSON Inválido', 'Revisa el formato del JSON', 'red');
          return;
        }

        // Validar que sea un objeto con ciudades
        if(!pricesData || typeof pricesData !== 'object') {
          showToast('⚠ Formato Inválido', 'Debe ser un objeto JSON', 'red');
          return;
        }

        // Actualizar precios
        const success = window.FuelModule.updatePricesManually(pricesData);

        if(success) {
          document.getElementById('fuel-admin-json-input').value = '';
          showToast('✅ Actualizado', 'Precios del SEN sincronizados correctamente', 'emerald');
          renderFuelPrices();
          renderFuelModule();
        } else {
          showToast('⚠ Error', 'No se pudieron actualizar los precios', 'red');
        }
      } catch(e) {
        console.error('[Admin Import]', e);
        showToast('⚠ Error', 'Ocurrió un error: ' + e.message, 'red');
      }
    }

    // 📋 PANEL ADMIN - Exportar precios a JSON (para copiar del Power BI)
    function exportFuelPricesToJSON() {
      try {
        const exported = window.FuelModule.exportPrices();
        const jsonStr = JSON.stringify(exported.data.prices, null, 2);

        document.getElementById('fuel-admin-json-input').value = jsonStr;

        showToast('📋 Copiado', 'JSON de precios generado en el textarea', 'blue');

        // Copiar al portapapeles automáticamente
        navigator.clipboard.writeText(jsonStr).then(() => {
          showToast('✅ Copiado', 'JSON en el portapapeles', 'emerald');
        }).catch(() => {
          showToast('ℹ Info', 'Copia manualmente desde el textarea', 'blue');
        });
      } catch(e) {
        console.error('[Admin Export]', e);
        showToast('⚠ Error', 'No se pudo exportar: ' + e.message, 'red');
      }
    }

    // 📖 PANEL ADMIN - Mostrar guía de actualización
    function showFuelAdminGuide() {
      const guide = `
🔧 GUÍA DE ACTUALIZACIÓN DE PRECIOS SEN

1️⃣ ACCEDER A LOS PRECIOS REALES:
   • Ve a: https://app.powerbi.com/view?r=eyJrIjoiZDdmNzNjMmYtNzMzYy00ZDQ2LTg0MzctYWRlNDQ5MWIzNGYxIiwidCI6Ijk0MDNiYTRiLWJjNTQtNDAzZS05NTg4LWI1NTJkMThhODI3YiJ9
   • Los precios se actualizan cada viernes

2️⃣ FORMATO DE PRECIOS:
   {
     "tegucigalpa": {
       "Gasolina Súper": 57.85,
       "Gasolina Regular": 55.20,
       "Diésel": 52.15,
       "Kerosene": 51.30,
       "GLP": 35.90
     },
     "sps": { ... },
     "laceiba": { ... },
     "choloma": { ... },
     "danli": { ... },
     "juticalpa": { ... },
     "comayagua": { ... },
     "trujillo": { ... }
   }

3️⃣ PASOS:
   a) Presiona "Exportar" para ver el formato actual
   b) Reemplaza los valores con los precios del SEN
   c) Pega el JSON en el textarea
   d) Presiona "Importar"

4️⃣ VALIDACIÓN:
   ✓ Debe ser JSON válido
   ✓ Todas las 8 ciudades
   ✓ Los 5 tipos de combustible

¡Los precios se sincronizarán automáticamente a todos los dispositivos!
      `;

      showToast('📖 Guía', guide, 'cyan', 8000);
    }
