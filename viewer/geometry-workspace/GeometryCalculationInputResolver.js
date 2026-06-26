export const GEOMETRY_CALCULATION_INPUT_SCHEMA = 'geometry-calculation-input-resolver/v1';
export const GEOMETRY_CALCULATION_INPUT_VERSION = '20260622-geometry-input-resolver-1';

const MAX_INPUT_ROWS = 50000;
const MATCH_FIELDS = Object.freeze(['lineNo', 'supportTag', 'nps', 'odMm', 'schedule', 'material']);

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function norm(value) {
  return String(value ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
}

function toFiniteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const match = String(value ?? '').replace(/,/g, '').match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/i);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function normalizeInputRows(rows, tableName) {
  return asArray(rows).slice(0, MAX_INPUT_ROWS).filter(Boolean).map((row, index) => {
    const source = row && typeof row === 'object' ? row : { value: row };
    return Object.freeze({
      id: source.id || `${tableName}-${index + 1}`,
      tableName,
      lineNo: source.lineNo || source.LINE_NO || source.LINE || source.line || '',
      supportTag: source.supportTag || source.SUPPORT_TAG || source.PS || source.ps || source.tag || '',
      nps: source.nps || source.NPS || source.size || source.SIZE || '',
      odMm: toFiniteNumber(source.odMm ?? source.OD_MM ?? source.od ?? source.OD),
      schedule: source.schedule || source.SCHEDULE || source.sch || source.SCH || '',
      material: source.material || source.MATERIAL || source.mat || source.MAT || '',
      wallThicknessMm: toFiniteNumber(source.wallThicknessMm ?? source.WALL_THICKNESS_MM ?? source.thkMm ?? source.THK_MM ?? source.thickness),
      fluidDensityKgM3: toFiniteNumber(source.fluidDensityKgM3 ?? source.FLUID_DENSITY_KG_M3 ?? source.density ?? source.DENSITY),
      pressureBar: toFiniteNumber(source.pressureBar ?? source.PRESSURE_BAR ?? source.pressure ?? source.PRESSURE),
      temperatureC: toFiniteNumber(source.temperatureC ?? source.TEMPERATURE_C ?? source.tempC ?? source.TEMP_C),
      insulationThicknessMm: toFiniteNumber(source.insulationThicknessMm ?? source.INSULATION_THICKNESS_MM),
      insulationDensityKgM3: toFiniteNumber(source.insulationDensityKgM3 ?? source.INSULATION_DENSITY_KG_M3),
      weightKgM: toFiniteNumber(source.weightKgM ?? source.WEIGHT_KG_M ?? source.weight ?? source.WEIGHT),
      raw: Object.freeze({ ...source })
    });
  });
}

export function normalizeCalculationInputPackage(input = {}) {
  const packageInput = input && typeof input === 'object' ? input : {};
  return Object.freeze({
    schemaVersion: GEOMETRY_CALCULATION_INPUT_SCHEMA,
    version: GEOMETRY_CALCULATION_INPUT_VERSION,
    pipeRows: normalizeInputRows(packageInput.pipeRows || packageInput.pipes || packageInput.pipeSchedule || [], 'pipeRows'),
    processRows: normalizeInputRows(packageInput.processRows || packageInput.process || packageInput.processData || [], 'processRows'),
    materialRows: normalizeInputRows(packageInput.materialRows || packageInput.materials || [], 'materialRows'),
    weightRows: normalizeInputRows(packageInput.weightRows || packageInput.weights || [], 'weightRows')
  });
}

function sourceKeys(object) {
  const keys = new Set();
  const raw = object?.rawFields || {};
  const support = object?.support || {};
  const pipe = object?.pipe || {};
  for (const value of [object?.lineNo, raw.LINE_NO, raw.LINE, raw.LINENO]) if (value) keys.add(`lineNo:${norm(value)}`);
  for (const value of [support.supportTag, raw.REF, raw.PS, raw.SUPPORT_TAG]) if (value) keys.add(`supportTag:${norm(value)}`);
  for (const value of [pipe.nps, raw.NPS, raw.SIZE, raw.BORE]) if (value) keys.add(`nps:${norm(value)}`);
  const od = toFiniteNumber(pipe.odMm ?? raw.OD_MM ?? raw.OD ?? raw.ATTACHED_PIPE_OD);
  if (od !== null) keys.add(`odMm:${Math.round(od * 1000) / 1000}`);
  for (const value of [pipe.schedule, raw.SCHEDULE, raw.SCH]) if (value) keys.add(`schedule:${norm(value)}`);
  for (const value of [pipe.material, raw.MATERIAL, raw.MAT]) if (value) keys.add(`material:${norm(value)}`);
  return keys;
}

function rowKeys(row) {
  const keys = new Set();
  if (row.lineNo) keys.add(`lineNo:${norm(row.lineNo)}`);
  if (row.supportTag) keys.add(`supportTag:${norm(row.supportTag)}`);
  if (row.nps) keys.add(`nps:${norm(row.nps)}`);
  if (row.odMm !== null && row.odMm !== undefined) keys.add(`odMm:${Math.round(row.odMm * 1000) / 1000}`);
  if (row.schedule) keys.add(`schedule:${norm(row.schedule)}`);
  if (row.material) keys.add(`material:${norm(row.material)}`);
  return keys;
}

function matchScore(objectKeys, row) {
  const keys = rowKeys(row);
  let score = 0;
  const matchedFields = [];
  for (const key of keys) {
    if (!objectKeys.has(key)) continue;
    const field = key.split(':')[0];
    score += field === 'supportTag' || field === 'lineNo' ? 5 : field === 'odMm' ? 3 : 2;
    matchedFields.push(field);
  }
  return { score, matchedFields };
}

function bestMatch(object, rows) {
  const objectKeys = sourceKeys(object);
  let best = null;
  for (const row of rows) {
    const scored = matchScore(objectKeys, row);
    if (!scored.score) continue;
    if (!best || scored.score > best.score) best = { row, ...scored };
  }
  return best;
}

function applyRow(object, row, tableName, matchedFields) {
  const next = {
    ...object,
    pipe: { ...(object.pipe || {}) },
    process: { ...(object.process || {}) },
    calculationInputs: { ...(object.calculationInputs || {}) },
    mappingAudit: Array.isArray(object.mappingAudit) ? [...object.mappingAudit] : []
  };
  if (row.odMm !== null && row.odMm !== undefined) next.pipe.odMm = row.odMm;
  if (row.wallThicknessMm !== null && row.wallThicknessMm !== undefined) next.pipe.wallThicknessMm = row.wallThicknessMm;
  if (row.schedule) next.pipe.schedule = row.schedule;
  if (row.material) next.pipe.material = row.material;
  if (row.fluidDensityKgM3 !== null && row.fluidDensityKgM3 !== undefined) next.process.fluidDensityKgM3 = row.fluidDensityKgM3;
  if (row.pressureBar !== null && row.pressureBar !== undefined) next.process.pressureBar = row.pressureBar;
  if (row.temperatureC !== null && row.temperatureC !== undefined) next.process.temperatureC = row.temperatureC;
  if (row.insulationThicknessMm !== null && row.insulationThicknessMm !== undefined) next.pipe.insulationThicknessMm = row.insulationThicknessMm;
  if (row.insulationDensityKgM3 !== null && row.insulationDensityKgM3 !== undefined) next.pipe.insulationDensityKgM3 = row.insulationDensityKgM3;
  if (row.weightKgM !== null && row.weightKgM !== undefined) next.pipe.weightKgM = row.weightKgM;
  next.calculationInputs[tableName] = { rowId: row.id, matchedFields };
  next.mappingAudit.push({
    source: 'CALCULATION_INPUT_RESOLVER',
    schemaVersion: GEOMETRY_CALCULATION_INPUT_SCHEMA,
    tableName,
    rowId: row.id,
    matchedFields,
    appliedFields: MATCH_FIELDS
  });
  return Object.freeze(next);
}

export function resolveCalculationInputs(mappedObjects = [], inputPackage = {}) {
  const normalized = normalizeCalculationInputPackage(inputPackage);
  const rowsByTable = {
    pipeRows: normalized.pipeRows,
    processRows: normalized.processRows,
    materialRows: normalized.materialRows,
    weightRows: normalized.weightRows
  };
  const resolvedObjects = asArray(mappedObjects).map((object) => {
    let next = object;
    for (const [tableName, rows] of Object.entries(rowsByTable)) {
      const match = bestMatch(next, rows);
      if (match) next = applyRow(next, match.row, tableName, match.matchedFields);
    }
    return next;
  });
  const resolvedCount = resolvedObjects.filter((object, index) => object !== mappedObjects[index]).length;
  return Object.freeze({
    schemaVersion: GEOMETRY_CALCULATION_INPUT_SCHEMA,
    version: GEOMETRY_CALCULATION_INPUT_VERSION,
    inputSummary: Object.freeze({
      pipeRows: normalized.pipeRows.length,
      processRows: normalized.processRows.length,
      materialRows: normalized.materialRows.length,
      weightRows: normalized.weightRows.length
    }),
    objectCount: resolvedObjects.length,
    resolvedCount,
    unresolvedCount: Math.max(0, resolvedObjects.length - resolvedCount),
    resolvedObjects: Object.freeze(resolvedObjects),
    normalizedInputs: normalized
  });
}

export function exampleCalculationInputPackage() {
  return {
    pipeRows: [
      { lineNo: 'LINE-001', nps: '4', odMm: 114.3, schedule: 'STD', wallThicknessMm: 6.02, material: 'A106-B' }
    ],
    processRows: [
      { lineNo: 'LINE-001', fluidDensityKgM3: 850, pressureBar: 20, temperatureC: 120 }
    ],
    materialRows: [
      { material: 'A106-B', weightKgM: 16.1 }
    ],
    weightRows: []
  };
}
