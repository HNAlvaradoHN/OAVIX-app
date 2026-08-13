import { beforeEach, describe, expect, it, vi } from 'vitest';

const EMAIL = 'piloto@oavix.hn';
const RECORDS = 'oavix_auto_records';
const FUEL = 'oavix_fuel_history';

function createStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(String(key)) ?? null,
    setItem: (key, value) => values.set(String(key), String(value)),
    removeItem: key => values.delete(String(key))
  };
}

async function loadMergeEngine() {
  delete window.OAVIXSyncInternal;
  vi.resetModules();
  await import('../src/services/sync/context.js');
  await import('../src/services/sync/merge-engine.js');
  return window.OAVIXSyncInternal.merge;
}

function payload({ updatedAt, data = {}, keys = Object.keys(data), keyTimes = {}, entities = {}, baselines = {} }) {
  return {
    schemaVersion: 6,
    app: 'OAVIX',
    account: EMAIL,
    updatedAt,
    keys,
    data,
    metadata: {
      keys: Object.fromEntries(keys.map(key => [key, keyTimes[key] || updatedAt])),
      entities,
      legacyEntityBaselines: baselines
    }
  };
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', {
    value: createStorage(),
    configurable: true,
    writable: true
  });
});

describe('record-level Drive merge', () => {
  it('migrates only the exact legacy demo entry and leaves real records intact', async () => {
    const merge = await loadMergeEngine();
    const time = '2026-08-10T10:00:00.000Z';
    const demo = {
      id: '1',
      title: 'Cambio de Aceite Sintético',
      category: 'Cambio de Aceite',
      amount: 60,
      mileage: 86000,
      provider: 'Taller San Pedro',
      date: '2026-06-01',
      notes: 'Filtro nuevo'
    };
    const real = { ...demo, id: 'real', notes: 'Trabajo real del usuario' };
    const oldCopy = {
      schemaVersion: 5,
      updatedAt: time,
      data: { [RECORDS]: JSON.stringify([demo, real]) }
    };

    const normalized = merge.normalizePayload(oldCopy, EMAIL);

    expect(merge.containsLegacyDemo(oldCopy)).toBe(true);
    expect(JSON.parse(normalized.data[RECORDS])).toEqual([real]);
    expect(normalized.metadata.entities[RECORDS]['1'].deletedAt).toBe(time);
  });

  it('keeps independent maintenance records created on two devices', async () => {
    const merge = await loadMergeEngine();
    const phoneTime = '2026-08-10T10:00:00.000Z';
    const tabletTime = '2026-08-10T11:00:00.000Z';
    const phone = payload({
      updatedAt: phoneTime,
      data: { [RECORDS]: JSON.stringify([{ id: 'phone', title: 'Aceite' }]) },
      entities: { [RECORDS]: { phone: { updatedAt: phoneTime } } }
    });
    const tablet = payload({
      updatedAt: tabletTime,
      data: { [RECORDS]: JSON.stringify([{ id: 'tablet', title: 'Frenos' }]) },
      entities: { [RECORDS]: { tablet: { updatedAt: tabletTime } } }
    });

    const combined = merge.mergePayloads(phone, tablet, EMAIL);

    expect(JSON.parse(combined.data[RECORDS]).map(record => record.id)).toEqual(['tablet', 'phone']);
  });

  it('keeps the newest edit when both devices changed the same record', async () => {
    const merge = await loadMergeEngine();
    const older = '2026-08-10T10:00:00.000Z';
    const newer = '2026-08-10T11:00:00.000Z';
    const phone = payload({
      updatedAt: older,
      data: { [RECORDS]: JSON.stringify([{ id: 'shared', title: 'Aceite' }]) },
      entities: { [RECORDS]: { shared: { updatedAt: older } } }
    });
    const tablet = payload({
      updatedAt: newer,
      data: { [RECORDS]: JSON.stringify([{ id: 'shared', title: 'Aceite y filtro' }]) },
      entities: { [RECORDS]: { shared: { updatedAt: newer } } }
    });

    const combined = merge.mergePayloads(phone, tablet, EMAIL);

    expect(JSON.parse(combined.data[RECORDS])).toEqual([{ id: 'shared', title: 'Aceite y filtro' }]);
  });

  it('keeps a deletion marker so stale devices cannot restore a deleted record', async () => {
    const merge = await loadMergeEngine();
    const oldTime = '2026-08-10T10:00:00.000Z';
    const deleteTime = '2026-08-10T12:00:00.000Z';
    const stale = payload({
      updatedAt: oldTime,
      data: { [RECORDS]: JSON.stringify([{ id: 'deleted', title: 'Viejo' }]) },
      entities: { [RECORDS]: { deleted: { updatedAt: oldTime } } }
    });
    const deleted = payload({
      updatedAt: deleteTime,
      data: { [RECORDS]: '[]' },
      entities: { [RECORDS]: { deleted: { updatedAt: deleteTime, deletedAt: deleteTime } } }
    });

    const firstMerge = merge.mergePayloads(stale, deleted, EMAIL);
    const secondMerge = merge.mergePayloads(firstMerge, stale, EMAIL);

    expect(JSON.parse(secondMerge.data[RECORDS])).toEqual([]);
    expect(secondMerge.metadata.entities[RECORDS].deleted.deletedAt).toBe(deleteTime);
  });

  it('also combines independent gasoline entries', async () => {
    const merge = await loadMergeEngine();
    const phoneTime = '2026-08-10T10:00:00.000Z';
    const tabletTime = '2026-08-10T11:00:00.000Z';
    const phone = payload({
      updatedAt: phoneTime,
      data: { [FUEL]: JSON.stringify([{ id: 'fill-phone', gallons: 5 }]) },
      entities: { [FUEL]: { 'fill-phone': { updatedAt: phoneTime } } }
    });
    const tablet = payload({
      updatedAt: tabletTime,
      data: { [FUEL]: JSON.stringify([{ id: 'fill-tablet', gallons: 7 }]) },
      entities: { [FUEL]: { 'fill-tablet': { updatedAt: tabletTime } } }
    });

    const combined = merge.mergePayloads(phone, tablet, EMAIL);

    expect(JSON.parse(combined.data[FUEL]).map(record => record.id)).toEqual(['fill-tablet', 'fill-phone']);
  });

  it('does not let a future-dated but empty new device erase Drive', async () => {
    const merge = await loadMergeEngine();
    const cloudTime = '2026-08-10T10:00:00.000Z';
    const emptyDevice = payload({
      updatedAt: '2099-01-01T00:00:00.000Z',
      data: {},
      keys: []
    });
    const drive = payload({
      updatedAt: cloudTime,
      data: {
        [RECORDS]: JSON.stringify([{ id: 'drive', title: 'Conservado' }]),
        oavix_auto_unit: 'km'
      },
      entities: { [RECORDS]: { drive: { updatedAt: cloudTime } } }
    });

    const combined = merge.mergePayloads(emptyDevice, drive, EMAIL);

    expect(JSON.parse(combined.data[RECORDS])).toHaveLength(1);
    expect(combined.data.oavix_auto_unit).toBe('km');
    expect(combined.updatedAt).toBe(cloudTime);
  });

  it('chooses settings independently instead of replacing the whole snapshot', async () => {
    const merge = await loadMergeEngine();
    const phone = payload({
      updatedAt: '2026-08-10T12:00:00.000Z',
      data: { oavix_auto_unit: 'mi', oavix_auto_mileage: '100' },
      keyTimes: {
        oavix_auto_unit: '2026-08-10T12:00:00.000Z',
        oavix_auto_mileage: '2026-08-10T09:00:00.000Z'
      }
    });
    const tablet = payload({
      updatedAt: '2026-08-10T11:00:00.000Z',
      data: { oavix_auto_unit: 'km', oavix_auto_mileage: '200' },
      keyTimes: {
        oavix_auto_unit: '2026-08-10T10:00:00.000Z',
        oavix_auto_mileage: '2026-08-10T11:00:00.000Z'
      }
    });

    const combined = merge.mergePayloads(phone, tablet, EMAIL);

    expect(combined.data.oavix_auto_unit).toBe('mi');
    expect(combined.data.oavix_auto_mileage).toBe('200');
  });

  it('records additions, edits and deletions when localStorage changes', async () => {
    const merge = await loadMergeEngine();
    const firstTime = '2026-08-10T10:00:00.000Z';
    const changedAt = '2026-08-10T11:00:00.000Z';
    const original = payload({
      updatedAt: firstTime,
      data: { [RECORDS]: JSON.stringify([{ id: 'keep', title: 'Antes' }, { id: 'remove' }]) },
      entities: {
        [RECORDS]: {
          keep: { updatedAt: firstTime },
          remove: { updatedAt: firstTime }
        }
      }
    });
    const nextRaw = JSON.stringify([{ id: 'keep', title: 'Después' }, { id: 'add' }]);

    const changed = merge.recordMutation(
      original,
      RECORDS,
      original.data[RECORDS],
      nextRaw,
      changedAt,
      EMAIL
    );

    expect(changed.metadata.entities[RECORDS].keep.updatedAt).toBe(changedAt);
    expect(changed.metadata.entities[RECORDS].add.updatedAt).toBe(changedAt);
    expect(changed.metadata.entities[RECORDS].remove.deletedAt).toBe(changedAt);
  });
});
