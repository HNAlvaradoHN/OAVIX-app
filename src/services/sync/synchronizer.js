(function initializeSynchronizer(root) {
  'use strict';

  const runtime = root.OAVIXSyncInternal;
  const { constants, state, nativeStorage, localUpdatedKey, needsPullKey } = runtime.context;
  const storage = runtime.storage;
  const merge = runtime.merge;
  const { toast } = runtime.feedback;

  function payload() {
    const rawSnapshot = storage.accountSnapshot(state.accountEmail);
    const snapshot = merge.normalizePayload(rawSnapshot, state.accountEmail);
    const data = storage.dataSnapshot();
    const keys = constants.dataKeys.filter(
      key => snapshot.keys.includes(key) || Object.prototype.hasOwnProperty.call(data, key)
    );
    const updatedAt = nativeStorage.get(localUpdatedKey(state.accountEmail)) ||
      rawSnapshot && rawSnapshot.updatedAt ||
      new Date().toISOString();

    return merge.normalizePayload({
      schemaVersion: 6,
      app: 'OAVIX',
      account: state.accountEmail,
      updatedAt,
      keys,
      data,
      metadata: snapshot.metadata
    }, state.accountEmail);
  }

  function applyCloud(cloudPayload, synced = false) {
    if (!cloudPayload || typeof cloudPayload !== 'object') return false;
    const copy = merge.normalizePayload(cloudPayload, state.accountEmail);

    constants.dataKeys.forEach(key => {
      if (Object.prototype.hasOwnProperty.call(copy.data, key)) {
        nativeStorage.set(key, copy.data[key]);
      } else if (copy.keys.includes(key)) {
        nativeStorage.remove(key);
      }
    });

    storage.storeAccountSnapshot(state.accountEmail, copy);
    nativeStorage.set(localUpdatedKey(state.accountEmail), copy.updatedAt);
    if (synced) finishSync(copy);
    return true;
  }

  function finishSync(copy) {
    storage.storeAccountSnapshot(state.accountEmail, copy);
    nativeStorage.set(localUpdatedKey(state.accountEmail), copy.updatedAt);
    nativeStorage.set(constants.lastSyncKey, copy.updatedAt);
    nativeStorage.remove(constants.pendingKey);
    nativeStorage.remove(needsPullKey(state.accountEmail));
  }

  function scheduleReload(options) {
    if (options && options.reload === false) return;
    setTimeout(() => root.location.reload(), 350);
  }

  async function syncNow(interactive = false, options = {}) {
    if (state.busy || !state.accountEmail) return { status: state.busy ? 'busy' : 'signed-out' };

    if (!root.navigator.onLine) {
      if (interactive || nativeStorage.get(constants.pendingKey) === 'true') {
        nativeStorage.set(constants.pendingKey, 'true');
        toast(
          '✓ Guardado localmente',
          'Se sincronizará automáticamente al conectarse a Internet.',
          'amber'
        );
      }
      return { status: 'offline' };
    }

    state.busy = true;
    state.lastSyncAttemptAt = Date.now();
    try {
      if (interactive) toast('☁️ Sincronizando', 'Consultando Google Drive…', 'cyan');

      // Drive se consulta antes de decidir qué guardar. Una copia local vacía
      // jamás se considera sustituta automática de los datos de la cuenta.
      const cloud = await runtime.drive.readCloud();
      const local = payload();

      if (!cloud) {
        await runtime.drive.writeCloud(local);
        finishSync(local);
        if (interactive) {
          toast('✓ Sincronizado correctamente', 'Los datos están guardados en Google Drive.', 'emerald');
        }
        return { status: 'uploaded', localChanged: false, cloudChanged: true };
      }

      const combined = merge.mergePayloads(local, cloud, state.accountEmail);
      const localChanged = merge.fingerprint(local, state.accountEmail) !==
        merge.fingerprint(combined, state.accountEmail);
      const visibleChanged = merge.dataFingerprint(local, state.accountEmail) !==
        merge.dataFingerprint(combined, state.accountEmail);
      const cloudChanged = merge.fingerprint(cloud, state.accountEmail) !==
        merge.fingerprint(combined, state.accountEmail);

      if (localChanged) applyCloud(combined, false);
      if (cloudChanged) await runtime.drive.writeCloud(combined);
      finishSync(combined);

      if (visibleChanged) {
        toast(
          '✓ Datos actualizados',
          'Se combinaron en este dispositivo los cambios guardados en Google Drive.',
          'emerald'
        );
        scheduleReload(options);
      } else if (interactive) {
        toast(
          '✓ Sincronizado correctamente',
          cloudChanged ? 'Se guardaron los cambios más recientes.' : 'Todos los datos están actualizados.',
          'emerald'
        );
      }

      return { status: 'synced', localChanged, cloudChanged, visibleChanged };
    } catch (error) {
      console.error('[OAVIX]', error);
      nativeStorage.set(constants.pendingKey, 'true');
      toast(
        '⚠ Guardado localmente',
        'Se intentará sincronizar automáticamente cuando haya conexión.',
        'amber'
      );
      return { status: 'error', error };
    } finally {
      state.busy = false;
    }
  }

  function schedule() {
    clearTimeout(state.timer);
    state.timer = setTimeout(() => syncNow(false), constants.debounce);
  }

  runtime.synchronizer = { payload, applyCloud, syncNow, schedule };
})(window);
