import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const app = readFileSync(resolve(process.cwd(), 'src/app.js'), 'utf8');

describe('orden de guardas', () => {
  it('instala estabilidad después de controladores funcionales y antes del bootstrap', () => {
    expect(app.indexOf("'src/core/stability-guards.js'")).toBeGreaterThan(app.indexOf("'src/features/fuel/controller.js'"));
    expect(app.indexOf("'src/core/stability-guards.js'")).toBeLessThan(app.indexOf("'src/core/bootstrap.js'"));
  });
});
