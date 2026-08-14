    function refreshOavixFromStorage() {
      currentUnit = localStorage.getItem('oavix_auto_unit') || 'km';
      const storedMileage = localStorage.getItem('oavix_auto_mileage');
      currentVehicleMileage = storedMileage === null ? 85400 : Number(storedMileage) || 0;
      try {
        const categories = JSON.parse(localStorage.getItem('oavix_auto_categories') || '[]');
        autoCategories = Array.isArray(categories) ? categories : [];
      } catch (_) { autoCategories = []; }
      try {
        const records = JSON.parse(localStorage.getItem('oavix_auto_records') || '[]');
        autoRecords = Array.isArray(records) ? records : [];
      } catch (_) { autoRecords = []; }

      repairMaintenanceCategories();
      document.getElementById('current-mileage-input').value = formatNumber(currentVehicleMileage);
      updateUnitUI();
      setupCategoryDropdowns();
      renderMileageComparison();
      renderStats();
      renderRecords();
      renderCalendar();
      renderAlerts();
      renderArchiveRecords();
      if (window.OAVIXFuel?.reloadLocalState) window.OAVIXFuel.reloadLocalState();
    }

    window.OAVIXRefreshFromStorage = refreshOavixFromStorage;

    function initializeOavixApp() {
      document.getElementById('current-mileage-input').value = formatNumber(currentVehicleMileage);
      updateUnitUI();
      setupCategoryDropdowns();
      renderMileageComparison();
      renderStats();
      renderRecords();
      renderCalendar();
      renderAlerts();
      renderArchiveRecords();
      initializeSettingsMenu();
      showMaintenanceWarnings();

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

    }

    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', initializeOavixApp, { once: true });
    } else {
      initializeOavixApp();
    }
