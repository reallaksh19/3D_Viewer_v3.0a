import { strict as assert } from 'node:assert';

import { buildRvmRenderedObjectInventory, classifyRvmObjectCategory } from '../rvm/RvmRenderedObjectInventory.js';
import { buildRvmDtxrGeometryCoverageReport } from '../rvm/RvmDtxrGeometryCoverageEngine.js';

function rootWith(objects) {
  return {
    traverse(callback) {
      callback(this);
      for (const object of objects) callback(object);
    },
  };
}

function mesh(name, userData = {}, extra = {}) {
  return {
    isMesh: true,
    isLine: false,
    isLineSegments: false,
    isPoints: false,
    name,
    uuid: `${name}-uuid`,
    visible: extra.visible !== false,
    userData,
  };
}

const objects = [
  mesh('PIPE-001', {
    renderKind: 'PIPE_CYLINDER',
    primitiveCode: '8',
    sourcePath: '/BTRM-1000-CU-PI/PIPE-001',
    canonicalId: 'pipe-001',
    reviewName: 'PIPE-001',
    pickable: true,
    selectable: true,
  }),
  mesh('ELBOW-001', {
    renderKind: 'RVM_NATIVE_CIRCULAR_TORUS_CAPPED',
    primitiveCode: '4',
    sourcePath: '/BTRM-1000-CU-PI/ELBOW-001',
    canonicalId: 'elbow-001',
    reviewName: 'ELBOW-001',
    pickable: true,
    selectable: true,
  }),
  mesh('TEE-001', {
    renderKind: 'GENERIC_BBOX_PLACEHOLDER',
    sourcePath: '/BTRM-1000-CU-PI/TEE-001',
    canonicalId: 'tee-001',
    reviewName: 'TEE-001',
    fallbackReason: 'native-tee-not-decoded',
    geometryPolicy: 'wireframe-diagnostic-not-solid-geometry',
    pickable: false,
    selectable: false,
    nonSelectableReason: 'bbox-placeholder-diagnostic-wireframe',
  }),
  mesh('PS-001', {
    renderKind: 'SUPPORT_SYMBOL',
    sourcePath: '/BTRM-1000-CU-SU/PS-001',
    canonicalId: 'support-001',
    reviewName: 'PS.001 GUIDE',
    DTXR_PS: 'PS.001 GUIDE GAP=10',
    pickable: true,
    selectable: true,
  }),
];

const inventory = buildRvmRenderedObjectInventory(rootWith(objects));

assert.equal(classifyRvmObjectCategory({ primitiveCode: '8', renderKind: 'RVM_NATIVE_CYLINDER' }), 'PIPE');
assert.equal(classifyRvmObjectCategory({ primitiveCode: '4', renderKind: 'RVM_NATIVE_CIRCULAR_TORUS_CAPPED' }), 'ELBOW');
assert.equal(classifyRvmObjectCategory({ reviewName: 'PS.001 GUIDE', dtxrPs: 'PS.001 GUIDE' }), 'SUPPORT');
assert.equal(inventory.counts.renderable, 4, 'inventory scans rendered objects');
assert.equal(inventory.byCategory.PIPE, 1, 'inventory classifies pipes');
assert.equal(inventory.byCategory.ELBOW, 1, 'inventory classifies elbows');
assert.equal(inventory.byCategory.TEE, 1, 'inventory classifies tee fallback placeholders');
assert.equal(inventory.byCategory.SUPPORT, 1, 'inventory classifies supports');
assert.equal(inventory.counts.fallback, 1, 'inventory counts fallback-only geometry');
assert.equal(inventory.counts.nonSelectable, 1, 'inventory counts non-pickable visible geometry');
assert.ok(inventory.byFailureReason.FALLBACK_ONLY >= 1, 'inventory records fallback failure reason');
assert.ok(inventory.byFailureReason['bbox-placeholder-diagnostic-wireframe'] >= 1, 'inventory records non-selectable reason');

const expectedRecords = [
  { canonicalId: 'pipe-001', reviewName: 'PIPE-001', primitiveCode: '8', sourcePath: '/BTRM-1000-CU-PI/PIPE-001' },
  { canonicalId: 'elbow-001', reviewName: 'ELBOW-001', primitiveCode: '4', sourcePath: '/BTRM-1000-CU-PI/ELBOW-001' },
  { canonicalId: 'tee-001', reviewName: 'TEE-001', sourcePath: '/BTRM-1000-CU-PI/TEE-001' },
  { canonicalId: 'support-001', reviewName: 'PS.001 GUIDE', DTXR_PS: 'PS.001 GUIDE GAP=10' },
  { canonicalId: 'valve-missing', reviewName: 'VALVE-001', sourcePath: '/BTRM-1000-CU-PI/VALVE-001' },
];

const report = buildRvmDtxrGeometryCoverageReport({ inventory, expectedRecords, fileKey: 'unit-rvm' });

assert.equal(report.schema, 'rvm-dtxr-geometry-coverage/v1', 'coverage report exposes schema marker');
assert.equal(report.summary.rendered, 4, 'coverage report counts rendered objects');
assert.equal(report.summary.expected, 5, 'coverage report counts expected DTXR/staged records');
assert.equal(report.categories.PIPE.missing, 0, 'pipe expected record is matched');
assert.equal(report.categories.ELBOW.missing, 0, 'elbow expected record is matched');
assert.equal(report.categories.TEE.fallbackMatched, 1, 'tee fallback-only render is detected');
assert.equal(report.categories.VALVE.missing, 1, 'missing valve expected record is reported');
assert.ok(report.issues.some((issue) => issue.code === 'VALVE_MISSING_RENDER'), 'missing component issue is emitted');
assert.ok(report.issues.some((issue) => issue.code === 'TEE_NON_PICKABLE'), 'non-pickable fallback issue is emitted');

console.log('PASS: RVM DTXR geometry coverage inventory and report');
