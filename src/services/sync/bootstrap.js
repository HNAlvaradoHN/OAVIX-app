(function bootstrapSync(root) {
  'use strict';

  if (root.__OAVIX_SYNC_V7__) return;
  if (typeof root.__OAVIX_SYNC_TEARDOWN__ === 'function') root.__OAVIX_SYNC_TEARDOWN__();
  root.__OAVIX_SYNC_V7__ = true;

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

  function refreshFromDrive(delay = 0, force = false) {
    if (!state.accountEmail || !root.navigator.onLine) return;
    if (!force && Date.now() - state.lastSyncAttemptAt < 15000) return;
    clearTimeout(state.refreshKickTimer);
    state.refreshKickTimer = setTimeout(() => runtime.synchronizer.syncNow(false), delay);
  }

  const handleOnline = () => refreshFromDrive(400, true);
  const handleFocus = () => refreshFromDrive(250);
  const handlePageShow = () => refreshFromDrive(250);
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') refreshFromDrive(250);
  };

  const handleBeforeUnload = () => {
    if (!state.accountEmail) return;
    const snapshot = storage.accountSnapshot(state.accountEmail) || {};
    storage.saveAccountSnapshot(
      state.accountEmail,
      nativeStorage.get(localUpdatedKey(state.accountEmail)) ||
        snapshot.updatedAt ||
        new Date().toISOString()
    );
  };

  const handleReady = () => {
    runtime.ui.initUI();
    if (state.accountEmail && root.navigator.onLine) {
      refreshFromDrive(900, true);
    }
  };
  const handleViewsReady = () => runtime.ui.initUI();

  root.addEventListener('online', handleOnline);
  root.addEventListener('focus', handleFocus);
  root.addEventListener('pageshow', handlePageShow);
  root.addEventListener('beforeunload', handleBeforeUnload);
  document.addEventListener('visibilitychange', handleVisibility);
  document.addEventListener('DOMContentLoaded', handleReady, { once: true });
  document.addEventListener('oavix:views-ready', handleViewsReady);

  root.__OAVIX_SYNC_TEARDOWN__ = () => {
    root.removeEventListener('online', handleOnline);
    root.removeEventListener('focus', handleFocus);
    root.removeEventListener('pageshow', handlePageShow);
    root.removeEventListener('beforeunload', handleBeforeUnload);
    document.removeEventListener('visibilitychange', handleVisibility);
    document.removeEventListener('DOMContentLoaded', handleReady);
    document.removeEventListener('oavix:views-ready', handleViewsReady);
    clearTimeout(state.timer);
    clearTimeout(state.refreshKickTimer);
  };
})(window);
