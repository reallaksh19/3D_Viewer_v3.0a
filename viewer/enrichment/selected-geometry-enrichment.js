// Plain-object enrichment resolver: matches selected geometry to line list,
// piping class, material, and weight masters while writing only attributes.enrichment.

import { isPipeLikeType } from './selected-geometry-diagnostics.js';
import {
  cloneSafe,
  freezeDeep,
  normalizeKey,
  numberOrNull,
  rowNumber,
  rowValue,
  text,
} from './selected-geometry-shared.js';

export function enrichSelectedGeometryScope(scope, masters, options) {
  const source = scope && typeof scope === 'object' ? scope : {};
  const objects = Array.isArray(source.objects) ? source.objects : [];
  const enrichedObjects = objects.map((object) => enrichGeometryObject(object, masters, options));
  return freezeDeep({
    ...source,
    schema: source.schema || 'selected-geometry-scope/v1',
    objects: enrichedObjects,
  });
}

export function enrichGeometryObject(object, masters, options) {
  const source = object && typeof object === 'object' ? object : {};
  const masterData = normalizeMasters(masters);
  const sourceFields = source.sourceAttributes || {};
  const lineMatch = matchLineListRow(source, masterData.lineList);
  const pipingClassMatch = matchPipingClass(source, lineMatch.row, masterData.pipingClass);
  const materialMatch = matchMaterial(source, lineMatch.row, pipingClassMatch.row, masterData.materialMap);
  const weightMatch = matchWeight(source, lineMatch.row, pipingClassMatch.row, masterData.weightMaster);
  const audit = collectEnrichmentAudit({
    object: source,
    sourceFields,
    lineMatch,
    pipingClassMatch,
    materialMatch,
    weightMatch,
    options,
  });
  return freezeDeep({
    ...source,
    sourceAttributes: cloneSafe(source.sourceAttributes || {}),
    calculatedFields: cloneSafe(source.calculatedFields || {}),
    attributes: {
      ...(source.attributes || {}),
      enrichment: {
        schema: 'selected-geometry-enrichment/v1',
        lineList: normalizeLineListEnrichment(lineMatch.row),
        pipingClass: normalizePipingClassEnrichment(pipingClassMatch.row, pipingClassMatch.className),
        material: normalizeMaterialEnrichment(materialMatch.row, materialMatch.fallbackName),
        weight: normalizeWeightEnrichment(weightMatch.row, weightMatch),
        audit,
      },
    },
  });
}

export function normalizeMasters(masters) {
  const source = masters && typeof masters === 'object' ? masters : {};
  return freezeDeep({
    lineList: rows(source.lineList),
    pipingClass: rows(source.pipingClass),
    materialMap: rows(source.materialMap),
    weightMaster: rows(source.weightMaster),
    versions: {
      lineListVersion: text(source.lineListVersion || source.lineList?.version),
      pipingClassVersion: text(source.pipingClassVersion || source.pipingClass?.version),
      materialMapVersion: text(source.materialMapVersion || source.materialMap?.version),
      weightMasterVersion: text(source.weightMasterVersion || source.weightMaster?.version),
    },
  });
}

export function matchLineListRow(object, lineRows) {
  const candidates = lineIdentityValues(object);
  const result = bestRowMatch(lineRows, candidates, [
    ['lineNo', ['lineNo', 'LINE_NO', 'LINE NO', 'LINE_NUMBER', 'LINE']],
    ['lineKey', ['lineKey', 'LINE_KEY', 'BRANCH_KEY']],
    ['branchName', ['branchName', 'BRANCH_NAME', 'BRANCHNAME']],
    ['sourceTag', ['sourceTag', 'SOURCE_TAG', 'TAG']],
  ]);
  return freezeDeep(result);
}

export function matchPipingClass(object, lineRow, classRows) {
  const sourceFields = object?.sourceAttributes || {};
  const className = text(
    rowValue(lineRow, ['pipingClass', 'PIPING_CLASS', 'Piping Class', 'CLASS', 'SPEC'])
      || sourceFields.PIPING_CLASS
      || sourceFields.PIPE_CLASS
      || sourceFields.CLASS
      || sourceFields.SPEC
  );
  if (!className) return freezeDeep(noMatch('piping-class-missing', null));
  const objectFacts = objectSizingFacts(object, lineRow, null);
  let best = null;
  for (const row of classRows) {
    const rowClass = rowValue(row, ['pipingClass', 'Piping Class', 'PIPING_CLASS', 'CLASS', 'SPEC']);
    if (normalizeKey(rowClass) !== normalizeKey(className)) continue;
    const score = sizingScore(row, objectFacts);
    if (!best || score.score > best.score.score) best = { row, score };
  }
  if (!best) return freezeDeep(noMatch('piping-class-no-master-row', className));
  return freezeDeep({
    row: best.row,
    method: best.score.approximate ? 'class-size-approximate' : 'class-size-exact',
    confidence: best.score.confidence,
    needsReview: best.score.approximate,
    className,
    reasons: best.score.reasons,
  });
}

export function matchMaterial(object, lineRow, classRow, materialRows) {
  const sourceFields = object?.sourceAttributes || {};
  const code = text(
    rowValue(classRow, ['materialCode', 'MATERIAL_CODE', 'MatID', 'Material Code'])
      || rowValue(lineRow, ['materialCode', 'MATERIAL_CODE', 'MatID'])
      || sourceFields.MATERIAL_CODE
      || sourceFields.MATID
  );
  const name = text(
    rowValue(classRow, ['materialName', 'MATERIAL_NAME', 'Material', 'material'])
      || rowValue(lineRow, ['material', 'MATERIAL', 'MATERIAL_NAME'])
      || sourceFields.MATERIAL_NAME
      || sourceFields.MATERIAL
  );
  const keys = [code, name].map(normalizeKey).filter(Boolean);
  for (const row of materialRows) {
    const rowKeys = [
      rowValue(row, ['materialCode', 'MATERIAL_CODE', 'MatID', 'code']),
      rowValue(row, ['materialName', 'MATERIAL_NAME', 'material', 'name']),
      rowValue(row, ['materialCategory', 'MATERIAL_CATEGORY', 'category']),
    ].map(normalizeKey).filter(Boolean);
    if (rowKeys.some((key) => keys.includes(key))) {
      return freezeDeep({ row, method: 'material-map-exact', confidence: 1, needsReview: false, fallbackName: '' });
    }
  }
  if (name) {
    return freezeDeep({ row: null, method: 'source-material-name', confidence: 0.55, needsReview: true, fallbackName: name });
  }
  return freezeDeep(noMatch('material-missing', null));
}

export function matchWeight(object, lineRow, classRow, weightRows) {
  const facts = objectSizingFacts(object, lineRow, classRow);
  let best = null;
  for (const row of weightRows) {
    const score = sizingScore(row, facts);
    if (score.score <= 0) continue;
    if (!best || score.score > best.score.score) best = { row, score };
  }
  if (!best || best.score.score < 4) return freezeDeep(noMatch('weight-no-master-row', null));
  return freezeDeep({
    row: best.row,
    method: best.score.approximate ? 'weight-master-approximate' : 'weight-master-exact',
    confidence: best.score.confidence,
    needsReview: best.score.approximate,
    reasons: best.score.reasons,
  });
}

export function normalizeLineListEnrichment(row) {
  return freezeDeep({
    lineNo: text(rowValue(row, ['lineNo', 'LINE_NO', 'LINE NO', 'LINE_NUMBER'])),
    service: text(rowValue(row, ['service', 'SERVICE'])),
    fluid: text(rowValue(row, ['fluid', 'FLUID'])),
    pressure1Mpa: rowNumber(row, ['pressure1Mpa', 'P1_MPA', 'PRESSURE1_MPA', 'PRESSURE']),
    hydroPressureMpa: rowNumber(row, ['hydroPressureMpa', 'HYDRO_PRESSURE_MPA', 'HYDRO']),
    temp1C: rowNumber(row, ['temp1C', 'TEMP1_C', 'TEMP_EXP_C1', 'T1']),
    temp2C: rowNumber(row, ['temp2C', 'TEMP2_C', 'TEMP_EXP_C2', 'T2']),
    temp3C: rowNumber(row, ['temp3C', 'TEMP3_C', 'TEMP_EXP_C3', 'T3']),
    fluidDensityKgM3: rowNumber(row, ['fluidDensityKgM3', 'DENSITY_KG_M3', 'DENSITY']),
    insulationThicknessMm: rowNumber(row, ['insulationThicknessMm', 'INSULATION_THICKNESS_MM', 'INSUL_THICK']),
  });
}

export function normalizePipingClassEnrichment(row, requestedClass) {
  return freezeDeep({
    className: text(rowValue(row, ['pipingClass', 'Piping Class', 'PIPING_CLASS', 'CLASS', 'SPEC']) || requestedClass),
    rating: text(rowValue(row, ['rating', 'RATING', 'classRating'])),
    schedule: text(rowValue(row, ['schedule', 'SCHEDULE', 'SCH'])),
    wallThicknessMm: rowNumber(row, ['wallThicknessMm', 'WALL_THICK', 'Wall Thickness', 'wall']),
    corrosionAllowanceMm: rowNumber(row, ['corrosionAllowanceMm', 'CORROSION_ALLOWANCE', 'Corrosion']),
    materialName: text(rowValue(row, ['materialName', 'MATERIAL_NAME', 'Material', 'material'])),
    materialCode: text(rowValue(row, ['materialCode', 'MATERIAL_CODE', 'MatID', 'Material Code'])),
  });
}

export function normalizeMaterialEnrichment(row, fallbackName) {
  return freezeDeep({
    materialCode: text(rowValue(row, ['materialCode', 'MATERIAL_CODE', 'MatID', 'code'])),
    materialCategory: text(rowValue(row, ['materialCategory', 'MATERIAL_CATEGORY', 'category'])),
    materialDensityKgM3: rowNumber(row, ['materialDensityKgM3', 'DENSITY_KG_M3', 'density']),
    materialName: text(rowValue(row, ['materialName', 'MATERIAL_NAME', 'material', 'name']) || fallbackName),
  });
}

export function normalizeWeightEnrichment(row, match) {
  return freezeDeep({
    unitPipeWeightKgPerM: rowNumber(row, ['unitPipeWeightKgPerM', 'UnitPipewtKg/m', 'PIPE_WT_KG_M']),
    rigidWeightKg: rowNumber(row, ['rigidWeightKg', 'RIGID_WEIGHT_KG', 'Rigid Weight', 'weight']),
    componentWeightKg: rowNumber(row, ['componentWeightKg', 'COMPONENT_WEIGHT_KG', 'componentWeight', 'weightKg']),
    source: text(rowValue(row, ['source', 'SOURCE']) || (row ? 'weight-master' : '')),
    matchMethod: text(match?.method),
    confidence: numberOrNull(match?.confidence),
  });
}

function collectEnrichmentAudit(input) {
  const line = input.lineMatch;
  const pipeClass = input.pipingClassMatch;
  const material = input.materialMatch;
  const weight = input.weightMatch;
  const missing = [];
  const conflicts = [];
  const sources = [];
  for (const [name, match] of [['lineList', line], ['pipingClass', pipeClass], ['material', material], ['weight', weight]]) {
    if (match?.row) sources.push({ source: name, method: match.method, confidence: match.confidence });
    else if (name !== 'weight' || isPipeLikeType(input.object?.type)) missing.push(name);
  }
  addConflict(conflicts, 'wallThicknessMm', input.sourceFields.WALL_THICK, rowValue(pipeClass?.row, ['wallThicknessMm', 'WALL_THICK', 'Wall Thickness']));
  addConflict(conflicts, 'materialName', input.sourceFields.MATERIAL_NAME || input.sourceFields.MATERIAL, rowValue(pipeClass?.row, ['materialName', 'MATERIAL_NAME', 'Material']));
  const confidenceValues = [line, pipeClass, material, weight].map((match) => Number(match?.confidence)).filter(Number.isFinite);
  const confidence = confidenceValues.length ? Math.min(...confidenceValues) : null;
  const approximate = confidenceValues.some((value) => value > 0 && value < 1);
  return freezeDeep({
    sources,
    method: approximate ? 'mixed-approximate' : 'deterministic-master-match',
    confidence,
    needsReview: Boolean(missing.length || conflicts.length || approximate || material?.needsReview || weight?.needsReview || pipeClass?.needsReview),
    conflicts,
    missing,
  });
}

function rows(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.masterRows)) return value.masterRows;
  if (Array.isArray(value?.mapRows)) return value.mapRows;
  return [];
}

function noMatch(method, className) {
  return { row: null, method, confidence: null, needsReview: true, className: className ? text(className) : '', reasons: [] };
}

function lineIdentityValues(object) {
  const attrs = object?.sourceAttributes || {};
  return [
    object?.id,
    object?.name,
    object?.sourcePath,
    attrs.LINE_NO,
    attrs.LINE_NUMBER,
    attrs.LINEKEY,
    attrs.LINE_KEY,
    attrs.BRANCH_NAME,
    attrs.BRANCHNAME,
    attrs.OWNER,
    attrs.RVM_OWNER_PATH,
    attrs.TAG,
  ].map(text).filter(Boolean);
}

function bestRowMatch(candidateRows, values, fieldGroups) {
  let best = null;
  for (const row of candidateRows) {
    let score = 0;
    const reasons = [];
    for (const [reason, keys] of fieldGroups) {
      const rowText = text(rowValue(row, keys));
      if (!rowText) continue;
      const rowKey = normalizeKey(rowText);
      const exact = values.some((value) => normalizeKey(value) === rowKey);
      const contained = values.some((value) => normalizeKey(value).includes(rowKey) || rowKey.includes(normalizeKey(value)));
      if (exact) {
        score += 10;
        reasons.push(`${reason}:exact`);
      } else if (contained) {
        score += 6;
        reasons.push(`${reason}:contains`);
      }
    }
    if (score && (!best || score > best.score)) best = { row, score, reasons };
  }
  if (!best) return noMatch('line-list-no-match', null);
  const confidence = best.score >= 10 ? 1 : Math.max(0.5, best.score / 10);
  return {
    row: best.row,
    method: confidence === 1 ? 'line-list-exact' : 'line-list-approximate',
    confidence,
    needsReview: confidence < 1,
    reasons: best.reasons,
  };
}

function objectSizingFacts(object, lineRow, classRow) {
  const attrs = object?.sourceAttributes || {};
  return {
    nps: numberOrNull(attrs.NPS ?? attrs.NS ?? attrs.NOMINAL_SIZE ?? rowValue(lineRow, ['nps', 'NPS', 'NS'])),
    od: numberOrNull(attrs.DIAMETER ?? attrs.PIPE_OD ?? attrs.OD ?? rowValue(classRow, ['pipeOdMm', 'OD', 'PipeOD'])),
    wall: numberOrNull(attrs.WALL_THICK ?? attrs.WALL_THICKNESS_MM ?? rowValue(classRow, ['wallThicknessMm', 'WALL_THICK', 'Wall Thickness'])),
    schedule: text(attrs.SCHEDULE ?? attrs.SCH ?? rowValue(classRow, ['schedule', 'SCHEDULE', 'SCH'])),
    componentType: text(object?.type || attrs.TYPE || attrs.COMPONENT_TYPE),
  };
}

function sizingScore(row, facts) {
  let score = 0;
  let possible = 0;
  const reasons = [];
  const nps = rowNumber(row, ['nps', 'NPS', 'NS', 'convertedBore']);
  const od = rowNumber(row, ['pipeOdMm', 'PipeOD', 'OD', 'DIAMETER']);
  const wall = rowNumber(row, ['wallThicknessMm', 'WALL_THICK', 'Wall Thickness', 'wall']);
  const schedule = rowValue(row, ['schedule', 'SCHEDULE', 'SCH']);
  const type = rowValue(row, ['componentType', 'COMPONENT_TYPE', 'TYPE']);
  possible += addNumericScore(nps, facts.nps, 4, 0.001, 'nps', reasons, (value) => { score += value; });
  possible += addNumericScore(od, facts.od, 4, 1.5, 'od', reasons, (value) => { score += value; });
  possible += addNumericScore(wall, facts.wall, 3, 0.25, 'wall', reasons, (value) => { score += value; });
  if (schedule || facts.schedule) {
    possible += 2;
    if (normalizeKey(schedule) && normalizeKey(schedule) === normalizeKey(facts.schedule)) {
      score += 2;
      reasons.push('schedule:exact');
    }
  }
  if (type || facts.componentType) {
    possible += 2;
    if (!normalizeKey(type) || normalizeKey(type) === normalizeKey(facts.componentType)) {
      score += 2;
      reasons.push('type:compatible');
    }
  }
  const confidence = possible ? Math.min(1, score / possible) : 1;
  return { score, possible, confidence, approximate: confidence > 0 && confidence < 1, reasons };
}

function addNumericScore(rowValueNumber, factNumber, weight, tolerance, reason, reasons, assign) {
  if (rowValueNumber === null && factNumber === null) return 0;
  if (rowValueNumber === null || factNumber === null) return weight;
  const delta = Math.abs(rowValueNumber - factNumber);
  if (delta <= tolerance) {
    assign(weight);
    reasons.push(`${reason}:exact`);
  } else if (delta <= tolerance * 4) {
    assign(weight / 2);
    reasons.push(`${reason}:approximate`);
  }
  return weight;
}

function addConflict(conflicts, field, sourceValue, enrichedValue) {
  if (!text(sourceValue) || !text(enrichedValue)) return;
  const sourceNumber = numberOrNull(sourceValue);
  const enrichedNumber = numberOrNull(enrichedValue);
  const same = sourceNumber !== null && enrichedNumber !== null
    ? Math.abs(sourceNumber - enrichedNumber) <= 0.001
    : normalizeKey(sourceValue) === normalizeKey(enrichedValue);
  if (!same) conflicts.push({ field, sourceValue, enrichedValue });
}
