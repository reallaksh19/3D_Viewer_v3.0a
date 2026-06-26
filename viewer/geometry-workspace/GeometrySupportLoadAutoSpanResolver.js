export const SUPPORT_LOAD_AUTOSPAN_RESOLVER_SCHEMA = 'support-load-autospan-resolver/v1';
export const SUPPORT_LOAD_AUTOSPAN_RESOLVER_VERSION = '20260623-support-load-autospan-resolver-1';

function num(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const match = String(value ?? '').replace(/,/g, '').match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/i);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}
function round3(value) { return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null; }
function point(value) {
  const x = num(value?.x), y = num(value?.y), z = num(value?.z);
  return x === null || y === null || z === null ? null : Object.freeze({ x, y, z });
}
function centerOf(object) { return point(object?.geometry?.center) || point(object?.geometryEnrichment?.geometry?.center) || point(object?.rawRecord?.geometry?.center); }
function distance(a, b) { return a && b ? Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) : null; }
function axisRange(points, axis) {
  const values = points.map(point => point.center?.[axis]).filter(value => Number.isFinite(value));
  return values.length ? Math.max(...values) - Math.min(...values) : -Infinity;
}
function dominantAxis(points) {
  const axes = ['x', 'y', 'z'];
  return axes.map(axis => ({ axis, range: axisRange(points, axis) })).sort((a, b) => b.range - a.range)[0]?.axis || 'x';
}
function explicitAutoSpan(ref) {
  const n = num(ref?.autoSpanMm);
  return n !== null && n > 0 ? n : null;
}
function withSpan(ref, span, status, audit = []) {
  return Object.freeze({
    ...ref,
    autoSpanMm: span,
    autoSpanStatus: status,
    autoSpanAudit: Object.freeze(audit)
  });
}

export function resolveSupportLoadAutoSpansForPipe(pipe, refs = [], supportById = new Map()) {
  const list = Array.isArray(refs) ? refs : [];
  if (!list.length) return Object.freeze([]);
  const explicit = list.map(ref => explicitAutoSpan(ref));
  const supportPoints = list.map((ref, index) => {
    const support = supportById.get(ref.supportId) || supportById.get(ref.supportTag) || null;
    return { ref, index, center: centerOf(support) };
  }).filter(item => item.center);

  if (supportPoints.length < 2) {
    return Object.freeze(list.map((ref, index) => explicit[index] !== null
      ? withSpan(ref, explicit[index], 'EXPLICIT_AUTOSPAN', [{ source: 'NATIVE_SUPPORT_ATTRIBUTE', field: 'supportRef.autoSpanMm', value: explicit[index] }])
      : withSpan(ref, null, 'REVIEW_REQUIRED_NO_NEIGHBOR_SUPPORTS', [{ source: 'AUTO_SPAN_RESOLVER', field: 'autoSpanMm', value: null, reason: 'At least two associated support coordinates are required.' }])));
  }

  const axis = dominantAxis(supportPoints);
  const sorted = [...supportPoints].sort((a, b) => a.center[axis] - b.center[axis]);
  const spanByIndex = new Map();
  for (let i = 0; i < sorted.length; i += 1) {
    const prev = i > 0 ? distance(sorted[i].center, sorted[i - 1].center) : null;
    const next = i < sorted.length - 1 ? distance(sorted[i].center, sorted[i + 1].center) : null;
    const span = Math.max(prev || 0, next || 0);
    if (span > 0) spanByIndex.set(sorted[i].index, round3(span));
  }

  return Object.freeze(list.map((ref, index) => {
    if (explicit[index] !== null) return withSpan(ref, explicit[index], 'EXPLICIT_AUTOSPAN', [{ source: 'NATIVE_SUPPORT_ATTRIBUTE', field: 'supportRef.autoSpanMm', value: explicit[index] }]);
    const span = spanByIndex.get(index) ?? null;
    if (span === null) return withSpan(ref, null, 'REVIEW_REQUIRED_NO_AUTOSPAN', [{ source: 'AUTO_SPAN_RESOLVER', field: 'autoSpanMm', value: null, axis }]);
    return withSpan(ref, span, 'AUTO_RESOLVED_SUPPORT_GRAPH', [{ source: 'AUTO_SPAN_RESOLVER', field: 'supportRef.autoSpanMm', value: span, axis, method: 'dominant-axis-adjacent-support-distance', schema: SUPPORT_LOAD_AUTOSPAN_RESOLVER_SCHEMA, version: SUPPORT_LOAD_AUTOSPAN_RESOLVER_VERSION }]);
  }));
}

export function summarizeSupportLoadAutoSpans(pipes = []) {
  const pipeList = Array.isArray(pipes) ? pipes : [];
  let resolved = 0;
  let explicit = 0;
  let review = 0;
  for (const pipe of pipeList) {
    for (const ref of pipe?.attributes?.supportLoadInput?.supportRefs || []) {
      if (ref.autoSpanStatus === 'EXPLICIT_AUTOSPAN') explicit += 1;
      else if (ref.autoSpanStatus === 'AUTO_RESOLVED_SUPPORT_GRAPH') resolved += 1;
      else review += 1;
    }
  }
  return Object.freeze({ schema: 'support-load-autospan-summary/v1', version: SUPPORT_LOAD_AUTOSPAN_RESOLVER_VERSION, explicitCount: explicit, autoResolvedCount: resolved, reviewRequiredCount: review, status: review ? 'AUTOSPAN_REVIEW_REQUIRED' : resolved || explicit ? 'AUTOSPAN_READY' : 'AUTOSPAN_EMPTY' });
}
