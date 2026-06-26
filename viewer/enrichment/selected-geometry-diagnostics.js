// Diagnostics for selected-geometry workflows: counts object families,
// enrichment readiness, conflicts, missing fields, and package-level issues.

import { freezeDeep, normalizeKey, text } from './selected-geometry-shared.js';

const PIPE_TYPES = new Set(['PIPE', 'BEND', 'ELBOW', 'ELBO', 'TEE', 'FLAN', 'FLANGE', 'VALV', 'VALVE', 'REDU', 'REDUCER']);
const SUPPORT_TYPES = new Set(['ATTA', 'SUPPORT', 'REST', 'GUIDE', 'LINESTOP', 'LINE_STOP', 'LIMIT', 'LIM', 'ANCHOR', 'SPRING']);

export function isPipeLikeType(type) {
  const normalized = normalizeKey(type);
  return PIPE_TYPES.has(normalized) || normalized.includes('PIPE') || normalized.includes('BEND') || normalized.includes('VALV');
}

export function isSupportLikeType(type) {
  const normalized = normalizeKey(type);
  return SUPPORT_TYPES.has(normalized) || normalized.includes('SUPPORT') || normalized.includes('ATTA') || normalized.includes('GUIDE');
}

export function summarizeGeometryObjects(objects) {
  const list = Array.isArray(objects) ? objects : [];
  const byType = {};
  let pipes = 0;
  let supports = 0;
  for (const object of list) {
    const type = text(object?.type || object?.attributes?.TYPE || 'OBJECT').toUpperCase();
    byType[type] = (byType[type] || 0) + 1;
    if (isPipeLikeType(type)) pipes += 1;
    if (isSupportLikeType(type)) supports += 1;
  }
  return freezeDeep({
    objects: list.length,
    pipes,
    supports,
    byType,
  });
}

export function summarizeEnrichmentObjects(objects) {
  const list = Array.isArray(objects) ? objects : [];
  let resolved = 0;
  let conflicts = 0;
  let missing = 0;
  let approximate = 0;
  const diagnostics = [];
  for (const object of list) {
    const audit = object?.attributes?.enrichment?.audit || {};
    const objectConflicts = Array.isArray(audit.conflicts) ? audit.conflicts : [];
    const objectMissing = Array.isArray(audit.missing) ? audit.missing : [];
    const confidence = Number(audit.confidence);
    if (objectConflicts.length) conflicts += 1;
    if (objectMissing.length) missing += 1;
    if (Number.isFinite(confidence) && confidence > 0 && confidence < 1) approximate += 1;
    if (!objectConflicts.length && !objectMissing.length && confidence > 0) resolved += 1;
    if (objectConflicts.length || objectMissing.length || audit.needsReview) {
      diagnostics.push(freezeDeep({
        objectId: text(object?.id),
        objectName: text(object?.name),
        type: text(object?.type),
        confidence: Number.isFinite(confidence) ? confidence : null,
        needsReview: Boolean(audit.needsReview),
        conflicts: objectConflicts,
        missing: objectMissing,
      }));
    }
  }
  return freezeDeep({
    objects: list.length,
    resolved,
    conflicts,
    missing,
    approximate,
    diagnostics,
  });
}

export function diagnosticRecord(input) {
  const record = input && typeof input === 'object' ? input : {};
  return freezeDeep({
    severity: text(record.severity || 'info'),
    code: text(record.code || 'SELECTED_GEOMETRY_DIAGNOSTIC'),
    message: text(record.message),
    objectId: text(record.objectId),
    field: text(record.field),
    value: record.value ?? null,
  });
}
