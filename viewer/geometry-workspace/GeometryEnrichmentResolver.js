import { parseXmlCiiEnrichmentConfig, toFiniteNumber } from '../converters/xml-cii2019-core/config.js';
import { deriveLineKeyFromBranchName, tokenizeBranchName } from '../converters/xml-cii2019-core/regex-line-key.js';
import { detectLineListFieldMap, normalizeLineListRow } from '../converters/xml-cii2019-core/linelist-mapping.js';
import { buildPipingClassIndex } from '../converters/xml-cii2019-core/piping-class-resolver.js';
import { resolveBranchProcessData } from '../converters/xml-cii2019-core/branch-process-resolver.js';
import { parseDimensionToMm } from './GeometryMappingEngine.js?v=20260622-geometry-mapping-1';

export const GEOMETRY_ENRICHMENT_SCHEMA = 'geometry-enrichment/v1';
export const GEOMETRY_ENRICHMENT_RESOLVER_SCHEMA = 'geometry-enrichment-resolver/v1';
export const GEOMETRY_ENRICHMENT_VERSION = '20260622-geometry-enrichment-1';

const DEFAULT_BRANCH_PARSER = Object.freeze({
  tokenDelimiter: '-',
  lineKeyTokenPositions: '4',
  lineKeyJoiner: '',
  branchNameRegex: '',
  lineNoGroup: 1,
  sizeTokenIndex: 3,
  pipingClassTokenIndex: 5,
});

function text(value) {
  return String(value ?? '').trim();
}

function cleanKey(value) {
  return text(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function numberFrom(value) {
  const direct = toFiniteNumber(value);
  if (direct != null) return direct;
  const match = text(value).match(/[-+]?\d*\.?\d+/);
  return match ? Number(match[0]) : null;
}

function firstText(row, keys) {
  for (const key of keys || []) {
    const value = row?.[key] ?? row?._raw?.[key];
    if (text(value)) return text(value);
  }
  return '';
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => row && typeof row === 'object' && !Array.isArray(row));
}

function normalizeConfig(input = {}) {
  if (typeof input.configJson === 'string' && input.configJson.trim()) {
    return parseXmlCiiEnrichmentConfig(input.configJson);
  }
  if (input.config && typeof input.config === 'object') {
    return parseXmlCiiEnrichmentConfig(JSON.stringify(input.config));
  }
  return parseXmlCiiEnrichmentConfig('');
}

function branchCandidates(object) {
  const raw = object?.rawRecord?.rawFields || object?.rawFields || {};
  return [
    raw.BRANCH,
    raw.BRANCH_NAME,
    raw.BRANCHNAME,
    raw.PIPELINE_REFERENCE,
    raw.LINE_REF,
    object?.sourcePath,
    object?.rawRecord?.sourcePath,
    object?.displayName,
  ].map(text).filter(Boolean);
}

function bestBranchName(object) {
  const candidates = branchCandidates(object);
  return candidates.find((item) => /\/B\d+\b/i.test(item)) || candidates.find((item) => item.includes('/')) || candidates[0] || '';
}

function tokenAt(tokens, oneBasedIndex) {
  const index = Math.round(Number(oneBasedIndex || 0)) - 1;
  return index >= 0 ? text(tokens[index]) : '';
}

function parseNpsToken(value) {
  const raw = text(value).replace(/"/g, '').replace(/INCH(?:ES)?/i, '').replace(/IN\b/i, '').trim();
  if (!raw) return '';
  if (/^\d+\s*\/\s*\d+$/.test(raw)) {
    const [a, b] = raw.split('/').map((part) => Number(part.trim()));
    return b ? String(a / b) : raw;
  }
  const match = raw.match(/\d+(?:\.\d+)?/);
  return match ? match[0] : raw;
}

export function parseRenderedBranchIdentity(object, config = {}) {
  const branchName = bestBranchName(object);
  const parser = { ...DEFAULT_BRANCH_PARSER, ...(config.linelist || {}), ...(config.branchParser || {}) };
  const lineKey = deriveLineKeyFromBranchName(branchName, { linelist: parser });
  const tokens = tokenizeBranchName(branchName, parser.tokenDelimiter || '-');
  const sizeToken = tokenAt(tokens, parser.sizeTokenIndex || parser.boreTokenIndex || 3);
  const pipingClassToken = tokenAt(tokens, parser.pipingClassTokenIndex || 5);
  return {
    schemaVersion: 'geometry-branch-identity/v1',
    branchName,
    lineKey,
    normalizedLineKey: cleanKey(lineKey),
    tokens,
    nps: parseNpsToken(sizeToken),
    boreMm: parseDimensionToMm(sizeToken) || null,
    pipingClassFromBranch: pipingClassToken,
  };
}

function normalizeClassRows(rows) {
  return normalizeRows(rows).map((row) => ({
    ...row,
    pipingClass: firstText(row, ['pipingClass', 'Piping Class', 'PIPING_CLASS', 'Class', 'SPEC', 'Spec']),
    convertedBore: firstText(row, ['convertedBore', 'Converted Bore', 'boreMm', 'sizeMm', 'Size', 'DN', 'NB', 'NPS']),
    componentType: firstText(row, ['componentType', 'Component Type', 'COMPONENT_TYPE', 'Type', 'Item Type']),
    rating: firstText(row, ['rating', 'Rating', 'RATING', 'Pressure Class', 'Class']),
    schedule: firstText(row, ['schedule', 'Schedule', 'SCHEDULE', 'SCH']),
    wallThickness: firstText(row, ['wallThickness', 'Wall Thickness', 'Wall thickness', 'WALL_THICKNESS', 'WT']),
    corrosion: firstText(row, ['corrosion', 'Corrosion', 'Corrosion Allowance', 'CORROSION_ALLOWANCE', 'CA']),
    materialName: firstText(row, ['materialName', 'Material_Name', 'Material', 'MATERIAL']),
  }));
}

function normalizeMaterialRows(rows) {
  return normalizeRows(rows).map((row) => ({
    ...row,
    code: firstText(row, ['code', 'Code', 'Material Code', 'MATERIAL_CODE', 'CA3']),
    material: firstText(row, ['material', 'Material', 'Material_Name', 'Description', 'Name']),
    spec: firstText(row, ['spec', 'Spec', 'Specification']),
  }));
}

function normalizeWeightRows(rows) {
  return normalizeRows(rows).map((row) => ({
    ...row,
    bore: firstText(row, ['bore', 'convertedBore', 'Converted Bore', 'Size (NPS)', 'Size', 'NPS', 'DN', 'NB', 'Bore']),
    rating: firstText(row, ['rating', 'Rating', 'RATING', 'Class', 'CLASS', 'Pressure Class']),
    length: firstText(row, ['length', 'Length (RF-F/F)', 'RF-F/F', 'Length', 'LEN', 'Face To Face', 'faceToFace']),
    valveType: firstText(row, ['valveType', 'Type Description', 'Valve Type', 'Type', 'Description']),
    weight: firstText(row, ['weight', 'RF/RTJ KG', 'Valve Weight', 'Weight', 'valveWeight']),
  }));
}

function normalizeLineRows(rows, config, explicitFieldMap) {
  const lineRows = normalizeRows(rows);
  const fieldMap = { ...(explicitFieldMap || detectLineListFieldMap(lineRows, config.linelist?.fieldMap || {}, config)) };
  return {
    fieldMap,
    rows: lineRows.map((row, index) => normalizeLineListRow(row, fieldMap, index)),
  };
}

function lineIndex(rows) {
  const map = new Map();
  for (const row of rows || []) {
    for (const key of [row.lineNoKey, row.lineNo, row.lineKey]) {
      const norm = cleanKey(key);
      if (norm && !map.has(norm)) map.set(norm, row);
    }
  }
  return map;
}

function componentTypeFor(object) {
  const textValue = `${object.family || ''} ${object.objectType || ''} ${object.primitiveKind || ''} ${object.displayName || ''}`.toUpperCase();
  if (textValue.includes('VALV')) return 'VALVE';
  if (textValue.includes('FLANGE') || textValue.includes('FLAN')) return 'FLANGE';
  if (textValue.includes('TEE')) return 'TEE';
  if (textValue.includes('BEND') || textValue.includes('ELBOW')) return 'BEND';
  if (textValue.includes('SUPPORT') || textValue.includes('ATTA')) return 'SUPPORT';
  return object.family === 'PIPE' ? 'PIPE' : (object.family || 'OBJECT');
}

function pickProcessDensity(lineRow) {
  return numberFrom(lineRow?.densityMixed) ?? numberFrom(lineRow?.densityGas) ?? numberFrom(lineRow?.densityLiquid) ?? numberFrom(lineRow?.density);
}

function resolveWeight(object, weightRows, branch, process) {
  if (!['VALVE', 'FLANGE', 'RIGID', 'OBJECT'].includes(componentTypeFor(object))) return null;
  const bore = Number(object.pipe?.odMm || branch.boreMm || process?.boreMm || 0);
  const length = Number(object.geometry?.lengthMm || 0);
  const rating = cleanKey(process?.rating || '');
  let best = null;
  for (const row of weightRows || []) {
    const rowBore = numberFrom(row.bore);
    const rowLength = numberFrom(row.length);
    const rowRating = cleanKey(row.rating);
    let score = 0;
    if (rowBore != null && bore && Math.abs(rowBore - bore) <= 1) score += 4;
    if (rowLength != null && length && Math.abs(rowLength - length) <= 6) score += 3;
    if (rowRating && rating && rowRating === rating) score += 2;
    if (cleanKey(row.valveType) && cleanKey(object.displayName).includes(cleanKey(row.valveType))) score += 1;
    if (!best || score > best.score) best = { row, score };
  }
  if (!best || best.score <= 0) return null;
  return {
    componentWeightKg: numberFrom(best.row.weight),
    weightSource: 'weight-master',
    weightMatchConfidence: Math.min(1, Number((best.score / 10).toFixed(2))),
    matchedRow: best.row,
  };
}

function audit(field, source, confidence, value) {
  return { field, source, confidence, value };
}

function buildEnrichment(object, ctx) {
  const branch = parseRenderedBranchIdentity(object, ctx.config);
  const lineRow = ctx.lineRowByKey.get(branch.normalizedLineKey) || null;
  const process = lineRow ? resolveBranchProcessData({
    branchName: branch.branchName,
    lineKey: branch.lineKey,
    lineRow,
    boreMm: object.pipe?.odMm || branch.boreMm,
    componentType: componentTypeFor(object),
    rating: lineRow.rating,
    schedule: object.pipe?.schedule,
    materialMap: ctx.materialRows,
    pipingClassIndex: ctx.pipingClassIndex,
    overrides: ctx.config.overrides || {},
    xmlNode: {},
    xmlBranch: {},
    config: ctx.config,
  }) : null;
  const weight = resolveWeight(object, ctx.weightRows, branch, process);
  const warnings = [];
  if (!branch.lineKey) warnings.push('missing-branch-line-key');
  if (!lineRow) warnings.push('line-list-row-not-found');
  if (process?.pipingClassNeedsReview) warnings.push('piping-class-needs-review');
  const processFields = {
    pressureKPa: numberFrom(lineRow?.p1),
    hydroPressureKPa: numberFrom(lineRow?.hydroPressure),
    temperature1C: numberFrom(lineRow?.t1),
    temperature2C: numberFrom(lineRow?.t2),
    temperature3C: numberFrom(lineRow?.t3),
    fluidDensityKgM3: pickProcessDensity(lineRow),
    densityMixedKgM3: numberFrom(lineRow?.densityMixed),
    densityGasKgM3: numberFrom(lineRow?.densityGas),
    densityLiquidKgM3: numberFrom(lineRow?.densityLiquid),
    phase: text(lineRow?.phase),
  };
  const pipingFields = {
    requestedPipingClass: process?.requestedPipingClass || lineRow?.pipingClass || branch.pipingClassFromBranch || '',
    resolvedPipingClass: process?.resolvedPipingClass || '',
    rating: process?.rating || lineRow?.rating || '',
    schedule: process?.pipingClassMatchedRow?.schedule || process?.pipingClassMatchedRow?.Schedule || object.pipe?.schedule || '',
    wallThicknessMm: process?.wallThicknessMm ?? object.pipe?.wallThicknessMm ?? null,
    corrosionAllowanceMm: process?.corrosionAllowanceMm ?? null,
    materialName: process?.material || object.pipe?.material || lineRow?.material || '',
    materialCode: process?.materialCode || '',
  };
  const audits = [];
  if (lineRow?.p1) audits.push(audit('process.pressureKPa', 'line-list.p1', 1, processFields.pressureKPa));
  if (lineRow?.hydroPressure) audits.push(audit('process.hydroPressureKPa', 'line-list.hydroPressure', 1, processFields.hydroPressureKPa));
  if (pipingFields.wallThicknessMm != null) audits.push(audit('piping.wallThicknessMm', process?.wallThicknessSource || 'piping-class-master', process?.pipingClassConfidence || 0, pipingFields.wallThicknessMm));
  if (pipingFields.corrosionAllowanceMm != null) audits.push(audit('piping.corrosionAllowanceMm', process?.corrosionSource || 'piping-class-master', process?.pipingClassConfidence || 0, pipingFields.corrosionAllowanceMm));
  if (weight?.componentWeightKg != null) audits.push(audit('weight.componentWeightKg', 'weight-master', weight.weightMatchConfidence, weight.componentWeightKg));
  return {
    schemaVersion: GEOMETRY_ENRICHMENT_SCHEMA,
    branch: { ...branch },
    process: processFields,
    piping: pipingFields,
    weight: weight ? { componentWeightKg: weight.componentWeightKg, weightSource: weight.weightSource, weightMatchConfidence: weight.weightMatchConfidence } : {},
    audit: audits,
    review: { needsReview: warnings.length > 0, warnings },
  };
}

export function exampleGeometryEnrichmentPackage() {
  return {
    config: { linelist: { tokenDelimiter: '-', lineKeyTokenPositions: '4', sizeTokenIndex: 3, pipingClassTokenIndex: 5 } },
    lineListRows: [
      { 'Line Number': 'S8810105', 'Piping Class': 'CS150', Rating: '150', Material: 'A106 Gr.B', Bore: '250', P1: '700', 'Hydro Test Pressure': '1200', T1: '120', T2: '309', T3: '-5', 'Mixed kg/m3': '100', Phase: 'gas' }
    ],
    pipingClassRows: [
      { 'Piping Class': 'CS150', 'Converted Bore': '250', 'Component Type': 'PIPE', Rating: '150', Schedule: 'STD', 'Wall Thickness': '9.27', Corrosion: '1.5', Material_Name: 'A106 Gr.B' }
    ],
    materialRows: [
      { Code: '1', Material: 'A106 GR.B', Spec: 'CS' }
    ],
    weightRows: [
      { Bore: '250', Rating: '150', Length: '300', 'Valve Type': 'VALVE', Weight: '48.5' }
    ]
  };
}

export function resolveGeometryEnrichment(mappedObjects, inputPackage = {}) {
  const objects = normalizeRows(mappedObjects);
  const config = normalizeConfig(inputPackage);
  const lineList = normalizeLineRows(inputPackage.lineListRows || inputPackage.linelistRows || inputPackage.lineRows, config, inputPackage.lineListFieldMap);
  const pipingClassRows = normalizeClassRows(inputPackage.pipingClassRows || inputPackage.classRows);
  const materialRows = normalizeMaterialRows(inputPackage.materialRows || inputPackage.materialMapRows || inputPackage.mapRows);
  const weightRows = normalizeWeightRows(inputPackage.weightRows || inputPackage.weightsRows);
  const ctx = {
    config,
    lineRowByKey: lineIndex(lineList.rows),
    pipingClassIndex: buildPipingClassIndex(pipingClassRows, inputPackage.pipingClassFieldMap || {}),
    materialRows,
    weightRows,
  };
  const enrichedObjects = objects.map((object) => {
    const geometryEnrichment = buildEnrichment(object, ctx);
    return {
      ...object,
      geometryEnrichment,
      enrichedFields: flattenEnrichedFields(geometryEnrichment),
      mappingAudit: [
        ...(object.mappingAudit || []),
        { source: 'GEOMETRY_ENRICHMENT_RESOLVER', schemaVersion: GEOMETRY_ENRICHMENT_SCHEMA, warningCount: geometryEnrichment.review.warnings.length }
      ]
    };
  });
  return {
    schemaVersion: GEOMETRY_ENRICHMENT_RESOLVER_SCHEMA,
    version: GEOMETRY_ENRICHMENT_VERSION,
    objectCount: objects.length,
    enrichedCount: enrichedObjects.filter((object) => !object.geometryEnrichment.review.needsReview).length,
    reviewCount: enrichedObjects.filter((object) => object.geometryEnrichment.review.needsReview).length,
    masterSummary: {
      lineListRows: lineList.rows.length,
      pipingClassRows: pipingClassRows.length,
      materialRows: materialRows.length,
      weightRows: weightRows.length,
      lineListFieldMap: lineList.fieldMap,
    },
    enrichedObjects,
  };
}

function flattenEnrichedFields(enrichment) {
  return {
    pressureKPa: enrichment.process.pressureKPa,
    hydroPressureKPa: enrichment.process.hydroPressureKPa,
    temperature1C: enrichment.process.temperature1C,
    temperature2C: enrichment.process.temperature2C,
    temperature3C: enrichment.process.temperature3C,
    fluidDensityKgM3: enrichment.process.fluidDensityKgM3,
    wallThicknessMm: enrichment.piping.wallThicknessMm,
    corrosionAllowanceMm: enrichment.piping.corrosionAllowanceMm,
    materialName: enrichment.piping.materialName,
    materialCode: enrichment.piping.materialCode,
    schedule: enrichment.piping.schedule,
    rating: enrichment.piping.rating,
    pipingClass: enrichment.piping.resolvedPipingClass || enrichment.piping.requestedPipingClass,
    componentWeightKg: enrichment.weight.componentWeightKg,
  };
}
