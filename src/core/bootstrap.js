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
      checkNotifPermissionState();
      initializeSettingsMenu();
      window.OAVIXPush?.sync().catch(error => console.warn('[OAVIX Push]', error.message));

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

      setInterval(checkScheduledAlarms, 10000);
      checkScheduledAlarms();
    }

    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', initializeOavixApp, { once: true });
    } else {
      initializeOavixApp();
    }
