import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = path => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('integración de guardas de estabilidad', () => {
  it('carga las guardas sin retirar los módulos existentes', () => {
    const index = read('index.html');
    const app = read('src/app.js');
    const sw = read('sw.js');

    expect(index).toContain('src/features/fuel/module.js?v=1');
    expect(index).toContain('src/features/fuel/storage-guard.js?v=1');
    expect(app).toContain("'src/core/stability-guards.js'");
    expect(app).toContain("'src/features/maintenance/controller.js'");
    expect(app).toContain("'src/features/calendar/controller.js'");
    expect(app).toContain("'src/features/fuel/controller.js'");
    expect(sw).toContain("const CACHE = 'oavix-shell-v20'");
    expect(sw).toContain("'./src/features/fuel/storage-guard.js'");
    expect(sw).toContain("'./src/core/stability-guards.js'");
  });
});
