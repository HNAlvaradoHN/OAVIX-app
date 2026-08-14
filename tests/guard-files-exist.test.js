import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('archivos de estabilidad', () => {
  it('incluye las dos guardas nuevas', () => {
    expect(existsSync(resolve(process.cwd(), 'src/core/stability-guards.js'))).toBe(true);
    expect(existsSync(resolve(process.cwd(), 'src/features/fuel/storage-guard.js'))).toBe(true);
  });
});
