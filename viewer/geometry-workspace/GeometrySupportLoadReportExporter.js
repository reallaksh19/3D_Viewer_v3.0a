export const SUPPORT_LOAD_REPORT_SCHEMA = 'support-load-report/v1';
export const SUPPORT_LOAD_REPORT_VERSION = '20260622-support-load-result-report-1';

function text(value) {
  return String(value ?? '').trim();
}

function number(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function valueOrNull(value) {
  const n = number(value);
  if (n !== null) return n;
  const s = text(value);
  return s ? s : null;
}

function inputKey(input) {
  const identity = input?.identity || {};
  return text(input?.sourceObjectId) || text(identity.lineNo) || text(identity.branchKey) || text(identity.branchName) || 'pipe-input';
}

function objectId(object) {
  return text(object?.sourceId || object?.id || object?.canonicalId || object?.displayName);
}

function collectPipeInputs(results, inputModel) {
  const map = new Map();
  for (const input of Array.isArray(inputModel?.pipeInputs) ? inputModel.pipeInputs : []) {
    const key = inputKey(input);
    if (key) map.set(key, input);
    if (input?.sourceObjectId) map.set(text(input.sourceObjectId), input);
  }
  for (const object of Array.isArray(results?.calculatedObjects) ? results.calculatedObjects : []) {
    const input = object?.attributes?.supportLoadInput;
    if (!input) continue;
    const key = inputKey(input);
    if (key) map.set(key, input);
    const id = objectId(object);
    if (id) map.set(id, input);
  }
  return map;
}

function calculated(result) {
  return result?.calculatedFields || {};
}

function pipeRow(result, inputMap) {
  const input = inputMap.get(text(result?.sourceObjectId)) || inputMap.get(inputKey(result)) || inputMap.get(text(result?.inputKey)) || {};
  const identity = input.identity || {};
  const physical = input.pipePhysical || {};
  const process = input.process || {};
  const spans = input.spans || {};
  const readiness = input.readiness || {};
  const c = calculated(result);
  const vertical = c.vertical || {};
  const guide = c.guide || {};
  const lineStop = c.lineStop || {};
  return Object.freeze({
    rowType: 'PIPE_RESULT',
    sourceObjectId: text(result?.sourceObjectId),
    lineNo: text(result?.lineNo || identity.lineNo),
    branchKey: text(identity.branchKey),
    nps: valueOrNull(identity.nps),
    pipeOdMm: valueOrNull(identity.pipeOdMm),
    wallThicknessMm: valueOrNull(physical.wallThicknessMm),
    insideDiameterMm: valueOrNull(physical.insideDiameterMm),
    tempExpC1: valueOrNull(process.tempExpC1),
    tempExpC2: valueOrNull(process.tempExpC2),
    unitPipeWtKgPerM: valueOrNull(physical.unitPipeWtKgPerM),
    fluidWtOpeKgPerM: valueOrNull(process.fluidWtOpeKgPerM),
    fluidWtHydKgPerM: valueOrNull(process.fluidWtHydKgPerM),
    autoSpanMm: valueOrNull(spans.autoSpanMm),
    depSpanMm: valueOrNull(spans.depSpanMm),
    inputLocked: readiness.readyForCalculation === true,
    calculationGateStatus: text(readiness.calculationGateStatus),
    status: text(result?.status),
    reason: text(result?.reason),
    missing: Array.isArray(result?.missing) ? result.missing.join('; ') : '',
    opeVA: valueOrNull(vertical.opeVA),
    hydVA: valueOrNull(vertical.hydVA),
    opeVDep: valueOrNull(vertical.opeVDep),
    hydVDep: valueOrNull(vertical.hydVDep),
    roundedGuideHA: valueOrNull(guide.roundedGuideHA),
    guideHA: valueOrNull(guide.guideHA),
    roundedGuideHDep: valueOrNull(guide.roundedGuideHDep),
    guideHDep: valueOrNull(guide.guideHDep),
    guideAControlling: text(guide.guideA?.controlling),
    guideDepControlling: text(guide.guideDep?.controlling),
    lineStopH: valueOrNull(lineStop.lineStopH),
    lineStopSectionTerm: valueOrNull(lineStop.lineStop?.sectionTerm),
    formulaProfileId: text(result?.profileId || c.profileId)
  });
}

function supportRow(row, inputMap) {
  const input = inputMap.get(text(row?.associatedPipeId)) || inputMap.get(text(row?.lineNo)) || {};
  const identity = input.identity || {};
  const physical = input.pipePhysical || {};
  const process = input.process || {};
  const spans = input.spans || {};
  const vertical = row?.vertical || {};
  const guide = row?.guide || {};
  const lineStop = row?.lineStop || {};
  const applies = row?.applies || {};
  return Object.freeze({
    rowType: 'SUPPORT_RESULT',
    supportId: text(row?.supportId),
    supportTag: text(row?.supportTag),
    supportType: text(row?.supportType),
    associatedPipeId: text(row?.associatedPipeId),
    lineNo: text(row?.lineNo || identity.lineNo),
    nps: valueOrNull(identity.nps),
    pipeOdMm: valueOrNull(identity.pipeOdMm),
    wallThicknessMm: valueOrNull(physical.wallThicknessMm),
    tempExpC1: valueOrNull(process.tempExpC1),
    autoSpanMm: valueOrNull(spans.autoSpanMm),
    depSpanMm: valueOrNull(spans.depSpanMm),
    appliesVertical: applies.vertical === true,
    appliesGuide: applies.guide === true,
    appliesLineStop: applies.lineStop === true,
    status: text(row?.status),
    opeVA: valueOrNull(vertical.opeVA),
    hydVA: valueOrNull(vertical.hydVA),
    opeVDep: valueOrNull(vertical.opeVDep),
    hydVDep: valueOrNull(vertical.hydVDep),
    guideHA: applies.guide === true ? valueOrNull(guide.guideHA) : null,
    guideHDep: applies.guide === true ? valueOrNull(guide.guideHDep) : null,
    guideAControlling: applies.guide === true ? text(guide.guideA?.controlling) : '',
    guideDepControlling: applies.guide === true ? text(guide.guideDep?.controlling) : '',
    lineStopH: applies.lineStop === true ? valueOrNull(lineStop.lineStopH) : null,
    lineStopSectionTerm: applies.lineStop === true ? valueOrNull(lineStop.lineStop?.sectionTerm) : null
  });
}

export const SUPPORT_LOAD_PIPE_REPORT_COLUMNS = Object.freeze([
  'sourceObjectId', 'lineNo', 'branchKey', 'nps', 'pipeOdMm', 'wallThicknessMm', 'insideDiameterMm',
  'tempExpC1', 'tempExpC2', 'unitPipeWtKgPerM', 'fluidWtOpeKgPerM', 'fluidWtHydKgPerM',
  'autoSpanMm', 'depSpanMm', 'inputLocked', 'calculationGateStatus', 'status', 'reason', 'missing',
  'opeVA', 'hydVA', 'opeVDep', 'hydVDep', 'roundedGuideHA', 'guideHA', 'roundedGuideHDep', 'guideHDep',
  'guideAControlling', 'guideDepControlling', 'lineStopH', 'lineStopSectionTerm', 'formulaProfileId'
]);

export const SUPPORT_LOAD_SUPPORT_REPORT_COLUMNS = Object.freeze([
  'supportId', 'supportTag', 'supportType', 'associatedPipeId', 'lineNo', 'nps', 'pipeOdMm', 'wallThicknessMm',
  'tempExpC1', 'autoSpanMm', 'depSpanMm', 'appliesVertical', 'appliesGuide', 'appliesLineStop', 'status',
  'opeVA', 'hydVA', 'opeVDep', 'hydVDep', 'guideHA', 'guideHDep', 'guideAControlling', 'guideDepControlling',
  'lineStopH', 'lineStopSectionTerm'
]);

export function buildSupportLoadReport(results, inputModel = null, options = {}) {
  const inputMap = collectPipeInputs(results, inputModel);
  const pipeRows = (Array.isArray(results?.pipeResults) ? results.pipeResults : []).map(result => pipeRow(result, inputMap));
  const supportRows = (Array.isArray(results?.supportRows) ? results.supportRows : []).map(row => supportRow(row, inputMap));
  const blockedPipeRows = pipeRows.filter(row => row.status !== 'CALCULATED').length;
  const calculatedPipeRows = pipeRows.length - blockedPipeRows;
  const guideRows = supportRows.filter(row => row.appliesGuide).length;
  const lineStopRows = supportRows.filter(row => row.appliesLineStop).length;
  return Object.freeze({
    schema: SUPPORT_LOAD_REPORT_SCHEMA,
    version: SUPPORT_LOAD_REPORT_VERSION,
    sourceSchema: text(results?.schema),
    sourceVersion: text(results?.version),
    profileId: text(results?.profileId),
    generatedAt: options.generatedAt || new Date().toISOString(),
    status: pipeRows.length === 0 ? 'EMPTY' : blockedPipeRows ? 'BLOCKED' : 'READY_FOR_EXPORT',
    summary: Object.freeze({
      pipeRowCount: pipeRows.length,
      calculatedPipeRowCount: calculatedPipeRows,
      blockedPipeRowCount: blockedPipeRows,
      supportRowCount: supportRows.length,
      guideSupportRowCount: guideRows,
      lineStopSupportRowCount: lineStopRows
    }),
    pipeColumns: SUPPORT_LOAD_PIPE_REPORT_COLUMNS,
    supportColumns: SUPPORT_LOAD_SUPPORT_REPORT_COLUMNS,
    pipeRows: Object.freeze(pipeRows),
    supportRows: Object.freeze(supportRows),
    formulaInfo: results?.formulaInfo || null,
    assumptions: Object.freeze([
      'Report is generated from calculatedFields.supportLoads and locked pipe.attributes.supportLoadInput packages.',
      'Input fields and calculated fields remain separated in the report rows.',
      'Rows with missing or unlocked inputs are exported as blocked rows, not silently completed.'
    ])
  });
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rowsToCsv(rows, columns) {
  const cols = Array.isArray(columns) ? columns : [];
  const body = (Array.isArray(rows) ? rows : []).map(row => cols.map(col => csvCell(row?.[col])).join(','));
  return [cols.join(','), ...body].join('\n');
}

export function buildSupportLoadPipeCsv(report) {
  return rowsToCsv(report?.pipeRows || [], report?.pipeColumns || SUPPORT_LOAD_PIPE_REPORT_COLUMNS);
}

export function buildSupportLoadSupportCsv(report) {
  return rowsToCsv(report?.supportRows || [], report?.supportColumns || SUPPORT_LOAD_SUPPORT_REPORT_COLUMNS);
}
