(function initializeMergeEngine(root) {
  'use strict';

  const runtime = root.OAVIXSyncInternal;
  const { constants } = runtime.context;
  const EPOCH = '1970-01-01T00:00:00.000Z';
  const entityKeys = Object.freeze([
    'oavix_auto_records',
    'oavix_fuel_history'
  ]);
  const legacyDataKeys = constants.dataKeys.filter(key => !key.startsWith('oavix_fuel_'));

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
  }

  function timestamp(value, fallback = EPOCH) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
    const parsedFallback = Date.parse(fallback);
    return Number.isFinite(parsedFallback) ? new Date(parsedFallback).toISOString() : EPOCH;
  }

  function timestampValue(value) {
    return Date.parse(timestamp(value)) || 0;
  }

  function latestTimestamp(...values) {
    return values.reduce(
      (latest, value) => timestampValue(value) > timestampValue(latest) ? timestamp(value) : latest,
      EPOCH
    );
  }

  function coveredKeys(copy) {
    if (Array.isArray(copy && copy.keys)) {
      return copy.keys.filter(key => constants.dataKeys.includes(key));
    }
    if (copy && copy.data && typeof copy.data === 'object') return legacyDataKeys.slice();
    return [];
  }

  function parseArray(raw) {
    if (raw === undefined || raw === null) return [];
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  function recordMap(raw) {
    const records = parseArray(raw);
    if (!records) return null;
    const map = new Map();
    records.forEach((record, index) => {
      if (!record || record.id === undefined || record.id === null) return;
      map.set(String(record.id), { record, index });
    });
    return map;
  }

  function comparable(value) {
    if (Array.isArray(value)) return value.map(comparable);
    if (!value || typeof value !== 'object') return value;
    return Object.keys(value).sort().reduce((copy, key) => {
      copy[key] = comparable(value[key]);
      return copy;
    }, {});
  }

  function sameRecord(first, second) {
    return JSON.stringify(comparable(first)) === JSON.stringify(comparable(second));
  }

  function normalizeEntityMetadata(source, key, rawData, keyTimestamp, legacy) {
    const records = recordMap(rawData);
    const sourceEntities = source && source.entities && source.entities[key] || {};
    const entities = {};

    Object.entries(sourceEntities).forEach(([id, detail]) => {
      const updatedAt = timestamp(detail && detail.updatedAt, keyTimestamp);
      const normalized = { updatedAt };
      if (detail && detail.deletedAt) normalized.deletedAt = timestamp(detail.deletedAt, updatedAt);
      entities[String(id)] = normalized;
    });

    if (records) {
      records.forEach((entry, id) => {
        if (!entities[id]) entities[id] = { updatedAt: keyTimestamp };
      });
    }

    return {
      entities,
      legacyBaseline: legacy ? keyTimestamp : null
    };
  }

  function normalizePayload(copy, account) {
    const source = copy && typeof copy === 'object' ? copy : {};
    const dataSource = source.data && typeof source.data === 'object' ? source.data : {};
    const keys = coveredKeys(source);
    const fallback = timestamp(source.updatedAt || source.modifiedTime);
    const sourceMetadata = source.metadata && typeof source.metadata === 'object' ? source.metadata : {};
    const metadata = { keys: {}, entities: {}, legacyEntityBaselines: {} };
    const data = {};
    const legacy = Number(source.schemaVersion || 0) < 6;

    keys.forEach(key => {
      const keyTimestamp = timestamp(sourceMetadata.keys && sourceMetadata.keys[key], fallback);
      metadata.keys[key] = keyTimestamp;
      if (hasOwn(dataSource, key)) {
        data[key] = typeof dataSource[key] === 'string'
          ? dataSource[key]
          : JSON.stringify(dataSource[key]);
      }

      if (!entityKeys.includes(key)) return;
      const normalized = normalizeEntityMetadata(
        sourceMetadata,
        key,
        data[key],
        keyTimestamp,
        legacy
      );
      metadata.entities[key] = normalized.entities;
      const savedBaseline = sourceMetadata.legacyEntityBaselines &&
        sourceMetadata.legacyEntityBaselines[key];
      if (savedBaseline || normalized.legacyBaseline) {
        metadata.legacyEntityBaselines[key] = timestamp(savedBaseline, normalized.legacyBaseline);
      }
    });

    return {
      schemaVersion: 6,
      app: 'OAVIX',
      account: account || source.account || '',
      updatedAt: fallback,
      keys,
      data,
      metadata
    };
  }

  function entityCandidate(copy, key, id, records) {
    const detail = copy.metadata.entities[key] && copy.metadata.entities[key][id];
    const entry = records && records.get(id);
    if (detail || entry) {
      const updatedAt = timestamp(detail && detail.updatedAt, copy.metadata.keys[key]);
      const deletedAt = detail && detail.deletedAt
        ? timestamp(detail.deletedAt, updatedAt)
        : null;
      const deleted = !entry || Boolean(deletedAt && timestampValue(deletedAt) >= timestampValue(updatedAt));
      return {
        record: entry && entry.record,
        index: entry ? entry.index : Number.MAX_SAFE_INTEGER,
        updatedAt: latestTimestamp(updatedAt, deletedAt),
        deleted,
        deletedAt: deleted ? deletedAt || updatedAt : null,
        implicit: false
      };
    }

    const baseline = copy.metadata.legacyEntityBaselines[key];
    if (!baseline) return null;
    return {
      record: null,
      index: Number.MAX_SAFE_INTEGER,
      updatedAt: baseline,
      deleted: true,
      deletedAt: baseline,
      implicit: true
    };
  }

  function chooseCandidate(local, cloud) {
    if (!local) return { candidate: cloud, source: 'cloud' };
    if (!cloud) return { candidate: local, source: 'local' };
    if (timestampValue(local.updatedAt) > timestampValue(cloud.updatedAt)) {
      return { candidate: local, source: 'local' };
    }
    return { candidate: cloud, source: 'cloud' };
  }

  function mergeEntityKey(local, cloud, key) {
    const localRecords = recordMap(local.data[key]);
    const cloudRecords = recordMap(cloud.data[key]);
    if (localRecords === null || cloudRecords === null) return null;

    const ids = new Set([
      ...localRecords.keys(),
      ...cloudRecords.keys(),
      ...Object.keys(local.metadata.entities[key] || {}),
      ...Object.keys(cloud.metadata.entities[key] || {})
    ]);
    const kept = [];
    const entities = {};

    ids.forEach(id => {
      const selected = chooseCandidate(
        entityCandidate(local, key, id, localRecords),
        entityCandidate(cloud, key, id, cloudRecords)
      );
      const winner = selected.candidate;
      if (!winner) return;

      if (!winner.implicit) {
        entities[id] = { updatedAt: winner.updatedAt };
        if (winner.deleted) entities[id].deletedAt = winner.deletedAt || winner.updatedAt;
      }
      if (!winner.deleted) {
        kept.push({
          id,
          record: winner.record,
          updatedAt: winner.updatedAt,
          source: selected.source,
          index: winner.index
        });
      }
    });

    kept.sort((first, second) => {
      const byTime = timestampValue(second.updatedAt) - timestampValue(first.updatedAt);
      if (byTime) return byTime;
      if (first.source !== second.source) return first.source === 'cloud' ? -1 : 1;
      if (first.index !== second.index) return first.index - second.index;
      return first.id.localeCompare(second.id);
    });

    return {
      raw: JSON.stringify(kept.map(entry => entry.record)),
      entities,
      keyTimestamp: latestTimestamp(
        local.metadata.keys[key],
        cloud.metadata.keys[key],
        ...Object.values(entities).flatMap(detail => [detail.updatedAt, detail.deletedAt])
      ),
      legacyBaseline: latestTimestamp(
        local.metadata.legacyEntityBaselines[key],
        cloud.metadata.legacyEntityBaselines[key]
      )
    };
  }

  function chooseScalar(local, cloud, key) {
    const localCovered = local.keys.includes(key);
    const cloudCovered = cloud.keys.includes(key);
    if (!localCovered && !cloudCovered) return null;
    if (!localCovered) return { copy: cloud, timestamp: cloud.metadata.keys[key] };
    if (!cloudCovered) return { copy: local, timestamp: local.metadata.keys[key] };
    if (timestampValue(local.metadata.keys[key]) > timestampValue(cloud.metadata.keys[key])) {
      return { copy: local, timestamp: local.metadata.keys[key] };
    }
    return { copy: cloud, timestamp: cloud.metadata.keys[key] };
  }

  function mergePayloads(localCopy, cloudCopy, account) {
    const local = normalizePayload(localCopy, account);
    const cloud = normalizePayload(cloudCopy, account);
    const data = {};
    const metadata = { keys: {}, entities: {}, legacyEntityBaselines: {} };
    const keys = constants.dataKeys.filter(key => local.keys.includes(key) || cloud.keys.includes(key));

    keys.forEach(key => {
      if (entityKeys.includes(key) && local.keys.includes(key) && cloud.keys.includes(key)) {
        const merged = mergeEntityKey(local, cloud, key);
        if (merged) {
          data[key] = merged.raw;
          metadata.keys[key] = merged.keyTimestamp;
          metadata.entities[key] = merged.entities;
          if (timestampValue(merged.legacyBaseline) > 0) {
            metadata.legacyEntityBaselines[key] = merged.legacyBaseline;
          }
          return;
        }
      }

      const selected = chooseScalar(local, cloud, key);
      if (!selected) return;
      metadata.keys[key] = timestamp(selected.timestamp);
      if (hasOwn(selected.copy.data, key)) data[key] = selected.copy.data[key];
      if (entityKeys.includes(key)) {
        metadata.entities[key] = selected.copy.metadata.entities[key] || {};
        const baseline = selected.copy.metadata.legacyEntityBaselines[key];
        if (baseline) metadata.legacyEntityBaselines[key] = baseline;
      }
    });

    const allTimestamps = [
      local.keys.length ? local.updatedAt : EPOCH,
      cloud.keys.length ? cloud.updatedAt : EPOCH,
      ...Object.values(metadata.keys),
      ...Object.values(metadata.entities).flatMap(entities =>
        Object.values(entities).flatMap(detail => [detail.updatedAt, detail.deletedAt])
      )
    ];

    return {
      schemaVersion: 6,
      app: 'OAVIX',
      account: account || local.account || cloud.account || '',
      updatedAt: latestTimestamp(...allTimestamps),
      keys,
      data,
      metadata
    };
  }

  function recordMutation(copy, key, previousRaw, nextRaw, changedAt, account) {
    const normalized = normalizePayload(copy, account);
    const changed = timestamp(changedAt, new Date().toISOString());
    if (!normalized.keys.includes(key)) normalized.keys.push(key);
    normalized.keys = constants.dataKeys.filter(candidate => normalized.keys.includes(candidate));
    normalized.updatedAt = changed;
    normalized.metadata.keys[key] = changed;

    if (nextRaw === null || nextRaw === undefined) delete normalized.data[key];
    else normalized.data[key] = String(nextRaw);

    if (entityKeys.includes(key)) {
      const previous = recordMap(previousRaw);
      const next = recordMap(nextRaw);
      const entities = { ...(normalized.metadata.entities[key] || {}) };

      if (previous && next) {
        const ids = new Set([...previous.keys(), ...next.keys()]);
        ids.forEach(id => {
          const before = previous.get(id);
          const after = next.get(id);
          if (before && !after) entities[id] = { updatedAt: changed, deletedAt: changed };
          else if (after && (!before || !sameRecord(before.record, after.record))) {
            entities[id] = { updatedAt: changed };
          } else if (after && !entities[id]) {
            entities[id] = { updatedAt: timestamp(copy && copy.updatedAt) };
          }
        });
      }
      normalized.metadata.entities[key] = entities;
    }

    return normalized;
  }

  function fingerprint(copy, account) {
    const normalized = normalizePayload(copy, account);
    return JSON.stringify(comparable({
      keys: normalized.keys,
      data: normalized.data,
      metadata: normalized.metadata
    }));
  }

  function dataFingerprint(copy, account) {
    return JSON.stringify(comparable(normalizePayload(copy, account).data));
  }

  runtime.merge = {
    entityKeys,
    coveredKeys,
    normalizePayload,
    mergePayloads,
    recordMutation,
    fingerprint,
    dataFingerprint,
    latestTimestamp
  };
})(window);
