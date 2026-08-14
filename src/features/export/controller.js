    function readOavixStoredArray(key) {
      try {
        const value = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(value) ? value : [];
      } catch {
        return [];
      }
    }

    function oavixExportText(value) {
      const text = String(value ?? '');
      return /^[=+\-@]/.test(text) ? `'${text}` : text;
    }

    function oavixExportNumber(value) {
      const number = Number(value);
      return Number.isFinite(number) ? number : 0;
    }

    function oavixExportDateLabel(value) {
      if (!value) return '';
      const source = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00` : value;
      const date = new Date(source);
      return Number.isFinite(date.getTime()) ? date.toLocaleDateString('es-HN') : String(value);
    }

    let oavixExportFormat = 'excel';

    function oavixMaintenanceKey(record, index) {
      return String(record && record.id != null ? record.id : `maintenance-${index}`);
    }

    function selectedOavixMaintenanceKeys() {
      return Array.from(document.querySelectorAll('#oavix-export-maintenance-list input:checked'))
        .map(input => input.value);
    }

    function buildOavixExportData(options = {}) {
      const allMaintenance = readOavixStoredArray('oavix_auto_records');
      const selectedKeys = Array.isArray(options.maintenanceKeys) ? new Set(options.maintenanceKeys.map(String)) : null;
      const maintenance = selectedKeys
        ? allMaintenance.filter((record, index) => selectedKeys.has(oavixMaintenanceKey(record, index)))
        : allMaintenance;
      const fills = readOavixStoredArray('oavix_fuel_history');
      const vehicles = readOavixStoredArray('oavix_fuel_vehicles');
      const vehicleNames = new Map(vehicles.map(vehicle => [String(vehicle.id), vehicle.name || 'Vehículo']));
      const mileage = oavixExportNumber(localStorage.getItem('oavix_auto_mileage'));
      const distanceUnit = localStorage.getItem('oavix_auto_unit') === 'mi' ? 'mi' : 'km';
      const maintenanceTotals = maintenance.reduce((totals, record) => {
        const currency = oavixExportText(record.currency || 'HNL');
        totals[currency] = (totals[currency] || 0) + oavixExportNumber(record.amount);
        return totals;
      }, {});
      const fuelTotal = fills.reduce((sum, record) => sum + oavixExportNumber(record.amountPaid), 0);

      return {
        generatedAt: new Date().toISOString(),
        maintenanceTotals,
        summary: [
          ['Informe', 'OAVIX — Gestión vehicular'],
          ['Generado', new Date().toLocaleString('es-HN')],
          ['Kilometraje actual', `${mileage.toLocaleString('en-US')} ${distanceUnit}`],
          ['Mantenimientos', maintenance.length],
          ['Mantenimientos activos', maintenance.filter(record => !record.validated).length],
          ['Mantenimientos archivados', maintenance.filter(record => record.validated).length],
          ...Object.entries(maintenanceTotals).map(([currency, total]) => [`Mantenimientos — total ${currency}`, total]),
          ['Cargas de combustible', fills.length],
          ['Total gastado en combustible (HNL)', fuelTotal],
          ['Vehículos', vehicles.length]
        ],
        maintenance: maintenance.map(record => [
          oavixExportDateLabel(record.date),
          oavixExportText(record.title),
          oavixExportText(record.category),
          oavixExportNumber(record.mileage),
          oavixExportNumber(record.amount),
          oavixExportText(record.currency || 'HNL'),
          oavixExportText(record.provider),
          oavixExportDateLabel(record.alertDate),
          oavixExportText(record.alertTime),
          record.validated ? 'Archivado' : 'Activo',
          record.photo ? 'Sí' : 'No',
          oavixExportText(record.notes)
        ]),
        fills: fills.map(record => [
          oavixExportDateLabel(record.date),
          oavixExportText(vehicleNames.get(String(record.vehicleId)) || 'Vehículo'),
          oavixExportText(record.fuelType),
          oavixExportNumber(record.odometer),
          oavixExportText(record.distanceUnit || 'km'),
          oavixExportNumber(record.volume),
          oavixExportText(record.volumeUnit || 'gal'),
          oavixExportNumber(record.amountPaid),
          record.fullTank ? 'Sí' : 'No',
          oavixExportText(record.department),
          oavixExportText(record.municipality),
          oavixExportText(record.station),
          oavixExportText(record.notes)
        ]),
        vehicles: vehicles.map(vehicle => [
          oavixExportText(vehicle.name),
          vehicle.type === 'motorcycle' ? 'Motocicleta' : 'Automóvil',
          oavixExportText(vehicle.fuelType),
          oavixExportText(vehicle.distanceUnit || 'km'),
          oavixExportText(vehicle.volumeUnit || 'gal'),
          oavixExportNumber(vehicle.tankCapacity),
          oavixExportNumber(vehicle.targetEfficiency),
          oavixExportText(vehicle.department),
          oavixExportText(vehicle.municipality),
          vehicle.archived ? 'Archivado' : 'Activo'
        ])
      };
    }

    function oavixWorksheet(rows, widths) {
      const sheet = window.XLSX.utils.aoa_to_sheet(rows);
      sheet['!cols'] = widths.map(width => ({ wch: width }));
      if (rows.length > 1 && sheet['!ref']) sheet['!autofilter'] = { ref: sheet['!ref'] };
      return sheet;
    }

    function exportOavixExcel(options = {}) {
      closeSettingsMenu();
      if (!window.XLSX || !window.XLSX.utils || typeof window.XLSX.writeFile !== 'function') {
        showToast('Excel no está disponible', 'Comprueba tu conexión y recarga la aplicación.', 'rose');
        return false;
      }

      try {
        const data = buildOavixExportData(options);
        const workbook = window.XLSX.utils.book_new();
        const maintenanceHeaders = ['Fecha', 'Mantenimiento', 'Categoría', 'Kilometraje', 'Monto', 'Moneda', 'Proveedor', 'Fecha de alerta', 'Hora', 'Estado', 'Foto', 'Notas'];
        const fillHeaders = ['Fecha', 'Vehículo', 'Combustible', 'Odómetro', 'Unidad distancia', 'Cantidad', 'Unidad volumen', 'Total HNL', 'Tanque lleno', 'Departamento', 'Municipio', 'Estación', 'Notas'];
        const vehicleHeaders = ['Vehículo', 'Tipo', 'Combustible', 'Distancia', 'Volumen', 'Capacidad tanque', 'Rendimiento esperado', 'Departamento', 'Municipio', 'Estado'];

        window.XLSX.utils.book_append_sheet(workbook, oavixWorksheet(data.summary, [34, 34]), 'Resumen');
        window.XLSX.utils.book_append_sheet(workbook, oavixWorksheet([maintenanceHeaders, ...data.maintenance], [13, 28, 22, 14, 13, 10, 22, 15, 10, 12, 8, 38]), 'Mantenimientos');
        window.XLSX.utils.book_append_sheet(workbook, oavixWorksheet([fillHeaders, ...data.fills], [13, 22, 18, 13, 15, 12, 14, 13, 12, 20, 24, 22, 38]), 'Combustibles');
        window.XLSX.utils.book_append_sheet(workbook, oavixWorksheet([vehicleHeaders, ...data.vehicles], [24, 15, 18, 12, 12, 17, 21, 20, 24, 12]), 'Vehículos');

        const date = data.generatedAt.slice(0, 10);
        window.XLSX.writeFile(workbook, `OAVIX-informe-${date}.xlsx`, { compression: true });
        showToast('Excel creado', 'Se exportaron mantenimientos, combustibles y vehículos.', 'emerald');
        return true;
      } catch (error) {
        console.error('[OAVIX Excel]', error);
        showToast('No se pudo crear el Excel', 'Tus datos no fueron modificados. Inténtalo nuevamente.', 'rose');
        return false;
      }
    }

    function oavixPrintEscape(value) {
      const source = String(value ?? '');
      const display = /^'[=+\-@]/.test(source) ? source.slice(1) : source;
      return display.replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[character]));
    }

    function oavixPrintRows(rows, emptyColumns, rowBuilder) {
      if (!rows.length) return `<tr><td colspan="${emptyColumns}">Sin registros</td></tr>`;
      return rows.map(rowBuilder).join('');
    }

    function createOavixPrintReport(data) {
      document.getElementById('oavix-print-report')?.remove();
      const report = document.createElement('section');
      report.id = 'oavix-print-report';
      report.className = 'oavix-print-report';
      const maintenanceTotal = Object.entries(data.maintenanceTotals)
        .map(([currency, total]) => `${currency} ${total.toLocaleString('es-HN', { minimumFractionDigits: 2 })}`)
        .join(' · ') || 'Sin gastos';
      const fuelTotal = data.summary.find(row => row[0] === 'Total gastado en combustible (HNL)')?.[1] || 0;
      report.innerHTML = `
        <header class="oavix-print-header">
          <div><span>OAVIX</span><h1>Informe de gestión vehicular</h1></div>
          <p>${oavixPrintEscape(new Date(data.generatedAt).toLocaleString('es-HN'))}</p>
        </header>
        <div class="oavix-print-summary">
          <article><small>Mantenimientos</small><strong>${data.maintenance.length}</strong></article>
          <article><small>Gasto en mantenimiento</small><strong>${oavixPrintEscape(maintenanceTotal)}</strong></article>
          <article><small>Cargas</small><strong>${data.fills.length}</strong></article>
          <article><small>Combustible HNL</small><strong>L ${oavixPrintEscape(fuelTotal.toLocaleString('es-HN', { minimumFractionDigits: 2 }))}</strong></article>
        </div>
        <section>
          <h2>Mantenimientos</h2>
          <table><thead><tr><th>Fecha</th><th>Trabajo</th><th>Categoría</th><th>Monto</th><th>Estado</th></tr></thead><tbody>
            ${oavixPrintRows(data.maintenance, 5, row => `<tr><td>${oavixPrintEscape(row[0])}</td><td>${oavixPrintEscape(row[1])}</td><td>${oavixPrintEscape(row[2])}</td><td>${oavixPrintEscape(row[5])} ${oavixPrintEscape(row[4])}</td><td>${oavixPrintEscape(row[9])}</td></tr>`)}
          </tbody></table>
        </section>
        <section>
          <h2>Combustibles</h2>
          <table><thead><tr><th>Fecha</th><th>Vehículo</th><th>Combustible</th><th>Cantidad</th><th>Total</th></tr></thead><tbody>
            ${oavixPrintRows(data.fills, 5, row => `<tr><td>${oavixPrintEscape(row[0])}</td><td>${oavixPrintEscape(row[1])}</td><td>${oavixPrintEscape(row[2])}</td><td>${oavixPrintEscape(row[5])} ${oavixPrintEscape(row[6])}</td><td>L ${oavixPrintEscape(row[7])}</td></tr>`)}
          </tbody></table>
        </section>
        <section>
          <h2>Vehículos</h2>
          <table><thead><tr><th>Vehículo</th><th>Tipo</th><th>Combustible</th><th>Ubicación</th><th>Estado</th></tr></thead><tbody>
            ${oavixPrintRows(data.vehicles, 5, row => `<tr><td>${oavixPrintEscape(row[0])}</td><td>${oavixPrintEscape(row[1])}</td><td>${oavixPrintEscape(row[2])}</td><td>${oavixPrintEscape(row[8])}, ${oavixPrintEscape(row[7])}</td><td>${oavixPrintEscape(row[9])}</td></tr>`)}
          </tbody></table>
        </section>
        <footer>Generado por OAVIX · Los precios oficiales SEN no forman parte de tus datos privados.</footer>`;
      document.body.appendChild(report);
      return report;
    }

    function exportOavixPdf(options = {}) {
      closeSettingsMenu();
      if (typeof window.print !== 'function') {
        showToast('PDF no disponible', 'Este navegador no permite imprimir el informe.', 'rose');
        return false;
      }

      try {
        const data = buildOavixExportData(options);
        const report = createOavixPrintReport(data);
        const previousTitle = document.title;
        document.title = `OAVIX-informe-${data.generatedAt.slice(0, 10)}`;
        document.body.classList.add('oavix-printing');
        let cleaned = false;
        const cleanup = () => {
          if (cleaned) return;
          cleaned = true;
          document.body.classList.remove('oavix-printing');
          report.remove();
          document.title = previousTitle;
        };
        window.addEventListener('afterprint', cleanup, { once: true });
        showToast('Informe PDF preparado', 'Selecciona “Guardar como PDF” en la ventana que se abrirá.', 'cyan');
        setTimeout(() => window.print(), 80);
        setTimeout(cleanup, 60000);
        return true;
      } catch (error) {
        console.error('[OAVIX PDF]', error);
        showToast('No se pudo preparar el PDF', 'Tus datos siguen intactos.', 'rose');
        return false;
      }
    }

    function updateOavixExportPickerCount() {
      const selected = selectedOavixMaintenanceKeys().length;
      const count = document.getElementById('oavix-export-picker-count');
      const confirm = document.getElementById('oavix-export-confirm');
      if (count) count.textContent = `${selected} seleccionado${selected === 1 ? '' : 's'}`;
      if (confirm) confirm.disabled = selected === 0;
    }

    function openOavixExportPicker(format) {
      oavixExportFormat = format === 'pdf' ? 'pdf' : 'excel';
      closeSettingsMenu();
      const picker = document.getElementById('oavix-export-picker');
      const list = document.getElementById('oavix-export-maintenance-list');
      const title = document.getElementById('oavix-export-picker-title');
      const caption = document.getElementById('oavix-export-picker-caption');
      const confirm = document.getElementById('oavix-export-confirm');
      if (!picker || !list) return false;

      const records = readOavixStoredArray('oavix_auto_records');
      if (title) title.textContent = `Elegir mantenimientos para ${oavixExportFormat === 'pdf' ? 'PDF' : 'Excel'}`;
      if (caption) caption.textContent = 'Combustibles y vehículos se incluirán completos; tú eliges los mantenimientos.';
      if (confirm) confirm.textContent = `Exportar en ${oavixExportFormat === 'pdf' ? 'PDF' : 'Excel'}`;
      list.innerHTML = records.length ? records.map((record, index) => `
        <label class="oavix-export-maintenance-option">
          <input type="checkbox" value="${oavixPrintEscape(oavixMaintenanceKey(record, index))}" checked onchange="updateOavixExportPickerCount()">
          <span><strong>${oavixPrintEscape(record.title || 'Mantenimiento sin título')}</strong><small>${oavixPrintEscape(oavixExportDateLabel(record.date) || 'Sin fecha')} · ${oavixPrintEscape(record.category || 'Sin categoría')}</small></span>
          <span>${record.validated ? 'Archivado' : 'Activo'}</span>
        </label>`).join('') : '<p class="oavix-export-empty">Todavía no hay mantenimientos para exportar.</p>';
      picker.classList.remove('hidden');
      document.body.classList.add('oavix-export-picker-open');
      updateOavixExportPickerCount();
      list.querySelector('input')?.focus({ preventScroll: true });
      return true;
    }

    function closeOavixExportPicker() {
      document.getElementById('oavix-export-picker')?.classList.add('hidden');
      document.body.classList.remove('oavix-export-picker-open');
    }

    function setAllOavixExportMaintenance(selected) {
      document.querySelectorAll('#oavix-export-maintenance-list input[type="checkbox"]')
        .forEach(input => { input.checked = Boolean(selected); });
      updateOavixExportPickerCount();
    }

    function confirmOavixExport() {
      const maintenanceKeys = selectedOavixMaintenanceKeys();
      if (!maintenanceKeys.length) {
        showToast('Selecciona un mantenimiento', 'Marca al menos un registro para continuar.', 'amber');
        return false;
      }
      closeOavixExportPicker();
      return oavixExportFormat === 'pdf'
        ? exportOavixPdf({ maintenanceKeys })
        : exportOavixExcel({ maintenanceKeys });
    }
