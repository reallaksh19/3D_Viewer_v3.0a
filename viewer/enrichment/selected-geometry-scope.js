// Selected-geometry scope builder: collects selected, visible, hierarchy, or
// full model objects and returns immutable workspace snapshots.

import {
  attributesForNode,
  clonePoint,
  cloneSafe,
  freezeDeep,
  nameForNode,
  numberOrZero,
  objectAliases,
  readPointFromAttributes,
  sourcePathForNode,
  stableHash,
  stableObjectId,
  text,
  typeForNode,
} from './selected-geometry-shared.js';
import { summarizeGeometryObjects } from './selected-geometry-diagnostics.js';

const SCOPE_MODES = new Set(['selected', 'visible', 'hierarchy', 'full']);
const TRAVERSE_KEYS = Object.freeze(['children', 'items', 'branches', 'objects', 'nodes']);

export function buildSelectedGeometryScope(input) {
  const options = input && typeof input === 'object' ? input : {};
  const scopeMode = normalizeScopeMode(options.scopeMode);
  const objects = collectScopeObjects({
    hierarchy: options.hierarchy,
    sourceObjects: options.sourceObjects,
    selectedIds: options.selectedIds,
    visibleIds: options.visibleIds,
    hierarchyNodeId: options.hierarchyNodeId,
    scopeMode,
  });
  const snapshots = objects.map(cloneGeometryObjectForWorkspace);
  return freezeDeep({
    schema: 'selected-geometry-scope/v1',
    scopeMode,
    capturedAt: new Date().toISOString(),
    axisTransform: normalizeAxisTransform(options.axisTransform),
    objects: snapshots,
    stats: summarizeGeometryObjects(snapshots),
  });
}

export function collectScopeObjects(input) {
  const options = input && typeof input === 'object' ? input : {};
  const allObjects = uniqueObjects([
    ...flattenRenderableObjects(options.hierarchy),
    ...flattenRenderableObjects(options.sourceObjects),
  ]);
  const selectedSet = idSet(options.selectedIds);
  const visibleSet = idSet(options.visibleIds);
  const scopeMode = normalizeScopeMode(options.scopeMode);

  if (scopeMode === 'selected') {
    return allObjects.filter((object) => matchesSet(object, selectedSet));
  }
  if (scopeMode === 'visible') {
    return allObjects.filter((object) => isVisibleObject(object, visibleSet));
  }
  if (scopeMode === 'hierarchy') {
    return collectHierarchyScopeObjects(allObjects, options.hierarchy, options.hierarchyNodeId);
  }
  return allObjects;
}

export function cloneGeometryObjectForWorkspace(node) {
  const attrs = attributesForNode(node);
  const id = stableObjectId(node);
  const apos = readPointFromAttributes(attrs, 'APOS');
  const lpos = readPointFromAttributes(attrs, 'LPOS');
  const delta = {
    x: numberOrZero(attrs.DELTA_X ?? attrs.DX ?? attrs.X_DELTA),
    y: numberOrZero(attrs.DELTA_Y ?? attrs.DY ?? attrs.Y_DELTA),
    z: numberOrZero(attrs.DELTA_Z ?? attrs.DZ ?? attrs.Z_DELTA),
  };
  return freezeDeep({
    id,
    name: nameForNode(node),
    type: typeForNode(node),
    sourcePath: sourcePathForNode(node),
    fromNode: text(attrs.FROM_NODE ?? attrs.FROM ?? attrs.START_NODE),
    toNode: text(attrs.TO_NODE ?? attrs.TO ?? attrs.END_NODE),
    apos,
    lpos,
    delta: freezeDeep(delta),
    sourceAttributes: cloneSafe(attrs),
    attributes: freezeDeep(cloneSafe(existingWorkspaceAttributes(node))),
    calculatedFields: freezeDeep(cloneSafe(node?.calculatedFields || node?.userData?.calculatedFields || {})),
    sourceIdentity: freezeDeep({
      renderId: text(node?.userData?.name || node?.name || node?.uuid),
      canonicalObjectId: text(node?.userData?.canonicalObjectId || node?.canonicalId),
      sourceObjectId: text(node?.userData?.sourceObjectId || node?.sourceObjectId),
    }),
  });
}

export function normalizeAxisTransform(axisTransform) {
  const source = axisTransform && typeof axisTransform === 'object' ? axisTransform : {};
  return freezeDeep({
    verticalAxis: text(source.verticalAxis || 'Y') || 'Y',
    northAxis: text(source.northAxis || 'Z') || 'Z',
    handedness: text(source.handedness || 'right') || 'right',
  });
}

function normalizeScopeMode(value) {
  const normalized = text(value || 'selected').toLowerCase();
  return SCOPE_MODES.has(normalized) ? normalized : 'selected';
}

function existingWorkspaceAttributes(node) {
  const attrs = node?.attributes || node?.userData?.attributes || {};
  if (attrs?.enrichment) return { enrichment: attrs.enrichment };
  return {};
}

function idSet(values) {
  if (!values) return new Set();
  if (values instanceof Set) return new Set([...values].map(normalizeAlias).filter(Boolean));
  if (Array.isArray(values)) return new Set(values.map(normalizeAlias).filter(Boolean));
  return new Set([normalizeAlias(values)].filter(Boolean));
}

function normalizeAlias(value) {
  return text(value).replace(/\s+/g, ' ').toLowerCase();
}

function matchesSet(object, set) {
  if (!set?.size) return false;
  const aliases = objectAliases(object).map(normalizeAlias).filter(Boolean);
  return aliases.some((alias) => set.has(alias));
}

function isVisibleObject(object, visibleSet) {
  if (!object) return false;
  if (object.visible === false) return false;
  const data = object.userData || {};
  if (data.rvmHiddenByVisibilityToolbar || data.rvmHiddenByUser || data.rvmHiddenBySelectionDetails) return false;
  if (!visibleSet?.size) return true;
  return matchesSet(object, visibleSet);
}

function collectHierarchyScopeObjects(allObjects, hierarchy, hierarchyNodeId) {
  const wanted = text(hierarchyNodeId);
  if (!wanted) return [];
  const hierarchyNode = findHierarchyNode(hierarchy, wanted);
  const objectIds = collectHierarchyObjectIds(hierarchyNode);
  if (objectIds.size) return allObjects.filter((object) => matchesSet(object, objectIds));
  const paths = collectHierarchyPaths(hierarchyNode);
  const normalizedWanted = normalizeAlias(wanted);
  return allObjects.filter((object) => {
    const path = normalizeAlias(sourcePathForNode(object));
    return path && (paths.some((item) => path.startsWith(item)) || path.startsWith(normalizedWanted));
  });
}

function collectHierarchyObjectIds(node) {
  const out = new Set();
  visitHierarchy(node, (item) => {
    for (const id of item?.objectIds || []) out.add(normalizeAlias(id));
    for (const id of item?.selectableObjectIds || []) out.add(normalizeAlias(id));
    for (const id of item?.selectedObjectIds || []) out.add(normalizeAlias(id));
  });
  out.delete('');
  return out;
}

function collectHierarchyPaths(node) {
  const out = [];
  visitHierarchy(node, (item) => {
    for (const value of [item?.path, item?.displayPath, item?.sourcePath, item?.normalizedPath]) {
      const normalized = normalizeAlias(value);
      if (normalized) out.push(normalized);
    }
  });
  return Array.from(new Set(out));
}

function findHierarchyNode(hierarchy, wanted) {
  const normalizedWanted = normalizeAlias(wanted);
  let found = null;
  visitHierarchy(hierarchy, (node) => {
    if (found) return;
    const aliases = [
      node?.id,
      node?.path,
      node?.displayPath,
      node?.normalizedPath,
      node?.sourcePath,
      node?.name,
      node?.canonicalObjectId,
      node?.sourceObjectId,
      node?.userData?.canonicalObjectId,
      node?.userData?.sourceObjectId,
      node?.userData?.name,
      node?.userData?.sourcePath,
      node?.userData?.displayName,
    ].map(normalizeAlias);
    if (aliases.includes(normalizedWanted)) found = node;
  });
  return found;
}

function flattenRenderableObjects(value) {
  const out = [];
  visitHierarchy(value, (node) => {
    if (isRenderableObject(node)) out.push(node);
  });
  return out;
}

function isRenderableObject(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.isMesh || node.isLine || node.isPoints) return true;
  if (node.attributes || node.sourceAttributes || node.userData?.browserRvmAttributes) {
    return !Array.isArray(node.children) || node.children.length === 0;
  }
  return false;
}

function visitHierarchy(value, visitor) {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) visitHierarchy(item, visitor);
    return;
  }
  if (typeof value !== 'object') return;
  visitor(value);
  if (typeof value.traverse === 'function') {
    value.traverse((child) => {
      if (child !== value) visitor(child);
    });
    return;
  }
  for (const key of TRAVERSE_KEYS) {
    const children = value[key];
    if (!Array.isArray(children)) continue;
    for (const child of children) visitHierarchy(child, visitor);
  }
}

function uniqueObjects(objects) {
  const seen = new Set();
  const out = [];
  for (const object of objects) {
    const key = stableObjectId(object) || `hash:${stableHash(JSON.stringify(object || {}))}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(object);
  }
  return out;
}
