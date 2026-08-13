import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = path => readFileSync(resolve(process.cwd(), path), 'utf8');

const modules = [
  'src/services/sync/context.js',
  'src/services/sync/merge-engine.js',
  'src/services/sync/account-storage.js',
  'src/services/sync/feedback.js',
  'src/services/sync/google-auth.js',
  'src/services/sync/drive-client.js',
  'src/services/sync/synchronizer.js',
  'src/services/sync/ui.js',
  'src/services/sync/bootstrap.js'
];

const responsibilities = {
  'src/services/sync/merge-engine.js': ['normalizePayload', 'mergePayloads', 'recordMutation'],
  'src/services/sync/account-storage.js': ['dataSnapshot', 'restoreAccount', 'installMutationHooks'],
  'src/services/sync/google-auth.js': ['requestToken', 'loginWithGoogle', 'logoutSession'],
  'src/services/sync/drive-client.js': ['drive', 'findFile', 'readCloud', 'writeCloud'],
  'src/services/sync/synchronizer.js': ['applyCloud', 'syncNow', 'schedule'],
  'src/services/sync/ui.js': ['buildLogin', 'cleanHeader', 'installPwa', 'initUI']
};

describe('sync service architecture', () => {
  it('loads the sync modules synchronously in dependency order', () => {
    const html = read('index.html');
    const positions = modules.map(path => html.indexOf(path));

    expect(positions.every(position => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(html.indexOf('src/services/sync/bootstrap.js')).toBeLessThan(html.indexOf('src/features/fuel/module.js'));
  });

  it('removes the old authentication and sync monolith', () => {
    expect(existsSync(resolve(process.cwd(), 'oavix-sync.js'))).toBe(false);
    expect(read('index.html')).not.toContain('src="oavix-sync.js');
  });

  it.each(Object.entries(responsibilities))('keeps %s responsibilities isolated', (path, functions) => {
    const source = read(path);

    for (const functionName of functions) {
      expect(source).toMatch(new RegExp(`function\\s+${functionName}\\s*\\(`));
      for (const otherPath of modules.filter(candidate => candidate !== path)) {
        expect(read(otherPath)).not.toMatch(new RegExp(`function\\s+${functionName}\\s*\\(`));
      }
    }
  });

  it('keeps network, UI and local-account concerns out of each other', () => {
    expect(read('src/services/sync/account-storage.js')).not.toContain('googleapis.com');
    expect(read('src/services/sync/drive-client.js')).not.toContain('document.');
    expect(read('src/services/sync/ui.js')).not.toMatch(/\bfetch\s*\(/);
    expect(read('src/services/sync/synchronizer.js')).not.toContain('modal-login');
  });

  it('exposes the compatibility API only from the sync bootstrap', () => {
    const bootstrap = read('src/services/sync/bootstrap.js');
    const otherModules = modules.filter(path => !path.endsWith('/bootstrap.js')).map(read).join('\n');

    expect(bootstrap).toContain('root.OAVIXDriveSync');
    expect(otherModules).not.toContain('OAVIXDriveSync');
  });
});
