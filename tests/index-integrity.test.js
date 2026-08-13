import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = path => readFileSync(resolve(process.cwd(), path), 'utf8');
const html = read('index.html');
const navigation = read('src/app-shell/navigation.html');
const navigationController = read('src/ui/navigation/controller.js');
const appStyles = read('src/styles/app.css');
const controllers = {
  switchSubTab: 'src/ui/navigation/controller.js',
  openFormModal: 'src/features/maintenance/controller.js',
  renderRecords: 'src/features/maintenance/controller.js',
  renderCalendar: 'src/features/calendar/controller.js',
  changeMonth: 'src/features/calendar/controller.js',
  renderAlerts: 'src/features/alerts/controller.js',
  renderFuelModule: 'src/features/fuel/controller.js',
  renderArchiveRecords: 'src/features/archive/controller.js'
};
const syncScripts = [
  'src/services/sync/context.js',
  'src/services/sync/merge-engine.js',
  'src/services/sync/account-storage.js',
  'src/services/sync/feedback.js',
  'src/services/sync/google-auth.js',
  'src/services/sync/drive-client.js',
  'src/services/sync/synchronizer.js',
  'src/services/sync/ui.js',
  'src/services/sync/bootstrap.js'
];
const activeSources = html + [...new Set(Object.values(controllers)), ...syncScripts].map(read).join('\n');
const tabs = {
  dashboard: 'src/features/dashboard/view.html',
  records: 'src/features/maintenance/view.html',
  calendar: 'src/features/calendar/view.html',
  fuel: 'src/features/fuel/view.html',
  alerts: 'src/features/alerts/view.html',
  archive: 'src/features/archive/view.html'
};

function extractSwitchSubTabBody(source) {
  const match = source.match(
    /function\s+switchSubTab\s*\(t\)\s*\{([\s\S]*?)\n\s*\}\s*$/
  );

  if (!match) throw new Error('No se encontró la implementación completa de switchSubTab');
  return match[1];
}

describe('modular app shell integrity', () => {
  it('keeps index.html as a complete, small module loader', () => {
    expect(html).toMatch(/^<!DOCTYPE html>/i);
    expect(html.trimEnd()).toMatch(/<\/body>\s*<\/html>$/i);
    expect(html.split('\n').length).toBeLessThan(80);
    expect(html).toContain('src/app.js?v=8');
    expect(html).not.toContain('function switchSubTab');
    expect(existsSync(resolve(process.cwd(), 'src/legacy/app.js'))).toBe(false);
  });

  it('loads the separated sync, fuel and style assets', () => {
    expect(html).toContain('oavix-sync-config.js?v=8');
    for (const path of syncScripts) expect(html).toContain(`${path}?v=`);
    expect(html).not.toContain('src="oavix-sync.js');
    expect(html).toContain('src/features/fuel/module.js?v=1');
    expect(html).toContain('src/styles/app.css?v=5');
    expect(html).not.toContain('oavix-fuel-module.js');
  });

  it.each(Object.entries(tabs))('links the %s tab to its own view file', (tab, path) => {
    const navDocument = new DOMParser().parseFromString(navigation, 'text/html');
    const viewDocument = new DOMParser().parseFromString(read(path), 'text/html');

    expect(html).toContain(`data-oavix-fragment="${path}"`);
    expect(navDocument.getElementById(`nav-btn-${tab}`)).not.toBeNull();
    expect(viewDocument.getElementById(`subtab-${tab}`)).not.toBeNull();
  });

  it.each(Object.entries(controllers))(
    'keeps %s in its dedicated controller',
    (functionName, controllerPath) => {
      expect(read(controllerPath)).toMatch(new RegExp(`function\\s+${functionName}\\s*\\(`));
      expect(html).not.toMatch(new RegExp(`function\\s+${functionName}\\s*\\(`));
    }
  );

  it('does not keep inactive login, likes or rescue implementations', () => {
    expect(activeSources).not.toContain('OAVIX SYNC RESCUE');
    expect(activeSources).not.toContain('OAVIX HOTFIX');
    expect(activeSources).not.toMatch(/function\s+handleLoginSubmit\s*\(/);
    expect(activeSources).not.toMatch(/function\s+giveAppLike\s*\(/);
  });
});

describe('main tab navigation', () => {
  beforeEach(() => {
    document.body.innerHTML = navigation + Object.values(tabs).map(read).join('');
    window.scrollTo = vi.fn();
  });

  it('shows the selected panel and updates the active button', () => {
    const switchSubTab = new Function('t', extractSwitchSubTabBody(navigationController));

    switchSubTab('calendar');

    for (const tab of Object.keys(tabs)) {
      const panel = document.getElementById(`subtab-${tab}`);
      const button = document.getElementById(`nav-btn-${tab}`);
      expect(panel.classList.contains('hidden')).toBe(tab !== 'calendar');
      expect(button.classList.contains('active')).toBe(tab === 'calendar');
      expect(button.getAttribute('aria-current')).toBe(tab === 'calendar' ? 'page' : null);
    }
  });

  it('gives every icon a visible name but activates only the selected one', () => {
    const names = {
      dashboard: 'Inicio',
      records: 'Mantenimiento',
      calendar: 'Calendario',
      fuel: 'Combustibles',
      alerts: 'Alertas',
      archive: 'Archivos'
    };

    for (const [tab, name] of Object.entries(names)) {
      const button = document.getElementById(`nav-btn-${tab}`);
      expect(button.getAttribute('aria-label')).toBe(name);
      expect(button.hasAttribute('title')).toBe(false);
      expect(button.querySelector('.nav-label').textContent).toBe(name);
    }

    const switchSubTab = new Function('t', 'renderFuelModule', extractSwitchSubTabBody(navigationController));
    switchSubTab('fuel', vi.fn());

    expect(document.querySelectorAll('.nav-btn.active')).toHaveLength(1);
    expect(document.querySelector('.nav-btn.active .nav-label').textContent).toBe('Combustibles');
  });

  it('reserves scroll space above the floating bar without moving labels into the layout', () => {
    expect(appStyles).toMatch(/--bottom-nav-clearance:\s*8\.5rem/);
    expect(appStyles).toMatch(/body\s*>\s*main\s*\{[^}]*padding-bottom:/s);
    expect(appStyles).toMatch(/\.nav-label\s*\{[^}]*position:\s*absolute/s);
    expect(appStyles).toMatch(/\.nav-btn\.active\s+\.nav-label\s*\{/);
    expect(read('src/features/fuel/module.js')).not.toContain('floating-nav');
  });
});
