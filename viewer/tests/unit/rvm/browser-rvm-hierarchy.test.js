import assert from 'node:assert/strict';

import { groupRvmOwnerHierarchy } from '../../../rvm/BrowserRvmHierarchyParser.js';
import { collectBrowserRvmRenderInstructions } from '../../../rvm/BrowserRvmRenderContractAdapter.js';

const syntheticPayload = {
  schemaVersion: 'rvm-parser-hierarchy/v1',
  nodes: [
    { id: 'root', name: 'ROOT', type: 'SITE', children: ['zone'] },
    { id: 'zone', name: 'ZONE /RHBG-1000-CU-PI-P', type: 'ZONE', children: ['pipe', 'branch', 'gasket', 'rtorus', 'instrument', 'reducer', 'structure'] },
    { id: 'pipe', name: 'PIPE 1', type: 'PIPE', children: [] },
    { id: 'branch', name: 'BRANCH 1', type: 'BRAN', children: [] },
    { id: 'gasket', name: 'GASKET 1', type: 'GASK', children: ['gasketPrim'] },
    { id: 'gasketPrim', name: 'GASKET PRIM', type: 'PRIM', primitive: { code: 2, bbox: [-10, -10, -2, 10, 10, 2], bodyLength: 92 }, children: [] },
    { id: 'rtorus', name: 'RTORUS 1', type: 'GASK', children: ['rtorusPrim'] },
    { id: 'rtorusPrim', name: 'RTORUS PRIM', type: 'PRIM', primitive: { code: 3, bbox: [-20, -20, -4, 20, 20, 4], bodyLength: 96 }, children: [] },
    { id: 'instrument', name: 'INSTRUMENT 1', type: 'INST', children: ['instrumentPrim'] },
    { id: 'instrumentPrim', name: 'INSTRUMENT PRIM', type: 'PRIM', primitive: { code: 11, bbox: [-5, -5, -5, 5, 5, 5], bodyLength: 708 }, children: [] },
    { id: 'reducer', name: 'REDUCER 1', type: 'REDU', children: ['reducerPrim'] },
    { id: 'reducerPrim', name: 'REDUCER PRIM', type: 'PRIM', primitive: { code: 5, bbox: [-10, -10, 0, 10, 10, 30], bodyLength: 88 }, children: [] },
    { id: 'structure', name: 'STRUCTURE 1', type: 'STRU', children: ['structurePrim'] },
    { id: 'structurePrim', name: 'STRUCTURE PRIM', type: 'PRIM', primitive: { code: 2, bbox: [-30, -30, -3, 30, 30, 3], bodyLength: 92 }, children: [] }
  ],
  diagnostics: { schemaVersion: 'rvm-parser-diagnostics/v1' }
};

const parsed = parseRvmForBrowserHierarchy(syntheticPayload);

assert.equal(parsed.schemaVersion, 'browser-rvm-hierarchy/v2');
assert.equal(parsed.hierarchy.length, 1);
assert.equal(parsed.diagnostics.geometryApproximateCount, 0);
assert.equal(parsed.diagnostics.geometryContractLeafCount, 5);
assert.equal(parsed.diagnostics.geometryContractSourceCounts['bbox-derived-browser-contract'], 5);
assert.equal(parsed.diagnostics.geometryContractCounts.TORUS_BBOX_PLACEHOLDER, 2);
assert.equal(parsed.diagnostics.geometryContractCounts.INSTRUMENT_BBOX_PLACEHOLDER, 1);
assert.equal(parsed.diagnostics.geometryContractCounts.CONE_BBOX_PLACEHOLDER, 1);
assert.equal(parsed.diagnostics.geometryContractCounts.BOX_BBOX, 1);

const root = parsed.hierarchy[0];
assert.equal(root.attributes.BROWSER_RVM_HIERARCHY_GROUPED, 'true');
assert.equal(root.attributes.BROWSER_RVM_HIERARCHY_SCHEMA, 'browser-rvm-hierarchy-wrapper/v6');
assert.equal(root.attributes.BROWSER_RVM_PRIMITIVE_SEMANTICS, 'owner-name-and-rhbg-prim-code-map');
assert.equal(root.attributes.BROWSER_RVM_PRIMITIVE_SEMANTICS_VERSION, 'rhbg-prim-code-map/v2');
assert.equal(root.attributes.BROWSER_RVM_GEOMETRY_QUALITY_VERSION, 'rvm-geometry-quality/v2');
assert.equal(root.attributes.BROWSER_RVM_GEOMETRY_CONTRACT_VERSION, 'rvm-browser-geometry-contract/v1');
assert.ok(findByName(root, 'ZONE /RHBG-1000-CU-PI-P'));
assert.ok(findByName(root, 'PIPE 1'));
assert.ok(findByName(root, 'BRANCH 1'));
assert.ok(findByName(root, 'GASKET 1'));
assert.ok(findByName(root, 'RTORUS 1'));
assert.ok(findByName(root, 'INSTRUMENT 1'));
assert.ok(findByName(root, 'REDUCER 1'));
assert.ok(findByName(root, 'STRUCTURE 1'));

const renderInstructions = collectBrowserRvmRenderInstructions(parsed.hierarchy);
assert.equal(renderInstructions.schemaVersion, 'rvm-browser-render-instructions/v6-rvm-support-runtime-retired');
assert.equal(renderInstructions.count, 5);
assert.equal(renderInstructions.diagnostics.instructionCount, 5);
assert.equal(renderInstructions.diagnostics.contractCounts.TORUS_BBOX_PLACEHOLDER, 2);
assert.equal(renderInstructions.diagnostics.contractCounts.INSTRUMENT_BBOX_PLACEHOLDER, 1);
assert.equal(renderInstructions.diagnostics.contractCounts.CONE_BBOX_PLACEHOLDER, 1);
assert.equal(renderInstructions.diagnostics.contractCounts.BOX_BBOX, 1);
assert.equal(renderInstructions.diagnostics.sourceCounts['bbox-derived-browser-contract'], 5);
assert.equal(renderInstructions.diagnostics.attCounts.plain, 5);
assert.equal(renderInstructions.diagnostics.supportRuntimeRetired, true);
assert.equal(renderInstructions.diagnostics.embeddedInputXmlSupportMarkerSkippedCount, 0);
assert.equal(renderInstructions.diagnostics.embeddedInputXmlSupportMarkerDebugKey, 'rvm.debug.showEmbeddedInputXmlSupportMarkers');
assert.ok(!Object.prototype.hasOwnProperty.call(renderInstructions.diagnostics, 'supportHintCount'), 'retired render contract must not emit support hint counters');

const gasket = findByNameWithChild(root, 'GASKET 1', (child) => child.type === 'GASK');
assert.ok(gasket, 'gasket group should retain GASK primitive leaf');
const rtorus = findByNameWithChild(root, 'RTORUS 1', (child) => child.attributes?.RVM_PRIMITIVE_CODE === '3');
assert.ok(rtorus, 'RTORUS owner group should retain code-3 primitive leaf');
const rtorusLeaf = rtorus.children.find((child) => child.attributes?.RVM_PRIMITIVE_CODE === '3');
assert.ok(rtorusLeaf, 'RTORUS code-3 PRIM should remain under the RTORUS owner group');
assert.equal(rtorusLeaf.type, 'GASK');
assert.equal(rtorusLeaf.attributes.RVM_PRIMITIVE_KIND, 'TORUS');
assert.equal(rtorusLeaf.attributes.RVM_BROWSER_PRIMITIVE_CLASS, 'TORUS');
assert.equal(rtorusLeaf.attributes.RVM_BROWSER_PRIMITIVE_SEMANTIC_SOURCE, 'owner-name');
assert.equal(rtorusLeaf.attributes.RVM_BROWSER_PRIMITIVE_SEMANTIC_VERSION, 'rhbg-prim-code-map/v2');

console.log('Browser RVM hierarchy support-runtime-retired test passed');

function parseRvmForBrowserHierarchy(payload = {}) {
  const nodesById = new Map((payload.nodes || []).map((node) => [node.id, node]));
  const referenced = new Set();
  for (const node of payload.nodes || []) for (const childId of node.children || []) referenced.add(childId);
  const roots = (payload.nodes || [])
    .filter((node) => !referenced.has(node.id))
    .map((rootNode) => syntheticRootWithPrimitiveLeaves(rootNode, nodesById));
  const hierarchy = groupRvmOwnerHierarchy(roots);
  const renderSummary = collectBrowserRvmRenderInstructions(hierarchy);
  return {
    schemaVersion: 'browser-rvm-hierarchy/v2',
    hierarchy,
    diagnostics: {
      ...(payload.diagnostics || {}),
      geometryApproximateCount: countApproximateGeometry(hierarchy),
      geometryContractLeafCount: renderSummary.count,
      geometryContractSourceCounts: renderSummary.diagnostics.sourceCounts,
      geometryContractCounts: renderSummary.diagnostics.contractCounts
    }
  };
}

function syntheticRootWithPrimitiveLeaves(rootNode, nodesById) {
  const primitiveLeaves = [];
  const ownerBranches = [];
  const walk = (node, ownerPath = []) => {
    const nextOwnerPath = node.primitive ? ownerPath : [...ownerPath, node.name];
    if (node.primitive) {
      primitiveLeaves.push(syntheticPrimitiveLeaf(node, ownerPath));
      return;
    }
    if (node !== rootNode) ownerBranches.push(syntheticOwnerBranch(node));
    for (const childId of node.children || []) {
      const child = nodesById.get(childId);
      if (child) walk(child, nextOwnerPath);
    }
  };
  walk(rootNode, []);
  return {
    name: rootNode.name || 'ROOT',
    type: rootNode.type || 'SITE',
    attributes: { TYPE: rootNode.type || 'SITE', NAME: rootNode.name || 'ROOT' },
    children: [...ownerBranches, ...primitiveLeaves]
  };
}

function syntheticOwnerBranch(node) {
  return { name: node.name, type: node.type, attributes: { TYPE: node.type, NAME: node.name }, children: [] };
}

function syntheticPrimitiveLeaf(node, ownerPath) {
  const ownerName = ownerPath.slice().reverse().join(' of ');
  return {
    name: node.name,
    type: node.type,
    bbox: node.primitive.bbox,
    attributes: {
      TYPE: node.type,
      NAME: node.name,
      RVM_RECORD_TAG: 'PRIM',
      RVM_OWNER_NAME: ownerName,
      RVM_PRIMITIVE_CODE: String(node.primitive.code),
      RVM_PRIMITIVE_BODY_LENGTH: String(node.primitive.bodyLength),
      RVM_BYTE_OFFSET: `synthetic:${node.id}`,
      BROWSER_PARSE_METHOD: 'binary-prim-record'
    },
    children: []
  };
}

function countApproximateGeometry(roots) {
  let count = 0;
  const walk = (node) => {
    if (node?.attributes?.RVM_BROWSER_GEOMETRY_APPROXIMATE === 'true') count += 1;
    for (const child of node.children || []) walk(child);
  };
  for (const rootNode of roots) walk(rootNode);
  return count;
}

function findByNameWithChild(node, name, predicate) {
  if (!node) return null;
  if (node.name === name && Array.isArray(node.children) && node.children.some((child) => predicate(child))) return node;
  for (const child of node.children || []) {
    const found = findByNameWithChild(child, name, predicate);
    if (found) return found;
  }
  return null;
}

function findByName(node, name) {
  if (!node) return null;
  if (node.name === name) return node;
  for (const child of node.children || []) {
    const found = findByName(child, name);
    if (found) return found;
  }
  return null;
}
