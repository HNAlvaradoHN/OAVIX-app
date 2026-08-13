import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, Script } from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';

const read = path => readFileSync(resolve(process.cwd(), path), 'utf8');

function loadToastController() {
  const timers = [];
  const context = createContext({
    document,
    setTimeout: callback => {
      timers.push(callback);
      return timers.length;
    }
  });
  context.window = context;
  new Script(read('src/ui/toasts/controller.js')).runInContext(context);
  return { context, timers };
}

describe('non-blocking toasts', () => {
  beforeEach(() => {
    document.body.innerHTML = read('src/ui/toasts/view.html');
  });

  it('places the notification stack away from the bottom navigation', () => {
    const view = read('src/ui/toasts/view.html');
    const styles = read('src/styles/app.css');
    const container = document.getElementById('toast-container');

    expect(container.classList.contains('toast-stack')).toBe(true);
    expect(container.classList.contains('bottom-4')).toBe(false);
    expect(container.classList.contains('pointer-events-none')).toBe(true);
    expect(container.getAttribute('aria-live')).toBe('polite');
    expect(styles).toMatch(/\.toast-stack\s*\{[^}]*top:/s);
    expect(styles).toMatch(/\.toast-stack\s*\{[^}]*left:\s*3\.75rem/s);
    expect(view).not.toContain('bottom-4');
  });

  it('never lets a visible notification capture navigation taps', () => {
    const { context } = loadToastController();
    new Script("showToast('Sincronizado', 'Todo está actualizado.', 'emerald')").runInContext(context);

    const toast = document.querySelector('[data-oavix-toast]');
    expect(toast).not.toBeNull();
    expect(toast.classList.contains('pointer-events-none')).toBe(true);
    expect(toast.classList.contains('pointer-events-auto')).toBe(false);
    expect(toast.getAttribute('role')).toBe('status');
  });

  it('keeps at most two messages visible so they do not cover the interface', () => {
    const { context } = loadToastController();
    new Script(`
      showToast('Primero', 'Uno', 'cyan');
      showToast('Segundo', 'Dos', 'cyan');
      showToast('Tercero', 'Tres', 'cyan');
    `).runInContext(context);

    const toasts = Array.from(document.querySelectorAll('[data-oavix-toast]'));
    expect(toasts).toHaveLength(2);
    expect(toasts.map(toast => toast.textContent)).toEqual([
      expect.stringContaining('Segundo'),
      expect.stringContaining('Tercero')
    ]);
  });
});
