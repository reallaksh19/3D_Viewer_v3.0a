/**
 * Shared pure helpers for selected-geometry branch enrichment. Kept separate so
 * the workflow module stays small and reviewable.
 */

import { tokenAtPosition, tokenizeBranchName } from '../converters/xml-cii2019-core/regex-line-key.js';
import { computeLineNoKey } from '../converters/xml-cii2019-core/linelist-mapping.js';
import { toFiniteNumber } from '../converters/xml-cii2019-core/config.js';
import { rankXmlCiiWeightCandidates } from '../converters/xml-cii2019-core/weight-valve-hints.js';
import { normalizeKey, rowNumber, rowValue, text } from './selected-geometry-shared.js';

const MATERIAL_TOKENS = /^(CS|SS|LTCS|DSS|SDSS|ALLOY|GI|CI|DI|PVC|CPVC|HDPE|GRP|GRE)$/i;
const OD_TO_DN = Object.freeze([[10.3, 6], [13.7, 8], [17.1, 10], [21.3, 15], [26.7, 20], [33.4, 25], [42.2, 32], [48.3, 40], [60.3, 50], [73.0, 65], [88.9, 80], [114.3, 100], [141.3, 125], [168.3, 150], [219.1, 200], [273.0, 250], [323.9, 300], [355.6, 350], [406.4, 400], [457.0, 450], [508.0, 500], [610.0, 600]]);
const ROW_ALIAS_GROUPS = Object.freeze({
  lineKey1: ['lineKey1', 'Key 1', 'ColumnX1', 'Service', 'Fluid', 'SERVICE', 'FLUID'],
  lineKey2: ['lineKey2', 'Key 2', 'ColumnX2', 'Line number', 'Line Number', 'Line No', 'LineNo', 'LINENO', 'LINE_NO', 'PipelineReference', 'Pipeline Reference'],
  lineNo: ['lineNoKey', 'lineNo', 'lineKey', 'LineNo', 'Line No', 'Line Number', 'LINE_NO', 'LINE NUMBER', 'PipelineReference', 'Pipeline Reference'],
  pipingClass: ['pipingClass', 'Piping Class', 'PIPING_CLASS', 'Class', 'CLASS', 'Spec', 'SPEC', 'Pipe Class', 'PIPE_CLASS'],
  rating: ['rating', 'Rating', 'RATING', 'Class Rating', 'Pressure Class', 'CLASS_RATING'],
  p1: ['p1', 'P1', 'Pressure', 'PRESSURE', 'Pressure1', 'PRESSURE1', 'Design Pressure', 'DESIGN_PRESSURE', 'Design Press', 'DESIGN_PRESS'],
  t1: ['t1', 'T1', 'Temperature', 'TEMP', 'Temp1', 'TEMP1', 'TEMP_EXP_C1', 'Design Temperature', 'DESIGN_TEMP'],
  t2: ['t2', 'T2', 'Temp2', 'TEMP2', 'TEMP_EXP_C2', 'Operating Temperature', 'OPERATING_TEMP'],
  t3: ['t3', 'T3', 'Temp3', 'TEMP3', 'TEMP_EXP_C3', 'Minimum Temperature', 'MIN_TEMP'],
  density: ['density', 'Density', 'DENSITY', 'Fluid Density', 'FLUID_DENSITY', 'Density kg/m3', 'DENSITY_KG_M3'],
});

export function branchInfoForObject(object, config) {
  const attrs = object?.sourceAttributes || {};
  const candidates = [attrs.BRANCH_NAME, attrs.BRANCHNAME, attrs.BRANCH, attrs.OWNER, attrs.RVM_OWNER_PATH, attrs.RVM_OWNER_NAME, attrs.SOURCE_PATH, object?.sourcePath, object?.name].map(text).filter(Boolean);
  return {
    branchName: bestBranchNameCandidate(candidates, config),
    lineKeyFallback: text(attrs.LINEKEY || attrs.LINE_KEY || attrs.LINE_NO || attrs.LINE_NUMBER || rowValue(attrs, ROW_ALIAS_GROUPS.lineNo)),
  };
}

export function findLineListRow(lineKey, config) {
  const lookupKey = normalizeLineKey(lineKey);
  const columnRegex = config.linelist?.linelistColumnRegex || '';
  const columnGroup = config.linelist?.linelistColumnGroup || 1;
  for (const row of config.linelist?.masterRows || []) {
    const rawKey = lineListRowKey(row, config);
    const cleanKey = normalizeLineKey(lineKeyRegexValue(rawKey, columnRegex, columnGroup));
    if (cleanKey && cleanKey === lookupKey) return row;
  }
  return null;
}

export function derivePipingClassFromBranchName(branchName, config) {
  const regexValue = regexGroup(branchName, config.rating?.pipingClassRegex, config.rating?.pipingClassGroup || 1);
  if (regexValue) return regexValue;
  const delimiter = config.rating?.tokenDelimiter || config.linelist?.tokenDelimiter || '-';
  const index = Number(config.rating?.pipingClassTokenIndex || 5);
  const value = tokenAtPosition(branchName, delimiter, index);
  const fourth = tokenAtPosition(branchName, delimiter, 4);
  const sixth = tokenAtPosition(branchName, delimiter, 6);
  if (index === 5 && MATERIAL_TOKENS.test(value) && looksLikeNpsToken(fourth) && /^S\d+/i.test(sixth)) return '';
  return value;
}

export function deriveRatingFromPipingClass(pipingClass, config) {
  const source = text(pipingClass).toUpperCase();
  const sequence = Array.isArray(config.rating?.ratingSequence) ? config.rating.ratingSequence : [];
  for (const pair of sequence) {
    if (Array.isArray(pair) && pair.length >= 2 && source.startsWith(text(pair[0]).toUpperCase())) return text(pair[1]);
  }
  return '';
}

export function deriveBoreFromBranchName(branchName, config) {
  const regexRaw = regexGroup(branchName, config.weight?.boreRegex, config.weight?.boreGroup || 1);
  const delimiter = config.weight?.tokenDelimiter || config.linelist?.tokenDelimiter || '-';
  const index = Number(config.weight?.boreTokenIndex || 3);
  let raw = regexRaw || tokenAtPosition(branchName, delimiter, index);
  if (!looksLikeNpsToken(raw) && index === 3) {
    const fourth = tokenAtPosition(branchName, delimiter, 4);
    const sixth = tokenAtPosition(branchName, delimiter, 6);
    if (looksLikeNpsToken(fourth) && /^S\d+/i.test(sixth)) raw = fourth;
  }
  return nominalDnFromNps(numericFromSizeToken(raw), config);
}

export function boreFromGroup(group, lineRow, config) {
  const lineBore = rowNumber(lineRow, ['convertedBore', 'Bore', 'BORE', 'DN', 'NB', 'NPS', 'Size', 'SIZE']);
  if (lineBore !== null) return lineBore;
  for (const object of group.objects || []) {
    const bore = objectBoreMm(object, config);
    if (bore !== null) return bore;
  }
  return null;
}

export function buildWeightRowsForGroup(group, context) {
  const rows = [];
  const objects = Array.isArray(group.objects) ? group.objects : [];
  for (const object of objects.slice(0, 250)) {
    const lengthMm = objectLengthMm(object);
    const boreMm = context.boreMm || objectBoreMm(object, context.config);
    if (lengthMm === null || boreMm === null || !context.rating) continue;
    const ranking = rankXmlCiiWeightCandidates({
      boreMm,
      rating: context.rating,
      lengthMm,
      nodeName: text(object?.name || object?.id),
      componentType: text(object?.type),
      componentRefNo: text(object?.sourceAttributes?.COMPONENT_REF_NO || object?.sourceAttributes?.COMPONENTREFNO),
      dtxr: text(object?.sourceAttributes?.DTXR || object?.sourceAttributes?.RAW_TYPE || object?.type),
    }, context.config, { includeRejected: true });
    const best = ranking.best || null;
    if (!usableWeightCandidate(best)) continue;
    rows.push({
      key: `${context.branchName || 'branch'}::${object?.id || rows.length}`,
      branchName: context.branchName,
      lineKey: context.lineKey,
      nodeNumber: text(object?.toNode || object?.fromNode || object?.id),
      objectId: text(object?.id),
      componentType: text(object?.type),
      boreMm,
      rating: context.rating,
      resolvedPipingClass: context.pipingClass,
      lengthMm,
      weight: best.selectedWeight ?? best.suggestedWeight ?? best.weight ?? '',
      weightMethod: best.weightMethod || '',
      lengthDelta: best.lengthDelta,
      typeDesc: best.typeDesc || best.valveType || best.type || '',
      candidates: ranking.candidates.slice(0, 5),
      rejectedCandidates: ranking.rejectedCandidates.slice(0, 3),
    });
  }
  return rows;
}

export function shouldReviewPipingClass(resolved) {
  if (!resolved?.pipingClass) return true;
  const method = text(resolved.pipingClassMatchMethod || resolved.pipingClassRowMethod).toLowerCase();
  const confidence = Number(resolved.pipingClassConfidence);
  const reasons = Array.isArray(resolved.pipingClassRowReasons) ? resolved.pipingClassRowReasons.map(text) : [];
  if (method.includes('ambiguous') || method.includes('fuzzy') || method.includes('numeric-near') || method === 'none') return true;
  if (reasons.some((reason) => /mismatch|below-min|class-mismatch/i.test(reason))) return true;
  if (Number.isFinite(confidence) && confidence > 0 && confidence < 0.9) return true;
  return false;
}

export function missingBranchFields(input) {
  const missing = [];
  if (!input.branchName) missing.push('branchName');
  if (!input.lineKey) missing.push('lineKey');
  if (!input.lineListMatch) missing.push('lineList');
  if (!input.resolved?.pipingClass) missing.push('pipingClass');
  if (!input.resolved?.materialCode) missing.push('materialCode');
  if (!input.branchRating) missing.push('rating');
  return missing;
}

export function branchStatus(input) {
  if (input.missing.length) return 'missing';
  if (input.classNeedsReview) return 'review';
  const method = text(input.resolved?.pipingClassMatchMethod).toLowerCase();
  const materialExact = input.materialCodeMethod === 'exact' || input.materialCodeMethod === 'override';
  if (method === 'exact' && materialExact) return 'resolved';
  return 'resolved-with-audit';
}

export function branchDiagnostics(row) {
  const diagnostics = [];
  for (const missing of row.missing || []) {
    diagnostics.push({ type: 'missing', branchName: row.branchName, lineKey: row.lineKey, field: missing, message: `${missing} unresolved` });
  }
  if (row.pipingClassNeedsReview) diagnostics.push({ type: 'review', branchName: row.branchName, lineKey: row.lineKey, field: 'pipingClass', message: 'Piping class match needs review' });
  return diagnostics;
}

export function summarizeDiagnostics(diagnostics) {
  const map = new Map();
  for (const item of diagnostics || []) {
    const key = `${item.type || ''}|${item.field || ''}|${item.message || ''}`;
    const current = map.get(key) || { type: item.type || '', field: item.field || '', message: item.message || '', count: 0, sampleBranch: item.branchName || '', sampleLineKey: item.lineKey || '' };
    current.count += 1;
    map.set(key, current);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count || text(a.field).localeCompare(text(b.field)));
}

export function countBranchStatuses(branchRows) {
  return branchRows.reduce((acc, row) => {
    const status = text(row.status || 'unknown');
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
}

export function processDefaultValue(config, fieldKey) {
  const defaults = config?.processDefaults && typeof config.processDefaults === 'object' ? config.processDefaults : {};
  return text(defaults[fieldKey]);
}

export function processValue(processOverride, row, overrideKey, rowKeys, config) {
  if (processOverride && Object.prototype.hasOwnProperty.call(processOverride, overrideKey)) return text(processOverride[overrideKey]);
  if (!row) return '';
  const rowVal = rowText(row, rowKeys);
  if (rowVal) return rowVal;
  return processDefaultValue(config, overrideKey);
}

export function processSource(processOverride, row, overrideKey, rowKeys, config) {
  if (processOverride && Object.prototype.hasOwnProperty.call(processOverride, overrideKey)) return 'override';
  if (!row) return 'line-list-missing';
  if (rowText(row, rowKeys)) return 'linelist';
  return processDefaultValue(config, overrideKey) ? 'default' : 'none';
}

export function rowText(row, keys) {
  if (!row || typeof row !== 'object') return '';
  return text(rowValue(row, expandRowKeys(keys)));
}

export function ratingOverride(config, keys) {
  return bucketText(config, 'rating', keys) || processDataText(config, keys, 'rating');
}

export function overrideSource(overrides, bucket, key) {
  return overrides?.[bucket] && Object.prototype.hasOwnProperty.call(overrides[bucket], key) ? 'override' : 'auto';
}

export function materialCodeMethodFor(source) {
  if (source === 'override' || source === 'override-material-map' || source === 'override-material-code') return 'override';
  if (source === 'line-list-material-map' || source === 'piping-class-material-map') return 'exact';
  if (source === 'line-list-material-code' || source === 'piping-class-material-code') return 'exact';
  if (source === 'xml-fallback') return 'xml-fallback';
  return 'none';
}

export function numberFromText(value) {
  const match = text(value).replace(/,/g, '').match(/[-+]?\d*\.?\d+/);
  const numeric = match ? Number(match[0]) : NaN;
  return Number.isFinite(numeric) ? numeric : null;
}

function expandRowKeys(keys) {
  const out = [];
  for (const key of Array.isArray(keys) ? keys : [keys]) {
    const clean = text(key);
    if (!clean) continue;
    out.push(clean);
    const normalized = normalizeKey(clean);
    for (const [aliasKey, aliases] of Object.entries(ROW_ALIAS_GROUPS)) {
      if (normalizeKey(aliasKey) === normalized || aliases.some((alias) => normalizeKey(alias) === normalized)) out.push(...aliases);
    }
  }
  return [...new Set(out)];
}

function bestBranchNameCandidate(candidates, config) {
  const delimiter = config?.linelist?.tokenDelimiter || '-';
  for (const value of candidates) {
    const direct = normalizeBranchText(value);
    if (looksLikeBranchName(direct, delimiter)) return direct;
    const fromPath = branchFromPathText(value, delimiter);
    if (fromPath) return fromPath;
  }
  return text(candidates[0] || '');
}

function normalizeBranchText(value) {
  const raw = text(value).replace(/\\/g, '/');
  const branchMatch = raw.match(/\/[^/]+\/B\d+\b/i);
  return branchMatch ? branchMatch[0] : raw;
}

function branchFromPathText(value, delimiter) {
  const parts = text(value).replace(/\\/g, '/').split('/').map((part) => part.trim()).filter(Boolean);
  for (let index = 0; index < parts.length; index += 1) {
    const candidate = `/${parts.slice(index).join('/')}`;
    if (looksLikeBranchName(candidate, delimiter)) return candidate;
  }
  return '';
}

function looksLikeBranchName(value, delimiter) {
  const candidate = text(value);
  if (!candidate) return false;
  if (/\/B\d+\b/i.test(candidate) && candidate.includes(delimiter)) return true;
  return tokenizeBranchName(candidate, delimiter).length >= 4;
}

function lineListRowKey(row, config) {
  const mapped = computeLineNoKey(row, config.linelist?.fieldMap || {});
  if (mapped) return mapped;
  const key1 = rowText(row, ROW_ALIAS_GROUPS.lineKey1);
  const key2 = rowText(row, ROW_ALIAS_GROUPS.lineKey2);
  if (key1 || key2) return `${key1}${key2}`;
  return rowText(row, ROW_ALIAS_GROUPS.lineNo);
}

function regexGroup(sourceText, pattern, groupIndex) {
  const source = text(sourceText);
  const patternText = text(pattern);
  if (!source || !patternText) return '';
  try {
    const match = new RegExp(patternText, 'i').exec(source);
    return text(match?.[Math.max(0, Number(groupIndex || 0))] || '');
  } catch {
    return '';
  }
}

function lineKeyRegexValue(value, pattern, groupIndex) {
  const source = text(value);
  const patternText = text(pattern);
  if (!source || !patternText) return source;
  return regexGroup(source, patternText, groupIndex || 1) || source;
}

function normalizeLineKey(value) {
  return text(value).toUpperCase().replace(/\s+/g, '');
}

function objectBoreMm(object, config) {
  const attrs = object?.sourceAttributes || {};
  const direct = firstNumber(attrs, ['BOREMM', 'BORE_MM', 'CONVERTED_BORE', 'DN', 'NB', 'NOMINAL_BORE', 'SIZE']);
  if (direct !== null) return direct;
  const nps = firstNumber(attrs, ['NPS', 'NS', 'NOMINAL_SIZE']);
  if (nps !== null) return nominalDnFromNps(nps, config);
  const od = firstNumber(attrs, ['OUTSIDE_DIAMETER', 'OUTSIDEDIAMETER', 'PIPE_OD', 'OD', 'DIAMETER']);
  return od !== null ? nominalDnFromOd(od) : null;
}

function objectLengthMm(object) {
  const attrs = object?.sourceAttributes || {};
  const explicit = firstNumber(attrs, ['ELEMENT_LENGTH_MM', 'ElementLengthMm', 'LENGTHMM', 'LENGTH_MM', 'LENGTH', 'Length']);
  if (explicit !== null) return explicit;
  const a = pointFromObject(object?.apos);
  const b = pointFromObject(object?.lpos);
  return a && b ? Math.sqrt(((a.x - b.x) ** 2) + ((a.y - b.y) ** 2) + ((a.z - b.z) ** 2)) : null;
}

function pointFromObject(value) {
  if (!value || typeof value !== 'object') return null;
  const x = Number(value.x ?? value.X ?? value[0]);
  const y = Number(value.y ?? value.Y ?? value[1]);
  const z = Number(value.z ?? value.Z ?? value[2]);
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? { x, y, z } : null;
}

function nominalDnFromNps(inches, config) {
  if (!Number.isFinite(inches)) return null;
  const map = config.weight?.npsToDn && typeof config.weight.npsToDn === 'object' ? config.weight.npsToDn : {};
  const key = String(Number(inches));
  const mapped = Number(map[key] ?? map[inches] ?? map[inches.toFixed(3)]);
  return Number.isFinite(mapped) ? mapped : inches * toFiniteNumber(config.weight?.inchToMm, 25.4);
}

function nominalDnFromOd(odNum) {
  if (!Number.isFinite(odNum)) return null;
  let best = null;
  for (const pair of OD_TO_DN) {
    const err = Math.abs(odNum - pair[0]);
    if (!best || err < best.err) best = { od: pair[0], dn: pair[1], err };
  }
  return best && best.err <= Math.max(1.5, Math.abs(best.od) * 0.006) ? best.dn : odNum;
}

function firstNumber(row, keys) {
  for (const key of keys) {
    const numeric = numberFromText(rowValue(row, [key]));
    if (numeric !== null) return numeric;
  }
  return null;
}

function uniqueKeys(values) {
  return [...new Set((values || []).map(text).filter(Boolean))];
}

function bucketText(config, bucketName, keys) {
  const bucket = config?.overrides?.[bucketName];
  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return '';
  for (const key of uniqueKeys(keys)) {
    if (Object.prototype.hasOwnProperty.call(bucket, key) && text(bucket[key])) return text(bucket[key]);
  }
  return '';
}

function processDataText(config, keys, fieldKey) {
  const bucket = config?.overrides?.processData;
  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return '';
  for (const key of uniqueKeys(keys)) {
    const value = bucket[key]?.[fieldKey];
    if (text(value)) return text(value);
  }
  return '';
}

function normalizeBranchKey(value) {
  return normalizeKey(value || '');
}

function looksLikeNpsToken(value) {
  return /^\s*\d+(?:\.\d+)?\s*(?:"|in|inch|nps)?\s*$/i.test(text(value));
}

function numericFromSizeToken(value) {
  const n = Number(text(value).replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function usableWeightCandidate(best) {
  if (!best) return false;
  const method = text(best.weightMethod || best.method).toLowerCase();
  if (method.startsWith('no-') || method.includes('no-same') || method.includes('unmatched')) return false;
  return numberFromText(best.selectedWeight ?? best.suggestedWeight ?? best.weight) !== null;
}
