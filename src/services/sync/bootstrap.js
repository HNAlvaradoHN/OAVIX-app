(function bootstrapSync(root) {
  'use strict';

  if (root.__OAVIX_SYNC_V6__) return;
  root.__OAVIX_SYNC_V6__ = true;

  const runtime = root.OAVIXSyncInternal;
  const { constants, state, nativeStorage, localUpdatedKey } = runtime.context;
  const storage = runtime.storage;

  storage.initializeSession();
  storage.installMutationHooks(runtime.synchronizer.schedule);

  root.OAVIXDriveSync = {
    syncNow: () => runtime.synchronizer.syncNow(true),
    loginWithGoogle: runtime.auth.loginWithGoogle,
    logoutSession: runtime.auth.logoutSession,
    refreshUI: runtime.ui.initUI
  };

  root.addEventListener('online', () => {
    if (state.accountEmail && nativeStorage.get(constants.pendingKey) === 'true') {
      setTimeout(() => runtime.synchronizer.syncNow(false), 400);
    }
  });

  root.addEventListener('beforeunload', () => {
    if (!state.accountEmail) return;
    const snapshot = storage.accountSnapshot(state.accountEmail) || {};
    storage.saveAccountSnapshot(
      state.accountEmail,
      nativeStorage.get(localUpdatedKey(state.accountEmail)) ||
        snapshot.updatedAt ||
        new Date().toISOString()
    );
  });

  document.addEventListener('DOMContentLoaded', () => {
    runtime.ui.initUI();
    if (state.accountEmail && root.navigator.onLine) {
      setTimeout(() => runtime.synchronizer.syncNow(false), 900);
    }
  }, { once: true });
  document.addEventListener('oavix:views-ready', runtime.ui.initUI);
})(window);
