const DEFAULT_MAINTENANCE_CATEGORIES = [
  'Mantenimiento General',
  'Cambio de Aceite',
  'Llantas / Frenos',
  'Combustible',
  'Reparaciones'
];
const MAINTENANCE_CATEGORY_KEY = 'oavix_auto_categories';
const MAINTENANCE_CATEGORY_INIT_KEY = 'oavix_auto_categories_initialized';
const MAINTENANCE_IMAGE_MAX_EDGE = 1280;
const MAINTENANCE_IMAGE_MIN_EDGE = 720;
const MAINTENANCE_IMAGE_TARGET_BYTES = 180 * 1024;
const MAINTENANCE_IMAGE_MAX_BYTES = 300 * 1024;
const MAINTENANCE_IMAGE_QUALITIES = [0.78, 0.66, 0.54, 0.44];

function repairMaintenanceCategories() {
      let stored = null;
      try {
        stored = JSON.parse(localStorage.getItem(MAINTENANCE_CATEGORY_KEY));
      } catch (_) {
        stored = null;
      }

      const userManaged = localStorage.getItem(MAINTENANCE_CATEGORY_INIT_KEY) === 'true';
      if (!Array.isArray(stored) || (stored.length === 0 && !userManaged)) {
        stored = DEFAULT_MAINTENANCE_CATEGORIES.slice();
        localStorage.setItem(MAINTENANCE_CATEGORY_KEY, JSON.stringify(stored));
      }

      autoCategories.splice(0, autoCategories.length, ...stored);
      localStorage.setItem(MAINTENANCE_CATEGORY_INIT_KEY, 'true');
    }

    repairMaintenanceCategories();

    function setupCategoryDropdowns() {
      const filterSel = document.getElementById('filter-category');
      const formSel = document.getElementById('form-category');
      const makeOption = (label, value) => {
        const option = document.createElement('option');
        option.textContent = label;
        option.value = value;
        return option;
      };

      if (filterSel) {
        filterSel.replaceChildren(makeOption('Todas las Categorías', 'ALL'));
        autoCategories.forEach(category => filterSel.add(makeOption(String(category), String(category))));
      }

      if (formSel) {
        formSel.replaceChildren();
        autoCategories.forEach(category => formSel.add(makeOption(String(category), String(category))));
        const manage = makeOption('+ Agregar / Gestionar Categorías...', '__ADD_NEW__');
        manage.className = 'text-cyan-400 font-black';
        formSel.add(manage);
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
          <span>${escapeHtml(cat)}</span>
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
      localStorage.setItem(MAINTENANCE_CATEGORY_INIT_KEY, 'true');
      input.value = '';
      renderCategoryManageList();
      setupCategoryDropdowns();
    }

    function deleteCategory(idx) {
      autoCategories.splice(idx, 1);
      localStorage.setItem('oavix_auto_categories', JSON.stringify(autoCategories));
      localStorage.setItem(MAINTENANCE_CATEGORY_INIT_KEY, 'true');
      renderCategoryManageList();
      setupCategoryDropdowns();
    }

    function maintenanceImageBytes(dataUrl) {
      const source = String(dataUrl || '');
      const separator = source.indexOf(',');
      if (separator < 0) return source.length;
      const payload = source.slice(separator + 1);
      const padding = (payload.match(/=*$/) || [''])[0].length;
      return Math.max(0, Math.ceil(payload.length * 3 / 4) - padding);
    }

    function maintenancePhotoSizeLabel(bytes) {
      if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    function setMaintenancePhotoState(busy, message, tone = 'muted') {
      const form = document.getElementById('record-form');
      const status = document.getElementById('photo-processing-status');
      const submit = document.getElementById('record-submit-button');
      if (form) form.dataset.photoProcessing = busy ? 'true' : 'false';
      if (submit) {
        submit.disabled = busy;
        submit.classList.toggle('opacity-50', busy);
        submit.classList.toggle('cursor-wait', busy);
      }
      if (status) {
        status.textContent = message;
        status.className = `text-[10px] font-extrabold ${
          tone === 'success' ? 'text-emerald-300' :
          tone === 'error' ? 'text-rose-300' :
          tone === 'working' ? 'text-cyan-300' : 'opacity-75'
        }`;
      }
    }

    function maintenancePhotoRequestId() {
      const form = document.getElementById('record-form');
      if (!form) return '';
      const id = `${Date.now()}-${Math.random()}`;
      form.dataset.photoRequestId = id;
      return id;
    }

    function isCurrentMaintenancePhotoRequest(id) {
      const form = document.getElementById('record-form');
      return Boolean(form && form.dataset.photoRequestId === id);
    }

    function decodeMaintenanceImage(file) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        let source = '';
        let release = () => {};

        if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
          source = URL.createObjectURL(file);
          release = () => URL.revokeObjectURL(source);
        } else {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('No se pudo leer la fotografía.'));
          reader.onload = () => { image.src = reader.result; };
          reader.readAsDataURL(file);
        }

        image.onload = () => resolve({ image, release });
        image.onerror = () => {
          release();
          reject(new Error('El formato de la fotografía no es compatible.'));
        };
        if (source) image.src = source;
      });
    }

    async function compressMaintenanceImage(file) {
      if (!file || !String(file.type || '').startsWith('image/')) {
        throw new Error('Selecciona un archivo de imagen válido.');
      }

      const decoded = await decodeMaintenanceImage(file);
      let best = '';
      let edge = MAINTENANCE_IMAGE_MAX_EDGE;

      try {
        for (let attempt = 0; attempt < 4; attempt += 1) {
          const sourceWidth = decoded.image.naturalWidth || decoded.image.width;
          const sourceHeight = decoded.image.naturalHeight || decoded.image.height;
          if (!sourceWidth || !sourceHeight) throw new Error('La fotografía no tiene dimensiones válidas.');

          const scale = Math.min(1, edge / Math.max(sourceWidth, sourceHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(sourceWidth * scale));
          canvas.height = Math.max(1, Math.round(sourceHeight * scale));
          const context = canvas.getContext('2d', { alpha: false });
          if (!context) throw new Error('El dispositivo no pudo preparar la fotografía.');

          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(decoded.image, 0, 0, canvas.width, canvas.height);

          for (const quality of MAINTENANCE_IMAGE_QUALITIES) {
            let candidate = canvas.toDataURL('image/webp', quality);
            if (!candidate.startsWith('data:image/webp')) {
              candidate = canvas.toDataURL('image/jpeg', quality);
            }
            best = candidate;
            if (maintenanceImageBytes(candidate) <= MAINTENANCE_IMAGE_TARGET_BYTES) return candidate;
          }

          edge = Math.max(MAINTENANCE_IMAGE_MIN_EDGE, Math.round(edge * 0.8));
        }

        if (best && maintenanceImageBytes(best) <= MAINTENANCE_IMAGE_MAX_BYTES) return best;
        throw new Error('La fotografía sigue siendo demasiado grande para guardarla.');
      } finally {
        decoded.release();
      }
    }

    async function previewImageFile(e) {
      const input = e.target;
      const file = input.files && input.files[0];
      if (!file) return;

      const requestId = maintenancePhotoRequestId();
      setMaintenancePhotoState(true, 'Optimizando la fotografía…', 'working');

      try {
        const optimized = await compressMaintenanceImage(file);
        if (!isCurrentMaintenancePhotoRequest(requestId)) return;

        currentBase64Image = optimized;
        document.getElementById('form-photo-url').value = '';
        document.getElementById('photo-preview').src = optimized;
        document.getElementById('photo-preview-container').classList.remove('hidden');
        setMaintenancePhotoState(
          false,
          `Foto optimizada: ${maintenancePhotoSizeLabel(file.size)} → ${maintenancePhotoSizeLabel(maintenanceImageBytes(optimized))}.`,
          'success'
        );
      } catch (error) {
        if (!isCurrentMaintenancePhotoRequest(requestId)) return;
        currentBase64Image = '';
        input.value = '';
        document.getElementById('photo-preview').removeAttribute('src');
        document.getElementById('photo-preview-container').classList.add('hidden');
        setMaintenancePhotoState(false, error.message || 'No se pudo preparar la fotografía.', 'error');
        showToast('Foto no agregada', error.message || 'No se pudo preparar la fotografía.', 'amber');
      }
    }

    function previewImageUrl(url) {
      maintenancePhotoRequestId();
      const source = String(url || '').trim();
      currentBase64Image = source;
      document.getElementById('form-photo-input').value = '';
      if (!source) {
        document.getElementById('photo-preview').removeAttribute('src');
        document.getElementById('photo-preview-container').classList.add('hidden');
        setMaintenancePhotoState(false, 'Las fotos del dispositivo se optimizan antes de guardarse.');
        return;
      }
      document.getElementById('photo-preview').src = source;
      document.getElementById('photo-preview-container').classList.remove('hidden');
      setMaintenancePhotoState(false, 'Enlace de imagen listo.', 'success');
    }

    function removePhoto() {
      maintenancePhotoRequestId();
      currentBase64Image = '';
      document.getElementById('form-photo-input').value = '';
      document.getElementById('form-photo-url').value = '';
      document.getElementById('photo-preview').removeAttribute('src');
      document.getElementById('photo-preview-container').classList.add('hidden');
      setMaintenancePhotoState(false, 'Las fotos del dispositivo se optimizan antes de guardarse.');
    }

    function openImageViewer(src) {
      const safeSource = safeImageSource(src);
      if (!safeSource) return;
      document.getElementById('image-viewer-src').src = safeSource;
      document.getElementById('modal-image-viewer').classList.remove('hidden');
    }

    function openImageViewerFromButton(button) {
      openImageViewer(button?.dataset.photo || '');
    }

    function maintenanceActionFromButton(button, action) {
      const id = decodeHtmlData(button?.dataset.recordId);
      if (!id) return;
      if (action === 'edit') openFormModal(id);
      else if (action === 'validate') toggleValidateRecord(id);
      else if (action === 'delete') deleteRecord(id);
    }

    function renderRecords() {
      const list = document.getElementById('records-list');
      const activeRecords = autoRecords.filter(r => !r.validated);

      if (activeRecords.length === 0) {
        list.innerHTML = `<p class="text-xs font-extrabold col-span-full opacity-90">No hay registros activos en el historial.</p>`;
        return;
      }

      list.innerHTML = activeRecords.map(r => {
        const photo = safeImageSource(r.photo);
        const encodedId = encodeHtmlData(r.id);
        return `
        <div data-maintenance-record-id="${encodedId}" class="animated-glass-card rounded-2xl p-4 shadow-lg space-y-2">
          <div class="min-h-14 flex justify-between items-start gap-3">
            <div class="min-w-0 flex-1">
              <h4 class="font-black text-sm truncate">${escapeHtml(r.title)}</h4>
              <span class="font-black text-cyan-400 text-sm">${formatMoney(r.amount, r.currency || 'USD')}</span>
            </div>
            ${photo ? `
              <button type="button" data-photo="${escapeHtml(photo)}" class="shrink-0 w-14 h-14 rounded-xl overflow-hidden cursor-zoom-in border-2 border-slate-500 shadow-lg group relative" onclick="openImageViewerFromButton(this)" aria-label="Ampliar foto de ${escapeHtml(r.title)}">
                <img src="${escapeHtml(photo)}" class="w-full h-full object-cover" alt="Vista previa de ${escapeHtml(r.title)}">
                <span class="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[9px] font-black transition">Ampliar</span>
              </button>
            ` : '<span class="shrink-0 w-14 h-14" aria-hidden="true"></span>'}
          </div>
          <div>
            <p class="text-xs font-extrabold opacity-90"><i class="fa-regular fa-calendar mr-1"></i>${escapeHtml(r.date)} | ${escapeHtml(r.category)}</p>
            ${r.notes ? `<p class="text-[11px] font-bold italic p-2 mt-2 rounded-lg bg-slate-900/20 line-clamp-2">${escapeHtml(r.notes)}</p>` : ''}
          </div>
          <div class="pt-2 border-t border-slate-600/60 flex justify-end space-x-2">
            <button data-record-id="${encodedId}" onclick="maintenanceActionFromButton(this, 'edit')" class="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 text-xs font-black">Editar</button>
            <button data-record-id="${encodedId}" onclick="maintenanceActionFromButton(this, 'validate')" class="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 text-xs font-black">Validar / Archivar</button>
            <button data-record-id="${encodedId}" onclick="maintenanceActionFromButton(this, 'delete')" class="px-2.5 py-1 rounded-lg bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 text-xs font-black">Eliminar</button>
          </div>
        </div>
      `; }).join('');
    }

    function startNewMaintenance() {
      switchSubTab('records');
      openFormModal();
    }

    function revealMaintenanceRecord(id) {
      const card = Array.from(document.querySelectorAll('[data-maintenance-record-id]'))
        .find(element => decodeHtmlData(element.dataset.maintenanceRecordId) === String(id));
      if (!card) return;

      card.classList.add('maintenance-record-highlight');
      if (typeof card.scrollIntoView === 'function') {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setTimeout(() => card.classList.remove('maintenance-record-highlight'), 2400);
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
          document.getElementById('form-notes').value = item.notes || '';

          if (item.photo) {
            currentBase64Image = item.photo;
            document.getElementById('photo-preview').src = item.photo;
            document.getElementById('photo-preview-container').classList.remove('hidden');
            setMaintenancePhotoState(false, 'Foto guardada y lista.', 'success');
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
      if (document.getElementById('record-form').dataset.photoProcessing === 'true') {
        showToast('Espera un momento', 'La fotografía todavía se está optimizando.', 'cyan');
        return;
      }

      const alertDate = document.getElementById('form-alert-date').value;

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
        alertDate,
        notes: document.getElementById('form-notes').value,
        photo: currentBase64Image,
        validated: false
      };

      const previousRecords = autoRecords.slice();
      const idx = autoRecords.findIndex(item => item.id === id);
      const isNewRecord = idx < 0;
      if (!isNewRecord) {
        r.validated = autoRecords[idx].validated;
        autoRecords[idx] = r;
      } else {
        autoRecords.unshift(r);
      }

      if (!saveAll()) {
        autoRecords = previousRecords;
        showToast(
          'No se pudo guardar',
          r.photo
            ? 'No hay espacio suficiente para esta foto. Quítala del formulario y vuelve a guardar; tus datos anteriores siguen intactos.'
            : 'No hay espacio suficiente en este dispositivo. Tus datos anteriores siguen intactos.',
          'rose'
        );
        return;
      }
      closeFormModal();
      removePhoto();
      renderStats();
      renderRecords();
      renderArchiveRecords();
      renderMileageComparison();
      renderCalendar();
      renderAlerts();
      if (isNewRecord) {
        switchSubTab('records');
        revealMaintenanceRecord(id);
      }
      showToast('Guardado', 'Mantenimiento registrado con éxito.', 'emerald');
    }
