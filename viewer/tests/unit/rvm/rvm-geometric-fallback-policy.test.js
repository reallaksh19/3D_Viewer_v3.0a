import assert from 'node:assert/strict';
import * as THREE from 'three';
import { runBrowserRvmGeometricFallbackPolicy } from '../../../rvm/BrowserRvmGeometricFallbackPolicyBridge.js';

const root = new THREE.Group();
const hugeAnonymousBox = new THREE.Mesh(new THREE.BoxGeometry(3200, 900, 1400), new THREE.MeshBasicMaterial());
hugeAnonymousBox.name = 'BOX_SOLID';
hugeAnonymousBox.userData = {
  effectiveRenderPrimitive: 'BOX_SOLID',
  sourcePath: '/EQUIPMENT',
};
root.add(hugeAnonymousBox);

const processBox = new THREE.Mesh(new THREE.BoxGeometry(1200, 1200, 1200), new THREE.MeshBasicMaterial());
processBox.name = 'PUMP EQUIPMENT BODY';
processBox.userData = {
  effectiveRenderPrimitive: 'BOX_SOLID',
  sourcePath: '/BTRM-1000-CU-PI/PUMP-001',
  displayName: 'PUMP EQUIPMENT BODY',
};
root.add(processBox);

const civilBox = new THREE.Mesh(new THREE.BoxGeometry(2200, 40, 1800), new THREE.MeshBasicMaterial());
civilBox.name = 'FOUNDATION SLAB';
civilBox.userData = {
  effectiveRenderPrimitive: 'BOX_SOLID',
  sourcePath: '/BTRM-1000-CU-CI/FDNS/SLAB-001',
  displayName: 'FOUNDATION SLAB',
};
root.add(civilBox);

const diagnostics = runBrowserRvmGeometricFallbackPolicy(root);
assert.equal(hugeAnonymousBox.visible, false, 'huge anonymous shallow bucket boxes should be hidden diagnostics');
assert.equal(hugeAnonymousBox.userData.pickable, false);
assert.equal(processBox.visible, true, 'process/equipment box with real path should remain visible');
assert.equal(processBox.userData.browserRvmGeometricFallbackPolicy, undefined);
assert.equal(civilBox.visible, true, 'civil box should remain visible as wireframe diagnostic, not opaque solid');
assert.equal(civilBox.userData.pickable, false);
assert.equal(civilBox.material.wireframe, true);
assert.ok(diagnostics.policyCount >= 2);

console.log('rvm-geometric-fallback-policy.test.js passed');
