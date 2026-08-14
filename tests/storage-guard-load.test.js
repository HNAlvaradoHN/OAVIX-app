import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const index = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

describe('carga de guardia de almacenamiento', () => {
  it('carga la guardia después del módulo de combustibles', () => {
    const moduleIndex = index.indexOf('src/features/fuel/module.js?v=1');
    const guardIndex = index.indexOf('src/features/fuel/storage-guard.js?v=1');
    expect(moduleIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeGreaterThan(moduleIndex);
  });
});
