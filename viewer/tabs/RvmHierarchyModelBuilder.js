export const RVM_HIERARCHY_MODEL_SCHEMA = 'rvm-canonical-hierarchy-model/v1';

const TECHNICAL_CONTAINER_NAMES = new Set(['STRUCTURE', 'RVM', 'MODEL', 'HIERARCHY']);
const FILE_RE = /\.(rvm|rev|nwd|nwc)$/i;
const PLANT_PREFIX_RE = /^(BTRM|PS[-_]?|SL[-_]?|EQUI|STRU|PIPE|BRANCH|PANEL|FLOOR|FRAME|GRAD|GRID|ROAD|FRMW|FDNS|PITS|STDS|SLEE|CU[-_])/i;

export function normalizeRvmReviewPath(rawPath = '', options = {}) {
  const fileName = cleanPart(options.fileName || '');
  const displayName = cleanPart(options.displayName || '');
  const raw = [rawPath, options.ownerPath, options.ownerName].filter(Boolean).join('/');
  let parts = String(raw || '')
    .replace(/\\/g, '/')
    .split('/')
    .map(cleanPart)
    .filter(Boolean)
    .filter((part) => !/^RVM\s+RVM_PRIM_CODE/i.test(part));

  parts = stripFilePrefixes(parts, fileName);
  parts = stripTechnicalStructureContainer(parts);
  if (!parts.length && displayName) parts = [displayName];
  if (!parts.length) parts = ['Unzoned'];
  const displayPath = `/${parts.join('/')}`.replace(/\/+/g, '/');
  return {
    sourcePath: String(rawPath || ''),
    displayPath,
    normalizedPath: displayPath.toLowerCase(),
    parts,
    fileName: fileName || '',
  };
}

export function buildRvmHierarchyModelFromZoneRows(rows = [], options = {}) {
  const rootName = cleanPart(options.rootName || options.fileName || 'RVM model').replace(FILE_RE, '') || 'RVM model';
  const root = makeNode({
    id: stableNodeId(`file:/${rootName}`),
    name: rootName,
    path: `/${rootName}`,
    sourcePath: options.fileName || rootName,
    type: 'FILE',
    level: -1,
  });
  const nodeById = new Map([[root.id, root]]);
  const nodeByPath = new Map([[root.normalizedPath, root]]);

  for (const row of Array.isArray(rows) ? rows : []) {
    const normalized = normalizeRvmReviewPath(row.key || row.path || row.sourcePath || row.name || '', {
      fileName: options.fileName,
      displayName: row.name,
    });
    addPathToTree(root, nodeById, nodeByPath, normalized, {
      count: Number(row.count || 0),
      primitiveCount: Number(row.primitiveCount || row.count || 0),
      source: row.source || options.source || 'zones',
      rawReviewName: row.rawReviewName || row.key || row.name || '',
      materialId: row.materialId || '',
      type: row.type || 'ZONE',
    });
  }
  finalizeTree(root);
  return { schemaVersion: RVM_HIERARCHY_MODEL_SCHEMA, rootNode: root, nodeById, nodeByPath, objectCount: root.count, builtAt: new Date().toISOString() };
}

export function buildRvmHierarchyModelFromObjects(modelGroup, options = {}) {
  const rootName = cleanPart(options.rootName || modelGroup?.userData?.fileName || 'Loaded RVM model') || 'Loaded RVM model';
  const root = makeNode({ id: 'rvm-root', name: rootName, path: `/${rootName}`, sourcePath: rootName, type: 'FILE', level: -1 });
  const nodeById = new Map([[root.id, root]]);
  const nodeByPath = new Map([[root.normalizedPath, root]]);
  let objectCount = 0;
  modelGroup?.traverse?.((obj) => {
    if (!(obj?.isMesh || obj?.isLine || obj?.isPoints)) return;
    if (obj.userData?.pickable === false) return;
    const renderId = renderIdForObject(obj);
    if (!renderId) return;
    objectCount += 1;
    const data = obj.userData || {};
    const props = data.browserRvmProperties || {};
    const normalized = normalizeRvmReviewPath(data.sourcePath || props.sourcePath || props.SourcePath || data.sourceName || obj.name || '', {
      fileName: options.fileName || rootName,
      displayName: data.displayName || data.sourceName || obj.name,
      ownerPath: data.browserRvmAttributes?.RVM_OWNER_PATH,
      ownerName: data.browserRvmAttributes?.RVM_OWNER_NAME,
    });
    const leaf = addPathToTree(root, nodeById, nodeByPath, normalized, {
      count: 1,
      primitiveCount: obj.isMesh ? 1 : 0,
      source: data.renderSource || 'rendered-object',
      rawReviewName: data.displayName || data.sourceName || obj.name || '',
      materialId: data.browserRvmAttributes?.MATERIAL_ID || '',
      type: objectKind(obj),
      selectableObjectIds: [renderId],
    });
    leaf.selectableObjectIds.add(renderId);
    leaf.objectIds.add(renderId);
  });
  root.count = objectCount;
  rollupObjectIds(root);
  finalizeTree(root);
  return { schemaVersion: RVM_HIERARCHY_MODEL_SCHEMA, rootNode: root, nodeById, nodeByPath, objectCount, builtAt: new Date().toISOString() };
}

export function flattenHierarchyNodes(root, options = {}) {
  const includeRoot = options.includeRoot === true;
  const out = [];
  const visit = (node) => {
    if (includeRoot || node !== root) out.push(node);
    for (const child of node.children || []) visit(child);
  };
  if (root) visit(root);
  return out;
}

export function descendantPathsForNode(node) {
  const paths = [];
  const visit = (cur) => {
    if (!cur) return;
    if (cur.level >= 0) paths.push(cur.path);
    for (const child of cur.children || []) visit(child);
  };
  visit(node);
  return paths;
}

export function topLevelSelectablePaths(root, limit = 3) {
  return (root?.children || []).slice(0, Math.max(0, limit)).map((node) => node.path);
}

export function sortHierarchyChildren(node) {
  node.children.sort((a, b) => {
    const branchA = a.children.length ? 0 : 1;
    const branchB = b.children.length ? 0 : 1;
    return branchA - branchB || String(a.name).localeCompare(String(b.name), undefined, { numeric: true, sensitivity: 'base' });
  });
  for (const child of node.children) sortHierarchyChildren(child);
  return node;
}

function addPathToTree(root, nodeById, nodeByPath, normalized, meta = {}) {
  let current = root;
  let path = '';
  const count = Math.max(0, Number(meta.count || 0));
  const primitiveCount = Math.max(0, Number(meta.primitiveCount || 0));
  root.count += count;
  root.primitiveCount += primitiveCount;
  for (let index = 0; index < normalized.parts.length; index += 1) {
    const part = normalized.parts[index];
    path += `/${part}`;
    const normalizedPath = path.toLowerCase();
    let child = nodeByPath.get(normalizedPath);
    if (!child) {
      child = makeNode({
        id: stableNodeId(normalizedPath),
        name: `/${part}`,
        path,
        sourcePath: normalized.sourcePath || path,
        type: index === normalized.parts.length - 1 ? meta.type || 'NODE' : 'ZONE',
        level: index,
        source: meta.source || '',
        rawReviewName: meta.rawReviewName || '',
        materialId: meta.materialId || '',
      });
      child.parent = current;
      current.children.push(child);
      nodeByPath.set(normalizedPath, child);
      nodeById.set(child.id, child);
    }
    child.count += count;
    child.primitiveCount += primitiveCount;
    if (Array.isArray(meta.selectableObjectIds)) for (const id of meta.selectableObjectIds) child.selectableObjectIds.add(String(id));
    current = child;
  }
  return current;
}

function makeNode(input) {
  const path = input.path || `/${input.name || 'Node'}`;
  return {
    id: input.id || stableNodeId(path.toLowerCase()),
    name: input.name || path.split('/').filter(Boolean).pop() || 'Node',
    path,
    displayPath: path,
    normalizedPath: path.toLowerCase(),
    type: String(input.type || 'NODE').toUpperCase(),
    count: 0,
    primitiveCount: 0,
    childCount: 0,
    selectableObjectIds: new Set(),
    objectIds: new Set(),
    children: [],
    parent: null,
    source: input.source || '',
    sourcePath: input.sourcePath || path,
    rawReviewName: input.rawReviewName || '',
    materialId: input.materialId || '',
    level: Number.isFinite(Number(input.level)) ? Number(input.level) : 0,
  };
}

function finalizeTree(root) {
  sortHierarchyChildren(root);
  const visit = (node) => {
    node.childCount = node.children.length;
    for (const child of node.children) visit(child);
  };
  visit(root);
}

function rollupObjectIds(node) {
  for (const child of node.children) {
    rollupObjectIds(child);
    for (const id of child.objectIds) node.objectIds.add(id);
    for (const id of child.selectableObjectIds) node.selectableObjectIds.add(id);
  }
}

function stripFilePrefixes(parts, fileName) {
  let out = [...parts];
  while (out.length > 1 && (FILE_RE.test(out[0]) || (fileName && out[0].replace(FILE_RE, '') === fileName.replace(FILE_RE, '')) || /^GAS_?\d/i.test(out[0]))) {
    out = out.slice(1);
  }
  return out;
}

function stripTechnicalStructureContainer(parts) {
  if (parts.length > 1 && TECHNICAL_CONTAINER_NAMES.has(parts[0].toUpperCase()) && PLANT_PREFIX_RE.test(parts[1])) return parts.slice(1);
  if (parts.length > 2 && /^GAS_?\d/i.test(parts[0]) && TECHNICAL_CONTAINER_NAMES.has(parts[1].toUpperCase()) && PLANT_PREFIX_RE.test(parts[2])) return [parts[0], ...parts.slice(2)];
  return parts;
}

function objectKind(obj) {
  const data = obj?.userData || {};
  const attrs = data.browserRvmAttributes || data.attributes || {};
  return String(data.type || data.kind || attrs.TYPE || data.effectiveRenderPrimitive || data.renderPrimitive || 'NODE').toUpperCase();
}

function renderIdForObject(obj) {
  return String(obj?.userData?.name || obj?.name || obj?.uuid || '').trim();
}

function cleanPart(value) {
  return String(value || '').replace(/\s+/g, ' ').replace(/^\/+|\/+$/g, '').trim();
}

function stableNodeId(text = '') {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `h:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
