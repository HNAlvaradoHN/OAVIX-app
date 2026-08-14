import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const settings = readFileSync(resolve(process.cwd(), 'src/ui/settings/controller.js'), 'utf8');

describe('aviso de cambios pendientes', () => {
  it('explica que los cambios aún no están respaldados', () => {
    expect(settings).toContain('todavía no están respaldados en Google Drive');
    expect(settings).toContain('No se cerró la sesión');
  });
});
