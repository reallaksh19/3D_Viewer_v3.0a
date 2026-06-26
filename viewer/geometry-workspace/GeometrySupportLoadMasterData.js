export const SUPPORT_LOAD_MASTER_DATA_SCHEMA = 'support-load-master-data/v1';
export const SUPPORT_LOAD_MASTER_DATA_VERSION = '20260623-support-load-master-data-1';

const DEFAULT_DEP_SPANS = Object.freeze([
  [0.5, 21.34, 900], [0.75, 26.67, 1400], [1, 33.4, 2200], [1.5, 48.26, 2800],
  [2, 60.325, 2800], [3, 88.9, 6400], [4, 114.3, 6400], [6, 168.275, 9400],
  [8, 219.075, 10750], [10, 273.05, 10750], [12, 323.85, 10750], [14, 355.6, 10750],
  [16, 406.4, 11000], [18, 457.2, 11000], [20, 508, 11500], [24, 609.6, 12000],
  [30, 762, 14000], [36, 914.4, 16000], [42, 1066.8, 18000], [48, 1219.2, 20000]
].map(([nps, pipeOdMm, depSpanMm]) => Object.freeze({ nps, pipeOdMm, depSpanMm, source: 'DEP_SPAN_TABLE' })));

const DEFAULT_MATERIAL_DENSITY = Object.freeze([
  Object.freeze({ materialCategory: 'LT', materialDensityKgM3: 7850, source: 'PROJECT_DEFAULT_REVIEW_REQUIRED' }),
  Object.freeze({ materialCategory: 'CS', materialDensityKgM3: 7850, source: 'PROJECT_DEFAULT_REVIEW_REQUIRED' }),
  Object.freeze({ materialCategory: 'SS', materialDensityKgM3: 8000, source: 'PROJECT_DEFAULT_REVIEW_REQUIRED' })
]);

const DEFAULT_HYDRO_DENSITY = Object.freeze([
  Object.freeze({ profileId: 'HYDRO_WATER_1000', fluidDensityHydKgM3: 1000, source: 'PROJECT_HYDRO_PROFILE_REVIEW_REQUIRED' })
]);

const DEFAULT_TEMP_FUNCTION = Object.freeze([
  Object.freeze({ profileId: 'TEMP_FNC_IDENTITY', mode: 'identity', source: 'ACCESS_PROFILE_COMPATIBILITY' })
]);

const DEFAULT_ROUNDING = Object.freeze([
  Object.freeze({ profileId: 'ACCESS_ROUND_UP_50', roundMajor: 100, roundStep: 50, roundMode: 'up', source: 'ACCESS_PROFILE_COMPATIBILITY' })
]);

export const SUPPORT_LOAD_MASTER_SOURCE_PRIORITY = Object.freeze([
  'native-pipe-attribute',
  'xml-cii-master-package',
  'project-master-table',
  'deterministic-derived-input',
  'reviewed-override'
]);

function text(value) { return String(value ?? '').trim(); }
function num(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const match = text(value).replace(/,/g, '').match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/i);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}
function arr(value) { return Array.isArray(value) ? value : []; }
function cleanString(value) { return text(value) || null; }
function cleanNumber(value) { const n = num(value); return n === null ? null : n; }
function withoutNulls(object) {
  const out = {};
  for (const [key, value] of Object.entries(object || {})) {
    if (value !== null && value !== undefined && value !== '') out[key] = value;
  }
  return Object.freeze(out);
}

function normalizeDepSpan(row) {
  return withoutNulls({
    nps: cleanNumber(row?.nps ?? row?.NPS ?? row?.ns ?? row?.NS),
    pipeOdMm: cleanNumber(row?.pipeOdMm ?? row?.PipeOD ?? row?.pipeOD ?? row?.OD),
    depSpanMm: cleanNumber(row?.depSpanMm ?? row?.DEP_SPAN ?? row?.['DEP SPAN'] ?? row?.supportSpanMm),
    source: cleanString(row?.source) || 'PROJECT_MASTER_TABLE'
  });
}
function normalizeMaterial(row) {
  return withoutNulls({
    materialCategory: cleanString(row?.materialCategory ?? row?.Mat_Category ?? row?.category),
    materialCode: cleanString(row?.materialCode ?? row?.MatID ?? row?.code),
    materialName: cleanString(row?.materialName ?? row?.material ?? row?.name),
    materialDensityKgM3: cleanNumber(row?.materialDensityKgM3 ?? row?.densityKgM3 ?? row?.density),
    source: cleanString(row?.source) || 'PROJECT_MASTER_TABLE'
  });
}
function normalizePipeWeight(row) {
  return withoutNulls({
    nps: cleanNumber(row?.nps ?? row?.NPS ?? row?.ns ?? row?.NS),
    pipeOdMm: cleanNumber(row?.pipeOdMm ?? row?.PipeOD ?? row?.OD),
    schedule: cleanString(row?.schedule ?? row?.SCH),
    wallThicknessMm: cleanNumber(row?.wallThicknessMm ?? row?.WALL_THICK ?? row?.wall),
    unitPipeWtKgPerM: cleanNumber(row?.unitPipeWtKgPerM ?? row?.['UnitPipewtKg/m'] ?? row?.pipeWeightKgM),
    source: cleanString(row?.source) || 'PROJECT_MASTER_TABLE'
  });
}
function normalizeHydro(row) {
  return withoutNulls({
    profileId: cleanString(row?.profileId ?? row?.id) || 'HYDRO_PROFILE',
    fluidDensityHydKgM3: cleanNumber(row?.fluidDensityHydKgM3 ?? row?.densityKgM3 ?? row?.density),
    description: cleanString(row?.description),
    source: cleanString(row?.source) || 'PROJECT_MASTER_TABLE'
  });
}
function normalizeTemp(row) {
  return withoutNulls({
    profileId: cleanString(row?.profileId ?? row?.id) || 'TEMP_FNC_PROFILE',
    mode: cleanString(row?.mode) || 'identity',
    points: arr(row?.points).map(point => Object.freeze({ inputC: cleanNumber(point.inputC ?? point.x), factor: cleanNumber(point.factor ?? point.y) })).filter(point => point.inputC !== null && point.factor !== null),
    source: cleanString(row?.source) || 'PROJECT_MASTER_TABLE'
  });
}
function normalizeRounding(row) {
  return withoutNulls({
    profileId: cleanString(row?.profileId ?? row?.id) || 'ROUND_PROFILE',
    roundMajor: cleanNumber(row?.roundMajor) ?? 100,
    roundStep: cleanNumber(row?.roundStep) ?? 50,
    roundMode: cleanString(row?.roundMode) || 'up',
    source: cleanString(row?.source) || 'PROJECT_MASTER_TABLE'
  });
}

export function buildDefaultSupportLoadMasterData(options = {}) {
  return Object.freeze({
    schema: SUPPORT_LOAD_MASTER_DATA_SCHEMA,
    version: SUPPORT_LOAD_MASTER_DATA_VERSION,
    generatedAt: options.generatedAt || new Date().toISOString(),
    policy: Object.freeze({
      sourcePriority: SUPPORT_LOAD_MASTER_SOURCE_PRIORITY,
      noSilentTopUp: true,
      noCalculatedFieldMutation: true,
      noFormulaExecution: true
    }),
    depSpanRows: DEFAULT_DEP_SPANS,
    materialDensityRows: DEFAULT_MATERIAL_DENSITY,
    pipeWeightRows: Object.freeze([]),
    hydroDensityProfiles: DEFAULT_HYDRO_DENSITY,
    tempFunctionProfiles: DEFAULT_TEMP_FUNCTION,
    roundingProfiles: DEFAULT_ROUNDING,
    audit: Object.freeze([{ source: 'SUPPORT_LOAD_MASTER_DATA_MANAGER', field: 'supportLoadMasterData', action: 'default-package' }])
  });
}

export function normalizeSupportLoadMasterDataPackage(packageLike = {}, options = {}) {
  const defaults = buildDefaultSupportLoadMasterData(options);
  const source = packageLike && typeof packageLike === 'object' ? packageLike : {};
  const normalized = {
    schema: SUPPORT_LOAD_MASTER_DATA_SCHEMA,
    version: SUPPORT_LOAD_MASTER_DATA_VERSION,
    generatedAt: source.generatedAt || defaults.generatedAt,
    policy: Object.freeze({ ...defaults.policy, ...(source.policy || {}), sourcePriority: SUPPORT_LOAD_MASTER_SOURCE_PRIORITY }),
    depSpanRows: arr(source.depSpanRows ?? source.depSpans).map(normalizeDepSpan).filter(row => row.nps !== undefined || row.pipeOdMm !== undefined),
    materialDensityRows: arr(source.materialDensityRows ?? source.materials).map(normalizeMaterial).filter(row => row.materialDensityKgM3 !== undefined),
    pipeWeightRows: arr(source.pipeWeightRows ?? source.pipeWeights).map(normalizePipeWeight).filter(row => row.unitPipeWtKgPerM !== undefined),
    hydroDensityProfiles: arr(source.hydroDensityProfiles ?? source.hydroProfiles).map(normalizeHydro).filter(row => row.fluidDensityHydKgM3 !== undefined),
    tempFunctionProfiles: arr(source.tempFunctionProfiles ?? source.tempProfiles).map(normalizeTemp),
    roundingProfiles: arr(source.roundingProfiles ?? source.rounding).map(normalizeRounding),
    audit: Object.freeze([...(arr(source.audit)), { source: 'SUPPORT_LOAD_MASTER_DATA_MANAGER', field: 'supportLoadMasterData', action: 'normalized' }])
  };
  if (!normalized.depSpanRows.length) normalized.depSpanRows = defaults.depSpanRows;
  if (!normalized.materialDensityRows.length) normalized.materialDensityRows = defaults.materialDensityRows;
  if (!normalized.hydroDensityProfiles.length) normalized.hydroDensityProfiles = defaults.hydroDensityProfiles;
  if (!normalized.tempFunctionProfiles.length) normalized.tempFunctionProfiles = defaults.tempFunctionProfiles;
  if (!normalized.roundingProfiles.length) normalized.roundingProfiles = defaults.roundingProfiles;
  return deepFreeze(normalized);
}

export function summarizeSupportLoadMasterData(packageLike) {
  const data = normalizeSupportLoadMasterDataPackage(packageLike);
  return Object.freeze({
    schema: 'support-load-master-data-summary/v1',
    depSpanRowCount: data.depSpanRows.length,
    materialDensityRowCount: data.materialDensityRows.length,
    pipeWeightRowCount: data.pipeWeightRows.length,
    hydroDensityProfileCount: data.hydroDensityProfiles.length,
    tempFunctionProfileCount: data.tempFunctionProfiles.length,
    roundingProfileCount: data.roundingProfiles.length,
    noSilentTopUp: data.policy.noSilentTopUp === true,
    noFormulaExecution: data.policy.noFormulaExecution === true,
    status: 'MASTER_DATA_READY_FOR_INPUT_HYDRATION'
  });
}

export function findDepSpanMasterRow(packageLike, { nps = null, pipeOdMm = null } = {}) {
  const data = normalizeSupportLoadMasterDataPackage(packageLike);
  const n = cleanNumber(nps);
  const od = cleanNumber(pipeOdMm);
  let row = n !== null ? data.depSpanRows.find(item => Math.abs(Number(item.nps) - n) < 0.0001) : null;
  if (!row && od !== null) row = data.depSpanRows.find(item => Math.abs(Number(item.pipeOdMm) - od) <= 1.5) || null;
  return row || null;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}
