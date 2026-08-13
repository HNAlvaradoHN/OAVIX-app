(function initializeFuelController(root) {
  'use strict';

  const PANELS = ['overview', 'prices', 'history'];
  const DEPARTMENTS = [
    'Atlántida', 'Choluteca', 'Colón', 'Comayagua', 'Copán', 'Cortés',
    'El Paraíso', 'Francisco Morazán', 'Gracias a Dios', 'Intibucá',
    'Islas de la Bahía', 'La Paz', 'Lempira', 'Ocotepeque', 'Olancho',
    'Santa Bárbara', 'Valle', 'Yoro'
  ];
  let initialized = false;
  let selectedMapRow = null;
  let vehicleFormUnits = { distance: 'km', volume: 'gal' };

  const byId = id => document.getElementById(id);
  const moduleReady = () => Boolean(root.FuelModule);
  const text = (id, value) => {
    const element = byId(id);
    if (element) element.textContent = value;
  };

  function money(value) {
    if (typeof root.formatMoney === 'function') return root.formatMoney(value, 'HNL');
    return `L ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function safe(value) {
    if (typeof root.escapeHtml === 'function') return root.escapeHtml(value);
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
  }

  function decimal(value, digits = 1) {
    return Number(value || 0).toLocaleString('es-HN', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function localDate(value, options = {}) {
    if (!value) return '—';
    const source = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00` : value;
    const date = new Date(source);
    if (!Number.isFinite(date.getTime())) return '—';
    return date.toLocaleDateString('es-HN', options);
  }

  function unitName(unit, plural = false) {
    if (unit === 'l') return plural ? 'litros' : 'L';
    if (unit === 'mi') return plural ? 'millas' : 'mi';
    if (unit === 'km') return plural ? 'kilómetros' : 'km';
    return plural ? 'galones' : 'gal';
  }

  function efficiencyUnit(vehicle) {
    return `${vehicle.distanceUnit}/${vehicle.volumeUnit === 'l' ? 'L' : 'gal'}`;
  }

  function volumeFromGallons(gallons, vehicle) {
    return root.FuelModule.fromGallons(gallons, vehicle.volumeUnit);
  }

  function activePriceContext(vehicle) {
    const official = root.FuelModule.getVehicleOfficialPrice(vehicle.id);
    if (official) return { price: official.pricePerGallon, source: 'Precio oficial SEN', official };
    const consumption = root.FuelModule.getConsumptionStats(vehicle.id);
    if (consumption.avgPrice > 0) return { price: consumption.avgPrice, source: 'Último promedio pagado', official: null };
    return { price: 0, source: 'Sin precio disponible', official: null };
  }

  function notify(title, body, tone = 'cyan') {
    if (typeof root.showToast === 'function') root.showToast(title, body, tone);
  }

  function renderVehiclePicker() {
    const picker = byId('fuel-active-vehicle');
    if (!picker || !moduleReady()) return;
    const vehicles = root.FuelModule.getVehicles();
    const active = root.FuelModule.getActiveVehicle();
    picker.innerHTML = vehicles.map(vehicle =>
      `<option value="${safe(vehicle.id)}" ${vehicle.id === active.id ? 'selected' : ''}>${safe(vehicle.name)}</option>`
    ).join('');
    const icon = byId('fuel-vehicle-icon');
    if (icon) icon.innerHTML = `<i class="fa-solid ${active.type === 'motorcycle' ? 'fa-motorcycle' : 'fa-car-side'}"></i>`;
    text('fuel-vehicle-caption', `${root.FuelModule.productInfo(active.fuelType).label} · ${active.municipality}`);
    text('fuel-trip-distance-unit', active.distanceUnit);
  }

  function renderMetricCards() {
    const vehicle = root.FuelModule.getActiveVehicle();
    const stats = root.FuelModule.getDashboardStats(new Date(), vehicle.id);
    const consumption = stats.consumption;
    const convertedEfficiency = root.FuelModule.efficiencyFromKmPerGallon(
      consumption.avgConsumption,
      vehicle.distanceUnit,
      vehicle.volumeUnit
    );

    text('fuel-stat-week', money(stats.week.amount));
    text(
      'fuel-stat-week-volume',
      stats.week.count
        ? `${decimal(volumeFromGallons(stats.week.gallons, vehicle), 2)} ${unitName(vehicle.volumeUnit, true)} · ${stats.week.count} ${stats.week.count === 1 ? 'carga' : 'cargas'}`
        : 'Sin cargas registradas'
    );
    text('fuel-stat-month', money(stats.month.amount));
    const monthVolume = stats.month.count
      ? `${decimal(volumeFromGallons(stats.month.gallons, vehicle), 2)} ${unitName(vehicle.volumeUnit, true)} · `
      : '';
    text(
      'fuel-stat-month-trend',
      stats.monthTrend === null
        ? `${monthVolume}aún sin comparación`
        : `${monthVolume}${stats.monthTrend > 0 ? '↑' : stats.monthTrend < 0 ? '↓' : '→'} ${decimal(Math.abs(stats.monthTrend), 0)}% frente al mes anterior`
    );
    text('fuel-stat-year', money(stats.year.amount));
    text(
      'fuel-stat-year-count',
      `${decimal(volumeFromGallons(stats.year.gallons, vehicle), 2)} ${unitName(vehicle.volumeUnit, true)} · ${stats.year.count} ${stats.year.count === 1 ? 'carga' : 'cargas'}`
    );
    text('fuel-stat-efficiency', convertedEfficiency > 0 ? `${decimal(convertedEfficiency, 1)} ${efficiencyUnit(vehicle)}` : '—');
    text(
      'fuel-stat-efficiency-source',
      consumption.source === 'measured'
        ? `${consumption.completedIntervals} ${consumption.completedIntervals === 1 ? 'tramo medido' : 'tramos medidos'}`
        : 'Estimado hasta completar dos tanques'
    );
    text('fuel-month-projection', money(stats.monthProjection));
    renderVehicleInsights(vehicle, consumption);
  }

  function renderVehicleInsights(vehicle, consumption) {
    const priceContext = activePriceContext(vehicle);
    const tank = root.FuelModule.calculateFullTank(vehicle.id);
    const range = root.FuelModule.fromKilometers(consumption.rangeKm, vehicle.distanceUnit);
    const costPerDistance = consumption.costPerKm > 0
      ? consumption.costPerKm * (vehicle.distanceUnit === 'mi' ? root.FuelModule.constants.KM_PER_MILE : 1)
      : consumption.avgConsumption > 0 && priceContext.price > 0
        ? priceContext.price / consumption.avgConsumption * (vehicle.distanceUnit === 'mi' ? root.FuelModule.constants.KM_PER_MILE : 1)
        : 0;

    text('fuel-insight-title', vehicle.name);
    text('fuel-insight-range', range > 0 ? `${decimal(range, 0)} ${vehicle.distanceUnit}` : '—');
    text('fuel-insight-cost-distance', costPerDistance > 0 ? `${money(costPerDistance)} / ${vehicle.distanceUnit}` : '—');
    text('fuel-insight-tank-cost', tank ? money(tank.cost) : '—');
    text('fuel-insight-price', priceContext.price > 0 ? `${money(priceContext.price)} / gal` : '—');
    text('fuel-calculator-source', priceContext.source);

    const quality = byId('fuel-efficiency-quality');
    if (quality) {
      quality.textContent = consumption.source === 'measured' ? 'Consumo real' : 'Estimación';
      quality.classList.toggle('measured', consumption.source === 'measured');
    }
    const guide = byId('fuel-consumption-guidance');
    if (guide) {
      guide.classList.remove('fuel-guidance-success', 'fuel-guidance-warning');
      if (consumption.source === 'measured') {
        const target = root.FuelModule.efficiencyToKmPerGallon(
          vehicle.targetEfficiency,
          vehicle.distanceUnit,
          vehicle.volumeUnit
        );
        const difference = target > 0 ? (consumption.avgConsumption - target) / target * 100 : 0;
        const intervalText = `${consumption.completedIntervals} ${consumption.completedIntervals === 1 ? 'intervalo completo' : 'intervalos completos'}`;
        if (difference < -5) {
          guide.classList.add('fuel-guidance-warning');
          guide.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i><p>El rendimiento está ${decimal(Math.abs(difference), 0)}% por debajo de tu meta, calculado con ${intervalText}. Conviene observar tráfico, carga y presión de llantas.</p>`;
        } else {
          guide.classList.add('fuel-guidance-success');
          guide.innerHTML = difference > 5
            ? `<i class="fa-solid fa-circle-check"></i><p>El vehículo rinde ${decimal(difference, 0)}% mejor que tu meta, calculado con ${intervalText}.</p>`
            : `<i class="fa-solid fa-circle-check"></i><p>El rendimiento está dentro de tu meta, calculado con ${intervalText}.</p>`;
        }
      } else {
        guide.innerHTML = '<i class="fa-solid fa-circle-info"></i><p>Para medir el consumo real, marca dos cargas completas e ingresa el kilometraje.</p>';
      }
    }
  }

  function renderSpendChart() {
    const chart = byId('fuel-spend-chart');
    const empty = byId('fuel-chart-empty');
    if (!chart || !empty) return;
    const series = root.FuelModule.getMonthlySeries(6);
    const maximum = Math.max(...series.map(item => item.amount), 0);
    const hasData = maximum > 0;
    chart.classList.toggle('hidden', !hasData);
    empty.classList.toggle('hidden', hasData);
    chart.innerHTML = hasData ? series.map(item => {
      const height = item.amount > 0 ? Math.max(8, item.amount / maximum * 100) : 3;
      return `
        <div class="fuel-chart-column" title="${safe(item.label)}: ${safe(money(item.amount))}">
          <span class="fuel-chart-value">${item.amount ? safe(money(item.amount).replace('.00', '')) : '—'}</span>
          <div class="fuel-chart-track"><span style="height:${height}%"></span></div>
          <strong>${safe(item.label)}</strong>
        </div>`;
    }).join('') : '';
  }

  function sourceState() {
    const source = root.FuelModule.getPriceSource();
    const badge = byId('fuel-source-badge');
    if (!badge) return source;
    badge.classList.remove('fuel-source-loading', 'fuel-source-official', 'fuel-source-cache', 'fuel-source-error');
    if (source.status === 'official') {
      badge.classList.add('fuel-source-official');
      badge.innerHTML = '<span class="fuel-status-dot"></span> SEN confirmado';
    } else if (source.status === 'offline-cache') {
      badge.classList.add('fuel-source-cache');
      badge.innerHTML = '<span class="fuel-status-dot"></span> Última copia oficial';
    } else {
      badge.classList.add('fuel-source-error');
      badge.innerHTML = '<span class="fuel-status-dot"></span> SEN no disponible';
    }
    return source;
  }

  function renderOfficialStatus() {
    const source = sourceState();
    const from = localDate(source.effectiveFrom, { day: 'numeric', month: 'short' });
    const until = localDate(source.effectiveUntil, { day: 'numeric', month: 'short', year: 'numeric' });
    if (source.status === 'official') {
      text('fuel-official-status', 'Precios oficiales confirmados');
      text('fuel-official-period', source.effectiveFrom ? `Vigentes del ${from} al ${until} · ${source.rowCount} precios publicados.` : `Última actualización: ${localDate(source.updatedAt, { dateStyle: 'medium' })}.`);
    } else if (source.status === 'offline-cache') {
      text('fuel-official-status', 'Mostrando la última copia oficial');
      text('fuel-official-period', `Sin conexión para comprobar cambios · copia del ${localDate(source.updatedAt, { dateStyle: 'medium' })}.`);
    } else {
      text('fuel-official-status', 'Aún no hay datos oficiales confirmados');
      text('fuel-official-period', 'OAVIX volverá a consultar automáticamente sin reemplazar datos con una tabla vacía.');
    }
  }

  function populatePriceFilters() {
    const departmentSelect = byId('fuel-price-department');
    const productSelect = byId('fuel-price-product');
    if (!departmentSelect || !productSelect) return;
    const prefs = root.FuelModule.getPreferences();
    const departments = root.FuelModule.getDepartments();
    const selectedDepartment = departments.includes(prefs.priceDepartment)
      ? prefs.priceDepartment
      : departments[0] || prefs.priceDepartment;
    departmentSelect.innerHTML = departments.map(department =>
      `<option value="${safe(department)}" ${department === selectedDepartment ? 'selected' : ''}>${safe(department)}</option>`
    ).join('');
    productSelect.innerHTML = root.FuelModule.getProducts().map(product =>
      `<option value="${safe(product.id)}" ${product.id === prefs.priceProduct ? 'selected' : ''}>${safe(product.label)}</option>`
    ).join('');
    if (selectedDepartment && selectedDepartment !== prefs.priceDepartment) {
      root.FuelModule.setPreferences({ priceDepartment: selectedDepartment });
    }
  }

  function renderFuelPrices() {
    if (!moduleReady()) return;
    const grid = byId('fuel-prices-grid');
    const empty = byId('fuel-prices-empty');
    const departmentSelect = byId('fuel-price-department');
    const productSelect = byId('fuel-price-product');
    if (!grid || !empty || !departmentSelect || !productSelect) return;
    const search = String(byId('fuel-price-search')?.value || '').trim().toLocaleLowerCase('es');
    const active = root.FuelModule.getActiveVehicle();
    const product = productSelect.value;
    const rows = root.FuelModule.getPriceRows({ department: departmentSelect.value, product })
      .filter(row => !search || row.municipality.toLocaleLowerCase('es').includes(search));
    const productLabel = root.FuelModule.productInfo(product).label;

    text('fuel-price-result-count', `${rows.length} ${rows.length === 1 ? 'municipio' : 'municipios'}`);
    empty.classList.toggle('hidden', rows.length > 0);
    grid.classList.toggle('hidden', rows.length === 0);
    grid.innerHTML = rows.map(row => {
      const delta = row.delta;
      const movement = delta === null
        ? '<span class="fuel-price-delta fuel-delta-neutral"><i class="fa-solid fa-minus"></i> Sin comparación</span>'
        : Math.abs(delta) < 0.005
          ? '<span class="fuel-price-delta fuel-delta-neutral"><i class="fa-solid fa-equals"></i> Sin cambio</span>'
          : delta > 0
            ? `<span class="fuel-price-delta fuel-delta-up"><i class="fa-solid fa-arrow-up"></i> ${safe(money(Math.abs(delta)))}</span>`
            : `<span class="fuel-price-delta fuel-delta-down"><i class="fa-solid fa-arrow-down"></i> ${safe(money(Math.abs(delta)))}</span>`;
      const preferred = active && active.municipality === row.municipality && active.department === row.department;
      return `
        <button type="button" class="fuel-price-card ${preferred ? 'preferred' : ''}"
          data-department="${safe(row.department)}" data-municipality="${safe(row.municipality)}"
          data-product="${safe(row.product)}" onclick="showFuelMapFromCard(this)">
          <span class="fuel-price-location"><i class="fa-solid fa-location-dot"></i>${safe(row.municipality)}</span>
          ${preferred ? '<span class="fuel-preferred-label">Tu ubicación</span>' : ''}
          <strong>${safe(money(row.pricePerGallon))}</strong>
          <small>por galón · ${safe(money(row.pricePerLiter))} por litro</small>
          <span class="fuel-price-card-footer">${movement}<span><i class="fa-solid fa-map"></i> Mapa</span></span>
        </button>`;
    }).join('');
    text('fuel-map-subtitle', selectedMapRow ? `${productLabel} · ${money(selectedMapRow.pricePerGallon)} por galón` : '—');
  }

  function historyBounds(range) {
    const now = new Date();
    if (range === 'month') return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    if (range === 'year') return `${now.getFullYear()}-01-01`;
    return '';
  }

  function renderFuelHistory() {
    if (!moduleReady()) return;
    const list = byId('fuel-history-list');
    const empty = byId('fuel-history-empty');
    if (!list || !empty) return;
    const prefs = root.FuelModule.getPreferences();
    const select = byId('fuel-history-range');
    if (select) select.value = prefs.historyRange || 'all';
    const records = root.FuelModule.getFuelHistory({ from: historyBounds(prefs.historyRange) });
    const vehicle = root.FuelModule.getActiveVehicle();
    const total = records.reduce((sum, record) => sum + record.amountPaid, 0);
    text('fuel-history-summary', records.length
      ? `${records.length} ${records.length === 1 ? 'carga' : 'cargas'} · ${money(total)}`
      : 'Todavía no hay cargas en este periodo.');
    list.classList.toggle('hidden', records.length === 0);
    empty.classList.toggle('hidden', records.length > 0);
    list.innerHTML = records.map(record => {
      const unitPrice = record.volume > 0 ? record.amountPaid / record.volume : 0;
      const distanceLabel = record.odometer > 0 ? `${decimal(record.odometer, 1)} ${record.distanceUnit}` : 'Sin kilometraje';
      return `
        <article class="fuel-history-item">
          <div class="fuel-history-date">
            <strong>${safe(localDate(record.date, { day: '2-digit' }))}</strong>
            <span>${safe(localDate(record.date, { month: 'short' }))}</span>
          </div>
          <div class="fuel-history-body">
            <div class="fuel-history-main">
              <div>
                <h4>${safe(root.FuelModule.productInfo(record.fuelType).label)}</h4>
                <p>${safe(decimal(record.volume, 2))} ${safe(unitName(record.volumeUnit, true))} · ${safe(distanceLabel)}</p>
              </div>
              <strong>${safe(money(record.amountPaid))}</strong>
            </div>
            <div class="fuel-history-meta">
              ${record.fullTank ? '<span class="fuel-full-badge"><i class="fa-solid fa-fill-drip"></i> Tanque lleno</span>' : '<span><i class="fa-solid fa-gauge-simple"></i> Carga parcial</span>'}
              <span>${safe(money(unitPrice))}/${safe(unitName(record.volumeUnit))}</span>
              ${record.station ? `<span><i class="fa-solid fa-store"></i> ${safe(record.station)}</span>` : ''}
            </div>
            ${record.notes ? `<p class="fuel-history-notes">${safe(record.notes)}</p>` : ''}
          </div>
          <div class="fuel-history-controls">
            <button type="button" data-record-id="${safe(record.id)}" onclick="editFuelFillFromButton(this)" aria-label="Editar carga"><i class="fa-solid fa-pen"></i></button>
            <button type="button" class="danger" data-record-id="${safe(record.id)}" onclick="removeFuelFillFromButton(this)" aria-label="Eliminar carga"><i class="fa-solid fa-trash"></i></button>
          </div>
        </article>`;
    }).join('');
    if (vehicle) text('fuel-fill-distance-unit', vehicle.distanceUnit);
  }

  function switchFuelPanel(panel, save = true) {
    const selected = PANELS.includes(panel) ? panel : 'overview';
    PANELS.forEach(name => {
      const tab = byId(`fuel-tab-${name}`);
      const target = byId(`fuel-panel-${name}`);
      const active = name === selected;
      if (tab) {
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', String(active));
      }
      if (target) target.classList.toggle('hidden', !active);
    });
    if (save && moduleReady()) root.FuelModule.setPreferences({ panel: selected });
    if (selected === 'prices') renderFuelPrices();
    if (selected === 'history') renderFuelHistory();
  }

  function renderFuelModule(options = {}) {
    if (!moduleReady() || !byId('subtab-fuel')) return;
    const prefs = root.FuelModule.getPreferences();
    renderVehiclePicker();
    renderMetricCards();
    renderSpendChart();
    renderOfficialStatus();
    populatePriceFilters();
    renderFuelPrices();
    renderFuelHistory();
    switchFuelPanel(options.preservePanel ? prefs.panel : prefs.panel || 'overview', false);
    bindFuelInputs();
  }

  function selectFuelVehicle(id) {
    if (!root.FuelModule.setActiveVehicle(id)) return;
    selectedMapRow = null;
    closeFuelMap();
    renderFuelModule({ preservePanel: true });
  }

  function changeFuelPriceDepartment(value) {
    root.FuelModule.setPreferences({ priceDepartment: value });
    closeFuelMap();
    renderFuelPrices();
  }

  function changeFuelPriceProduct(value) {
    root.FuelModule.setPreferences({ priceProduct: value });
    closeFuelMap();
    renderFuelPrices();
  }

  function changeFuelHistoryRange(value) {
    root.FuelModule.setPreferences({ historyRange: value });
    renderFuelHistory();
  }

  async function refreshFuelPrices() {
    const button = byId('fuel-refresh-prices');
    if (button) {
      button.disabled = true;
      button.classList.add('loading');
    }
    notify('Comprobando precios', 'Consultando la publicación oficial de la SEN…', 'cyan');
    const success = await root.FuelModule.refreshPrices();
    renderFuelModule({ preservePanel: true });
    if (button) {
      button.disabled = false;
      button.classList.remove('loading');
    }
    notify(
      success ? 'Precios confirmados' : 'No se pudo comprobar',
      success ? 'OAVIX está usando la publicación oficial más reciente.' : 'Se conserva la última copia oficial disponible.',
      success ? 'emerald' : 'amber'
    );
  }

  function calculateFuelTrip(event) {
    event.preventDefault();
    const vehicle = root.FuelModule.getActiveVehicle();
    const priceContext = activePriceContext(vehicle);
    const result = root.FuelModule.calculateTrip({
      distance: byId('fuel-trip-distance').value,
      distanceUnit: vehicle.distanceUnit,
      roundTrip: byId('fuel-trip-round').checked,
      pricePerGallon: priceContext.price
    });
    if (!result) {
      notify('Falta información', 'Configura el rendimiento y espera un precio oficial o registra una carga.', 'amber');
      return;
    }
    text('fuel-trip-cost', money(result.cost));
    text('fuel-trip-detail', `${decimal(result.volume, 2)} ${unitName(result.volumeUnit, true)} · ${decimal(result.distance, 1)} ${result.distanceUnit} · ${result.source === 'measured' ? 'consumo real' : 'estimación'}`);
    byId('fuel-trip-result').classList.remove('hidden');
  }

  function calculateFuelBudget(event) {
    event.preventDefault();
    const vehicle = root.FuelModule.getActiveVehicle();
    const priceContext = activePriceContext(vehicle);
    const result = root.FuelModule.calculateBudget({
      budget: byId('fuel-budget-amount').value,
      pricePerGallon: priceContext.price
    });
    if (!result) {
      notify('Falta información', 'Configura el rendimiento y espera un precio oficial o registra una carga.', 'amber');
      return;
    }
    text('fuel-budget-distance', `${decimal(result.distance, 0)} ${result.distanceUnit}`);
    text('fuel-budget-detail', `${decimal(result.volume, 2)} ${unitName(result.volumeUnit, true)} · ${result.source === 'measured' ? 'consumo real' : 'estimación'}`);
    byId('fuel-budget-result').classList.remove('hidden');
  }

  function showFuelMap(department, municipality, product) {
    const row = root.FuelModule.getOfficialPrice(department, municipality, product);
    if (!row) return;
    selectedMapRow = row;
    text('fuel-map-title', `${row.municipality}, ${row.department}`);
    text('fuel-map-subtitle', `${root.FuelModule.productInfo(row.product).label} · ${money(row.pricePerGallon)} por galón`);
    const frame = byId('fuel-map-frame');
    if (frame) {
      if (Number.isFinite(row.lat) && Number.isFinite(row.lng) && row.lat !== 0 && row.lng !== 0) {
        const margin = 0.08;
        const bbox = [row.lng - margin, row.lat - margin, row.lng + margin, row.lat + margin].join('%2C');
        frame.innerHTML = `<iframe loading="lazy" title="Mapa de ${safe(row.municipality)}" src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&amp;layer=mapnik&amp;marker=${row.lat}%2C${row.lng}"></iframe>`;
      } else {
        frame.innerHTML = '<div class="fuel-map-unavailable"><i class="fa-solid fa-map-location-dot"></i><p>La SEN no publicó coordenadas válidas para esta ubicación.</p></div>';
      }
    }
    byId('fuel-map-card')?.classList.remove('hidden');
    byId('fuel-map-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function showFuelMapFromCard(button) {
    if (!button || !button.dataset) return;
    showFuelMap(button.dataset.department, button.dataset.municipality, button.dataset.product);
  }

  function closeFuelMap() {
    byId('fuel-map-card')?.classList.add('hidden');
    const frame = byId('fuel-map-frame');
    if (frame) frame.innerHTML = '';
    selectedMapRow = null;
  }

  function toggleFuelOfficialSource() {
    const container = byId('fuel-official-frame');
    if (!container) return;
    const opening = container.classList.contains('hidden');
    if (opening && !container.querySelector('iframe')) {
      container.innerHTML = `<iframe loading="lazy" title="Tablero oficial de precios de la SEN" src="${safe(root.FuelModule.getOfficialSourceUrl())}" allowfullscreen></iframe>`;
    }
    container.classList.toggle('hidden', !opening);
    text('fuel-source-button-label', opening ? 'Cerrar fuente oficial' : 'Abrir fuente oficial');
    if (opening) container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function modalState(id, open) {
    const modal = byId(id);
    if (!modal) return;
    modal.classList.toggle('hidden', !open);
    document.body.classList.toggle('fuel-modal-open', open || Boolean(document.querySelector('.fuel-modal:not(.hidden)')));
  }

  function populateFillVehicles(selectedId) {
    const select = byId('fuel-fill-vehicle');
    if (!select) return;
    select.innerHTML = root.FuelModule.getVehicles().map(vehicle =>
      `<option value="${safe(vehicle.id)}" ${vehicle.id === selectedId ? 'selected' : ''}>${safe(vehicle.name)}</option>`
    ).join('');
    select.onchange = updateFuelFillVehicleUnits;
  }

  function updateFuelFillVehicleUnits() {
    const vehicle = root.FuelModule.getVehicle(byId('fuel-fill-vehicle')?.value) || root.FuelModule.getActiveVehicle();
    if (!vehicle) return;
    text('fuel-fill-distance-unit', vehicle.distanceUnit);
    text('fuel-fill-volume-unit', vehicle.volumeUnit === 'l' ? 'L' : 'gal');
    updateFuelFillSummary();
  }

  function updateFuelFillSummary() {
    const amount = Number(byId('fuel-fill-amount')?.value || 0);
    const volume = Number(byId('fuel-fill-volume')?.value || 0);
    const vehicle = root.FuelModule.getVehicle(byId('fuel-fill-vehicle')?.value) || root.FuelModule.getActiveVehicle();
    const summary = byId('fuel-fill-live-summary');
    if (!summary || !vehicle) return;
    summary.innerHTML = `<span>Precio por ${vehicle.volumeUnit === 'l' ? 'litro' : 'galón'}</span><strong>${amount > 0 && volume > 0 ? safe(money(amount / volume)) : '—'}</strong>`;
  }

  function openFuelFillModal(recordId = '') {
    const active = root.FuelModule.getActiveVehicle();
    const record = recordId ? root.FuelModule.getFuelRecord(recordId) : null;
    byId('fuel-fill-form')?.reset();
    byId('fuel-fill-id').value = record ? record.id : '';
    text('fuel-fill-modal-title', record ? 'Editar carga' : 'Registrar carga');
    populateFillVehicles(record ? record.vehicleId : active.id);
    byId('fuel-fill-date').value = record ? record.date : new Date().toISOString().slice(0, 10);
    byId('fuel-fill-odometer').value = record && record.odometer ? record.odometer : '';
    byId('fuel-fill-volume').value = record ? record.volume : '';
    byId('fuel-fill-amount').value = record ? record.amountPaid : '';
    byId('fuel-fill-station').value = record ? record.station : '';
    byId('fuel-fill-notes').value = record ? record.notes : '';
    byId('fuel-fill-full-tank').checked = Boolean(record && record.fullTank);
    updateFuelFillVehicleUnits();
    modalState('fuel-fill-modal', true);
    setTimeout(() => byId('fuel-fill-volume')?.focus(), 50);
  }

  function closeFuelFillModal() {
    modalState('fuel-fill-modal', false);
  }

  function saveFuelFill(event) {
    event.preventDefault();
    const vehicle = root.FuelModule.getVehicle(byId('fuel-fill-vehicle').value);
    const fullTank = byId('fuel-fill-full-tank').checked;
    const odometer = Number(byId('fuel-fill-odometer').value || 0);
    if (fullTank && odometer <= 0) {
      notify('Falta el kilometraje', 'Para calcular el consumo real de un tanque lleno necesitamos leer el odómetro.', 'amber');
      byId('fuel-fill-odometer').focus();
      return;
    }
    const saved = root.FuelModule.saveFuelRecord({
      id: byId('fuel-fill-id').value || undefined,
      vehicleId: vehicle.id,
      date: byId('fuel-fill-date').value,
      odometer,
      distanceUnit: vehicle.distanceUnit,
      volume: byId('fuel-fill-volume').value,
      volumeUnit: vehicle.volumeUnit,
      amountPaid: byId('fuel-fill-amount').value,
      fullTank,
      department: vehicle.department,
      municipality: vehicle.municipality,
      station: byId('fuel-fill-station').value,
      notes: byId('fuel-fill-notes').value,
      fuelType: vehicle.fuelType
    });
    if (!saved) {
      notify('No se pudo guardar', 'Revisa la cantidad y el total pagado.', 'rose');
      return;
    }
    root.FuelModule.setActiveVehicle(vehicle.id);
    closeFuelFillModal();
    renderFuelModule({ preservePanel: true });
    notify('Carga guardada', 'El resumen y el historial ya fueron actualizados.', 'emerald');
  }

  function removeFuelFill(id) {
    if (!root.confirm('¿Eliminar esta carga? El cálculo de consumo se actualizará.')) return;
    if (!root.FuelModule.deleteFuelRecord(id)) return;
    renderFuelModule({ preservePanel: true });
    notify('Carga eliminada', 'El historial y los cálculos fueron actualizados.', 'emerald');
  }

  function editFuelFillFromButton(button) {
    openFuelFillModal(button?.dataset?.recordId || '');
  }

  function removeFuelFillFromButton(button) {
    removeFuelFill(button?.dataset?.recordId || '');
  }

  function fallbackDepartments(current) {
    const official = root.FuelModule.getDepartments();
    return [...new Set([...official, current, ...DEPARTMENTS].filter(Boolean))]
      .sort((first, second) => first.localeCompare(second, 'es'));
  }

  function populateFuelVehicleDepartments(current) {
    const select = byId('fuel-vehicle-department');
    if (!select) return;
    select.innerHTML = fallbackDepartments(current).map(department =>
      `<option value="${safe(department)}" ${department === current ? 'selected' : ''}>${safe(department)}</option>`
    ).join('');
  }

  function populateFuelVehicleMunicipalities(current) {
    const department = byId('fuel-vehicle-department')?.value;
    const select = byId('fuel-vehicle-municipality');
    if (!select) return;
    const existing = current || select.value;
    const municipalities = root.FuelModule.getMunicipalities(department);
    const options = [...new Set([existing, ...municipalities].filter(Boolean))]
      .sort((first, second) => first.localeCompare(second, 'es'));
    if (!options.length) options.push('Municipio por definir');
    select.innerHTML = options.map(municipality =>
      `<option value="${safe(municipality)}" ${municipality === existing ? 'selected' : ''}>${safe(municipality)}</option>`
    ).join('');
  }

  function populateVehicleProducts(selected) {
    byId('fuel-vehicle-product').innerHTML = root.FuelModule.getProducts()
      .filter(product => product.id !== 'KEROSENE')
      .map(product => `<option value="${safe(product.id)}" ${product.id === selected ? 'selected' : ''}>${safe(product.label)}</option>`)
      .join('');
  }

  function updateFuelVehicleUnitLabels(convertValues = true) {
    const distance = byId('fuel-vehicle-distance-unit')?.value || 'km';
    const volume = byId('fuel-vehicle-volume-unit')?.value || 'gal';
    if (convertValues && moduleReady() &&
        (distance !== vehicleFormUnits.distance || volume !== vehicleFormUnits.volume)) {
      const tankInput = byId('fuel-vehicle-tank');
      const efficiencyInput = byId('fuel-vehicle-efficiency');
      const tankGallons = root.FuelModule.toGallons(tankInput?.value, vehicleFormUnits.volume);
      const efficiencyKmPerGallon = root.FuelModule.efficiencyToKmPerGallon(
        efficiencyInput?.value,
        vehicleFormUnits.distance,
        vehicleFormUnits.volume
      );
      if (tankInput && tankGallons > 0) {
        tankInput.value = Number(root.FuelModule.fromGallons(tankGallons, volume).toFixed(2));
      }
      if (efficiencyInput && efficiencyKmPerGallon > 0) {
        efficiencyInput.value = Number(root.FuelModule.efficiencyFromKmPerGallon(
          efficiencyKmPerGallon,
          distance,
          volume
        ).toFixed(2));
      }
    }
    vehicleFormUnits = { distance, volume };
    text('fuel-vehicle-tank-unit', volume === 'l' ? 'L' : 'gal');
    text('fuel-vehicle-efficiency-unit', `${distance}/${volume === 'l' ? 'L' : 'gal'}`);
  }

  function renderArchivedVehicles() {
    const section = byId('fuel-archived-section');
    const list = byId('fuel-archived-list');
    if (!section || !list) return;
    const archived = root.FuelModule.getVehicles(true).filter(vehicle => vehicle.archived);
    section.classList.toggle('hidden', archived.length === 0);
    list.innerHTML = archived.map(vehicle => `
      <button type="button" data-vehicle-id="${safe(vehicle.id)}" onclick="restoreFuelVehicleFromButton(this)">
        <span><i class="fa-solid ${vehicle.type === 'motorcycle' ? 'fa-motorcycle' : 'fa-car-side'}"></i> ${safe(vehicle.name)}</span>
        <strong>Restaurar</strong>
      </button>`).join('');
  }

  function fillVehicleForm(vehicle) {
    const source = vehicle || {
      id: '', name: '', type: 'car', fuelType: 'REGULAR', distanceUnit: 'km', volumeUnit: 'gal',
      tankCapacity: 15, targetEfficiency: 35, department: 'Francisco Morazán', municipality: 'Distrito Central'
    };
    byId('fuel-vehicle-form')?.reset();
    byId('fuel-vehicle-id').value = source.id || '';
    byId('fuel-vehicle-name').value = source.name || '';
    const type = document.querySelector(`input[name="fuel-vehicle-type"][value="${source.type}"]`);
    if (type) type.checked = true;
    populateVehicleProducts(source.fuelType);
    byId('fuel-vehicle-distance-unit').value = source.distanceUnit;
    byId('fuel-vehicle-volume-unit').value = source.volumeUnit;
    byId('fuel-vehicle-tank').value = source.tankCapacity;
    byId('fuel-vehicle-efficiency').value = source.targetEfficiency;
    populateFuelVehicleDepartments(source.department);
    populateFuelVehicleMunicipalities(source.municipality);
    vehicleFormUnits = { distance: source.distanceUnit, volume: source.volumeUnit };
    updateFuelVehicleUnitLabels(false);
    renderArchivedVehicles();
    const archive = byId('fuel-archive-vehicle');
    if (archive) archive.classList.toggle('hidden', !source.id || root.FuelModule.getVehicles().length <= 1);
    text('fuel-vehicle-modal-title', source.id ? 'Editar vehículo' : 'Nuevo vehículo');
  }

  function openFuelVehicleModal(id = '') {
    const vehicle = id ? root.FuelModule.getVehicle(id) : root.FuelModule.getActiveVehicle();
    fillVehicleForm(vehicle);
    modalState('fuel-vehicle-modal', true);
    setTimeout(() => byId('fuel-vehicle-name')?.focus(), 50);
  }

  function startNewFuelVehicle() {
    fillVehicleForm(null);
    setTimeout(() => byId('fuel-vehicle-name')?.focus(), 20);
  }

  function closeFuelVehicleModal() {
    modalState('fuel-vehicle-modal', false);
  }

  function saveFuelVehicle(event) {
    event.preventDefault();
    const type = document.querySelector('input[name="fuel-vehicle-type"]:checked')?.value || 'car';
    const vehicle = root.FuelModule.saveVehicle({
      id: byId('fuel-vehicle-id').value || undefined,
      name: byId('fuel-vehicle-name').value,
      type,
      fuelType: byId('fuel-vehicle-product').value,
      distanceUnit: byId('fuel-vehicle-distance-unit').value,
      volumeUnit: byId('fuel-vehicle-volume-unit').value,
      tankCapacity: byId('fuel-vehicle-tank').value,
      targetEfficiency: byId('fuel-vehicle-efficiency').value,
      department: byId('fuel-vehicle-department').value,
      municipality: byId('fuel-vehicle-municipality').value
    });
    if (!vehicle) {
      notify('No se pudo guardar', 'Revisa el nombre y los valores del vehículo.', 'rose');
      return;
    }
    closeFuelVehicleModal();
    renderFuelModule({ preservePanel: true });
    notify('Vehículo guardado', `${vehicle.name} quedó activo y se sincronizará con tu cuenta.`, 'emerald');
  }

  function archiveCurrentFuelVehicle() {
    const id = byId('fuel-vehicle-id').value;
    const vehicle = root.FuelModule.getVehicle(id);
    if (!vehicle || !root.confirm(`¿Archivar ${vehicle.name}? Su historial no se borrará.`)) return;
    if (!root.FuelModule.archiveVehicle(id)) {
      notify('No se puede archivar', 'Debe quedar al menos un vehículo activo.', 'amber');
      return;
    }
    closeFuelVehicleModal();
    renderFuelModule({ preservePanel: true });
    notify('Vehículo archivado', 'Sus cargas permanecen guardadas.', 'emerald');
  }

  function restoreFuelVehicleFromButton(button) {
    const id = button?.dataset?.vehicleId || '';
    const vehicle = root.FuelModule.getVehicle(id);
    if (!vehicle || !root.FuelModule.restoreVehicle(id)) return;
    fillVehicleForm(root.FuelModule.getVehicle(id));
    renderFuelModule({ preservePanel: true });
    notify('Vehículo restaurado', `${vehicle.name} volvió a quedar disponible con todo su historial.`, 'emerald');
  }

  function bindFuelInputs() {
    if (initialized) return;
    initialized = true;
    ['fuel-fill-volume', 'fuel-fill-amount'].forEach(id => {
      byId(id)?.addEventListener('input', updateFuelFillSummary);
    });
    document.querySelectorAll('input[name="fuel-vehicle-type"]').forEach(input => {
      input.addEventListener('change', () => {
        if (byId('fuel-vehicle-id')?.value) return;
        const motorcycle = input.value === 'motorcycle' && input.checked;
        if (motorcycle) {
          byId('fuel-vehicle-tank').value = '4';
          byId('fuel-vehicle-efficiency').value = '120';
        } else if (input.checked) {
          byId('fuel-vehicle-tank').value = '15';
          byId('fuel-vehicle-efficiency').value = '35';
        }
      });
    });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      closeFuelFillModal();
      closeFuelVehicleModal();
    });
  }

  root.renderFuelModule = renderFuelModule;
  root.renderFuelPrices = renderFuelPrices;
  root.renderFuelHistory = renderFuelHistory;
  root.switchFuelPanel = switchFuelPanel;
  root.selectFuelVehicle = selectFuelVehicle;
  root.changeFuelPriceDepartment = changeFuelPriceDepartment;
  root.changeFuelPriceProduct = changeFuelPriceProduct;
  root.changeFuelHistoryRange = changeFuelHistoryRange;
  root.refreshFuelPrices = refreshFuelPrices;
  root.calculateFuelTrip = calculateFuelTrip;
  root.calculateFuelBudget = calculateFuelBudget;
  root.showFuelMap = showFuelMap;
  root.showFuelMapFromCard = showFuelMapFromCard;
  root.closeFuelMap = closeFuelMap;
  root.toggleFuelOfficialSource = toggleFuelOfficialSource;
  root.openFuelFillModal = openFuelFillModal;
  root.closeFuelFillModal = closeFuelFillModal;
  root.updateFuelFillVehicleUnits = updateFuelFillVehicleUnits;
  root.saveFuelFill = saveFuelFill;
  root.removeFuelFill = removeFuelFill;
  root.editFuelFillFromButton = editFuelFillFromButton;
  root.removeFuelFillFromButton = removeFuelFillFromButton;
  root.openFuelVehicleModal = openFuelVehicleModal;
  root.startNewFuelVehicle = startNewFuelVehicle;
  root.closeFuelVehicleModal = closeFuelVehicleModal;
  root.populateFuelVehicleMunicipalities = populateFuelVehicleMunicipalities;
  root.updateFuelVehicleUnitLabels = updateFuelVehicleUnitLabels;
  root.saveFuelVehicle = saveFuelVehicle;
  root.archiveCurrentFuelVehicle = archiveCurrentFuelVehicle;
  root.restoreFuelVehicleFromButton = restoreFuelVehicleFromButton;
})(window);
