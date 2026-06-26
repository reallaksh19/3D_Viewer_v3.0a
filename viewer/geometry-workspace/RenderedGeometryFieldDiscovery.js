export const RENDERED_GEOMETRY_FIELD_DISCOVERY_SCHEMA = 'geometry-field-discovery/v1';
export const FIELD_DISCOVERY_VERSION = '20260622-geometry-workspace-1';

const MAX_SAMPLE_VALUES = 8;
const MAX_FIELDS = 400;

function flattenObject(input, prefix = '', out = {}) {
  if (!input || typeof input !== 'object') return out;
  for (const [key, value] of Object.entries(input)) {
    const safeKey = String(key || '').trim();
    if (!safeKey) continue;
    const path = prefix ? `${prefix}.${safeKey}` : safeKey;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flattenObject(value, path, out);
    } else {
      out[path] = value;
    }
  }
  return out;
}

function normalizeSample(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.slice(0, 4).join('|');
  return String(value).slice(0, 120);
}

function inferType(samples) {
  const values = samples.map((value) => String(value || '').trim()).filter(Boolean);
  if (!values.length) return 'empty';
  let numeric = 0;
  let dimension = 0;
  let bool = 0;
  let identifier = 0;
  for (const value of values) {
    if (/^(true|false)$/i.test(value)) bool += 1;
    if (/^-?\d+(\.\d+)?$/.test(value)) numeric += 1;
    if (/^-?\d+(\.\d+)?\s*(mm|m|in|inch|deg|°)$/i.test(value)) dimension += 1;
    if (/^(PS[-_ ]?\d+|PE[_-]?\d+|[A-Z]+[-_][A-Z0-9_-]+)$/i.test(value)) identifier += 1;
  }
  const total = values.length;
  if (dimension / total >= 0.6) return 'dimension-mm';
  if (numeric / total >= 0.8) return 'number';
  if (bool / total >= 0.8) return 'boolean';
  if (identifier / total >= 0.5) return 'identifier';
  return 'string';
}

function confidenceFor(seenCount, recordCount, sampleCount) {
  if (!recordCount) return 0;
  const coverage = seenCount / recordCount;
  const diversityPenalty = sampleCount > 1 ? 0 : 0.08;
  return Number(Math.max(0.1, Math.min(0.99, coverage - diversityPenalty)).toFixed(2));
}

function addField(stats, path, value) {
  if (!stats.has(path)) {
    stats.set(path, {
      key: path.split('.').pop(),
      paths: [path],
      seenCount: 0,
      missingCount: 0,
      samples: new Set()
    });
  }
  const item = stats.get(path);
  item.seenCount += 1;
  const sample = normalizeSample(value);
  if (sample && item.samples.size < MAX_SAMPLE_VALUES) item.samples.add(sample);
}

export function discoverRenderedGeometryFields(snapshot, options = {}) {
  const records = Array.isArray(snapshot?.records) ? snapshot.records : [];
  const stats = new Map();
  const includeDerived = options.includeDerived !== false;

  for (const record of records) {
    const rawFlat = flattenObject(record.rawFields || {}, 'rawFields');
    const geomFlat = flattenObject(record.geometry || {}, 'geometry');
    const derivedFlat = includeDerived ? flattenObject(record.derivedFields || {}, 'derivedFields') : {};
    const common = {
      id: record.id,
      displayName: record.displayName,
      sourcePath: record.sourcePath,
      objectClass: record.objectClass,
      objectType: record.objectType,
      primitiveKind: record.primitiveKind,
      visible: record.visible,
      selected: record.selected,
      pickable: record.pickable
    };
    const all = { ...flattenObject(common), ...rawFlat, ...geomFlat, ...derivedFlat };
    for (const [path, value] of Object.entries(all)) addField(stats, path, value);
  }

  const fieldSet = [...stats.entries()].slice(0, MAX_FIELDS).map(([path, item]) => {
    const sampleValues = [...item.samples];
    return {
      key: item.key,
      path,
      paths: item.paths,
      seenCount: item.seenCount,
      missingCount: Math.max(0, records.length - item.seenCount),
      sampleValues,
      inferredType: inferType(sampleValues),
      confidence: confidenceFor(item.seenCount, records.length, sampleValues.length)
    };
  }).sort((a, b) => (b.seenCount - a.seenCount) || a.path.localeCompare(b.path));

  return {
    schemaVersion: RENDERED_GEOMETRY_FIELD_DISCOVERY_SCHEMA,
    version: FIELD_DISCOVERY_VERSION,
    recordCount: records.length,
    fieldCount: fieldSet.length,
    capped: stats.size > MAX_FIELDS,
    fieldSet
  };
}

export function valueAtPath(record, path) {
  if (!record || !path) return '';
  const parts = String(path).split('.');
  let current = record;
  for (const part of parts) {
    if (current === undefined || current === null) return '';
    current = current[part];
  }
  return current === undefined || current === null ? '' : current;
}

export function selectDefaultTableFields(fieldDiscovery, maxColumns = 14) {
  const preferred = [
    'displayName',
    'sourcePath',
    'objectClass',
    'objectType',
    'primitiveKind',
    'rawFields.TYPE',
    'rawFields.DTXR',
    'rawFields.REF',
    'rawFields.NAME',
    'rawFields.SUPPORT_KIND',
    'rawFields.SUPPORT_TYPE',
    'rawFields.ATTACHED_PIPE_OD',
    'rawFields.BORE',
    'geometry.length'
  ];
  const fields = Array.isArray(fieldDiscovery?.fieldSet) ? fieldDiscovery.fieldSet : [];
  const byPath = new Map(fields.map((field) => [field.path, field]));
  const selected = [];
  for (const path of preferred) {
    if (byPath.has(path)) selected.push(byPath.get(path));
  }
  for (const field of fields) {
    if (selected.length >= maxColumns) break;
    if (!selected.some((item) => item.path === field.path)) selected.push(field);
  }
  return selected.slice(0, maxColumns);
}
