import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = path => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('invariantes después de la auditoría', () => {
  it('mantiene Drive appdata y el merge existente', () => {
    const context = read('src/services/sync/context.js');
    const drive = read('src/services/sync/drive-client.js');
    const merge = read('src/services/sync/merge-engine.js');

    expect(context).toContain("driveScope: 'https://www.googleapis.com/auth/drive.appdata'");
    expect(drive).toContain("parents: ['appDataFolder']");
    expect(drive).toContain("name='${constants.fileName}' and 'appDataFolder' in parents");
    expect(merge).toContain('mergeEntityKey');
    expect(merge).toContain('recordMutation');
  });
});
