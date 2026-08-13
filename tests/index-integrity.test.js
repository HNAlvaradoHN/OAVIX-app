import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = path => readFileSync(resolve(process.cwd(), path), 'utf8');
const html = read('index.html');
const navigation = read('src/app-shell/navigation.html');
const legacyApp = read('src/legacy/app.js');
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
    /function\s+switchSubTab\s*\(t\)\s*\{([\s\S]*?)\n\s*\}\n\n\s*function\s+openFormModal/
  );

  if (!match) throw new Error('No se encontró la implementación completa de switchSubTab');
  return match[1];
}

describe('modular app shell integrity', () => {
  it('keeps index.html as a complete, small module loader', () => {
    expect(html).toMatch(/^<!DOCTYPE html>/i);
    expect(html.trimEnd()).toMatch(/<\/body>\s*<\/html>$/i);
    expect(html.split('\n').length).toBeLessThan(80);
    expect(html).toContain('src/app.js?v=1');
    expect(html).not.toContain('function switchSubTab');
  });

  it('loads the current sync, fuel and style assets', () => {
    expect(html).toContain('oavix-sync-config.js?v=8');
    expect(html).toContain('oavix-sync.js?v=10');
    expect(html).toContain('oavix-fuel-module.js?v=3');
    expect(html).toContain('src/styles/app.css?v=1');
  });

  it.each(Object.entries(tabs))('links the %s tab to its own view file', (tab, path) => {
    const navDocument = new DOMParser().parseFromString(navigation, 'text/html');
    const viewDocument = new DOMParser().parseFromString(read(path), 'text/html');

    expect(html).toContain(`data-oavix-fragment="${path}"`);
    expect(navDocument.getElementById(`nav-btn-${tab}`)).not.toBeNull();
    expect(viewDocument.getElementById(`subtab-${tab}`)).not.toBeNull();
  });

  it.each(['switchSubTab', 'openFormModal', 'renderRecords', 'renderCalendar', 'changeMonth'])(
    'keeps the critical %s function outside index.html',
    functionName => {
      expect(legacyApp).toMatch(new RegExp(`function\\s+${functionName}\\s*\\(`));
      expect(html).not.toMatch(new RegExp(`function\\s+${functionName}\\s*\\(`));
    }
  );

  it('does not keep inactive login, likes or rescue implementations', () => {
    const activeSources = html + legacyApp;
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
    const switchSubTab = new Function('t', extractSwitchSubTabBody(legacyApp));

    switchSubTab('calendar');

    for (const tab of Object.keys(tabs)) {
      const panel = document.getElementById(`subtab-${tab}`);
      const button = document.getElementById(`nav-btn-${tab}`);
      expect(panel.classList.contains('hidden')).toBe(tab !== 'calendar');
      expect(button.classList.contains('active')).toBe(tab === 'calendar');
    }
  });
});
