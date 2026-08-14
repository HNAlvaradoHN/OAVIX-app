import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const context = readFileSync(resolve(process.cwd(), 'src/services/sync/context.js'), 'utf8');

describe('compatibilidad de datos', () => {
  it('conserva las claves principales sincronizadas', () => {
    for (const key of ['oavix_auto_records', 'oavix_auto_mileage', 'oavix_auto_categories', 'oavix_fuel_history', 'oavix_fuel_vehicles']) {
      expect(context).toContain(`'${key}'`);
    }
  });
});
