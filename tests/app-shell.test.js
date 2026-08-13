import { beforeEach, describe, expect, it, vi } from 'vitest';

const originalAppendChild = document.body.appendChild.bind(document.body);

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  delete window.OAVIX_APP_READY;
  delete document.documentElement.dataset.oavixReady;
  document.head.innerHTML = '';
  document.body.innerHTML = `
    <div data-oavix-fragment="first.html"></div>
    <div data-oavix-fragment="second.html"></div>
  `;
});

describe('app shell bootstrap', () => {
  it('loads every view before starting the application controller', async () => {
    const events = [];
    const loadedScripts = [];
    document.addEventListener('oavix:views-ready', () => events.push('views'), { once: true });
    document.addEventListener('oavix:ready', () => events.push('app'), { once: true });

    window.fetch = vi.fn(async path => ({
      ok: true,
      text: async () => path === 'first.html'
        ? '<section id="first-view">Primera</section>'
        : '<section id="second-view">Segunda</section>'
    }));

    vi.spyOn(document.body, 'appendChild').mockImplementation(node => {
      const result = originalAppendChild(node);
      if (node.tagName === 'SCRIPT') {
        loadedScripts.push(node.getAttribute('src'));
        queueMicrotask(() => node.onload());
      }
      return result;
    });

    const app = await import('../src/app.js');
    await window.OAVIX_APP_READY;

    expect(document.getElementById('first-view')).not.toBeNull();
    expect(document.getElementById('second-view')).not.toBeNull();
    expect(document.querySelector('[data-oavix-fragment]')).toBeNull();
    expect(events).toEqual(['views', 'app']);
    expect(loadedScripts).toEqual(app.controllerScripts.map(path => `${path}?v=5`));
    expect(loadedScripts.at(-1)).toBe('src/core/bootstrap.js?v=5');
    expect(document.documentElement.dataset.oavixReady).toBe('true');
  });

  it('shows a recoverable error surface if a view cannot load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.fetch = vi.fn(async () => ({ ok: false, status: 503 }));

    await import('../src/app.js');
    await expect(window.OAVIX_APP_READY).rejects.toThrow('No se pudo cargar');

    expect(document.body.textContent).toContain('OAVIX no pudo iniciar');
    expect(document.body.textContent).toContain('Recarga la página');
  });
});
