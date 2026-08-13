    function switchSubTab(t) {
      // Ocultar todas las sub-pestañas incluyendo el Dashboard
      ['dashboard', 'records', 'calendar', 'fuel', 'alerts', 'archive'].forEach(tab => {
        const element = document.getElementById(`subtab-${tab}`);
        if (element) element.classList.add('hidden');

        // Actualizar estado de los botones del menú flotante
        const navBtn = document.getElementById(`nav-btn-${tab}`);
        if (navBtn) {
          navBtn.classList.remove('active');
          navBtn.removeAttribute('aria-current');
        }
      });

      // Mostrar solo la seleccionada
      const activeElement = document.getElementById(`subtab-${t}`);
      if (activeElement) activeElement.classList.remove('hidden');

      const activeNavBtn = document.getElementById(`nav-btn-${t}`);
      if (activeNavBtn) {
        activeNavBtn.classList.add('active');
        activeNavBtn.setAttribute('aria-current', 'page');
      }

      if (t === 'archive') renderArchiveRecords();
      if (t === 'fuel') setTimeout(renderFuelModule, 0);
      if (t === 'dashboard') window.scrollTo({top:0, behavior:'smooth'});
    }
