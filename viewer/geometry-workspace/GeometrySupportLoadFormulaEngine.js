import { normalizeSupportLoadFormulaProfile, resolveSupportLoadTempFnC, supportLoadFormulaProfileAudit, SUPPORT_LOAD_DEFAULT_PROFILE_ID } from './GeometrySupportLoadAdvancedProfiles.js?v=20260623-support-load-advanced-profiles-1';

export const SUPPORT_LOAD_FORMULA_SCHEMA = 'support-load-formula-results/v1';
export const SUPPORT_LOAD_FORMULA_VERSION = '20260623-access-support-load-formula-advanced-profile-1';
export const SUPPORT_LOAD_FORMULA_PROFILE_ID = SUPPORT_LOAD_DEFAULT_PROFILE_ID;
export const SUPPORT_LOAD_RESULT_WRITEBACK_SCHEMA = 'support-load-result-writeback-audit/v1';
export const SUPPORT_LOAD_RESULT_WRITEBACK_VERSION = '20260622-support-load-result-writeback-audit-1';

export const SUPPORT_LOAD_FORMULA_INFO_TEXT = `Support Load Formula — Access Temperature / Wall Weighted Profile

Vertical Loads

OPE_V_A =
Round(((FluidWt_OPE kg/m + UnitPipeWt kg/m) × AutoSpan mm × gravityFactor × verticalLoadFactor ÷ 1000), 1)

HYD_V_A =
Round(((FluidWt_HYD kg/m + UnitPipeWt kg/m) × AutoSpan mm × gravityFactor × verticalLoadFactor ÷ 1000), 1)

OPE_V_DEP =
Round(((FluidWt_OPE kg/m + UnitPipeWt kg/m) × DEPSpan mm × gravityFactor × verticalLoadFactor ÷ 1000), 1)

HYD_V_DEP =
Round(((FluidWt_HYD kg/m + UnitPipeWt kg/m) × DEPSpan mm × gravityFactor × verticalLoadFactor ÷ 1000), 1)

Guide Horizontal Loads

Rounded_Guide_H_A =
GetRoundedNum(guideTemperatureMultiplier × guideSpanLoadMultiplier × OPE_V_A × (WallThickness mm ÷ guideWallReferenceMm) × (TempfnC(TEMP_EXP_C1) ÷ guideTempDivisor) ÷ guideDivisor, roundMajor, roundStep, roundMode)

Guide_H_A = Max(Rounded_Guide_H_A, guideMinimumOpeVerticalFactor × OPE_V_A)

Rounded_Guide_H_DEP =
GetRoundedNum(guideTemperatureMultiplier × guideSpanLoadMultiplier × OPE_V_DEP × (WallThickness mm ÷ guideWallReferenceMm) × (TempfnC(TEMP_EXP_C1) ÷ guideTempDivisor) ÷ guideDivisor, roundMajor, roundStep, roundMode)

Guide_H_DEP = Max(Rounded_Guide_H_DEP, guideMinimumOpeVerticalFactor × OPE_V_DEP)

Default Access values:
guideTemperatureMultiplier = 0.1, guideSpanLoadMultiplier = 0.3, guideWallReferenceMm = 6.3, guideTempDivisor = 100, guideDivisor = 1.23, guideMinimumOpeVerticalFactor = 0.3

Line Stop Horizontal Load

LineStop_H =
GetRoundedNum(lineStopScale × lineStopCoefficient × (lineStopPi ÷ lineStopSectionDivisor × (Dia_mm^4 - (Dia_mm - WallThickness_mm)^4) ÷ Dia_mm)^lineStopExponent × (TempfnC(TEMP_EXP_C1) ÷ lineStopTempDivisor) ÷ lineStopDivisor, roundMajor, roundStep, roundMode)

Default Access values:
lineStopScale = 1000, lineStopCoefficient = 0.0209, lineStopPi = 3.14, lineStopSectionDivisor = 32, lineStopExponent = 0.5079, lineStopTempDivisor = 100, lineStopDivisor = 1.23, lineStop ID expression = Dia - WALL_THICK

Notes:
- Calculation reads only locked pipe.attributes.supportLoadInput packages.
- The default profile preserves Access benchmark behavior.
- Advanced profile values must be supplied in the locked input package; no master lookup, enrichment, association, or missing-value top-up is performed inside this formula engine.
- Result writeback is restricted to calculatedFields.supportLoads and calculatedFields.supportLoadReference.
- Blocked recalculation clears stale support-load calculated fields rather than leaving old results on objects.`;

function text(value) { return String(value ?? '').trim(); }
function number(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}
function round1(value) { return Number.isFinite(value) ? Math.round(value * 10) / 10 : null; }
function round3(value) { return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null; }
function freezeDeep(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freezeDeep(child)])));
}
function objectId(object) { return text(object?.sourceId || object?.id || object?.canonicalId || object?.displayName); }
function inputKey(input) {
  const identity = input?.identity || {};
  return text(input?.sourceObjectId) || text(identity.lineNo) || text(identity.branchKey) || text(identity.branchName) || 'pipe-input';
}
function normalizedProfile(input) { return normalizeSupportLoadFormulaProfile(input?.formulaProfile || {}); }
function profileId(input) { return normalizedProfile(input).profileId || SUPPORT_LOAD_FORMULA_PROFILE_ID; }
function getRoundStep(input) { return normalizedProfile(input).rounding.roundStep; }
function getRoundMajor(input) { return normalizedProfile(input).rounding.roundMajor; }
function getRoundMode(input) { return normalizedProfile(input).rounding.roundMode; }
function stableJson(value) {
  try { return JSON.stringify(value ?? null); } catch { return '__unserializable__'; }
}
function supportLoadInputSnapshot(object) {
  return stableJson(object?.attributes?.supportLoadInput || null);
}
function calculatedFieldCount(calculatedFields) {
  return Object.keys(calculatedFields || {}).length;
}
function hasOwn(object, key) {
  return Boolean(object && typeof object === 'object' && Object.prototype.hasOwnProperty.call(object, key));
}
function removeCalculatedKey(calculatedFields, key) {
  if (!calculatedFields || typeof calculatedFields !== 'object' || !hasOwn(calculatedFields, key)) return calculatedFields || null;
  const next = { ...calculatedFields };
  delete next[key];
  return calculatedFieldCount(next) ? next : null;
}
function withCalculatedFields(object, calculatedFields) {
  const next = { ...object };
  if (calculatedFields && calculatedFieldCount(calculatedFields)) next.calculatedFields = calculatedFields;
  else delete next.calculatedFields;
  return next;
}
function writebackMarker({ target, inputKeyValue, sourceObjectId, status, evaluatedAt }) {
  return freezeDeep({
    schema: SUPPORT_LOAD_RESULT_WRITEBACK_SCHEMA,
    version: SUPPORT_LOAD_RESULT_WRITEBACK_VERSION,
    target,
    status,
    inputSource: 'pipe.attributes.supportLoadInput',
    inputKey: text(inputKeyValue),
    sourceObjectId: text(sourceObjectId),
    evaluatedAt: evaluatedAt || null,
    inputMutation: 'FORBIDDEN',
    allowedCalculatedFields: ['calculatedFields.supportLoads', 'calculatedFields.supportLoadReference']
  });
}
export function getRoundedNum(value, major = 100, step = 50, mode = 'up') {
  const numeric = number(value);
  const roundStep = number(step) || 50;
  if (numeric === null) return null;
  if (String(mode || 'up').toLowerCase() !== 'up') return Math.round(numeric / roundStep) * roundStep;
  return Math.ceil(numeric / roundStep) * roundStep;
}
export function tempFnC(value, profileLike = {}) {
  return number(resolveSupportLoadTempFnC(value, profileLike));
}
function verticalLoad(pipeWt, fluidWt, spanMm, profile) {
  const p = number(pipeWt), f = number(fluidWt), span = number(spanMm);
  if (p === null || f === null || span === null) return null;
  const gravity = number(profile?.vertical?.gravityFactor) || 10;
  const factor = number(profile?.vertical?.loadFactor) || 1.1;
  return round1((p + f) * span * gravity * factor / 1000);
}
function guideLoad(opeVerticalN, input, profile) {
  if (profile?.guide?.enabled === false) return null;
  const v = number(opeVerticalN);
  const wall = number(input?.pipePhysical?.wallThicknessMm);
  const temp = tempFnC(input?.process?.tempExpC1, profile);
  if (v === null || wall === null || temp === null) return null;
  const g = profile.guide;
  const raw = g.temperatureMultiplier * g.spanLoadMultiplier * v * (wall / g.wallReferenceMm) * (temp / g.tempDivisor) / g.divisor;
  const rounded = getRoundedNum(raw, profile.rounding.roundMajor, profile.rounding.roundStep, profile.rounding.roundMode);
  const minimumByOpeVertical = round3(g.minimumOpeVerticalFactor * v);
  const finalN = round3(Math.max(number(rounded) ?? -Infinity, minimumByOpeVertical));
  const controlling = finalN === rounded
    ? 'ROUNDED_TEMPERATURE_WALL_GUIDE'
    : (g.minimumOpeVerticalFactor === 0.3 ? 'THIRTY_PERCENT_OPE_VERTICAL' : 'MINIMUM_OPE_VERTICAL_FACTOR');
  return freezeDeep({
    rawN: round3(raw),
    roundedN: rounded,
    thirtyPercentOpeVN: g.minimumOpeVerticalFactor === 0.3 ? minimumByOpeVertical : null,
    minimumOpeVerticalN: minimumByOpeVertical,
    finalN,
    controlling,
    profile: {
      temperatureMultiplier: g.temperatureMultiplier,
      spanLoadMultiplier: g.spanLoadMultiplier,
      wallReferenceMm: g.wallReferenceMm,
      tempDivisor: g.tempDivisor,
      divisor: g.divisor,
      minimumOpeVerticalFactor: g.minimumOpeVerticalFactor
    },
    formula: 'Max(GetRoundedNum(guideTemperatureMultiplier*guideSpanLoadMultiplier*OPE_V*(WT/guideWallReferenceMm)*(TempfnC(T1)/guideTempDivisor)/guideDivisor,roundMajor,roundStep,roundMode),guideMinimumOpeVerticalFactor*OPE_V)'
  });
}
function lineStopLoad(input, profile) {
  if (profile?.lineStop?.enabled === false) return null;
  const dia = number(input?.identity?.pipeOdMm);
  const wall = number(input?.pipePhysical?.wallThicknessMm);
  const temp = tempFnC(input?.process?.tempExpC1, profile);
  if (dia === null || wall === null || temp === null) return null;
  const ls = profile.lineStop;
  const idTerm = ls.idExpression === 'D_MINUS_2WT' ? dia - 2 * wall : dia - wall;
  const sectionTerm = ls.pi / ls.sectionDivisor * (dia ** 4 - idTerm ** 4) / dia;
  const raw = ls.scale * ls.coefficient * (sectionTerm ** ls.exponent) * (temp / ls.tempDivisor) / ls.divisor;
  const rounded = getRoundedNum(raw, profile.rounding.roundMajor, profile.rounding.roundStep, profile.rounding.roundMode);
  return freezeDeep({
    sectionTerm: round3(sectionTerm),
    rawN: round3(raw),
    finalN: rounded,
    idExpression: ls.idExpression,
    profile: {
      scale: ls.scale,
      coefficient: ls.coefficient,
      pi: ls.pi,
      sectionDivisor: ls.sectionDivisor,
      exponent: ls.exponent,
      tempDivisor: ls.tempDivisor,
      divisor: ls.divisor,
      idExpression: ls.idExpression
    },
    formula: ls.idExpression === 'D_MINUS_2WT'
      ? 'GetRoundedNum(scale*coefficient*(pi/sectionDivisor*(D^4-(D-2*WT)^4)/D)^exponent*(TempfnC(T1)/tempDivisor)/divisor,roundMajor,roundStep,roundMode)'
      : 'GetRoundedNum(scale*coefficient*(pi/sectionDivisor*(D^4-(D-WT)^4)/D)^exponent*(TempfnC(T1)/tempDivisor)/divisor,roundMajor,roundStep,roundMode)'
  });
}
function supportAppliesGuide(ref) {
  const t = text(ref?.supportType).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  return t.includes('GUIDE');
}
function supportAppliesLineStop(ref) {
  const t = text(ref?.supportType).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  return t.includes('LINE_STOP') || t.includes('LINESTOP') || t.includes('LIMIT') || t.includes('STOP') || t.includes('ANCHOR');
}
function blockedResult(input, reason) {
  const missing = Array.isArray(input?.readiness?.missing) ? input.readiness.missing : [];
  return freezeDeep({
    schema: SUPPORT_LOAD_FORMULA_SCHEMA,
    version: SUPPORT_LOAD_FORMULA_VERSION,
    profileId: profileId(input),
    sourceObjectId: text(input?.sourceObjectId),
    inputKey: inputKey(input),
    status: 'BLOCKED',
    reason,
    missing,
    calculatedFields: null,
    audit: [{ source: 'SUPPORT_LOAD_FORMULA_ENGINE', field: 'calculationGate', value: reason }]
  });
}
export function calculateSupportLoadsForPipeInput(input) {
  if (!input || typeof input !== 'object') return blockedResult(input, 'missing-pipe-support-load-input');
  if (input?.readiness?.readyForCalculation !== true) return blockedResult(input, 'pipe-input-not-locked-for-calculation');
  const profile = normalizedProfile(input);
  const pipe = input.pipePhysical || {};
  const process = input.process || {};
  const spans = input.spans || {};
  const vertical = freezeDeep({
    opeVA: verticalLoad(pipe.unitPipeWtKgPerM, process.fluidWtOpeKgPerM, spans.autoSpanMm, profile),
    hydVA: verticalLoad(pipe.unitPipeWtKgPerM, process.fluidWtHydKgPerM, spans.autoSpanMm, profile),
    opeVDep: verticalLoad(pipe.unitPipeWtKgPerM, process.fluidWtOpeKgPerM, spans.depSpanMm, profile),
    hydVDep: verticalLoad(pipe.unitPipeWtKgPerM, process.fluidWtHydKgPerM, spans.depSpanMm, profile)
  });
  const guideA = guideLoad(vertical.opeVA, input, profile);
  const guideDep = guideLoad(vertical.opeVDep, input, profile);
  const lineStop = lineStopLoad(input, profile);
  const calculatedFields = freezeDeep({
    schema: SUPPORT_LOAD_FORMULA_SCHEMA,
    version: SUPPORT_LOAD_FORMULA_VERSION,
    profileId: profile.profileId,
    formulaProfile: profile,
    vertical,
    guide: {
      roundedGuideHA: guideA?.roundedN ?? null,
      guideHA: guideA?.finalN ?? null,
      guideA,
      roundedGuideHDep: guideDep?.roundedN ?? null,
      guideHDep: guideDep?.finalN ?? null,
      guideDep
    },
    lineStop: {
      lineStopH: lineStop?.finalN ?? null,
      lineStop
    },
    formulaInfo: SUPPORT_LOAD_FORMULA_INFO_TEXT
  });
  return freezeDeep({
    schema: SUPPORT_LOAD_FORMULA_SCHEMA,
    version: SUPPORT_LOAD_FORMULA_VERSION,
    profileId: profile.profileId,
    sourceObjectId: text(input.sourceObjectId),
    inputKey: inputKey(input),
    lineNo: text(input.identity?.lineNo),
    status: 'CALCULATED',
    calculatedFields,
    audit: [
      { source: 'SUPPORT_LOAD_FORMULA_ENGINE', field: 'inputSource', value: 'pipe.attributes.supportLoadInput' },
      { source: 'SUPPORT_LOAD_FORMULA_ENGINE', field: 'calculationGate', value: input.readiness?.calculationGateStatus || 'INPUT_LOCKED' },
      ...supportLoadFormulaProfileAudit(profile)
    ]
  });
}
function pipeSupportRows(pipeResult, input) {
  const refs = Array.isArray(input?.supportRefs) ? input.supportRefs : [];
  return refs.map(ref => freezeDeep({
    schema: 'support-load-formula-support-row/v1',
    supportId: text(ref.supportId),
    supportTag: text(ref.supportTag),
    supportType: text(ref.supportType),
    associatedPipeId: pipeResult.sourceObjectId,
    lineNo: pipeResult.lineNo,
    status: pipeResult.status,
    vertical: pipeResult.calculatedFields?.vertical || null,
    guide: supportAppliesGuide(ref) ? pipeResult.calculatedFields?.guide || null : null,
    lineStop: supportAppliesLineStop(ref) ? pipeResult.calculatedFields?.lineStop || null : null,
    applies: { vertical: true, guide: supportAppliesGuide(ref), lineStop: supportAppliesLineStop(ref) }
  }));
}
function writeResultsToObjects(objects, pipeResults, supportRows, options = {}) {
  const byPipe = new Map(pipeResults.map(result => [result.sourceObjectId, result]));
  const bySupport = new Map(supportRows.map(row => [row.supportId, row]));
  const audit = {
    schema: SUPPORT_LOAD_RESULT_WRITEBACK_SCHEMA,
    version: SUPPORT_LOAD_RESULT_WRITEBACK_VERSION,
    evaluatedAt: options.evaluatedAt || null,
    status: 'OK',
    inputMutationPolicy: 'FORBIDDEN',
    allowedWriteTargets: ['calculatedFields.supportLoads', 'calculatedFields.supportLoadReference'],
    objectCount: Array.isArray(objects) ? objects.length : 0,
    pipeCalculatedWriteCount: 0,
    supportCalculatedWriteCount: 0,
    stalePipeResultClearedCount: 0,
    staleSupportReferenceClearedCount: 0,
    inputPackagePreservedCount: 0,
    inputPackageMutatedCount: 0
  };
  const calculatedObjects = (Array.isArray(objects) ? objects : []).map(object => {
    const beforeInput = supportLoadInputSnapshot(object);
    const id = objectId(object);
    const pipeResult = byPipe.get(id);
    const supportResult = bySupport.get(id);
    let next = object;
    if (pipeResult?.status === 'CALCULATED') {
      const marker = writebackMarker({ target: 'calculatedFields.supportLoads', inputKeyValue: pipeResult.inputKey, sourceObjectId: pipeResult.sourceObjectId, status: 'WRITTEN', evaluatedAt: options.evaluatedAt });
      const supportLoads = { ...pipeResult.calculatedFields, writebackAudit: marker };
      next = { ...object, calculatedFields: { ...(object.calculatedFields || {}), supportLoads } };
      audit.pipeCalculatedWriteCount += 1;
    } else if (pipeResult) {
      const hadStalePipeResult = hasOwn(object.calculatedFields, 'supportLoads');
      const cleaned = removeCalculatedKey(object.calculatedFields, 'supportLoads');
      next = withCalculatedFields(object, cleaned);
      if (hadStalePipeResult) audit.stalePipeResultClearedCount += 1;
    }
    if (supportResult?.status === 'CALCULATED') {
      const marker = writebackMarker({ target: 'calculatedFields.supportLoadReference', inputKeyValue: supportResult.associatedPipeId, sourceObjectId: supportResult.supportId, status: 'WRITTEN', evaluatedAt: options.evaluatedAt });
      const supportLoadReference = { ...supportResult, writebackAudit: marker };
      next = { ...next, calculatedFields: { ...(next.calculatedFields || {}), supportLoadReference } };
      audit.supportCalculatedWriteCount += 1;
    } else if (supportResult) {
      const hadStaleSupportReference = hasOwn(next.calculatedFields, 'supportLoadReference');
      const cleaned = removeCalculatedKey(next.calculatedFields, 'supportLoadReference');
      next = withCalculatedFields(next, cleaned);
      if (hadStaleSupportReference) audit.staleSupportReferenceClearedCount += 1;
    }
    const afterInput = supportLoadInputSnapshot(next);
    if (beforeInput === afterInput) audit.inputPackagePreservedCount += 1;
    else audit.inputPackageMutatedCount += 1;
    return next;
  });
  if (audit.inputPackageMutatedCount > 0) audit.status = 'INPUT_MUTATION_DETECTED';
  return freezeDeep({ calculatedObjects, writebackAudit: audit });
}
export function calculateSupportLoadResultsFromInputModel(model, options = {}) {
  const evaluatedAt = options.evaluatedAt || new Date().toISOString();
  const pipeInputs = Array.isArray(model?.pipeInputs) ? model.pipeInputs : [];
  const pipeResults = pipeInputs.map(input => calculateSupportLoadsForPipeInput(input));
  const byKey = new Map(pipeInputs.map(input => [inputKey(input), input]));
  const supportRows = pipeResults.flatMap(result => pipeSupportRows(result, byKey.get(result.inputKey)));
  const writeback = writeResultsToObjects(model?.hydratedObjects || [], pipeResults, supportRows, { evaluatedAt });
  const calculatedCount = pipeResults.filter(result => result.status === 'CALCULATED').length;
  const blockedCount = pipeResults.length - calculatedCount;
  const resultProfileId = pipeResults.find(result => result.profileId)?.profileId || SUPPORT_LOAD_FORMULA_PROFILE_ID;
  return freezeDeep({
    schema: SUPPORT_LOAD_FORMULA_SCHEMA,
    version: SUPPORT_LOAD_FORMULA_VERSION,
    profileId: resultProfileId,
    evaluatedAt,
    status: pipeResults.length === 0 ? 'EMPTY' : blockedCount ? 'BLOCKED' : 'CALCULATED',
    pipeInputCount: pipeResults.length,
    calculatedPipeCount: calculatedCount,
    blockedPipeCount: blockedCount,
    supportResultCount: supportRows.length,
    pipeResults,
    supportRows,
    calculatedObjects: writeback.calculatedObjects,
    writebackAudit: writeback.writebackAudit,
    formulaInfo: SUPPORT_LOAD_FORMULA_INFO_TEXT,
    assumptions: [
      'Formula engine reads only locked pipe.attributes.supportLoadInput packages.',
      'Default profile preserves the Access benchmark and Dia - WALL_THICK expression.',
      'Advanced formula profile values must be present in the locked input package; no master lookup or top-up occurs inside the engine.',
      'Result writeback is restricted to calculatedFields.supportLoads and calculatedFields.supportLoadReference.'
    ]
  });
}
