export const GEOMETRY_IMPORT_TREE_SCHEMA = 'geometry-import-hierarchy/v1';
export const GEOMETRY_IMPORT_HIERARCHY_SCHEMA = 'geometry-import-hierarchy/v1';

const DEFAULT_MAX_DEPTH = 5;
const DEFAULT_MAX_VISIBLE_ROWS = 500;

function cleanPart(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text.replace(/^\/+|\/+$/g, '').trim();
}

function splitPath(value) {
  return String(value ?? '')
    .split('/')
    .map(cleanPart)
    .filter(Boolean);
}

function stableRecordName(record) {
  return cleanPart(record?.displayName || record?.reviewName || record?.name || record?.canonicalId || record?.id || 'Object');
}

export function hierarchyPartsFromRenderedRecord(record, options = {}) {
  const maxDepth = Math.max(1, Number(options.maxDepth || DEFAULT_MAX_DEPTH));
  const rawParts = Array.isArray(record?.hierarchyPath)
    ? record.hierarchyPath.map(cleanPart).filter(Boolean)
    : [];

  let parts = rawParts.length ? rawParts : splitPath(record?.sourcePath || record?.path || '');

  if (!parts.length) parts = [stableRecordName(record)];

  const fileName = cleanPart(options.modelName || record?.sourceFile || record?.sourceModel || record?.rootName || 'Rendered Geometry');
  if (fileName && parts[0] !== fileName && !parts[0].toLowerCase().includes(fileName.toLowerCase())) {
    parts = [fileName, ...parts];
  }

  return parts.slice(0, maxDepth).map((part, index) => part || `Level ${index + 1}`);
}

function makeNode(id, name, path, level, parentPath = null) {
  return {
    id,
    name,
    path,
    normalizedPath: path.toUpperCase(),
    level,
    parentPath,
    count: 0,
    objectIds: [],
    childCount: 0,
    children: []
  };
}

export function buildGeometryImportHierarchy(records, options = {}) {
  const maxDepth = Math.max(1, Number(options.maxDepth || DEFAULT_MAX_DEPTH));
  const rootName = cleanPart(options.rootName || 'Imported Geometry');
  const root = makeNode('__ROOT__', rootName, '__ROOT__', 0, null);
  const nodesByPath = new Map([[root.path, root]]);
  const objectSets = new Map([[root.path, new Set()]]);

  for (const record of Array.isArray(records) ? records : []) {
    const id = String(record?.id ?? '').trim();
    if (!id) continue;
    objectSets.get(root.path).add(id);
    const parts = hierarchyPartsFromRenderedRecord(record, { ...options, maxDepth });
    let parent = root;
    let parentPath = root.path;
    let fullPath = '';

    for (let index = 0; index < parts.length; index += 1) {
      const name = parts[index];
      fullPath = `${fullPath}/${name}`;
      if (!nodesByPath.has(fullPath)) {
        const node = makeNode(fullPath, name, fullPath, index + 1, parentPath);
        nodesByPath.set(fullPath, node);
        objectSets.set(fullPath, new Set());
        parent.children.push(node);
      }
      const node = nodesByPath.get(fullPath);
      objectSets.get(fullPath).add(id);
      parent = node;
      parentPath = fullPath;
    }
  }

  for (const [path, node] of nodesByPath.entries()) {
    const ids = [...(objectSets.get(path) || new Set())];
    node.objectIds = ids;
    node.count = ids.length;
    node.childCount = node.children.length;
    node.children.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  const flatNodes = [...nodesByPath.values()].sort((a, b) => a.level - b.level || b.count - a.count || a.path.localeCompare(b.path));
  return {
    schemaVersion: GEOMETRY_IMPORT_TREE_SCHEMA,
    maxDepth,
    root,
    flatNodes,
    nodeCount: flatNodes.length,
    objectCount: root.count
  };
}

function nodeMatches(node, query) {
  if (!query) return true;
  const haystack = `${node.name} ${node.path}`.toLowerCase();
  return haystack.includes(query);
}

function descendantMatches(node, query) {
  if (nodeMatches(node, query)) return true;
  return node.children.some((child) => descendantMatches(child, query));
}

export function flattenGeometryImportHierarchy(tree, options = {}) {
  const rows = [];
  const query = String(options.search || '').trim().toLowerCase();
  const expandedPaths = options.expandedPaths instanceof Set ? options.expandedPaths : new Set(options.expandedPaths || []);
  const maxRows = Math.max(25, Number(options.maxRows || DEFAULT_MAX_VISIBLE_ROWS));
  const root = tree?.root;
  if (!root) return rows;

  const walk = (node, ancestorsVisible = true) => {
    if (!node || rows.length >= maxRows) return false;
    const matched = nodeMatches(node, query);
    const hasMatchBelow = query ? descendantMatches(node, query) : true;
    const visible = ancestorsVisible && hasMatchBelow;
    if (!visible) return false;

    rows.push({ ...node, searchMatched: matched, hasMatchBelow });
    const expanded = query || node.path === '__ROOT__' || expandedPaths.has(node.path);
    if (expanded) {
      for (const child of node.children) walk(child, true);
    }
    return true;
  };

  walk(root, true);
  return rows.slice(0, maxRows);
}

export function collectObjectIdsForHierarchyPaths(tree, paths) {
  const selected = new Set();
  const wanted = new Set(Array.isArray(paths) ? paths : [...(paths || [])]);
  if (!tree || !wanted.size) return selected;
  for (const node of tree.flatNodes || []) {
    if (!wanted.has(node.path)) continue;
    for (const id of node.objectIds || []) selected.add(id);
  }
  return selected;
}

export function countCheckedHierarchyObjects(tree, paths) {
  return collectObjectIdsForHierarchyPaths(tree, paths).size;
}
