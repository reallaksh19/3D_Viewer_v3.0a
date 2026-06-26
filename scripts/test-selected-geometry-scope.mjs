import assert from 'assert';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const moduleUrl = pathToFileURL(path.join(__dirname, '../viewer/enrichment/selected-geometry-scope.js')).href;
const {
  buildSelectedGeometryScope,
  collectScopeObjects,
  cloneGeometryObjectForWorkspace,
} = await import(moduleUrl);

const pipeA = {
  id: 'PIPE-A',
  name: 'Pipe A',
  type: 'PIPE',
  visible: true,
  attributes: {
    TYPE: 'PIPE',
    OWNER: '/UNIT/LINE-100',
    FROM_NODE: '10',
    TO_NODE: '20',
    APOS: { x: 0, y: 0, z: 0 },
    LPOS: { x: 1000, y: 0, z: 0 },
    WALL_THICK: '12.7',
  },
};
const pipeB = {
  id: 'PIPE-B',
  name: 'Pipe B',
  type: 'PIPE',
  visible: false,
  attributes: {
    TYPE: 'PIPE',
    OWNER: '/UNIT/LINE-200',
    FROM_NODE: '20',
    TO_NODE: '30',
    APOS: { x: 1000, y: 0, z: 0 },
    LPOS: { x: 2000, y: 0, z: 0 },
  },
};
const supportA = {
  id: 'SUP-A',
  name: 'Support A',
  type: 'ATTA',
  visible: true,
  attributes: {
    TYPE: 'ATTA',
    OWNER: '/UNIT/LINE-100/SUPPORTS',
    APOS: { x: 500, y: -100, z: 0 },
  },
};
const hierarchy = {
  id: 'root',
  children: [
    {
      id: 'node-line-100',
      path: '/UNIT/LINE-100',
      selectableObjectIds: new Set(['PIPE-A', 'SUP-A']),
      children: [],
    },
    {
      id: 'node-line-200',
      path: '/UNIT/LINE-200',
      selectableObjectIds: new Set(['PIPE-B']),
      children: [],
    },
  ],
};

const selected = collectScopeObjects({
  hierarchy: [pipeA, pipeB, supportA],
  selectedIds: ['PIPE-A'],
  visibleIds: [],
  hierarchyNodeId: '',
  scopeMode: 'selected',
});
assert.deepStrictEqual(selected.map((object) => object.id), ['PIPE-A']);

const visible = collectScopeObjects({
  hierarchy: [pipeA, pipeB, supportA],
  selectedIds: [],
  visibleIds: [],
  hierarchyNodeId: '',
  scopeMode: 'visible',
});
assert.deepStrictEqual(visible.map((object) => object.id).sort(), ['PIPE-A', 'SUP-A']);

const hierarchyScope = collectScopeObjects({
  hierarchy,
  sourceObjects: [pipeA, pipeB, supportA],
  selectedIds: [],
  visibleIds: [],
  hierarchyNodeId: 'node-line-100',
  scopeMode: 'hierarchy',
});
assert.deepStrictEqual(hierarchyScope.map((object) => object.id).sort(), ['PIPE-A', 'SUP-A']);

const snapshot = cloneGeometryObjectForWorkspace(pipeA);
assert.strictEqual(snapshot.id, 'PIPE-A');
assert.strictEqual(snapshot.sourceAttributes.WALL_THICK, '12.7');
assert.strictEqual(snapshot.fromNode, '10');
assert.strictEqual(snapshot.toNode, '20');
assert.deepStrictEqual(snapshot.apos, { x: 0, y: 0, z: 0 });
assert.deepStrictEqual(snapshot.lpos, { x: 1000, y: 0, z: 0 });
assert.deepStrictEqual(snapshot.attributes, {});
assert.strictEqual(pipeA.attributes.enrichment, undefined);

const scope = buildSelectedGeometryScope({
  hierarchy: [pipeA, pipeB, supportA],
  selectedIds: ['PIPE-A', 'SUP-A'],
  visibleIds: [],
  hierarchyNodeId: '',
  scopeMode: 'selected',
  axisTransform: { verticalAxis: 'Z', northAxis: 'Y', handedness: 'right' },
});
assert.strictEqual(scope.schema, 'selected-geometry-scope/v1');
assert.strictEqual(scope.stats.objects, 2);
assert.strictEqual(scope.stats.pipes, 1);
assert.strictEqual(scope.stats.supports, 1);
assert.strictEqual(scope.axisTransform.verticalAxis, 'Z');
assert.ok(Object.isFrozen(scope.objects[0]));
assert.strictEqual(pipeA.attributes.enrichment, undefined);

console.log('selected geometry scope tests passed');
