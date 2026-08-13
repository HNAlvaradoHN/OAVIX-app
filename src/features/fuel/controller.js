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
