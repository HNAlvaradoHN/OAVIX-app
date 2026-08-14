import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(), 'src/features/alerts/controller.js'), 'utf8');
const controller = () => new Function(`${source}; return { maintenanceReminderState, showMaintenanceWarnings, dismissMaintenanceWarning };`)();

beforeEach(() => {
  document.body.innerHTML = '<div id="alerts-list"></div><span id="nav-alerts-badge"></span>';
  sessionStorage.clear();
  window.autoRecords = [];
  window.switchSubTab = () => {};
  window.revealMaintenanceRecord = () => {};
  window.escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
});

describe('avisos internos de mantenimiento', () => {
  it('clasifica fechas próximas y vencidas sin sonido ni notificaciones del sistema', () => {
    const alerts = controller();
    const now = new Date(2026, 7, 13, 12);
    expect(alerts.maintenanceReminderState({ alertDate: '2026-08-15' }, now).level).toBe('near');
    expect(alerts.maintenanceReminderState({ alertDate: '2026-08-10' }, now).level).toBe('overdue');
    expect(source).not.toMatch(/AudioContext|new Notification|PushManager|setInterval/);
  });

  it('muestra texto seguro y permite cerrar el aviso', () => {
    window.autoRecords = [{ id: 'one', title: '<img src=x onerror=alert(1)>', alertDate: '2020-01-01', validated: false }];
    const alerts = controller();
    alerts.showMaintenanceWarnings();
    const notice = document.querySelector('[data-maintenance-warning]');
    expect(notice).not.toBeNull();
    expect(notice.querySelector('img')).toBeNull();
    expect(notice.textContent).toContain('<img src=x onerror=alert(1)>');
    const close = notice.querySelector('[aria-label="Cerrar aviso"]');
    alerts.dismissMaintenanceWarning(close);
    expect(document.querySelector('[data-maintenance-warning]')).toBeNull();
  });
});
