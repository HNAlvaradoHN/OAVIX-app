import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const context = readFileSync(resolve(process.cwd(), 'src/services/sync/context.js'), 'utf8');

describe('privacidad de Drive', () => {
  it('no solicita el alcance general de Drive', () => {
    expect(context).toContain("driveScope: 'https://www.googleapis.com/auth/drive.appdata'");
    expect(context).not.toMatch(/driveScope:\s*['"]https:\/\/www\.googleapis\.com\/auth\/drive['"]/);
  });
});
