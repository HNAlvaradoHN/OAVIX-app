import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = path => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('mensaje de privacidad de Google Drive', () => {
  it('explica el alcance real sin prometer acceso general', () => {
    const context = read('src/services/sync/context.js');
    const ui = read('src/services/sync/ui.js');

    expect(context).toContain('https://www.googleapis.com/auth/drive.appdata');
    expect(ui).toContain('espacio privado de Google Drive');
    expect(ui).toContain('no solicita acceso general a tus archivos personales de Drive');
    expect(ui).toContain('OAVIX no recibe tu contraseña');
    expect(ui).toContain('no se crea respaldo en Drive');
  });
});
