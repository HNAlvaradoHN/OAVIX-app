(function initializeAccountStorage(root) {
  'use strict';

  const runtime = root.OAVIXSyncInternal;
  const { constants, state, nativeStorage, metaKey, localUpdatedKey, needsPullKey, session } = runtime.context;
  const merge = runtime.merge;

  function dataSnapshot() {
    const data = {};
    constants.dataKeys.forEach(key => {
      const value = nativeStorage.get(key);
      if (value !== null) data[key] = value;
    });
    return data;
  }

  function accountSnapshot(email) {
    try {
      return JSON.parse(nativeStorage.get(metaKey(email)) || 'null');
    } catch {
      return null;
    }
  }

  function storeAccountSnapshot(email, copy) {
    if (!email) return undefined;
    const snapshot = merge.normalizePayload(copy, email);
    nativeStorage.set(metaKey(email), JSON.stringify(snapshot));
    return snapshot;
  }

  function saveAccountSnapshot(email, updatedAt, metadata, keys) {
    if (!email) return undefined;
    const rawPrevious = accountSnapshot(email);
    const previous = merge.normalizePayload(rawPrevious, email);
    const data = dataSnapshot();
    const covered = Array.isArray(keys)
      ? keys
      : [...new Set([...previous.keys, ...Object.keys(data)])];
    const snapshot = {
      schemaVersion: 6,
      app: 'OAVIX',
      account: email,
      updatedAt: updatedAt || (rawPrevious && previous.updatedAt) || new Date().toISOString(),
      keys: constants.dataKeys.filter(key => covered.includes(key)),
      data,
      metadata: metadata || previous.metadata
    };
    return storeAccountSnapshot(email, snapshot);
  }

  function restoreAccount(email) {
    const raw = accountSnapshot(email);
    if (!raw) return false;
    const snapshot = merge.normalizePayload(raw, email);

    constants.dataKeys.forEach(key => {
      if (Object.prototype.hasOwnProperty.call(snapshot.data, key)) {
        nativeStorage.set(key, snapshot.data[key]);
      } else if (snapshot.keys.includes(key)) {
        nativeStorage.remove(key);
      }
    });

    storeAccountSnapshot(email, snapshot);
    nativeStorage.set(localUpdatedKey(email), snapshot.updatedAt);
    if (!nativeStorage.get(constants.lastSyncKey)) {
      nativeStorage.set(constants.lastSyncKey, snapshot.updatedAt);
    }
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
    purgeInactiveAccounts(existingSession && existingSession.email || '');
    if (existingSession && existingSession.email) {
      state.accountEmail = existingSession.email;
      if (!restoreAccount(state.accountEmail)) {
        clearActiveData();
        nativeStorage.set(needsPullKey(state.accountEmail), 'true');
      }
    } else if (!legacyMigrationAllowed()) {
      clearActiveData();
    }
  }

  function mutationTimestamp(snapshot) {
    const now = Date.now();
    const previous = Date.parse(snapshot && snapshot.updatedAt) || 0;
    return new Date(Math.max(now, previous + 1)).toISOString();
  }

  function saveMutation(key, previousRaw, nextRaw, scheduleSync) {
    if (!state.accountEmail || !constants.dataKeys.includes(key) || previousRaw === nextRaw) return;
    const current = accountSnapshot(state.accountEmail);
    const changedAt = mutationTimestamp(current);
    const snapshot = merge.recordMutation(
      current,
      key,
      previousRaw,
      nextRaw,
      changedAt,
      state.accountEmail
    );
    storeAccountSnapshot(state.accountEmail, snapshot);
    nativeStorage.set(localUpdatedKey(state.accountEmail), changedAt);
    nativeStorage.set(constants.pendingKey, 'true');
    scheduleSync();
  }

  function installMutationHooks(scheduleSync) {
    localStorage.setItem = function setTrackedItem(key, value) {
      const normalizedKey = String(key);
      const previousRaw = nativeStorage.get(normalizedKey);
      const nextRaw = String(value);
      nativeStorage.set(normalizedKey, nextRaw);
      saveMutation(normalizedKey, previousRaw, nextRaw, scheduleSync);
    };

    localStorage.removeItem = function removeTrackedItem(key) {
      const normalizedKey = String(key);
      const previousRaw = nativeStorage.get(normalizedKey);
      nativeStorage.remove(normalizedKey);
      saveMutation(normalizedKey, previousRaw, null, scheduleSync);
    };
  }

  function purgeAccount(email) {
    if (!email) return;
    nativeStorage.remove(metaKey(email));
    nativeStorage.remove(localUpdatedKey(email));
    nativeStorage.remove(needsPullKey(email));
  }

  function purgeInactiveAccounts(activeEmail) {
    const activePrefix = activeEmail
      ? constants.accountPrefix + encodeURIComponent(activeEmail.toLowerCase()) + '__'
      : '';
    nativeStorage.keys()
      .filter(key => key.startsWith(constants.accountPrefix) && (!activePrefix || !key.startsWith(activePrefix)))
      .forEach(key => nativeStorage.remove(key));
  }

  runtime.storage = {
    dataSnapshot,
    accountSnapshot,
    storeAccountSnapshot,
    saveAccountSnapshot,
    restoreAccount,
    clearActiveData,
    hasLegacyData,
    legacyMigrationAllowed,
    initializeSession,
    installMutationHooks,
    purgeAccount,
    purgeInactiveAccounts,
    localUpdatedKey,
    needsPullKey
  };
})(window);
