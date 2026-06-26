export const GEOMETRY_MAPPING_SCHEMA = 'geometry-mapping-engine/v1';
export const GEOMETRY_MAPPING_VERSION = '20260622-geometry-mapping-1';

const MAX_MAPPED_RECORDS = 80000;

export const DEFAULT_GEOMETRY_MAPPING_PROFILE = Object.freeze({
  profileId: 'AUTO_RVM_GEOMETRY_MAPPING_V1',
  schemaVersion: 'geometry-mapping-profile/v1',
  rules: Object.freeze([
    keywordRule('family-support-from-atta', ['rawFields.TYPE', 'objectType', 'objectClass'], ['ATTA', 'SUPPORT', 'RESTRAINT'], 'family', 'SUPPORT', 0.92),
    keywordRule('family-pipe-from-type', ['rawFields.TYPE', 'rawFields.DTXR', 'objectClass', 'objectType'], ['PIPE', 'TUBE'], 'family', 'PIPE', 0.90),
    keywordRule('family-valve-from-type', ['rawFields.TYPE', 'rawFields.DTXR', 'objectClass', 'objectType'], ['VALV', 'VALVE'], 'family', 'VALVE', 0.90),
    keywordRule('family-flange-from-type', ['rawFields.TYPE', 'rawFields.DTXR', 'objectClass', 'objectType'], ['FLAN', 'FLANGE'], 'family', 'FLANGE', 0.90),
    keywordRule('support-guide', ['rawFields.DTXR', 'rawFields.SUPPORT_KIND', 'rawFields.SUPPORT_TYPE', 'rawFields.CMPSUPTYPE', 'rawFields.MDSSUPPTYPE', 'displayName'], ['GUIDE', 'GUID', 'LATERAL'], 'support.supportType', 'GUIDE', 0.93),
    keywordRule('support-line-stop', ['rawFields.DTXR', 'rawFields.SUPPORT_KIND', 'rawFields.SUPPORT_TYPE', 'rawFields.CMPSUPTYPE', 'rawFields.MDSSUPPTYPE', 'displayName'], ['LINESTOP', 'LINE STOP', 'LIMIT', 'LIM', 'AXIAL'], 'support.supportType', 'LINE_STOP', 0.93),
    keywordRule('support-rest', ['rawFields.DTXR', 'rawFields.SUPPORT_KIND', 'rawFields.SUPPORT_TYPE', 'rawFields.CMPSUPTYPE', 'rawFields.MDSSUPPTYPE', 'displayName'], ['REST', 'RESTING', 'VERTICAL'], 'support.supportType', 'REST', 0.90),
    keywordRule('support-anchor', ['rawFields.DTXR', 'rawFields.SUPPORT_KIND', 'rawFields.SUPPORT_TYPE', 'rawFields.CMPSUPTYPE', 'rawFields.MDSSUPPTYPE', 'displayName'], ['ANCHOR', 'ANC', 'FIXED'], 'support.supportType', 'ANCHOR', 0.90),
    regexRule('support-tag-from-ref', ['rawFields.REF', 'rawFields.NAME', 'rawFields.SUPPORT_TAG', 'displayName'], '(PS[-_ ]?\\d+|INPUTXML[-_ ]?\\d+[-_ ][A-Z0-9_ -]+)', 'support.supportTag', 0.84),
    dimensionRule('pipe-od-from-attached-pipe-od', ['rawFields.ATTACHED_PIPE_OD', 'rawFields.DIAMETER', 'rawFields.BORE', 'derivedFields.detectedDiameterMm', 'geometry.diameter'], 'pipe.odMm', 0.95),
    dimensionRule('pipe-wall-from-wall-thick', ['rawFields.WALL_THICK', 'rawFields.WT', 'rawFields.WALL_THICKNESS'], 'pipe.wallThicknessMm', 0.91),
    directRule('pipe-material', ['rawFields.MATERIAL', 'rawFields.MATL'], 'pipe.material', 0.88),
    directRule('line-number', ['rawFields.LINE_NO', 'rawFields.LINE', 'rawFields.LINENO'], 'lineNo', 0.82),
    dimensionRule('geometry-length', ['geometry.length', 'derivedFields.detectedLengthMm'], 'geometry.lengthMm', 0.82),
    dimensionRule('support-gap', ['rawFields.SUPPORT_GAP_MM', 'rawFields.GAP', 'rawFields.GUIDE_GAP', 'rawFields.LINE_STOP_GAP'], 'support.gapMm', 0.80)
  ])
});

function keywordRule(ruleId, sourceFields, keywords, targetField, targetValue, confidence) {
  return Object.freeze({ ruleId, match: 'keyword', sourceFields, keywords, targetField, targetValue, confidence });
}

function regexRule(ruleId, sourceFields, pattern, targetField, confidence) {
  return Object.freeze({ ruleId, match: 'regex', sourceFields, pattern, targetField, confidence });
}

function dimensionRule(ruleId, sourceFields, targetField, confidence) {
  return Object.freeze({ ruleId, match: 'dimensionToMm', sourceFields, targetField, confidence });
}

function directRule(ruleId, sourceFields, targetField, confidence) {
  return Object.freeze({ ruleId, match: 'direct', sourceFields, targetField, confidence });
}

export function valueAtPath(input, path) {
  if (!input || !path) return undefined;
  const parts = String(path).split('.');
  let current = input;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
}

function setAtPath(target, path, value) {
  const parts = String(path).split('.').filter(Boolean);
  if (!parts.length) return;
  let current = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!current[key] || typeof current[key] !== 'object') current[key] = {};
    current = current[key];
  }
  current[parts[parts.length - 1]] = value;
}

function normalizeText(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[\s_-]+/g, ' ');
}

export function parseDimensionToMm(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  const match = text.match(/^(-?\d+(?:\.\d+)?)\s*(mm|millimet(?:er|re)s?|m|meter|metre|in|inch|inches)?$/i);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;
  const unit = String(match[2] || 'mm').toLowerCase();
  if (unit === 'm' || unit === 'meter' || unit === 'metre') return n * 1000;
  if (unit === 'in' || unit === 'inch' || unit === 'inches') return n * 25.4;
  return n;
}

function firstRuleSource(record, rule) {
  for (const sourceField of rule.sourceFields || []) {
    const value = valueAtPath(record, sourceField);
    if (value !== undefined && value !== null && String(value).trim() !== '') return { sourceField, value };
  }
  return null;
}

function evaluateRule(record, rule) {
  if (rule.match === 'keyword') {
    for (const sourceField of rule.sourceFields || []) {
      const value = valueAtPath(record, sourceField);
      const text = normalizeText(value);
      if (!text) continue;
      const hit = (rule.keywords || []).find((keyword) => text.includes(normalizeText(keyword)));
      if (hit) return { matched: true, value: rule.targetValue, sourceField, sourceValue: value, matchedValue: hit };
    }
  }
  if (rule.match === 'regex') {
    const re = new RegExp(rule.pattern, 'i');
    for (const sourceField of rule.sourceFields || []) {
      const value = valueAtPath(record, sourceField);
      const match = String(value ?? '').match(re);
      if (match) return { matched: true, value: match[1] || match[0], sourceField, sourceValue: value, matchedValue: match[0] };
    }
  }
  if (rule.match === 'dimensionToMm') {
    const source = firstRuleSource(record, rule);
    if (!source) return { matched: false };
    const mm = parseDimensionToMm(source.value);
    if (mm !== null) return { matched: true, value: mm, sourceField: source.sourceField, sourceValue: source.value, matchedValue: `${mm}mm` };
  }
  if (rule.match === 'direct') {
    const source = firstRuleSource(record, rule);
    if (source) return { matched: true, value: source.value, sourceField: source.sourceField, sourceValue: source.value, matchedValue: source.value };
  }
  return { matched: false };
}

function initialMappedObject(record) {
  return {
    schemaVersion: 'mapped-geometry-object/v1',
    id: record.id,
    sourceId: record.id,
    canonicalId: record.canonicalId || record.id,
    displayName: record.displayName || record.id,
    sourcePath: record.sourcePath || '',
    family: record.objectClass || record.objectType || 'UNKNOWN',
    objectType: record.objectType || '',
    primitiveKind: record.primitiveKind || record.effectivePrimitive || '',
    lineNo: '',
    support: {},
    pipe: {},
    geometry: {
      bboxMin: record.geometry?.bboxMin || null,
      bboxMax: record.geometry?.bboxMax || null,
      center: record.geometry?.center || null,
      size: record.geometry?.size || null,
      lengthMm: record.geometry?.length || null,
      axis: record.geometry?.axis || null,
      start: record.geometry?.start || null,
      end: record.geometry?.end || null
    },
    process: {},
    calculation: {},
    mappingStatus: 'UNMAPPED',
    mappingConfidence: 0,
    mappingAudit: [],
    rawRecord: record
  };
}

function applyProfile(record, profile) {
  const mapped = initialMappedObject(record);
  for (const rule of profile.rules || []) {
    const result = evaluateRule(record, rule);
    if (!result.matched) continue;
    setAtPath(mapped, rule.targetField, result.value);
    mapped.mappingAudit.push({
      ruleId: rule.ruleId,
      targetField: rule.targetField,
      value: result.value,
      sourceField: result.sourceField,
      sourceValue: result.sourceValue,
      matchedValue: result.matchedValue,
      confidence: rule.confidence
    });
  }
  if (mapped.family === 'ATTA') mapped.family = 'SUPPORT';
  if (!mapped.support.supportType && mapped.family === 'SUPPORT') mapped.support.supportType = 'GENERIC_SUPPORT';
  if (mapped.pipe.odMm && !mapped.geometry.diameterMm) mapped.geometry.diameterMm = mapped.pipe.odMm;
  const confidence = mapped.mappingAudit.length
    ? mapped.mappingAudit.reduce((sum, item) => sum + Number(item.confidence || 0), 0) / mapped.mappingAudit.length
    : 0;
  mapped.mappingConfidence = Number(confidence.toFixed(2));
  mapped.mappingStatus = mapped.mappingAudit.length ? 'AUTO_MAPPED' : 'UNMAPPED';
  return Object.freeze(mapped);
}

function summarizeCoverage(mappedObjects) {
  const coverage = new Map();
  for (const object of mappedObjects) {
    for (const item of object.mappingAudit || []) {
      const row = coverage.get(item.targetField) || { targetField: item.targetField, mappedCount: 0, rules: new Set() };
      row.mappedCount += 1;
      row.rules.add(item.ruleId);
      coverage.set(item.targetField, row);
    }
  }
  return [...coverage.values()].map((row) => ({
    targetField: row.targetField,
    mappedCount: row.mappedCount,
    rules: [...row.rules]
  })).sort((a, b) => b.mappedCount - a.mappedCount);
}

export function mapRenderedGeometryRecords(records, options = {}) {
  const inputRecords = Array.isArray(records) ? records.slice(0, options.maxRecords || MAX_MAPPED_RECORDS) : [];
  const profile = options.profile || DEFAULT_GEOMETRY_MAPPING_PROFILE;
  const mappedObjects = inputRecords.map((record) => applyProfile(record, profile));
  const supportCount = mappedObjects.filter((item) => item.family === 'SUPPORT').length;
  const pipeCount = mappedObjects.filter((item) => item.family === 'PIPE').length;
  const mappedCount = mappedObjects.filter((item) => item.mappingStatus === 'AUTO_MAPPED').length;
  return Object.freeze({
    schemaVersion: GEOMETRY_MAPPING_SCHEMA,
    version: GEOMETRY_MAPPING_VERSION,
    profileId: profile.profileId,
    recordCount: inputRecords.length,
    mappedCount,
    unmappedCount: Math.max(0, inputRecords.length - mappedCount),
    capped: Array.isArray(records) && records.length > inputRecords.length,
    summary: Object.freeze({ supportCount, pipeCount, mappedCount, unmappedCount: Math.max(0, inputRecords.length - mappedCount) }),
    fieldCoverage: Object.freeze(summarizeCoverage(mappedObjects)),
    mappedObjects: Object.freeze(mappedObjects)
  });
}
