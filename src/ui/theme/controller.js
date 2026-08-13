    function openThemeModal() { document.getElementById('modal-theme').classList.remove('hidden'); }
    function closeThemeModal() { document.getElementById('modal-theme').classList.add('hidden'); }

    function applyCustomTheme() {
      const bg = document.getElementById('picker-bg-color').value;
      const neon = document.getElementById('picker-border-color').value;
      applyCustomThemeColors(bg, neon);
      localStorage.setItem('oavix_custom_bg', bg);
      localStorage.setItem('oavix_custom_neon', neon);
    }

    function applyCustomThemeColors(bg, neon) {
      document.documentElement.style.setProperty('--bg-dynamic', bg);
      document.documentElement.style.setProperty('--border-neon', neon);

      let r = parseInt(bg.slice(1,3), 16), g = parseInt(bg.slice(3,5), 16), b = parseInt(bg.slice(5,7), 16);
      if (isNaN(r)) { r = 15; g = 23; b = 42; }
      const isLight = document.documentElement.classList.contains('light-theme');
      document.documentElement.style.setProperty('--card-bg', isLight ? 'rgba(255, 255, 255, 0.95)' : `rgba(${r}, ${g}, ${b}, 0.88)`);
    }

    function resetDefaultTheme() {
      const isLight = document.documentElement.classList.contains('light-theme');
      const defBg = isLight ? '#f1f5f9' : '#030712';
      const defNeon = isLight ? '#8b5cf6' : '#06b6d4';
      document.getElementById('picker-bg-color').value = defBg;
      document.getElementById('picker-border-color').value = defNeon;
      applyCustomThemeColors(defBg, defNeon);
      localStorage.setItem('oavix_custom_bg', defBg);
      localStorage.setItem('oavix_custom_neon', defNeon);
      showToast('Tema Restablecido', 'Se aplicó el diseño perfecto.', 'cyan');
    }

    function toggleTheme() {
      const isDark = document.documentElement.classList.toggle('dark');
      document.documentElement.classList.toggle('light-theme', !isDark);
      document.getElementById('theme-icon').className = isDark ? 'fa-solid fa-moon text-xs' : 'fa-solid fa-sun text-xs text-amber-400';
      localStorage.setItem('oavix_is_light', !isDark);
      resetDefaultTheme();
    }
