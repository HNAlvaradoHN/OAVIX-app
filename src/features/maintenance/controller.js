const DEFAULT_MAINTENANCE_CATEGORIES = [
  'Mantenimiento General',
  'Cambio de Aceite',
  'Llantas / Frenos',
  'Combustible',
  'Reparaciones'
];
const MAINTENANCE_CATEGORY_KEY = 'oavix_auto_categories';
const MAINTENANCE_CATEGORY_INIT_KEY = 'oavix_auto_categories_initialized';

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
