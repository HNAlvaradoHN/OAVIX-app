(function initializeSynchronizer(root) {
  'use strict';

  const runtime = root.OAVIXSyncInternal;
  const { constants, state, nativeStorage, localUpdatedKey, needsPullKey } = runtime.context;
  const storage = runtime.storage;
  const { toast } = runtime.feedback;

  function payload() {
    const snapshot = storage.accountSnapshot(state.accountEmail);
    const updatedAt = nativeStorage.get(localUpdatedKey(state.accountEmail)) ||
      snapshot && snapshot.updatedAt ||
      new Date().toISOString();
    storage.saveAccountSnapshot(state.accountEmail, updatedAt);
    return {
      schemaVersion: 5,
      app: 'OAVIX',
      account: state.accountEmail,
      updatedAt,
      keys: constants.dataKeys.slice(),
      data: storage.dataSnapshot()
    };
  }

  function applyCloud(cloudPayload) {
    if (!cloudPayload || !cloudPayload.data) return false;
    const covered = storage.coveredKeys(cloudPayload);

    constants.dataKeys.forEach(key => {
      if (Object.prototype.hasOwnProperty.call(cloudPayload.data, key)) {
        nativeStorage.set(key, cloudPayload.data[key]);
      } else if (covered.includes(key)) {
        nativeStorage.remove(key);
      }
    });

    const updatedAt = cloudPayload.updatedAt || new Date().toISOString();
    nativeStorage.set(localUpdatedKey(state.accountEmail), updatedAt);
    storage.saveAccountSnapshot(state.accountEmail, updatedAt);
    nativeStorage.set(constants.lastSyncKey, cloudPayload.updatedAt || '');
    nativeStorage.remove(constants.pendingKey);
    nativeStorage.remove(needsPullKey(state.accountEmail));
    return true;
  }

  function mustPullFromCloud() {
    return nativeStorage.get(needsPullKey(state.accountEmail)) === 'true' ||
      !nativeStorage.get(localUpdatedKey(state.accountEmail));
  }

  async function syncNow(interactive) {
    if (state.busy || !state.accountEmail) return;

    if (!root.navigator.onLine) {
      if (interactive || nativeStorage.get(constants.pendingKey) === 'true') {
        nativeStorage.set(constants.pendingKey, 'true');
        toast(
          '✓ Guardado localmente',
          'Se sincronizará automáticamente al conectarse a Internet.',
          'amber'
        );
      }
      return;
    }

    state.busy = true;
    try {
      toast('☁️ Sincronizando', 'Sincronizando con Google Drive…', 'cyan');
      const pullOnly = mustPullFromCloud();
      const cloud = await runtime.drive.readCloud();
      const local = payload();

      if (!cloud) {
        await runtime.drive.writeCloud(local);
        nativeStorage.set(constants.lastSyncKey, local.updatedAt);
        nativeStorage.remove(constants.pendingKey);
        nativeStorage.remove(needsPullKey(state.accountEmail));
        toast('✓ Sincronizado correctamente', 'Los datos están guardados en Google Drive.', 'emerald');
        return;
      }

      if (pullOnly && applyCloud(cloud)) {
        toast('✓ Datos restaurados', 'Se descargaron los datos de tu cuenta desde Google Drive.', 'emerald');
        setTimeout(() => root.location.reload(), 600);
        return;
      }

      const localUpdated = Date.parse(local.updatedAt) || 0;
      const cloudUpdated = Date.parse(cloud.updatedAt) || Date.parse(cloud.modifiedTime) || 0;
      const localChanged = storage.dataString() !== JSON.stringify(cloud.data || {});

      if (!localChanged) {
        storage.saveAccountSnapshot(state.accountEmail, cloud.updatedAt);
        nativeStorage.set(localUpdatedKey(state.accountEmail), cloud.updatedAt || local.updatedAt);
        nativeStorage.remove(constants.pendingKey);
        nativeStorage.remove(needsPullKey(state.accountEmail));
        toast('✓ Sincronizado correctamente', 'Todos los datos están actualizados.', 'emerald');
        return;
      }

      if (localUpdated >= cloudUpdated) {
        await runtime.drive.writeCloud(local);
        nativeStorage.set(constants.lastSyncKey, local.updatedAt);
        nativeStorage.remove(constants.pendingKey);
        nativeStorage.remove(needsPullKey(state.accountEmail));
        toast('✓ Sincronizado correctamente', 'Se conservaron los cambios más recientes.', 'emerald');
      } else {
        if (applyCloud(cloud)) setTimeout(() => root.location.reload(), 600);
        toast('✓ Sincronizado correctamente', 'Se conservaron los cambios más recientes.', 'emerald');
      }
    } catch (error) {
      console.error('[OAVIX]', error);
      nativeStorage.set(constants.pendingKey, 'true');
      toast(
        '⚠ Guardado localmente',
        'Se intentará sincronizar automáticamente cuando haya conexión.',
        'amber'
      );
    } finally {
      state.busy = false;
    }
  }

  function schedule() {
    clearTimeout(state.timer);
    state.timer = setTimeout(() => syncNow(false), constants.debounce);
  }

  runtime.synchronizer = { payload, applyCloud, mustPullFromCloud, syncNow, schedule };
})(window);
