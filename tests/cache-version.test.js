import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sw = readFileSync(resolve(process.cwd(), 'sw.js'), 'utf8');
const ui = readFileSync(resolve(process.cwd(), 'src/services/sync/ui.js'), 'utf8');

describe('actualización PWA', () => {
  it('usa la misma generación de service worker', () => {
    expect(sw).toContain("const CACHE = 'oavix-shell-v20'");
    expect(ui).toContain("navigator.serviceWorker.register('sw.js?v=20')");
  });
});
