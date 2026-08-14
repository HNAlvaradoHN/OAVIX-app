import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = path => readFileSync(resolve(process.cwd(), path), 'utf8');
const viewSource = read('src/ui/settings/view.html');
const settingsSource = read('src/ui/settings/controller.js');
const styles = read('src/styles/app.css');

function settingsController() {
  return new Function(`${settingsSource}; return {
    openSettingsMenu, closeSettingsMenu, toggleSettingsMenu, initializeSettingsMenu
  };`)();
}

beforeEach(() => {
  document.body.innerHTML = viewSource;
  document.documentElement.className = 'dark';
  window.showToast = vi.fn();
  window.refreshSettingsSyncState = vi.fn();
});

describe('centro de control', () => {
  it('reúne todos los controles y elimina los botones dispersos', () => {
    const view = new DOMParser().parseFromString(viewSource, 'text/html');
    const header = read('src/app-shell/header.html');
    const dashboard = read('src/features/dashboard/view.html');

    for (const id of [
      'oavix-settings-toggle', 'oavix-drive-control',
      'settings-customize', 'settings-theme-toggle', 'settings-export-excel',
      'settings-export-pdf', 'oavix-settings-backdrop', 'oavix-export-picker'
    ]) expect(view.getElementById(id), id).not.toBeNull();

    expect(header).not.toContain('btn-notif-perm');
    expect(header).not.toContain('openThemeModal()');
    expect(dashboard).not.toContain('openExportModal');
    expect(view.querySelector('#oavix-settings-toggle .fa-gear')).not.toBeNull();
  });

  it('abre, cierra y mantiene atributos accesibles', () => {
    const controller = settingsController();
    controller.initializeSettingsMenu();
    const panel = document.getElementById('oavix-settings-panel');
    const toggle = document.getElementById('oavix-settings-toggle');

    controller.toggleSettingsMenu();
    expect(panel.classList.contains('hidden')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById('oavix-settings-backdrop').classList.contains('hidden')).toBe(false);
    expect(document.body.classList.contains('oavix-settings-open')).toBe(true);

    controller.closeSettingsMenu();
    expect(panel.classList.contains('hidden')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById('oavix-settings-backdrop').classList.contains('hidden')).toBe(true);
    expect(document.body.classList.contains('oavix-settings-open')).toBe(false);
  });

  it('conecta el botón de Drive con la sincronización visible del centro de control', async () => {
    const controller = settingsController();
    const syncNow = vi.fn().mockResolvedValue({ status: 'synced' });
    window.OAVIXDriveSync = { syncNow };
    controller.initializeSettingsMenu();

    await document.getElementById('oavix-drive-control').onclick();

    expect(syncNow).toHaveBeenCalledTimes(1);
    expect(document.getElementById('settings-sync-state').textContent).toBe('Actualizado');
    delete window.OAVIXDriveSync;
  });

  it('protege el menú en móvil pequeño, tableta y escritorio', () => {
    const dashboard = read('src/features/dashboard/view.html');
    expect(styles).toMatch(/\.oavix-settings-panel[\s\S]*width:\s*min\(23rem,\s*calc\(100vw\s*-\s*1\.2rem\)\)/);
    expect(styles).toMatch(/max-height:[^;]*var\(--bottom-nav-clearance\)/);
    expect(styles).toMatch(/@media\s*\(max-width:\s*379px\)[\s\S]*\.oavix-settings-grid\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(styles).toMatch(/@media\s*\(min-width:\s*640px\)[\s\S]*\.oavix-settings-panel/);
    expect(styles).toMatch(/\.oavix-settings-backdrop[\s\S]*backdrop-filter:\s*blur\(9px\)/);
    expect(styles).toContain('@keyframes oavixBackgroundDrift');
    expect(styles).toContain('.light-theme .animated-glass-card');
    expect(dashboard).toContain('dashboard-surface');
  });
});
