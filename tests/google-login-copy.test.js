import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ui = readFileSync(resolve(process.cwd(), 'src/services/sync/ui.js'), 'utf8');

describe('pantalla de acceso', () => {
  it('mantiene Google e invitado junto a la explicación de privacidad', () => {
    expect(ui).toContain('Continuar con Google');
    expect(ui).toContain('Usar como invitado');
    expect(ui).toContain('Tu privacidad está protegida');
  });
});
