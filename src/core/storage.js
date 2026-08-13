    function recordsStorageCheckpoint() {
      const runtime = typeof window !== 'undefined' && window.OAVIXSyncInternal;
      const syncContext = runtime && runtime.context;
      const direct = syncContext && syncContext.nativeStorage || {
        get: localStorage.getItem.bind(localStorage),
        set: localStorage.setItem.bind(localStorage),
        remove: localStorage.removeItem.bind(localStorage)
      };
      const keys = ['oavix_auto_records'];
      const accountEmail = syncContext && syncContext.state && syncContext.state.accountEmail;

      if (accountEmail) {
        keys.push(
          syncContext.metaKey(accountEmail),
          syncContext.localUpdatedKey(accountEmail),
          syncContext.constants.pendingKey
        );
      }

      return {
        direct,
        values: keys.map(key => [key, direct.get(key)])
      };
    }

    function restoreRecordsStorage(checkpoint) {
      checkpoint.values.forEach(([key, value]) => {
        if (value === null) checkpoint.direct.remove(key);
        else checkpoint.direct.set(key, value);
      });
    }

    function saveAll() {
      const checkpoint = recordsStorageCheckpoint();
      try {
        localStorage.setItem('oavix_auto_records', JSON.stringify(autoRecords));
        return true;
      } catch (error) {
        try {
          restoreRecordsStorage(checkpoint);
        } catch (restoreError) {
          console.error('[OAVIX storage rollback]', restoreError);
        }
        console.error('[OAVIX storage]', error);
        return false;
      }
    }

    function toggleValidateRecord(id) {
      const r = autoRecords.find(item => item.id === id);
      if (r) {
        const previousValue = r.validated;
        r.validated = !r.validated;
        if (!saveAll()) {
          r.validated = previousValue;
          showToast('No se pudo actualizar', 'No hay espacio suficiente. El registro anterior sigue intacto.', 'rose');
          return;
        }
        renderStats();
        renderRecords();
        renderArchiveRecords();
        renderMileageComparison();
        renderAlerts();
        showToast('Actualizado', r.validated ? 'Servicio validado y archivado.' : 'Servicio restaurado.', 'emerald');
      }
    }

    function deleteRecord(id) {
      const previousRecords = autoRecords.slice();
      autoRecords = autoRecords.filter(r => r.id !== id);
      if (!saveAll()) {
        autoRecords = previousRecords;
        showToast('No se pudo eliminar', 'El registro anterior sigue intacto.', 'rose');
        return;
      }
      renderStats();
      renderRecords();
      renderArchiveRecords();
      renderMileageComparison();
      renderAlerts();
      showToast('Eliminado', 'Registro eliminado correctamente.', 'amber');
    }
