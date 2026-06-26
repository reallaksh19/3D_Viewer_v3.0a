import * as THREE from 'three';

export const RENDERED_GEOMETRY_SNAPSHOT_SCHEMA = 'rendered-geometry-snapshot/v1';
export const SNAPSHOT_BUILDER_VERSION = '20260622-geometry-workspace-1';

const DEFAULT_MAX_SCAN_OBJECTS = 120000;
const DEFAULT_MAX_RECORDS = 50000;
const SNAPSHOT_SCOPES = new Set(['selected', 'visible', 'all']);

function viewer() {
  return globalThis.__3D_RVM_VIEWER__ || null;
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
}

function attrsFor(obj) {
  const data = obj?.userData || {};
  const props = data.browserRvmProperties || {};
  return data.browserRvmAttributes || data.attributes || props.attributes || data.rawAttributes || {};
}

function propsFor(obj) {
  return obj?.userData?.browserRvmProperties || {};
}

function isRenderableObject(obj) {
  return Boolean(obj && (obj.isMesh || obj.isLine || obj.isLineSegments || obj.isPoints));
}

function canonicalObjectId(obj) {
  const data = obj?.userData || {};
  return String(firstDefined(
    data.canonicalObjectId,
    data.rvmCanonicalId,
    data.sourceObjectId,
    data.objectId,
    obj?.name,
    obj?.uuid
  )).trim();
}

function displayNameFor(obj) {
  const data = obj?.userData || {};
  const props = propsFor(obj);
  const attrs = attrsFor(obj);
  return String(firstDefined(
    data.displayName,
    data.sourceName,
    props.displayName,
    props.sourceName,
    attrs.RVM_REVIEW_NAME,
    attrs.NAME,
    obj?.name,
    canonicalObjectId(obj),
    'rendered object'
  )).trim();
}

function sourcePathFor(obj) {
  const data = obj?.userData || {};
  const props = propsFor(obj);
  const attrs = attrsFor(obj);
  return String(firstDefined(
    data.sourcePath,
    props.sourcePath,
    props.SourcePath,
    attrs.RVM_OWNER_PATH,
    attrs.RVM_OWNER_NAME,
    attrs.OWNER,
    attrs.PATH,
    data.sourceName,
    data.displayName,
    obj?.name
  )).trim();
}

function objectClassFor(obj) {
  const data = obj?.userData || {};
  const attrs = attrsFor(obj);
  return String(firstDefined(
    data.objectClass,
    data.type,
    data.kind,
    attrs.TYPE,
    attrs.RVM_TYPE,
    attrs.DTXR,
    data.effectiveRenderPrimitive,
    data.renderPrimitive,
    'OBJECT'
  )).toUpperCase();
}

function primitiveFor(obj) {
  const data = obj?.userData || {};
  const attrs = attrsFor(obj);
  return String(firstDefined(
    data.effectiveRenderPrimitive,
    data.renderPrimitive,
    attrs.RVM_BROWSER_RENDER_PRIMITIVE,
    attrs.RVM_PRIMITIVE_KIND,
    attrs.RVM_PRIMITIVE_CODE,
    ''
  )).toUpperCase();
}

function safeNumber(value) {
  return Number.isFinite(value) ? Number(value.toFixed(6)) : null;
}

function toPoint(vector) {
  if (!vector) return null;
  return { x: safeNumber(vector.x), y: safeNumber(vector.y), z: safeNumber(vector.z) };
}

function bboxForObject(obj) {
  try {
    const box = new THREE.Box3().setFromObject(obj);
    if (!box || box.isEmpty()) return null;
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    return {
      min: toPoint(box.min),
      max: toPoint(box.max),
      center: toPoint(center),
      size: toPoint(size)
    };
  } catch (_) {
    return null;
  }
}

function vectorFromData(value) {
  if (!value) return null;
  if (Array.isArray(value) && value.length >= 3) return { x: Number(value[0]), y: Number(value[1]), z: Number(value[2]) };
  if (typeof value === 'object') return { x: Number(value.x ?? value.X), y: Number(value.y ?? value.Y), z: Number(value.z ?? value.Z) };
  return null;
}

function geometryForObject(obj, bbox) {
  const data = obj?.userData || {};
  const attrs = attrsFor(obj);
  const start = vectorFromData(firstDefined(data.axisStart, data.start, attrs.RVM_AXIS_START, attrs.APOS, attrs.HPOS));
  const end = vectorFromData(firstDefined(data.axisEnd, data.end, attrs.RVM_AXIS_END, attrs.LPOS, attrs.TPOS));
  const axis = vectorFromData(firstDefined(data.axis, data.pipeAxis, attrs.PIPE_AXIS_VECTOR));
  return {
    bboxMin: bbox?.min || null,
    bboxMax: bbox?.max || null,
    center: bbox?.center || null,
    size: bbox?.size || null,
    length: safeNumber(firstDefined(data.length, attrs.LENGTH, bbox?.size ? Math.max(bbox.size.x || 0, bbox.size.y || 0, bbox.size.z || 0) : null)),
    diameter: safeNumber(firstDefined(data.diameter, data.pipeOd, attrs.ATTACHED_PIPE_OD, attrs.DIAMETER, attrs.BORE)),
    radius: safeNumber(firstDefined(data.radius, attrs.RADIUS)),
    axis,
    start,
    end
  };
}

function copyPlainFields(obj) {
  const data = obj?.userData || {};
  const attrs = attrsFor(obj);
  const props = propsFor(obj);
  const raw = { ...attrs };
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || typeof value === 'object') continue;
    if (!(key in raw)) raw[key] = value;
  }
  for (const key of ['canonicalObjectId', 'sourcePath', 'displayName', 'sourceName', 'renderPrimitive', 'effectiveRenderPrimitive', 'rvmPrimitiveCode']) {
    if (data[key] !== undefined && data[key] !== null && !(key in raw)) raw[key] = data[key];
  }
  return raw;
}

function hierarchyPathFor(obj) {
  const rawPath = sourcePathFor(obj);
  const parts = rawPath.split('/').map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts.slice(0, 8) : [displayNameFor(obj)];
}

function selectedIdSet(v) {
  const ids = new Set();
  try {
    const selected = v?.selection?.getSelectedCanonicalIds?.();
    if (Array.isArray(selected)) selected.forEach((id) => { if (id) ids.add(String(id)); });
  } catch (_) {}
  try {
    const meshes = Array.isArray(v?._rvmCanvasSelectedMeshes) ? v._rvmCanvasSelectedMeshes : [];
    meshes.forEach((obj) => { const id = canonicalObjectId(obj); if (id) ids.add(id); });
  } catch (_) {}
  return ids;
}

function includeForScope(obj, scope, selectedIds) {
  if (scope === 'all') return true;
  if (scope === 'visible') return obj?.visible !== false;
  if (scope === 'selected') return selectedIds.has(canonicalObjectId(obj));
  return false;
}

export function buildRenderedGeometrySnapshot(options = {}) {
  const scope = SNAPSHOT_SCOPES.has(options.scope) ? options.scope : 'visible';
  const maxScan = Number.isFinite(options.maxScanObjects) ? options.maxScanObjects : DEFAULT_MAX_SCAN_OBJECTS;
  const maxRecords = Number.isFinite(options.maxRecords) ? options.maxRecords : DEFAULT_MAX_RECORDS;
  const v = options.viewer || viewer();
  const selectedIds = selectedIdSet(v);
  const records = [];
  let scanned = 0;
  let capped = false;

  v?.modelGroup?.traverse?.((obj) => {
    if (!isRenderableObject(obj)) return;
    scanned += 1;
    if (scanned > maxScan) { capped = true; return; }
    if (records.length >= maxRecords) { capped = true; return; }
    if (!includeForScope(obj, scope, selectedIds)) return;
    const bbox = bboxForObject(obj);
    const rawFields = copyPlainFields(obj);
    const id = canonicalObjectId(obj) || `rendered-${records.length + 1}`;
    const record = {
      schemaVersion: 'rendered-geometry-record/v1',
      id,
      sourceViewer: '3D_RVM_VIEWER',
      sourceFormat: 'RVM',
      canonicalId: id,
      displayName: displayNameFor(obj),
      sourcePath: sourcePathFor(obj),
      hierarchyPath: hierarchyPathFor(obj),
      objectClass: objectClassFor(obj),
      objectType: String(firstDefined(rawFields.TYPE, rawFields.DTXR, objectClassFor(obj))).toUpperCase(),
      primitiveKind: primitiveFor(obj),
      effectivePrimitive: primitiveFor(obj),
      visible: obj.visible !== false,
      selected: selectedIds.has(id),
      pickable: obj.userData?.pickable !== false,
      geometry: geometryForObject(obj, bbox),
      rawFields,
      derivedFields: {
        detectedFamily: objectClassFor(obj),
        detectedDiameterMm: geometryForObject(obj, bbox).diameter,
        detectedLengthMm: geometryForObject(obj, bbox).length
      }
    };
    records.push(record);
  });

  return {
    schemaVersion: RENDERED_GEOMETRY_SNAPSHOT_SCHEMA,
    version: SNAPSHOT_BUILDER_VERSION,
    scope,
    sourceViewer: '3D_RVM_VIEWER',
    sourceFormat: 'RVM',
    generatedAt: new Date().toISOString(),
    fileName: String(v?.loadedFileName || v?.sourceFileName || ''),
    scanned,
    capped,
    recordCount: records.length,
    records
  };
}

export function buildRenderedGeometrySnapshotSummary(snapshot) {
  const records = Array.isArray(snapshot?.records) ? snapshot.records : [];
  const byClass = new Map();
  for (const record of records) {
    const key = record.objectClass || 'OBJECT';
    byClass.set(key, (byClass.get(key) || 0) + 1);
  }
  return {
    schemaVersion: 'rendered-geometry-snapshot-summary/v1',
    recordCount: records.length,
    scanned: snapshot?.scanned || 0,
    capped: Boolean(snapshot?.capped),
    byClass: Object.fromEntries([...byClass.entries()].sort((a, b) => b[1] - a[1]))
  };
}
