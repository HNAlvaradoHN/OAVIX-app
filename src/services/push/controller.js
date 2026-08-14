(function initializeOavixPush(root) {
  'use strict';

  const config = root.OAVIX_PUSH_CONFIG || {};
  let syncTimer = null;

  function supported() {
    return Boolean(root.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in root);
  }

  function configured() {
    return Boolean(config.enabled && config.endpoint && config.publicVapidKey);
  }

  function decodeVapidKey(value) {
    const padding = '='.repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(base64), character => character.charCodeAt(0));
  }

  function recordsForPush() {
    try {
      const records = JSON.parse(localStorage.getItem('oavix_auto_records') || '[]');
      return Array.isArray(records)
        ? records.filter(record => !record.validated && record.alertDate && new Date(dueAt(record)).getTime() > Date.now())
        : [];
    } catch {
      return [];
    }
  }

  function dueAt(record) {
    const date = String(record.alertDate || '');
    const time = String(record.alertTime || '09:00');
    const localDate = new Date(`${date}T${time}:00`);
    return Number.isNaN(localDate.getTime()) ? '' : localDate.toISOString();
  }

  async function googleAccessToken(interactive) {
    const runtime = root.OAVIXSyncInternal;
    if (!runtime || !runtime.context.state.accountEmail || !runtime.auth) {
      throw new Error('Inicia sesión con Google para activar los avisos push.');
    }
    return runtime.auth.ensureToken(Boolean(interactive));
  }

  async function pushSubscription(create) {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription && create) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(config.publicVapidKey)
      });
    }
    return subscription;
  }

  async function sendState(subscription, interactive) {
    const token = await googleAccessToken(interactive);
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        subscription: subscription ? subscription.toJSON() : null,
        reminders: recordsForPush().map(record => ({
          id: String(record.id),
          title: String(record.title || 'Mantenimiento programado'),
          category: String(record.category || ''),
          alertDate: String(record.alertDate || ''),
          alertTime: String(record.alertTime || '09:00'),
          dueAt: dueAt(record)
        })),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Tegucigalpa'
      })
    });
    if (!response.ok) throw new Error(`No se pudo sincronizar el servicio push (${response.status}).`);
    localStorage.setItem('oavix_push_enabled', subscription ? 'true' : 'false');
    return response.json();
  }

  async function enable() {
    if (!supported()) throw new Error('Este navegador no admite notificaciones push.');
    if (!configured()) return { status: 'not-configured' };
    if (Notification.permission !== 'granted') throw new Error('Primero permite las notificaciones del sistema.');
    const subscription = await pushSubscription(true);
    const result = await sendState(subscription, true);
    root.dispatchEvent(new CustomEvent('oavix:push-state-changed'));
    return result;
  }

  async function sync() {
    if (!supported() || !configured() || Notification.permission !== 'granted') return { status: 'inactive' };
    const subscription = await pushSubscription(false);
    if (!subscription) return { status: 'unsubscribed' };
    return sendState(subscription, false);
  }

  function scheduleSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => sync().catch(error => console.warn('[OAVIX Push]', error.message)), 1800);
  }

  function status() {
    return { supported: supported(), configured: configured(), enabled: localStorage.getItem('oavix_push_enabled') === 'true' };
  }

  root.OAVIXPush = { enable, sync, scheduleSync, status };
})(window);
