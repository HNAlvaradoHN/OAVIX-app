import { describe, it, expect, beforeEach, vi } from 'vitest';

const CATEGORY_KEY = 'oavix_auto_categories';
const CATEGORY_INIT_KEY = 'oavix_auto_categories_initialized';
const DEFAULTS = [
  'Mantenimiento General',
  'Cambio de Aceite',
  'Llantas / Frenos',
  'Combustible',
  'Reparaciones'
];

async function loadConfig() {
  vi.resetModules();
  await import('../oavix-sync-config.js');
}

function storedCategories() {
  return JSON.parse(localStorage.getItem(CATEGORY_KEY));
}

describe('oavix-sync-config', () => {
  beforeEach(() => {
    localStorage.clear();
    document.head.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('publishes the public Google OAuth client id', async () => {
    await loadConfig();
    expect(window.OAVIX_GOOGLE_CLIENT_ID).toMatch(/\.apps\.googleusercontent\.com$/);
  });

  describe('theme overrides stylesheet', () => {
    it('injects the stylesheet link once', async () => {
      await loadConfig();

      const link = document.getElementById('oavix-theme-overrides');
      expect(link.tagName).toBe('LINK');
      expect(link.rel).toBe('stylesheet');
      expect(link.getAttribute('href')).toBe('oavix-theme-overrides.css?v=1');

      await loadConfig();
      expect(document.querySelectorAll('link#oavix-theme-overrides')).toHaveLength(1);
    });
  });

  describe('maintenance categories bootstrap', () => {
    it('seeds the default categories on a fresh install', async () => {
      await loadConfig();
      expect(storedCategories()).toEqual(DEFAULTS);
    });

    it('keeps categories chosen by the user', async () => {
      localStorage.setItem(CATEGORY_KEY, JSON.stringify(['Solo Frenos']));
      await loadConfig();
      expect(storedCategories()).toEqual(['Solo Frenos']);
    });

    it('recovers an unmanaged empty list once', async () => {
      localStorage.setItem(CATEGORY_KEY, JSON.stringify([]));
      await loadConfig();
      expect(storedCategories()).toEqual(DEFAULTS);
    });

    it('respects an empty list the user manages deliberately', async () => {
      localStorage.setItem(CATEGORY_KEY, JSON.stringify([]));
      localStorage.setItem(CATEGORY_INIT_KEY, 'true');
      await loadConfig();
      expect(storedCategories()).toEqual([]);
    });

    it('replaces a non-array value with the defaults', async () => {
      localStorage.setItem(CATEGORY_KEY, JSON.stringify({ oops: true }));
      await loadConfig();
      expect(storedCategories()).toEqual(DEFAULTS);
    });

    it('replaces unparseable JSON with the defaults', async () => {
      localStorage.setItem(CATEGORY_KEY, '[[[');
      await loadConfig();
      expect(storedCategories()).toEqual(DEFAULTS);
    });
  });
});
