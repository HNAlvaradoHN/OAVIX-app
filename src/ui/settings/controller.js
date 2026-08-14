    let settingsMenuInitialized = false;

    function settingsElement(id) {
      return document.getElementById(id);
    }

    function openSettingsMenu() {
      const panel = settingsElement('oavix-settings-panel');
      const toggle = settingsElement('oavix-settings-toggle');
      if (!panel || !toggle) return;
      panel.classList.remove('hidden');
      settingsElement('oavix-settings-backdrop')?.classList.remove('hidden');
      document.body.classList.add('oavix-settings-open');
      toggle.classList.add('active');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Cerrar configuración');
      refreshSettingsMenuState();
      panel.querySelector('button')?.focus({ preventScroll: true });
    }

    function closeSettingsMenu(options = {}) {
      const panel = settingsElement('oavix-settings-panel');
      const toggle = settingsElement('oavix-settings-toggle');
      if (!panel || !toggle) return;
      panel.classList.add('hidden');
      settingsElement('oavix-settings-backdrop')?.classList.add('hidden');
      document.body.classList.remove('oavix-settings-open');
      toggle.classList.remove('active');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Abrir configuración');
      if (options.restoreFocus) toggle.focus({ preventScroll: true });
    }

    function toggleSettingsMenu() {
      const panel = settingsElement('oavix-settings-panel');
      if (!panel) return;
      if (panel.classList.contains('hidden')) openSettingsMenu();
      else closeSettingsMenu({ restoreFocus: true });
    }

    function openSettingsThemeEditor() {
      closeSettingsMenu();
      openThemeModal();
    }

    function refreshSettingsThemeState() {
      const isLight = document.documentElement.classList.contains('light-theme');
      const icon = settingsElement('theme-icon');
      const label = settingsElement('settings-theme-label');
      const caption = settingsElement('settings-theme-caption');
      if (icon) icon.className = isLight ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
      if (label) label.textContent = isLight ? 'Modo día' : 'Modo noche';
      if (caption) caption.textContent = isLight ? 'Cambiar a modo noche' : 'Cambiar a modo día';
    }

    function toggleSettingsTheme() {
      toggleTheme();
      refreshSettingsThemeState();
      closeSettingsMenu();
    }

    function settingsSyncTime(value) {
      const date = new Date(value || '');
      if (!Number.isFinite(date.getTime())) return '';
      return date.toLocaleString('es-HN', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
      });
    }

    function setSettingsSyncState(state, label, caption) {
      const button = settingsElement('oavix-drive-control');
      const badge = settingsElement('settings-sync-state');
      const detail = settingsElement('settings-sync-caption');
      if (button) button.dataset.state = state;
      if (badge) {
        badge.className = `oavix-settings-state settings-state-${state}`;
        badge.textContent = label;
      }
      if (detail && caption) detail.textContent = caption;
    }

    function refreshSettingsAccountState() {
      const runtime = window.OAVIXSyncInternal;
      const state = runtime && runtime.context && runtime.context.state;
      const session = runtime && runtime.context && typeof runtime.context.session === 'function'
        ? runtime.context.session()
        : null;
      const label = settingsElement('settings-account-label');
      const caption = settingsElement('settings-account-caption');
      const badge = settingsElement('settings-account-state');
      const icon = settingsElement('settings-account-icon');
      const google = settingsElement('settings-account-google');
      const logout = settingsElement('settings-account-logout');

      google?.classList.add('hidden');
      logout?.classList.add('hidden');

      if (state && state.accountEmail) {
        if (label) label.textContent = 'Cuenta de Google conectada';
        if (caption) caption.textContent = session?.email || state.accountEmail;
        if (badge) {
          badge.className = 'oavix-settings-state settings-state-ready';
          badge.textContent = 'Conectada';
        }
        if (icon) icon.className = 'fa-solid fa-user-check';
        logout?.classList.remove('hidden');
        return;
      }

      if (state && state.guestMode) {
        if (label) label.textContent = 'Modo invitado';
        if (caption) caption.textContent = 'Los datos se guardan solamente en este dispositivo';
        if (badge) {
          badge.className = 'oavix-settings-state settings-state-pending';
          badge.textContent = 'Local';
        }
        if (icon) icon.className = 'fa-solid fa-user';
        google?.classList.remove('hidden');
        return;
      }

      if (label) label.textContent = 'Sin sesión';
      if (caption) caption.textContent = 'Conecta Google o continúa como invitado';
      if (badge) {
        badge.className = 'oavix-settings-state settings-state-inactive';
        badge.textContent = 'Inactiva';
      }
      if (icon) icon.className = 'fa-solid fa-user';
      google?.classList.remove('hidden');
    }

    function refreshSettingsSyncState() {
      const runtime = window.OAVIXSyncInternal;
      const state = runtime && runtime.context && runtime.context.state;
      const email = state && state.accountEmail;
      if (!email) {
        if (state && state.guestMode) {
          setSettingsSyncState('inactive', 'Local', 'Vincula Google para activar la sincronización');
        } else {
          setSettingsSyncState('inactive', 'Sin sesión', 'Inicia sesión para usar Google Drive');
        }
        return;
      }
      const lastSync = runtime.context.nativeStorage.get(runtime.context.constants.lastSyncKey);
      setSettingsSyncState(
        'ready',
        'Listo',
        lastSync ? `Última sincronización: ${settingsSyncTime(lastSync)}` : 'Guardar y descargar lo más reciente'
      );
    }

    async function triggerSettingsSync() {
      const button = settingsElement('oavix-drive-control');
      const runtime = window.OAVIXSyncInternal;
      if (runtime?.context?.state?.guestMode) {
        showToast('Modo invitado', 'Vincula una cuenta de Google para activar la sincronización.', 'cyan');
        return { status: 'guest' };
      }
      if (!window.OAVIXDriveSync || typeof window.OAVIXDriveSync.syncNow !== 'function') {
        showToast('Sincronización no disponible', 'Recarga la aplicación e inténtalo nuevamente.', 'rose');
        return false;
      }

      if (button) button.disabled = true;
      setSettingsSyncState('working', 'Sincronizando', 'Comprobando los cambios de Google Drive…');
      try {
        const result = await window.OAVIXDriveSync.syncNow();
        if (result && result.status === 'offline') {
          setSettingsSyncState('pending', 'Pendiente', 'Se guardará automáticamente al recuperar conexión');
        } else if (result && result.status === 'error') {
          setSettingsSyncState('inactive', 'Error', 'Los datos siguen guardados en este dispositivo');
        } else {
          const now = new Date().toISOString();
          setSettingsSyncState('ready', 'Actualizado', `Comprobado: ${settingsSyncTime(now)}`);
        }
        return result;
      } finally {
        if (button) button.disabled = false;
      }
    }

    function linkSettingsGoogleAccount() {
      const login = window.OAVIXSyncInternal?.auth?.loginWithGoogle;
      if (typeof login !== 'function') {
        showToast('Inicio de sesión no disponible', 'Recarga la aplicación e inténtalo nuevamente.', 'rose');
        return false;
      }
      closeSettingsMenu();
      return login();
    }

    function confirmSettingsLogout() {
      const logout = window.OAVIXSyncInternal?.auth?.logoutSession;
      if (typeof logout !== 'function') {
        showToast('Cierre de sesión no disponible', 'Recarga la aplicación e inténtalo nuevamente.', 'rose');
        return false;
      }
      const accepted = window.confirm('¿Seguro que deseas cerrar sesión en OAVIX?');
      if (!accepted) return false;
      closeSettingsMenu();
      logout();
      return true;
    }

    function refreshSettingsMenuState() {
      refreshSettingsThemeState();
      refreshSettingsAccountState();
      refreshSettingsSyncState();
    }

    function initializeSettingsMenu() {
      if (settingsMenuInitialized || !settingsElement('oavix-settings-hub')) return;
      settingsMenuInitialized = true;
      const syncButton = settingsElement('oavix-drive-control');
      const googleButton = settingsElement('settings-account-google');
      const logoutButton = settingsElement('settings-account-logout');
      if (syncButton) syncButton.onclick = triggerSettingsSync;
      if (googleButton) googleButton.onclick = linkSettingsGoogleAccount;
      if (logoutButton) logoutButton.onclick = confirmSettingsLogout;
      document.addEventListener('pointerdown', event => {
        const hub = settingsElement('oavix-settings-hub');
        const panel = settingsElement('oavix-settings-panel');
        if (!hub || !panel || panel.classList.contains('hidden') || hub.contains(event.target)) return;
        closeSettingsMenu();
      });
      document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || settingsElement('oavix-settings-panel')?.classList.contains('hidden')) return;
        closeSettingsMenu({ restoreFocus: true });
      });
      refreshSettingsMenuState();
    }
