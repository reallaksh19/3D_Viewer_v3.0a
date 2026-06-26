export const SUPPORT_LOAD_INPUT_OVERRIDE_SCHEMA = 'support-load-input-override/v1';
export const SUPPORT_LOAD_INPUT_OVERRIDE_VERSION = '20260622-input-override-1';

export const SUPPORT_LOAD_INPUT_OVERRIDE_FIELDS = Object.freeze([
  { path: 'identity.nps', label: 'NPS', type: 'number' },
  { path: 'identity.pipeOdMm', label: 'Pipe OD mm', type: 'number' },
  { path: 'pipePhysical.wallThicknessMm', label: 'Wall thickness mm', type: 'number' },
  { path: 'pipePhysical.insideDiameterMm', label: 'Inside diameter mm', type: 'number' },
  { path: 'pipePhysical.material', label: 'Material', type: 'text' },
  { path: 'pipePhysical.materialCategory', label: 'Material category', type: 'text' },
  { path: 'pipePhysical.materialDensityKgM3', label: 'Material density kg/m3', type: 'number' },
  { path: 'pipePhysical.unitPipeWtKgPerM', label: 'Pipe wt kg/m', type: 'number' },
  { path: 'process.tempExpC1', label: 'TEMP_EXP_C1', type: 'number' },
  { path: 'process.tempExpC2', label: 'TEMP_EXP_C2', type: 'number' },
  { path: 'process.fluidDensityOpeKgM3', label: 'OPE density kg/m3', type: 'number' },
  { path: 'process.fluidDensityHydKgM3', label: 'HYD density kg/m3', type: 'number' },
  { path: 'process.fluidWtOpeKgPerM', label: 'OPE fluid wt kg/m', type: 'number' },
  { path: 'process.fluidWtHydKgPerM', label: 'HYD fluid wt kg/m', type: 'number' },
  { path: 'spans.autoSpanMm', label: 'AutoSpan mm', type: 'number' },
  { path: 'spans.depSpanMm', label: 'DEPSpan mm', type: 'number' }
]);

function text(value) {
  return String(value ?? '').trim();
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freezeDeep(child)])));
}

function numeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function specFor(path) {
  return SUPPORT_LOAD_INPUT_OVERRIDE_FIELDS.find(field => field.path === path) || null;
}

function parseValue(path, value) {
  const spec = specFor(path);
  if (!spec) return undefined;
  return spec.type === 'number' ? numeric(value) : text(value);
}

function inputKey(input) {
  const identity = input?.identity || {};
  return text(input?.sourceObjectId) || text(identity.lineNo) || text(identity.branchKey) || text(identity.branchName) || 'pipe-input';
}

function normaliseOverride(override, path) {
  const spec = specFor(path);
  if (!spec) return null;
  const parsed = parseValue(path, override?.value ?? override);
  if (parsed === undefined) return null;
  return freezeDeep({
    schema: SUPPORT_LOAD_INPUT_OVERRIDE_SCHEMA,
    path,
    label: spec.label,
    type: spec.type,
    value: parsed,
    reason: text(override?.reason) || 'Reviewed support-load input override.',
    updatedAt: text(override?.updatedAt),
    updatedBy: text(override?.updatedBy) || 'geometry-workspace',
    source: 'REVIEW_OVERRIDE'
  });
}

export function normaliseSupportLoadInputOverrideState(state = {}) {
  const src = state?.schema === SUPPORT_LOAD_INPUT_OVERRIDE_SCHEMA ? state.records : state?.records || state || {};
  const records = {};
  for (const [keyRaw, value] of Object.entries(src || {})) {
    const key = text(value?.key || keyRaw);
    if (!key) continue;
    const overrides = {};
    const rawOverrides = value?.overrides || value || {};
    for (const [path, override] of Object.entries(rawOverrides || {})) {
      const item = normaliseOverride(override, path);
      if (item) overrides[path] = item;
    }
    if (Object.keys(overrides).length) {
      records[key] = freezeDeep({
        schema: SUPPORT_LOAD_INPUT_OVERRIDE_SCHEMA,
        key,
        overrides
      });
    }
  }
  return freezeDeep({
    schema: SUPPORT_LOAD_INPUT_OVERRIDE_SCHEMA,
    version: SUPPORT_LOAD_INPUT_OVERRIDE_VERSION,
    records
  });
}

function setPath(input, path, value) {
  const parts = path.split('.');
  const [group, field] = parts;
  if (!group || !field) return input;
  return {
    ...input,
    [group]: {
      ...(input[group] || {}),
      [field]: value
    }
  };
}

function recalcReadiness(input) {
  const id = input.identity || {};
  const pipe = input.pipePhysical || {};
  const process = input.process || {};
  const spans = input.spans || {};
  const hasSpan = spans.autoSpanMm !== null && spans.autoSpanMm !== undefined || spans.depSpanMm !== null && spans.depSpanMm !== undefined;
  const ope = pipe.unitPipeWtKgPerM !== null && pipe.unitPipeWtKgPerM !== undefined && process.fluidWtOpeKgPerM !== null && process.fluidWtOpeKgPerM !== undefined && hasSpan;
  const hyd = pipe.unitPipeWtKgPerM !== null && pipe.unitPipeWtKgPerM !== undefined && process.fluidWtHydKgPerM !== null && process.fluidWtHydKgPerM !== undefined && hasSpan;
  const lineStop = id.pipeOdMm !== null && id.pipeOdMm !== undefined && pipe.wallThicknessMm !== null && pipe.wallThicknessMm !== undefined && process.tempExpC1 !== null && process.tempExpC1 !== undefined;
  const guide = ope && pipe.wallThicknessMm !== null && pipe.wallThicknessMm !== undefined && process.tempExpC1 !== null && process.tempExpC1 !== undefined;
  const missing = [];
  for (const [field, ok] of [
    ['identity.nps', id.nps !== null && id.nps !== undefined],
    ['identity.pipeOdMm', id.pipeOdMm !== null && id.pipeOdMm !== undefined],
    ['pipePhysical.wallThicknessMm', pipe.wallThicknessMm !== null && pipe.wallThicknessMm !== undefined],
    ['pipePhysical.unitPipeWtKgPerM', pipe.unitPipeWtKgPerM !== null && pipe.unitPipeWtKgPerM !== undefined],
    ['process.tempExpC1', process.tempExpC1 !== null && process.tempExpC1 !== undefined],
    ['process.fluidWtOpeKgPerM', process.fluidWtOpeKgPerM !== null && process.fluidWtOpeKgPerM !== undefined],
    ['process.fluidWtHydKgPerM', process.fluidWtHydKgPerM !== null && process.fluidWtHydKgPerM !== undefined],
    ['spans.autoSpanMm or spans.depSpanMm', hasSpan]
  ]) {
    if (!ok) missing.push(field);
  }
  return freezeDeep({
    ...(input.readiness || {}),
    readyForVertical: ope && hyd,
    readyForOpeVertical: ope,
    readyForHydVertical: hyd,
    readyForGuide: guide,
    readyForLineStop: lineStop,
    missing,
    reviewerOverrideApplied: Boolean(input.inputOverrides && Object.keys(input.inputOverrides.overrides || {}).length),
    status: !missing.length ? 'INPUT_READY' : lineStop ? 'PARTIAL_INPUT' : 'BLOCKED'
  });
}

export function applySupportLoadInputOverridesToInput(input, stateInput = {}) {
  if (!input || typeof input !== 'object') return input;
  const state = normaliseSupportLoadInputOverrideState(stateInput?.overrides || stateInput?.inputOverrides || stateInput);
  const record = state.records?.[inputKey(input)];
  if (!record) return input;
  let next = {
    ...input,
    identity: { ...(input.identity || {}) },
    pipePhysical: { ...(input.pipePhysical || {}) },
    process: { ...(input.process || {}) },
    spans: { ...(input.spans || {}) }
  };
  const auditRows = Array.isArray(input.audit) ? input.audit.slice() : [];
  for (const override of Object.values(record.overrides || {})) {
    next = setPath(next, override.path, override.value);
    auditRows.push({
      source: 'REVIEW_OVERRIDE',
      field: override.path,
      value: override.value,
      reason: override.reason,
      updatedAt: override.updatedAt,
      updatedBy: override.updatedBy
    });
  }
  next.inputOverrides = record;
  next.audit = auditRows;
  next.readiness = recalcReadiness(next);
  return freezeDeep(next);
}

export function setSupportLoadInputOverride(previousState = {}, key, path, value, options = {}) {
  const field = specFor(path);
  if (!field || !text(key)) return freezeDeep(previousState || {});
  const parsed = parseValue(path, value);
  const base = previousState && typeof previousState === 'object' ? { ...previousState } : {};
  const state = normaliseSupportLoadInputOverrideState(base.overrides || base.inputOverrides || {});
  const records = { ...(state.records || {}) };
  const existing = records[key] || { schema: SUPPORT_LOAD_INPUT_OVERRIDE_SCHEMA, key, overrides: {} };
  records[key] = freezeDeep({
    schema: SUPPORT_LOAD_INPUT_OVERRIDE_SCHEMA,
    key,
    overrides: {
      ...(existing.overrides || {}),
      [path]: {
        schema: SUPPORT_LOAD_INPUT_OVERRIDE_SCHEMA,
        path,
        label: field.label,
        type: field.type,
        value: parsed,
        reason: text(options.reason) || 'Reviewed support-load input override.',
        updatedAt: options.updatedAt || new Date().toISOString(),
        updatedBy: text(options.updatedBy) || 'geometry-workspace',
        source: 'REVIEW_OVERRIDE'
      }
    }
  });
  return freezeDeep({
    ...base,
    overrides: {
      schema: SUPPORT_LOAD_INPUT_OVERRIDE_SCHEMA,
      version: SUPPORT_LOAD_INPUT_OVERRIDE_VERSION,
      records
    }
  });
}

export function clearSupportLoadInputOverride(previousState = {}, key, path = '') {
  const base = previousState && typeof previousState === 'object' ? { ...previousState } : {};
  const state = normaliseSupportLoadInputOverrideState(base.overrides || base.inputOverrides || {});
  const records = { ...(state.records || {}) };
  if (text(key) && records[key]) {
    if (text(path)) {
      const next = { ...(records[key].overrides || {}) };
      delete next[path];
      if (Object.keys(next).length) records[key] = freezeDeep({ ...records[key], overrides: next });
      else delete records[key];
    } else {
      delete records[key];
    }
  }
  return freezeDeep({
    ...base,
    overrides: {
      schema: SUPPORT_LOAD_INPUT_OVERRIDE_SCHEMA,
      version: SUPPORT_LOAD_INPUT_OVERRIDE_VERSION,
      records
    }
  });
}
