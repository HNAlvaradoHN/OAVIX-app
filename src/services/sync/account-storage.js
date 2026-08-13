(function initializeAccountStorage(root) {
  'use strict';

  const runtime = root.OAVIXSyncInternal;
  const { constants, state, nativeStorage, metaKey, localUpdatedKey, needsPullKey, session } = runtime.context;
  const legacyDataKeys = constants.dataKeys.filter(
    key => key !== 'oavix_fuel_history' && key !== 'oavix_fuel_vehicle_config'
  );

  const coveredKeys = copy => Array.isArray(copy && copy.keys) ? copy.keys : legacyDataKeys;

  function dataSnapshot() {
    const data = {};
    constants.dataKeys.forEach(key => {
      const value = nativeStorage.get(key);
      if (value !== null) data[key] = value;
    });
    return data;
  }

  function dataString() {
    return JSON.stringify(dataSnapshot());
  }

  function accountSnapshot(email) {
    try {
      return JSON.parse(nativeStorage.get(metaKey(email)) || 'null');
    } catch {
      return null;
    }
  }

  function saveAccountSnapshot(email, updatedAt) {
    if (!email) return undefined;
    const snapshot = {
      schemaVersion: 5,
      updatedAt: updatedAt || new Date().toISOString(),
      keys: constants.dataKeys.slice(),
      data: dataSnapshot()
    };
    nativeStorage.set(metaKey(email), JSON.stringify(snapshot));
    return snapshot;
  }

  function restoreAccount(email) {
    const snapshot = accountSnapshot(email);
    if (!snapshot) return false;
    const covered = coveredKeys(snapshot);

    constants.dataKeys.forEach(key => {
      if (Object.prototype.hasOwnProperty.call(snapshot.data || {}, key)) {
        nativeStorage.set(key, snapshot.data[key]);
      } else if (covered.includes(key)) {
        nativeStorage.remove(key);
      }
    });

    nativeStorage.set(localUpdatedKey(email), snapshot.updatedAt || new Date().toISOString());
    nativeStorage.set(constants.lastSyncKey, snapshot.updatedAt || '');
    nativeStorage.remove(constants.pendingKey);
    return true;
  }

  function clearActiveData() {
    constants.dataKeys.forEach(key => nativeStorage.remove(key));
    nativeStorage.remove(constants.lastSyncKey);
    nativeStorage.remove(constants.pendingKey);
  }

  function hasLegacyData() {
    return constants.dataKeys.some(key => nativeStorage.get(key) !== null);
  }

  function legacyMigrationAllowed() {
    return nativeStorage.get('oavix_migration_v5') !== 'done';
  }

  function initializeSession() {
    const existingSession = session();
    if (existingSession && existingSession.email) {
      state.accountEmail = existingSession.email;
      restoreAccount(state.accountEmail);
    } else if (!legacyMigrationAllowed()) {
      clearActiveData();
    }
  }

  function installMutationHooks(scheduleSync) {
    localStorage.setItem = function setTrackedItem(key, value) {
      nativeStorage.set(key, value);
      if (!state.accountEmail || !constants.dataKeys.includes(key)) return;
      const timestamp = new Date().toISOString();
      nativeStorage.set(localUpdatedKey(state.accountEmail), timestamp);
      saveAccountSnapshot(state.accountEmail, timestamp);
      nativeStorage.set(constants.pendingKey, 'true');
      scheduleSync();
    };

    localStorage.removeItem = function removeTrackedItem(key) {
      nativeStorage.remove(key);
      if (!state.accountEmail || !constants.dataKeys.includes(key)) return;
      const timestamp = new Date().toISOString();
      nativeStorage.set(localUpdatedKey(state.accountEmail), timestamp);
      saveAccountSnapshot(state.accountEmail, timestamp);
      nativeStorage.set(constants.pendingKey, 'true');
      scheduleSync();
    };
  }

  runtime.storage = {
    coveredKeys,
    dataSnapshot,
    dataString,
    accountSnapshot,
    saveAccountSnapshot,
    restoreAccount,
    clearActiveData,
    hasLegacyData,
    legacyMigrationAllowed,
    initializeSession,
    installMutationHooks,
    localUpdatedKey,
    needsPullKey
  };
})(window);
