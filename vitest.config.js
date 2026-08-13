import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    env: { TZ: 'UTC' },
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'src/features/fuel/module.js',
        'src/services/sync/*.js',
        'oavix-sync-config.js',
        'sw.js'
      ]
    }
  }
});
