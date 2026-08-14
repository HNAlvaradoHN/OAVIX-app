(function initializeGoogleAuth(root) {
  'use strict';

  const runtime = root.OAVIXSyncInternal;
  const { constants, state, nativeStorage, localUpdatedKey, needsPullKey } = runtime.context;
  const storage = runtime.storage;
  const { toast } = runtime.feedback;

  function loadGIS() {
    return new Promise((resolve, reject) => {
      if (root.google && root.google.accounts && root.google.accounts.oauth2) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('No se pudo cargar Google Identity Services.'));
      document.head.appendChild(script);
    });
  }

  async function aboutMe() {
    const response = await root.fetch(
      'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)',
      { headers: { Authorization: 'Bearer ' + state.accessToken } }
    );
    if (!response.ok) throw new Error('No se pudo identificar la cuenta de Google.');
    return response.json();
  }

  function initTokenClient() {
    if (state.tokenClient || !root.google) return;
    state.tokenClient = root.google.accounts.oauth2.initTokenClient({
      client_id: constants.clientId,
      scope: constants.driveScope,
      include_granted_scopes: true,
      callback: response => {
        if (response && response.access_token) {
          state.accessToken = response.access_token;
          state.tokenExpiresAt = Date.now() + Math.max(30, (response.expires_in || 3600) - 30) * 1000;
          if (state.pendingTokenResolve) {
            const resolve = state.pendingTokenResolve;
            state.pendingTokenResolve = null;
            state.pendingTokenReject = null;
            resolve(response);
          }
        } else if (state.pendingTokenReject) {
          const reject = state.pendingTokenReject;
          state.pendingTokenResolve = null;
          state.pendingTokenReject = null;
          reject(new Error(response && response.error_description || 'Google no concedió acceso.'));
        }
      },
      error_callback: error => {
        if (!state.pendingTokenReject) return;
        const reject = state.pendingTokenReject;
        state.pendingTokenResolve = null;
        state.pendingTokenReject = null;
        reject(new Error(
          error && error.type === 'popup_closed'
            ? 'Se canceló el inicio de sesión.'
            : 'No se pudo abrir el acceso de Google.'
        ));
      }
    });
  }

  function requestToken(interactive, loginHint) {
    return new Promise(async (resolve, reject) => {
      try {
        await loadGIS();
        initTokenClient();
        state.pendingTokenResolve = resolve;
        state.pendingTokenReject = reject;
        const options = { login_hint: loginHint || undefined };
        options.prompt = interactive ? 'select_account' : '';
        state.tokenClient.requestAccessToken(options);
      } catch (error) {
        state.pendingTokenResolve = null;
        state.pendingTokenReject = null;
        reject(error);
      }
    });
  }

  async function ensureToken(interactive) {
    if (state.accessToken && Date.now() < state.tokenExpiresAt) return state.accessToken;
    if (!constants.clientId) throw new Error('Falta configurar el Client ID de Google.');
    const response = await requestToken(interactive, state.accountEmail || undefined);
    return response.access_token;
  }

  function enterGuestMode() {
    state.accountEmail = '';
    state.guestMode = true;
    state.accessToken = null;
    state.tokenExpiresAt = 0;
    state.fileId = null;
    nativeStorage.set(constants.sessionKey, JSON.stringify({ mode: 'guest' }));
    nativeStorage.remove(constants.pendingKey);
    nativeStorage.remove(constants.lastSyncKey);
    nativeStorage.remove('oavix_current_user_name');
    nativeStorage.remove('oavix_current_user_pin');
    runtime.ui?.hideLogin?.();
    runtime.ui?.cleanHeader?.();
    toast('Modo invitado', 'Tus datos se guardarán solamente en este dispositivo.', 'cyan');
  }

  async function loginWithGoogle() {
    if (state.authInProgress) return;
    state.authInProgress = true;

    try {
      if (!constants.clientId) throw new Error('Falta configurar el Client ID de Google.');
      const migratingGuest = state.guestMode;
      const guestData = migratingGuest ? storage.dataSnapshot() : null;

      await loadGIS();
      initTokenClient();
      await requestToken(true, '');
      const me = await aboutMe();
      const email = me.user && me.user.emailAddress;
      if (!email) throw new Error('Google no devolvió el correo de la cuenta.');

      const oldEmail = state.accountEmail;
      const firstMigration = !migratingGuest && !oldEmail && storage.legacyMigrationAllowed() && storage.hasLegacyData();
      if (migratingGuest) {
        const timestamp = new Date().toISOString();
        state.accountEmail = email;
        state.guestMode = false;
        nativeStorage.set(constants.sessionKey, JSON.stringify({
          email,
          displayName: me.user && me.user.displayName || email
        }));
        nativeStorage.set('oavix_current_user_name', email);
        nativeStorage.remove('oavix_current_user_pin');
        storage.saveAccountSnapshot(email, timestamp, undefined, Object.keys(guestData || {}));
        nativeStorage.set(localUpdatedKey(email), timestamp);
        nativeStorage.set('oavix_migration_v5', 'done');
      } else if (firstMigration) {
        const timestamp = new Date().toISOString();
        nativeStorage.set(localUpdatedKey(email), timestamp);
        storage.saveAccountSnapshot(email, timestamp, undefined, Object.keys(storage.dataSnapshot()));
        nativeStorage.set('oavix_migration_v5', 'done');
      } else {
        storage.clearActiveData();
        if (storage.accountSnapshot(email)) storage.restoreAccount(email);
        else nativeStorage.remove(localUpdatedKey(email));
      }

      state.accountEmail = email;
      state.guestMode = false;
      nativeStorage.set(constants.sessionKey, JSON.stringify({
        email,
        displayName: me.user && me.user.displayName || email
      }));
      nativeStorage.set('oavix_current_user_name', email);
      nativeStorage.remove('oavix_current_user_pin');
      nativeStorage.set(needsPullKey(email), 'true');
      await runtime.synchronizer.syncNow(true, { reload: false });
      root.location.reload();
    } catch (error) {
      console.error('[OAVIX login]', error);
      toast('No se pudo iniciar sesión', error.message || 'Google canceló el acceso.', 'rose');
    } finally {
      state.authInProgress = false;
    }
  }

  function logoutSession() {
    const signedOutEmail = state.accountEmail;
    const tokenToRevoke = state.accessToken;
    if (tokenToRevoke && root.google?.accounts?.oauth2?.revoke) {
      root.google.accounts.oauth2.revoke(tokenToRevoke, () => {});
    }
    state.accessToken = null;
    state.tokenExpiresAt = 0;
    state.fileId = null;
    state.guestMode = false;
    nativeStorage.remove(constants.sessionKey);
    nativeStorage.remove('oavix_current_user_name');
    nativeStorage.remove('oavix_current_user_pin');
    storage.clearActiveData();
    storage.purgeAccount(signedOutEmail);
    state.accountEmail = '';
    setTimeout(() => root.location.reload(), 100);
  }

  runtime.auth = {
    loadGIS,
    aboutMe,
    initTokenClient,
    requestToken,
    ensureToken,
    enterGuestMode,
    loginWithGoogle,
    logoutSession
  };
})(window);
