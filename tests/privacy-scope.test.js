import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const context = readFileSync(resolve(process.cwd(), 'src/services/sync/context.js'), 'utf8');

describe('alcance OAuth', () => {
  it('permanece limitado a appDataFolder', () => {
    expect(context).toContain('https://www.googleapis.com/auth/drive.appdata');
    expect(context).not.toContain('https://www.googleapis.com/auth/drive ');
    expect(context).not.toContain('https://www.googleapis.com/auth/drive.readonly');
  });
});
