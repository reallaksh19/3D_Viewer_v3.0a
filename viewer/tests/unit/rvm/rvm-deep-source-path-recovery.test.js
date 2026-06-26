import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  recoverRvmDeepSourcePathFromInstruction,
  recoverRvmDeepSourcePathFromObject,
  isWeakRvmSourcePath,
} from '../../../tabs/RvmDeepSourcePathRecoveryBridge.js';

const recovered = recoverRvmDeepSourcePathFromInstruction({
  sourcePath: '/EQUIPMENT',
  displayName: 'GAS_2026Apr26-0828/STRUCTURE /BTRM-1000-CU-CI-01-GRID-EASTINGS/FRMWORK 1/GENSEC 11/RVM RVM_PRIM_CODE_10 316',
}, { fileName: 'GAS_2026Apr26-0828.rvm' });
assert.equal(recovered.displayPath, '/BTRM-1000-CU-CI-01-GRID-EASTINGS/FRMWORK 1/GENSEC 11');
assert.ok(recovered.score > 4);
assert.equal(isWeakRvmSourcePath('/EQUIPMENT'), true);
assert.equal(isWeakRvmSourcePath('/BTRM-1000-CU-PI/PUMP-001'), false);

const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
mesh.name = 'RVM RVM_PRIM_CODE_10 316 GENSEC 11';
mesh.userData = {
  sourcePath: '/STRUCTURE',
  displayName: 'GAS_2026Apr26-0828/STRUCTURE /BTRM-1000-CU-CI/GRID/GENSEC 11',
};
const objRecovered = recoverRvmDeepSourcePathFromObject(mesh, { fileName: 'GAS_2026Apr26-0828.rvm' });
assert.equal(objRecovered.displayPath, '/BTRM-1000-CU-CI/GRID/GENSEC 11');

console.log('rvm-deep-source-path-recovery.test.js passed');
