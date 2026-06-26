import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  BROWSER_RVM_TORUS_PARITY_SCHEMA,
  upgradeRvmTorusParity,
} from '../../../rvm/BrowserRvmTorusParityRuntimePatch.js';

function makeNativeTorusAttributes(kind = 4) {
  const params = kind === 4
    ? {
        decoded: true,
        kind: 4,
        kindName: 'Circular Torus',
        offset: 40,
        radius: 6,
        angle: Math.PI / 2,
      }
    : {
        decoded: true,
        kind: 3,
        kindName: 'Rectangular Torus',
        innerRadius: 26,
        outerRadius: 40,
        height: 8,
        angle: Math.PI / 2,
      };
  return {
    RVM_PRIMITIVE_CODE: String(kind),
    RVM_PRIMITIVE_KIND_NAME: params.kindName,
    RVM_NATIVE_PRIMITIVE_PARAMS: JSON.stringify(params),
    RVM_TRANSFORM_3X4: JSON.stringify([1, 0, 0, 0, 1, 0, 0, 0, 1, 100, 200, 300]),
  };
}

function makeLinePlaceholder(kind = 4) {
  const box = new THREE.BoxGeometry(10, 10, 10);
  const edges = new THREE.EdgesGeometry(box);
  const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x3d74c5 }));
  line.name = 'ELBOW-PRIM-LINE-PLACEHOLDER';
  line.userData = {
    sourcePath: '/BTRM-1000-CU-PI/ELBOW-001/PRIM',
    displayName: 'ELBOW-001',
    renderPrimitive: 'GENERIC_BBOX_PLACEHOLDER',
    effectiveRenderPrimitive: 'GENERIC_BBOX_PLACEHOLDER',
    renderQuality: 'placeholder-wireframe-diagnostic',
    browserRvmBboxPlaceholderWireframe: true,
    pickable: true,
    browserRvmAttributes: makeNativeTorusAttributes(kind),
  };
  return line;
}

const root = new THREE.Group();
const linePlaceholder = makeLinePlaceholder(4);
root.add(linePlaceholder);

const diagnostics = upgradeRvmTorusParity(root);
assert.equal(diagnostics.schemaVersion, BROWSER_RVM_TORUS_PARITY_SCHEMA);
assert.equal(diagnostics.candidateCount, 1);
assert.equal(diagnostics.linePlaceholderCandidateCount, 1);
assert.equal(diagnostics.upgradedCount, 1);
assert.equal(diagnostics.circularTorusTessellatedCount, 1);
assert.equal(diagnostics.carrierTypeCounts['line-segments'], 1);

assert.equal(root.children.length, 1);
const replacement = root.children[0];
assert.equal(replacement.isMesh, true);
assert.equal(replacement.name, 'ELBOW-PRIM-LINE-PLACEHOLDER');
assert.equal(replacement.userData.sourcePath, '/BTRM-1000-CU-PI/ELBOW-001/PRIM');
assert.equal(replacement.userData.effectiveRenderPrimitive, 'RVM_NATIVE_CIRCULAR_TORUS_CAPPED');
assert.equal(replacement.userData.browserRvmTorusParityCode, '4');
assert.equal(replacement.userData.browserRvmTorusCarrierType, 'line-segments');
assert.equal(replacement.userData.pickable, true);
assert.equal(replacement.userData.selectable, true);
assert.ok(replacement.geometry?.attributes?.position?.count > 0);
assert.ok(replacement.geometry?.index?.count > 0);

console.log('Browser RVM torus parity line-placeholder test passed');
