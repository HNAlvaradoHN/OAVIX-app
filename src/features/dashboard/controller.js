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
