import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const INDEX_PATH = resolve(process.cwd(), 'index.html');
const html = readFileSync(INDEX_PATH, 'utf8');
const tabs = ['dashboard', 'records', 'calendar', 'fuel', 'alerts', 'archive'];

function extractSwitchSubTabBody(source) {
  const match = source.match(
    /function\s+switchSubTab\s*\(t\)\s*\{([\s\S]*?)\n\s*\}\n\n\s*function\s+openFormModal/
  );

  if (!match) throw new Error('No se encontró la implementación completa de switchSubTab');
  return match[1];
}

describe('index.html integrity', () => {
  it('has a complete HTML document instead of a truncated file', () => {
    expect(html).toMatch(/^<!DOCTYPE html>/i);
    expect(html.trimEnd()).toMatch(/<\/body>\s*<\/html>$/i);
  });

  it('loads the current sync and fuel modules', () => {
    expect(html).toContain('oavix-sync-config.js?v=8');
    expect(html).toContain('oavix-sync.js?v=9');
    expect(html).toContain('oavix-fuel-module.js?v=3');
  });

  it.each(tabs)('contains both the %s navigation button and its panel', tab => {
    const document = new DOMParser().parseFromString(html, 'text/html');
    expect(document.getElementById(`nav-btn-${tab}`)).not.toBeNull();
    expect(document.getElementById(`subtab-${tab}`)).not.toBeNull();
  });

  it.each(['switchSubTab', 'openFormModal', 'renderRecords', 'renderCalendar', 'changeMonth'])(
    'keeps the critical %s function',
    functionName => {
      expect(html).toMatch(new RegExp(`function\\s+${functionName}\\s*\\(`));
    }
  );

  it('does not keep inactive login, likes or rescue implementations', () => {
    expect(html).not.toContain('OAVIX SYNC RESCUE');
    expect(html).not.toContain('OAVIX HOTFIX');
    expect(html).not.toMatch(/function\s+handleLoginSubmit\s*\(/);
    expect(html).not.toMatch(/function\s+giveAppLike\s*\(/);
  });
});

describe('main tab navigation', () => {
  beforeEach(() => {
    document.body.innerHTML = tabs
      .map(
        tab =>
          `<button id="nav-btn-${tab}"></button><section id="subtab-${tab}" class="hidden"></section>`
      )
      .join('');

    window.scrollTo = vi.fn();
  });

  it('shows the selected panel and updates the active button', () => {
    const switchSubTab = new Function('t', extractSwitchSubTabBody(html));

    switchSubTab('calendar');

    for (const tab of tabs) {
      const panel = document.getElementById(`subtab-${tab}`);
      const button = document.getElementById(`nav-btn-${tab}`);
      expect(panel.classList.contains('hidden')).toBe(tab !== 'calendar');
      expect(button.classList.contains('active')).toBe(tab === 'calendar');
    }
  });
});
