/**
 * Functionality: adapts the XML->CII branch enrichment resolver to immutable
 * selected-geometry scopes. Parameters: selected scope snapshots, imported
 * master rows, and editable XML->CII-style config. Outputs: branch preview rows,
 * diagnostics, and enriched object snapshots. Source geometry is never mutated.
 */

import { deriveLineKeyFromBranchName } from '../converters/xml-cii2019-core/regex-line-key.js';
import { detectLineListFieldMap, normalizeLineListRow } from '../converters/xml-cii2019-core/linelist-mapping.js';
import { parseXmlCiiEnrichmentConfig } from '../converters/xml-cii2019-core/config.js';
import { buildPipingClassIndex } from '../converters/xml-cii2019-core/piping-class-resolver.js';
import { resolveBranchProcessData } from '../converters/xml-cii2019-core/branch-process-resolver.js';
import { resolveLineListDensity } from '../converters/xml-cii2019-core/line-density-resolver.js';
import { cloneSafe, freezeDeep, normalizeKey, text } from './selected-geometry-shared.js';
import {
  boreFromGroup,
  branchDiagnostics,
  branchInfoForObject,
  branchStatus,
  buildWeightRowsForGroup,
  countBranchStatuses,
  deriveBoreFromBranchName,
  derivePipingClassFromBranchName,
  deriveRatingFromPipingClass,
  findLineListRow,
  materialCodeMethodFor,
  missingBranchFields,
  numberFromText,
  overrideSource,
  processDefaultValue,
  processSource,
  processValue,
  ratingOverride,
  rowText,
  shouldReviewPipingClass,
  summarizeDiagnostics,
} from './selected-geometry-branch-helpers.js';

export const SELECTED_GEOMETRY_BRANCH_WORKFLOW_SCHEMA = 'selected-geometry-branch-workflow/v1';
export const SELECTED_GEOMETRY_BRANCH_ENRICHMENT_SCHEMA = 'selected-geometry-branch-enrichment/v1';

export function buildSelectedGeometryWorkflowConfig(input) {
  const options = input && typeof input === 'object' ? input : {};
  const rawConfig = options.config && typeof options.config === 'object' ? options.config : {};
  const masters = options.masters && typeof options.masters === 'object' ? options.masters : {};
  const config = parseXmlCiiEnrichmentConfig(JSON.stringify(rawConfig));
  const lineRows = rowsFromMaster(masters.lineList);
  const fieldMap = detectLineListFieldMap(lineRows, config.linelist?.fieldMap || {}, config);
  const normalizedLineRows = lineRows.map((row, index) => normalizeLineListRow(row, fieldMap, index));
  config.linelist = { ...(config.linelist || {}), fieldMap, masterRows: normalizedLineRows };
  config.pipingClass = { ...(config.pipingClass || {}), masterRows: rowsFromMaster(masters.pipingClass) };
  config.material = { ...(config.material || {}), mapRows: rowsFromMaster(masters.materialMap) };
  config.weight = { ...(config.weight || {}), masterRows: rowsFromMaster(masters.weightMaster) };
  return config;
}

export function collectSelectedGeometryBranchGroups(scope, config) {
  const objects = Array.isArray(scope?.objects) ? scope.objects : [];
  const map = new Map();
  for (const object of objects) {
    const branchInfo = branchInfoForObject(object, config);
    const key = branchInfo.branchName || `missing:${object?.id || map.size}`;
    const current = map.get(key) || {
      branchName: branchInfo.branchName,
      lineKeyFallback: branchInfo.lineKeyFallback,
      objects: [],
      objectIds: [],
      objectNames: [],
    };
    current.objects.push(object);
    current.objectIds.push(text(object?.id));
    current.objectNames.push(text(object?.name || object?.id));
    if (!current.lineKeyFallback && branchInfo.lineKeyFallback) current.lineKeyFallback = branchInfo.lineKeyFallback;
    map.set(key, current);
  }
  return freezeDeep(Array.from(map.values()).map((group) => ({
    branchName: group.branchName,
    lineKeyFallback: group.lineKeyFallback,
    objectCount: group.objects.length,
    objectIds: group.objectIds.filter(Boolean),
    objectNames: group.objectNames.filter(Boolean),
    objects: group.objects,
  })));
}

export function buildSelectedGeometryBranchPreview(input) {
  const options = input && typeof input === 'object' ? input : {};
  const scope = options.scope && typeof options.scope === 'object' ? options.scope : {};
  const config = buildSelectedGeometryWorkflowConfig({ masters: options.masters, config: options.config });
  const groups = collectSelectedGeometryBranchGroups(scope, config);
  const pipingClassIndex = buildPipingClassIndex(config.pipingClass?.masterRows || []);
  const branchRows = groups.map((group) => resolveBranchGroup(group, config, pipingClassIndex));
  const nodeRows = branchRows.flatMap((row) => row.weightRows || []);
  const diagnostics = branchRows.flatMap(branchDiagnostics);
  return freezeDeep({
    schema: SELECTED_GEOMETRY_BRANCH_WORKFLOW_SCHEMA,
    scopeMode: text(scope.scopeMode || 'selected'),
    capturedAt: text(scope.capturedAt),
    counts: {
      objects: Number(scope.stats?.objects || scope.objects?.length || 0),
      branches: branchRows.length,
      resolved: branchRows.filter((row) => !row.needsReview).length,
      diagnostics: diagnostics.length,
      weights: nodeRows.length,
      statuses: countBranchStatuses(branchRows),
    },
    config,
    groups,
    branchRows,
    nodeRows,
    diagnostics,
    diagnosticSummary: summarizeDiagnostics(diagnostics),
  });
}

export function enrichSelectedGeometryScopeWithBranchWorkflow(input) {
  const options = input && typeof input === 'object' ? input : {};
  const scope = options.scope && typeof options.scope === 'object' ? options.scope : {};
  const preview = buildSelectedGeometryBranchPreview({ scope, masters: options.masters, config: options.config });
  const byBranch = new Map(preview.branchRows.map((row) => [normalizeBranchKey(row.branchName), row]));
  const objects = (Array.isArray(scope.objects) ? scope.objects : []).map((object) => {
    const branchInfo = branchInfoForObject(object, preview.config);
    const row = byBranch.get(normalizeBranchKey(branchInfo.branchName)) || null;
    return enrichObjectFromBranchRow(object, row, branchInfo);
  });
  return freezeDeep({
    ...scope,
    schema: scope.schema || 'selected-geometry-scope/v1',
    objects,
    branchWorkflowPreview: preview,
  });
}

function resolveBranchGroup(group, config, pipingClassIndex) {
  const branchName = text(group.branchName);
  const lineKey = deriveLineKeyFromBranchName(branchName, config) || text(group.lineKeyFallback);
  const lineListMatch = lineKey ? findLineListRow(lineKey, config) : null;
  const lineListClass = rowText(lineListMatch, ['pipingClass', 'Piping Class', 'PIPING_CLASS']);
  const derivedClassRaw = derivePipingClassFromBranchName(branchName, config) || lineListClass;
  const boreMm = deriveBoreFromBranchName(branchName, config) || boreFromGroup(group, lineListMatch, config);
  const ratingKeys = uniqueKeys([lineKey, branchName, derivedClassRaw]);
  const manualRating = ratingOverride(config, ratingKeys);
  const rowRating = rowText(lineListMatch, ['rating', 'Rating', 'RATING']);
  const inputRating = manualRating || deriveRatingFromPipingClass(derivedClassRaw, config) || rowRating;
  const resolved = resolveBranchProcessData({
    branchName,
    lineKey,
    lineRow: { ...(lineListMatch || {}), pipingClass: derivedClassRaw },
    boreMm,
    componentType: 'PIPE',
    rating: inputRating,
    materialMap: config.material?.mapRows || [],
    pipingClassIndex,
    overrides: config.overrides || {},
    xmlNode: null,
    xmlBranch: null,
    config,
  });
  const branchRating = manualRating || deriveRatingFromPipingClass(resolved.pipingClass, config) || resolved.rating || rowRating;
  const pdOverride = (lineKey && config?.overrides?.processData?.[lineKey]) || {};
  const densityInfo = resolveLineListDensity(lineListMatch, pdOverride);
  const materialCodeMethod = materialCodeMethodFor(resolved.materialSource);
  const classNeedsReview = shouldReviewPipingClass(resolved);
  const missing = missingBranchFields({ branchName, lineKey, lineListMatch, resolved, branchRating });
  const weightRows = buildWeightRowsForGroup(group, { branchName, lineKey, boreMm, rating: branchRating, pipingClass: resolved.pipingClass, config });
  const status = branchStatus({ missing, classNeedsReview, materialCodeMethod, resolved, branchRating });
  return {
    branchName,
    objectCount: group.objectCount,
    sampleObject: group.objectNames?.[0] || group.objectIds?.[0] || '',
    lineKey,
    lineMiss: !lineListMatch,
    size: boreMm != null ? `${boreMm}mm` : '',
    sizeMm: boreMm,
    pipingClass: resolved.pipingClass || '',
    pipingClassDerived: derivedClassRaw || '',
    pipingClassMethod: resolved.pipingClassMatchMethod || '',
    pipingClassConfidence: resolved.pipingClassConfidence ?? null,
    pipingClassScore: resolved.pipingClassScore ?? null,
    pipingClassRowScore: resolved.pipingClassRowScore ?? null,
    pipingClassRowReasons: resolved.pipingClassRowReasons || [],
    pipingClassNeedsReview: classNeedsReview,
    pipingClassCandidates: resolved.pipingClassCandidates || [],
    material: resolved.material || '',
    materialSource: resolved.materialSource || overrideSource(config.overrides, 'material', lineKey),
    materialCode: resolved.materialCode || '',
    materialCodeMethod,
    materialCodeNeedsReview: !resolved.materialCode,
    rating: branchRating || '',
    ratingSource: manualRating ? 'override' : (branchRating ? 'piping-class-prefix' : 'none'),
    p1: processValue(pdOverride, lineListMatch, 'p1', ['p1'], config),
    t1: processValue(pdOverride, lineListMatch, 't1', ['t1'], config),
    t2: processValue(pdOverride, lineListMatch, 't2', ['t2'], config),
    t3: processValue(pdOverride, lineListMatch, 't3', ['t3'], config),
    density: densityInfo.value || (lineListMatch ? processDefaultValue(config, 'density') : ''),
    p1Source: processSource(pdOverride, lineListMatch, 'p1', ['p1'], config),
    t1Source: processSource(pdOverride, lineListMatch, 't1', ['t1'], config),
    t2Source: processSource(pdOverride, lineListMatch, 't2', ['t2'], config),
    t3Source: processSource(pdOverride, lineListMatch, 't3', ['t3'], config),
    densitySource: densityInfo.value ? densityInfo.source : (processDefaultValue(config, 'density') ? 'default' : (lineListMatch ? 'none' : 'line-list-missing')),
    wallThickness: resolved.wallThicknessMm != null ? String(Number(resolved.wallThicknessMm.toPrecision(6))) : '',
    wallThicknessSource: resolved.wallThicknessSource || overrideSource(config.overrides, 'wallThickness', lineKey),
    corrosion: resolved.corrosionAllowanceMm != null ? String(resolved.corrosionAllowanceMm) : '',
    corrosionSource: resolved.corrosionSource || overrideSource(config.overrides, 'corrosion', lineKey),
    weightRows,
    missing,
    needsReview: status === 'missing' || status === 'review',
    status,
  };
}

function enrichObjectFromBranchRow(object, row, branchInfo) {
  const source = object && typeof object === 'object' ? object : {};
  const missing = row?.missing || ['branchWorkflow'];
  const audit = {
    sources: row ? [{ source: 'xml-cii-branch-workflow', method: row.pipingClassMethod || 'branch-regex', confidence: row.pipingClassConfidence }] : [],
    method: 'xml-cii-branch-workflow',
    confidence: row?.pipingClassConfidence ?? null,
    needsReview: !row || Boolean(row.needsReview),
    conflicts: [],
    missing,
  };
  return freezeDeep({
    ...source,
    sourceAttributes: cloneSafe(source.sourceAttributes || {}),
    calculatedFields: cloneSafe(source.calculatedFields || {}),
    attributes: { ...(source.attributes || {}), enrichment: enrichmentPayload(row, branchInfo, audit) },
  });
}

function enrichmentPayload(row, branchInfo, audit) {
  return {
    schema: SELECTED_GEOMETRY_BRANCH_ENRICHMENT_SCHEMA,
    branch: { branchName: row?.branchName || branchInfo.branchName || '', objectCount: row?.objectCount || 0, status: row?.status || 'review' },
    lineList: { lineNo: row?.lineKey || '', lineKey: row?.lineKey || '', p1: row?.p1 || '', t1: row?.t1 || '', t2: row?.t2 || '', t3: row?.t3 || '', density: row?.density || '' },
    pipingClass: { className: row?.pipingClass || '', requestedClass: row?.pipingClassDerived || '', rating: row?.rating || '', wallThicknessMm: numberFromText(row?.wallThickness), corrosionAllowanceMm: numberFromText(row?.corrosion), materialName: row?.material || '', materialCode: row?.materialCode || '' },
    material: { materialName: row?.material || '', materialCode: row?.materialCode || '', source: row?.materialSource || '' },
    weight: { rating: row?.rating || '', candidateCount: row?.weightRows?.length || 0, bestWeightKg: firstWeight(row?.weightRows) },
    audit,
  };
}

function rowsFromMaster(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.masterRows)) return value.masterRows;
  if (Array.isArray(value?.mapRows)) return value.mapRows;
  return [];
}

function normalizeBranchKey(value) {
  return normalizeKey(value || '');
}

function uniqueKeys(values) {
  return [...new Set((values || []).map(text).filter(Boolean))];
}

function firstWeight(weightRows) {
  const first = Array.isArray(weightRows) ? weightRows[0] : null;
  const numeric = numberFromText(first?.weight);
  return numeric === null ? null : numeric;
}
