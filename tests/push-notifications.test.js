import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(), 'src/services/push/controller.js'), 'utf8');

function installPushEnvironment(config = {}) {
  const subscription = {
    toJSON: () => ({ endpoint: 'https://push.example/device', keys: { p256dh: 'key', auth: 'auth' } })
  };
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(subscription),
    subscribe: vi.fn().mockResolvedValue(subscription)
  };
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(window, 'PushManager', { configurable: true, value: function PushManager() {} });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager }) }
  });
  window.OAVIX_PUSH_CONFIG = {
    enabled: true,
    endpoint: 'https://functions.example/syncPushState',
    publicVapidKey: 'AQAB',
    ...config
  };
  window.OAVIXSyncInternal = {
    context: { state: { accountEmail: 'driver@example.com' } },
    auth: { ensureToken: vi.fn().mockResolvedValue('google-token') }
  };
  window.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'synced' }) });
  new Function(source)();
  return { pushManager, subscription };
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('Notification', { permission: 'granted' });
});

describe('notificaciones push reales', () => {
  it('mantiene la alarma local cuando Firebase todavía no está configurado', async () => {
    installPushEnvironment({ enabled: false });
    await expect(window.OAVIXPush.enable()).resolves.toEqual({ status: 'not-configured' });
    expect(window.fetch).not.toHaveBeenCalled();
  });

  it('registra el dispositivo y sincroniza solo recordatorios activos', async () => {
    const { pushManager } = installPushEnvironment();
    pushManager.getSubscription.mockResolvedValueOnce(null);
    localStorage.setItem('oavix_auto_records', JSON.stringify([
      { id: 'due', title: 'Aceite', alertDate: '2026-08-20', alertTime: '09:30', validated: false },
      { id: 'done', title: 'Frenos', alertDate: '2026-08-21', validated: true }
    ]));

    await expect(window.OAVIXPush.enable()).resolves.toEqual({ status: 'synced' });
    expect(pushManager.subscribe).toHaveBeenCalledTimes(1);
    const request = window.fetch.mock.calls[0];
    expect(request[1].headers.Authorization).toBe('Bearer google-token');
    const reminders = JSON.parse(request[1].body).reminders;
    expect(reminders).toHaveLength(1);
    expect(reminders[0].dueAt).toMatch(/^2026-08-20T\d{2}:30:00\.000Z$/);
    expect(localStorage.getItem('oavix_push_enabled')).toBe('true');
  });

  it('el service worker muestra y abre una notificación recibida en segundo plano', async () => {
    const listeners = {};
    const notification = { close: vi.fn(), data: { url: './?tab=alerts' } };
    const client = { url: 'https://example.com/OAVIX-app/', focus: vi.fn().mockResolvedValue(), navigate: vi.fn().mockResolvedValue() };
    self.addEventListener = vi.fn((type, handler) => { listeners[type] = handler; });
    self.registration = { showNotification: vi.fn().mockResolvedValue() };
    self.clients = { matchAll: vi.fn().mockResolvedValue([client]), openWindow: vi.fn() };
    self.location = new URL('https://example.com/OAVIX-app/sw.js');
    self.caches = { open: vi.fn(), keys: vi.fn(), match: vi.fn() };
    self.fetch = vi.fn();
    vi.resetModules();
    await import('../sw.js');

    const pushPromises = [];
    listeners.push({ data: { json: () => ({ title: 'OAVIX: Aceite', body: 'Hoy', tag: 'oil' }) }, waitUntil: promise => pushPromises.push(promise) });
    await Promise.all(pushPromises);
    expect(self.registration.showNotification).toHaveBeenCalledWith('OAVIX: Aceite', expect.objectContaining({ tag: 'oil' }));

    const clickPromises = [];
    listeners.notificationclick({ notification, waitUntil: promise => clickPromises.push(promise) });
    await Promise.all(clickPromises);
    expect(notification.close).toHaveBeenCalled();
    expect(client.focus).toHaveBeenCalled();
  });
});
