import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const doc = readFileSync(resolve(process.cwd(), 'AUDITORIA-ESTABILIDAD.md'), 'utf8');

describe('documentación de auditoría', () => {
  it('registra las protecciones aplicadas', () => {
    expect(doc).toContain('Protege el cierre de sesión');
    expect(doc).toContain('Combustibles');
    expect(doc).toContain('drive.appdata');
  });
});
