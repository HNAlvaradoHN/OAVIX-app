import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = path => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('alcance mínimo de la auditoría', () => {
  it('no cambia el formato principal del respaldo', () => {
    const context = read('src/services/sync/context.js');
    const sync = read('src/services/sync/synchronizer.js');

    expect(context).toContain("fileName: 'oavix-data.json'");
    expect(sync).toContain("schemaVersion: 6");
    expect(sync).toContain("app: 'OAVIX'");
  });
});
