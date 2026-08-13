(function initializeSyncContext(root) {
  'use strict';

  const runtime = root.OAVIXSyncInternal || (root.OAVIXSyncInternal = {});
  if (runtime.context) return;

  const constants = Object.freeze({
    clientId: root.OAVIX_GOOGLE_CLIENT_ID || '',
    fileName: 'oavix-data.json',
    driveScope: 'https://www.googleapis.com/auth/drive.appdata',
    dataKeys: [
      'oavix_auto_records',
      'oavix_auto_mileage',
      'oavix_auto_categories',
      'oavix_auto_unit',
      'oavix_custom_bg',
      'oavix_custom_neon',
      'oavix_is_light',
      'oavix_triggered_alarms',
      'oavix_fuel_history',
      'oavix_fuel_vehicles',
      'oavix_fuel_preferences',
      'oavix_fuel_vehicle_config'
    ],
    sessionKey: 'oavix_google_session',
    accountPrefix: 'oavix_account_',
    metaSuffix: '__meta',
    pendingKey: 'oavix_sync_pending',
    lastSyncKey: 'oavix_sync_last',
    debounce: 1600
  });

  const state = {
    tokenClient: null,
    accessToken: null,
    tokenExpiresAt: 0,
    fileId: null,
    busy: false,
    timer: null,
    refreshKickTimer: null,
    lastSyncAttemptAt: 0,
    authInProgress: false,
    accountEmail: '',
    pendingTokenResolve: null,
    pendingTokenReject: null
  };

  const nativeStorage = {
    get: localStorage.getItem.bind(localStorage),
    set: localStorage.setItem.bind(localStorage),
    remove: localStorage.removeItem.bind(localStorage)
  };

  const accountKey = (email, key) =>
    constants.accountPrefix + encodeURIComponent(email.toLowerCase()) + '__' + key;
  const metaKey = email => accountKey(email, constants.metaSuffix);
  const localUpdatedKey = email => accountKey(email, 'local_updated');
  const needsPullKey = email => accountKey(email, 'needs_pull');
  const session = () => {
    try {
      return JSON.parse(nativeStorage.get(constants.sessionKey) || 'null');
    } catch {
      return null;
    }
  };

  runtime.context = {
    constants,
    state,
    nativeStorage,
    accountKey,
    metaKey,
    localUpdatedKey,
    needsPullKey,
    session
  };
})(window);
