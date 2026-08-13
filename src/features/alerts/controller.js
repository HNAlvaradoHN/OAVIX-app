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
