export const SUPPORT_LOAD_CANVAS_OVERLAY_SCHEMA = 'support-load-canvas-overlay/v1';
export const SUPPORT_LOAD_CANVAS_OVERLAY_VERSION = '20260623-support-load-canvas-overlay-1';

const DEFAULT_MAX_ARROWS = 1500;
const MIN_ARROW_LENGTH = 24;
const MAX_ARROW_LENGTH = 420;
const NOMINAL_ARROW_LENGTH = 320;

function text(value) {
  return String(value ?? '').trim();
}

function number(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function round3(value) {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
}

function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map(freeze));
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
}

function point(value) {
  const x = number(value?.x);
  const y = number(value?.y);
  const z = number(value?.z);
  return x === null || y === null || z === null ? null : freeze({ x: round3(x), y: round3(y), z: round3(z) });
}

function pointForObject(object) {
  return point(object?.geometry?.center)
    || point(object?.rawRecord?.geometry?.center)
    || point(object?.geometryEnrichment?.geometry?.center)
    || point(object?.bbox?.center)
    || null;
}

function sourceObjectId(object) {
  return text(object?.sourceId || object?.id || object?.canonicalId || object?.objectId || object?.displayName);
}

function calculatedSupportReference(object) {
  return object?.calculatedFields?.supportLoadReference || null;
}

function firstNumber(...values) {
  for (const value of values) {
    const n = number(value);
    if (n !== null) return n;
  }
  return null;
}

function maxAbs(values) {
  let max = 0;
  for (const value of values) {
    const n = number(value);
    if (n !== null) max = Math.max(max, Math.abs(n));
  }
  return max;
}

function lengthFor(loadN, maxLoadN) {
  const load = Math.abs(number(loadN) || 0);
  if (!load || !maxLoadN) return MIN_ARROW_LENGTH;
  const scaled = MIN_ARROW_LENGTH + (load / maxLoadN) * (NOMINAL_ARROW_LENGTH - MIN_ARROW_LENGTH);
  return round3(Math.max(MIN_ARROW_LENGTH, Math.min(MAX_ARROW_LENGTH, scaled)));
}

function loadRowForSupport(object) {
  const ref = calculatedSupportReference(object);
  if (!ref) return null;
  const supportId = text(ref.supportId || sourceObjectId(object));
  const center = pointForObject(object);
  const verticalN = firstNumber(ref.vertical?.opeVDep, ref.vertical?.opeVA, ref.vertical?.hydVDep, ref.vertical?.hydVA);
  const guideN = ref.applies?.guide ? firstNumber(ref.guide?.guideHDep, ref.guide?.guideHA) : null;
  const lineStopN = ref.applies?.lineStop ? firstNumber(ref.lineStop?.lineStopH) : null;
  return freeze({
    supportId,
    supportTag: text(ref.supportTag || supportId),
    supportType: text(ref.supportType),
    associatedPipeId: text(ref.associatedPipeId),
    lineNo: text(ref.lineNo),
    status: text(ref.status || 'UNKNOWN'),
    center,
    loads: {
      verticalN,
      guideN,
      lineStopN,
    },
    applies: {
      vertical: true,
      guide: Boolean(ref.applies?.guide && guideN !== null),
      lineStop: Boolean(ref.applies?.lineStop && lineStopN !== null),
    },
    warnings: center ? [] : ['support-center-missing'],
  });
}

function arrow({ row, kind, loadN, direction, maxLoadN }) {
  if (!row?.center || number(loadN) === null) return null;
  return freeze({
    schema: 'support-load-canvas-overlay-arrow/v1',
    kind,
    supportId: row.supportId,
    supportTag: row.supportTag,
    supportType: row.supportType,
    associatedPipeId: row.associatedPipeId,
    loadN: round3(number(loadN)),
    label: `${kind}: ${round3(number(loadN))} N`,
    start: row.center,
    direction: freeze(direction),
    length: lengthFor(loadN, maxLoadN),
    renderPrimitive: 'LINE_SEGMENTS_ONLY',
  });
}

export function buildSupportLoadCanvasOverlayPlan(input = {}, options = {}) {
  const calculatedObjects = Array.isArray(input?.calculatedObjects)
    ? input.calculatedObjects
    : Array.isArray(input?.formulaResults?.calculatedObjects)
      ? input.formulaResults.calculatedObjects
      : [];
  const maxArrows = Math.max(1, Math.min(DEFAULT_MAX_ARROWS, Math.floor(number(options.maxArrows) || DEFAULT_MAX_ARROWS)));
  const rows = calculatedObjects.map(loadRowForSupport).filter(Boolean);
  const loadValues = rows.flatMap(row => [row.loads.verticalN, row.loads.guideN, row.loads.lineStopN]).filter(value => number(value) !== null);
  const maxLoadN = maxAbs(loadValues);
  const arrows = [];
  for (const row of rows) {
    if (arrows.length >= maxArrows) break;
    const verticalArrow = arrow({ row, kind: 'VERTICAL_OPE', loadN: row.loads.verticalN, direction: { x: 0, y: -1, z: 0 }, maxLoadN });
    if (verticalArrow) arrows.push(verticalArrow);
    if (arrows.length >= maxArrows) break;
    const guideArrow = row.applies.guide ? arrow({ row, kind: 'GUIDE_HORIZONTAL', loadN: row.loads.guideN, direction: { x: 1, y: 0, z: 0 }, maxLoadN }) : null;
    if (guideArrow) arrows.push(guideArrow);
    if (arrows.length >= maxArrows) break;
    const lineStopArrow = row.applies.lineStop ? arrow({ row, kind: 'LINESTOP_HORIZONTAL', loadN: row.loads.lineStopN, direction: { x: 0, y: 0, z: 1 }, maxLoadN }) : null;
    if (lineStopArrow) arrows.push(lineStopArrow);
  }
  const warningCount = rows.reduce((count, row) => count + (row.warnings?.length || 0), 0);
  return freeze({
    schema: SUPPORT_LOAD_CANVAS_OVERLAY_SCHEMA,
    version: SUPPORT_LOAD_CANVAS_OVERLAY_VERSION,
    generatedAt: options.generatedAt || new Date().toISOString(),
    status: rows.length ? (arrows.length ? 'READY' : 'NO_DRAWABLE_LOADS') : 'EMPTY',
    inputSource: 'calculatedFields.supportLoadReference',
    mutationPolicy: 'READ_ONLY_OVERLAY',
    renderPolicy: 'LINE_SEGMENTS_ONLY_NO_INPUT_OR_RESULT_MUTATION',
    supportRows: rows,
    arrows,
    supportCount: rows.length,
    arrowCount: arrows.length,
    maxLoadN: round3(maxLoadN),
    warningCount,
    capped: arrows.length >= maxArrows,
    assumptions: [
      'Canvas overlay consumes calculatedFields.supportLoadReference only.',
      'Overlay does not hydrate inputs, calculate loads, or mutate input/result fields.',
      'Arrows are line-segment graphics only; no support marker/cone runtime is used.',
    ],
  });
}

export function summarizeSupportLoadCanvasOverlayPlan(plan) {
  return freeze({
    schema: 'support-load-canvas-overlay-summary/v1',
    status: text(plan?.status || 'EMPTY'),
    supportCount: number(plan?.supportCount) || 0,
    arrowCount: number(plan?.arrowCount) || 0,
    warningCount: number(plan?.warningCount) || 0,
    maxLoadN: number(plan?.maxLoadN) || 0,
  });
}
