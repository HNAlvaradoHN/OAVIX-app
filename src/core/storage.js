    function seedData() {
      autoRecords = [
        { id: '1', title: 'Cambio de Aceite Sintético', category: 'Cambio de Aceite', amount: 60.00, currency: 'USD', mileage: 86000, provider: 'Taller San Pedro', date: '2026-06-01', notes: 'Filtro nuevo', photo: '', validated: false }
      ];
      saveAll();
    }

    function saveAll() {
      localStorage.setItem('oavix_auto_records', JSON.stringify(autoRecords));
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
