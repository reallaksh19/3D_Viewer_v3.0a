import assert from 'node:assert/strict';
import * as THREE from 'three';

import { applyGlbSupportSymbols } from '../js/pcf2glb/advanced/applyGlbSupportSymbols.js';
import { buildExportScene } from '../js/pcf2glb/glb/buildExportScene.js';

function support(id, kind, axis = { x: 1, y: 0, z: 0 }, extra = {}) {
  const { component = {}, attributes = {} } = extra;
  return {
    id,
    type: 'SUPPORT',
    bore: component.bore ?? 20,
    coOrds: { x: 0, y: 0, z: 0 },
    ep1: { x: 0, y: 0, z: 0 },
    refNo: id,
    supportKind: kind,
    attributes: {
      COMPONENT_IDENTIFIER: id,
      SUPPORT_TAG: id,
      SUPPORT_KIND: kind,
      CAESAR_SUPPORT_KIND: kind,
      caesarXCosine: String(axis.x),
      caesarYCosine: String(axis.y),
      caesarZCosine: String(axis.z),
      ...attributes,
    },
    raw: {
      caesarSupportKind: kind,
      caesarXCosine: String(axis.x),
      caesarYCosine: String(axis.y),
      caesarZCosine: String(axis.z),
    },
    ...component,
  };
}

function supportObject(component) {
  const scene = buildExportScene({ components: [component] });
  const object = scene.getObjectByName(component.id);
  assert.ok(object, `${component.id} should be present in GLB scene`);
  assert.equal(object.userData.supportKind, component.supportKind);
  assert.equal(object.userData.renderGlyph, 'baked-bm-cii-independent-od-gap-placement-policy');
  assert.ok(object.userData.bmCiiOdTouchRadius > 0, `${component.id} should stamp pipe OD contact radius`);
  assert.ok(Array.isArray(object.userData.odTouchContacts), `${component.id} should stamp contact audit records`);
  assert.ok(object.userData.odTouchContacts.length > 0, `${component.id} should create source-backed support contacts`);
  assert.ok(object.getObjectByName(`${component.id}-bm-cii-od2-gap-policy-${String(component.supportKind).toLowerCase()}`)
    || object.children.some((child) => String(child.name).includes('-bm-cii-od2-gap-policy-')),
    `${component.id} should contain a baked BM_CII source-backed glyph group`);
  return object;
}

function meshNames(object) {
  const names = [];
  object.traverse((child) => {
    if (child.isMesh) names.push(child.name || '');
  });
  return names;
}

function assertContainsName(object, fragment, message) {
  assert.ok(meshNames(object).some((name) => name.includes(fragment)), message || `${object.name} should contain ${fragment}`);
}

const guide = supportObject(support('GUIDE-X', 'GUIDE', { x: 1, y: 0, z: 0 }));
assertContainsName(guide, 'guide-positive-lateral', 'GUIDE should create a positive lateral guide arrow');
assertContainsName(guide, 'guide-negative-lateral', 'GUIDE should create a negative lateral guide arrow');
assert.equal(guide.userData.supportKind, 'GUIDE');
assert.equal(guide.userData.AXIS, 'X');

const guideY = supportObject(support('GUIDE-Y', 'GUIDE', { x: 0, y: 1, z: 0 }));
assertContainsName(guideY, 'guide-positive-lateral', 'GUIDE with vertical source axis should still create lateral guide arrows');
assertContainsName(guideY, 'guide-negative-lateral', 'GUIDE with vertical source axis should still create lateral guide arrows');

const lineStop = supportObject(support('LS-Z', 'LINESTOP', { x: 0, y: 0, z: 1 }));
assertContainsName(lineStop, 'axial-pair-plus', 'LINESTOP should create a positive axial marker');
assertContainsName(lineStop, 'axial-pair-minus', 'LINESTOP should create a negative axial marker');
assert.equal(lineStop.userData.supportKind, 'LINESTOP');
assert.ok(lineStop.userData.odTouchContacts.every((contact) => contact.parallelToPipe === true), 'LINESTOP contacts should be pipe-parallel/axial');

const lineStopX = supportObject(support('LS-X', 'LINESTOP', { x: 1, y: 0, z: 0 }));
assertContainsName(lineStopX, 'axial-pair-plus', 'LINESTOP-X should create a positive axial marker');
assertContainsName(lineStopX, 'axial-pair-minus', 'LINESTOP-X should create a negative axial marker');
assert.equal(lineStopX.userData.supportKind, 'LINESTOP');
assert.ok(lineStopX.userData.odTouchContacts.every((contact) => contact.parallelToPipe === true), 'LINESTOP-X contacts should be pipe-parallel/axial');

const limit = supportObject(support('LIMIT-X', 'LIMIT', { x: -1, y: 0, z: 0 }));
assertContainsName(limit, 'axial-pair-plus', 'LIMIT should create a positive axial marker');
assertContainsName(limit, 'axial-pair-minus', 'LIMIT should create a negative axial marker');
assert.equal(limit.userData.supportKind, 'LIMIT');

const anchor = supportObject(support('ANCHOR', 'ANCHOR'));
assertContainsName(anchor, 'anchor-flat-flow-blocking-plate', 'ANCHOR should create a flat flow-blocking plate');
assert.equal(anchor.userData.supportKind, 'ANCHOR');

const hanger = supportObject(support('HANGER', 'HANGER', { x: 0, y: 1, z: 0 }));
assertContainsName(hanger, 'spring-coil-only', 'HANGER should use the coil-only spring/hanger symbol family');
assert.equal(hanger.userData.supportKind, 'HANGER');

const spring = supportObject(support('SPRING', 'SPRING', { x: 0, y: 1, z: 0 }));
assertContainsName(spring, 'spring-coil-only', 'SPRING should use the coil-only spring/hanger symbol family');
assert.equal(spring.userData.supportKind, 'SPRING');

const rest = supportObject(support('REST-Y', 'REST', { x: 0, y: 1, z: 0 }));
assertContainsName(rest, 'axis-pair-plus', 'REST should create vertical restraint marker geometry');
assert.equal(rest.userData.supportKind, 'REST');

const largeGuide = supportObject(support('GUIDE-LARGE', 'GUIDE', { x: 1, y: 0, z: 0 }, { component: { bore: 300 } }));
assert.ok(largeGuide.userData.bmCiiOdTouchRadius > guide.userData.bmCiiOdTouchRadius);
assertContainsName(largeGuide, 'guide-positive-lateral', 'large GUIDE should keep the lateral guide symbol family');

const runtimeRoot = new THREE.Group();
const runtimeGuide = new THREE.Object3D();
runtimeGuide.name = 'RUNTIME-GUIDE';
runtimeGuide.userData = { supportKind: 'GUIDE', supportAxis: { x: 0, y: 1, z: 0 } };
runtimeRoot.add(runtimeGuide);
const runtimeScene = new THREE.Scene();
runtimeScene.add(runtimeRoot);
const runtimeStats = applyGlbSupportSymbols(runtimeRoot, runtimeScene, { scaleMultiplier: 1 });
assert.equal(runtimeStats.created, 0);
assert.equal(runtimeStats.skipped, true);
assert.match(runtimeStats.reason, /runtime support overlay disabled|source-backed support glyphs/);
assert.equal(runtimeScene.getObjectByName('__GLB_SUPPORT_SYMBOLS_V3__'), undefined);

const fallbackScene = buildExportScene({
  components: [
    support('GUIDE-FALLBACK', 'GUIDE', { x: 1, y: 0, z: 0 }),
    support('LINESTOP-FALLBACK', 'LINESTOP', { x: 0, y: 0, z: 1 }),
    support('REST-FALLBACK', 'REST', { x: 0, y: 1, z: 0 }),
  ],
});
const fallbackRoot = fallbackScene.getObjectByName('PCF_EXPORT_ROOT');
const fallbackStats = applyGlbSupportSymbols(fallbackRoot, fallbackScene, { scaleMultiplier: 1 });
assert.equal(fallbackStats.created, 0);
assert.equal(fallbackStats.skipped, true);

const bakedKinds = new Set();
fallbackRoot.traverse((object) => {
  const renderGlyph = object.userData?.renderGlyph;
  if (renderGlyph === 'baked-bm-cii-independent-od-gap-placement-policy') bakedKinds.add(object.userData.supportKind);
});
assert.deepEqual(new Set(['GUIDE', 'LINESTOP', 'REST']), bakedKinds);

console.log('inputxml-glb-directional-restraints.test.js passed');
