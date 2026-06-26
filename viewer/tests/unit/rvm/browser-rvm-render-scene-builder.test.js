import assert from 'node:assert/strict';
import {
  BROWSER_RVM_RENDER_SCENE_SCHEMA,
  buildBrowserRvmRenderSceneFromInstructions
} from '../../../rvm/BrowserRvmRenderSceneBuilder.js';
import { buildResponsiveBrowserRvmRenderSceneFromInstructions } from '../../../rvm/BrowserRvmResponsiveRenderSceneBuilder.js';

const base = {
  schemaVersion: 'rvm-browser-render-instructions/v2',
  renderSource: 'bbox-derived-browser-contract',
  contractVersion: 'rvm-browser-geometry-contract/v1',
  axisStart: { x: 0, y: 0, z: 0 },
  axisEnd: { x: 100, y: 0, z: 0 },
  length: 100,
  radius: 10,
  diameter: 20
};

const instructions = [
  {
    ...base,
    sourcePath: 'ROOT/PIPE 1/PRIM 1',
    sourceName: 'PRIM 1',
    displayName: 'PIPE-10-A',
    type: 'PIPE',
    kind: 'CYLINDER',
    renderPrimitive: 'CYLINDER_BBOX',
    center: { x: 50, y: 0, z: 0 },
    attributes: { TYPE: 'PIPE', RVM_BROWSER_ATT_ENRICHED: 'true', RVM_BROWSER_ATT_OWNER_QUERY: 'PIPE 1', LINE: 'PIPE-10-A', SERVICE: 'STEAM' },
    att: { enriched: true, schemaVersion: 'browser-rvm-att-enricher/v1', ownerQuery: 'PIPE 1', attributeCount: 2 },
    attAttributes: { LINE: 'PIPE-10-A', SERVICE: 'STEAM' }
  },
  { ...base, sourcePath: 'ROOT/RTORUS 1/PRIM 2', sourceName: 'PRIM 2', type: 'GASK', kind: 'TORUS', renderPrimitive: 'TORUS_BBOX_PLACEHOLDER', center: { x: 200, y: 0, z: 0 } },
  { ...base, sourcePath: 'ROOT/REDUCER 1/PRIM 3', sourceName: 'PRIM 3', type: 'REDUCER', kind: 'CONE', renderPrimitive: 'CONE_BBOX_PLACEHOLDER', center: { x: 350, y: 0, z: 0 } },
  { ...base, sourcePath: 'ROOT/STRUCTURE 1/PRIM 4', sourceName: 'PRIM 4', type: 'STRUCTURE', kind: 'STRUCTURE', renderPrimitive: 'BOX_BBOX', center: { x: 500, y: 0, z: 0 }, axisStart: { x: 450, y: 0, z: 0 }, axisEnd: { x: 550, y: 0, z: 0 }, bbox: '450,-10,-10,550,10,10' },
  { ...base, sourcePath: 'ROOT/ELBOW 1/PRIM 5', sourceName: 'PRIM 5', type: 'ELBOW', kind: 'ELBOW', renderPrimitive: 'ELBOW_BBOX_PLACEHOLDER', center: { x: 650, y: 0, z: 0 } },
  { ...base, sourcePath: 'ROOT/TEE 1/PRIM 6', sourceName: 'PRIM 6', type: 'TEE', kind: 'TEE', renderPrimitive: 'TEE_BBOX_PLACEHOLDER', center: { x: 800, y: 0, z: 0 } },
  { ...base, sourcePath: 'ROOT/FLANGE 1/PRIM 7', sourceName: 'PRIM 7', type: 'FLANGE', kind: 'FLANGE', renderPrimitive: 'FLANGE_BBOX_PLACEHOLDER', center: { x: 950, y: 0, z: 0 } },
  { ...base, sourcePath: 'ROOT/SUPPORT 1/PRIM 8', sourceName: 'PRIM 8', type: 'SUPPORT', kind: 'SUPPORT', renderPrimitive: 'SUPPORT_BBOX_PLACEHOLDER', center: { x: 1100, y: 0, z: 0 } },
  { ...base, sourcePath: 'ROOT/BAD 1/PRIM 9', sourceName: 'PRIM 9', type: 'UNKNOWN', kind: 'UNKNOWN', renderPrimitive: 'UNKNOWN_BBOX_PLACEHOLDER', center: null, axisStart: null, axisEnd: null, length: null, radius: null, diameter: null }
];

const result = buildBrowserRvmRenderSceneFromInstructions(instructions);
assert.equal(result.schemaVersion, BROWSER_RVM_RENDER_SCENE_SCHEMA);
assert.equal(result.scene.userData.schemaVersion, BROWSER_RVM_RENDER_SCENE_SCHEMA);
assert.equal(result.scene.userData.renderOptions.renderMode, 'all');
assert.equal(result.diagnostics.instructionCount, 9);
assert.equal(result.diagnostics.renderableCount, 8);
assert.equal(result.diagnostics.skippedCount, 1);
assert.equal(result.diagnostics.primitiveCounts.CYLINDER_BBOX, 1);
assert.equal(result.diagnostics.primitiveCounts.TORUS_BBOX_PLACEHOLDER, 1);
assert.equal(result.diagnostics.primitiveCounts.CONE_BBOX_PLACEHOLDER, 1);
assert.equal(result.diagnostics.primitiveCounts.BOX_BBOX, 1);
assert.equal(result.diagnostics.primitiveCounts.ELBOW_BBOX_PLACEHOLDER, 1);
assert.equal(result.diagnostics.primitiveCounts.TEE_BBOX_PLACEHOLDER, 1);
assert.equal(result.diagnostics.primitiveCounts.FLANGE_BBOX_PLACEHOLDER, 1);
assert.equal(result.diagnostics.primitiveCounts.SUPPORT_BBOX_PLACEHOLDER, 1);
assert.equal(result.diagnostics.effectivePrimitiveCounts.PIPE_CYLINDER, 1);
assert.equal(result.diagnostics.effectivePrimitiveCounts.TORUS_RING, 1);
assert.equal(result.diagnostics.effectivePrimitiveCounts.CONE_FRUSTUM, 1);
assert.equal(result.diagnostics.effectivePrimitiveCounts.BOX_SOLID, 1);
assert.equal(result.diagnostics.effectivePrimitiveCounts.ELBOW_TORUS_ARC, 1);
assert.equal(result.diagnostics.effectivePrimitiveCounts.TEE_COMPOSITE, 1);
assert.equal(result.diagnostics.effectivePrimitiveCounts.FLANGE_DISC, 1);
assert.equal(result.diagnostics.effectivePrimitiveCounts.SUPPORT_STAND, 1);
assert.equal(result.diagnostics.renderQualityCounts['bbox-derived-geometry'], 2);
assert.equal(result.diagnostics.renderQualityCounts['bbox-promoted-geometry'], 6);
assert.equal(result.diagnostics.skippedReasons['missing-position'], 1);
assert.equal(result.diagnostics.attCounts.enriched, 1);
assert.equal(result.diagnostics.attCounts.plain, 7);
assert.equal(result.bounds.hasBounds, true);
assert.equal(result.scene.userData.bounds.hasBounds, true);
assert.ok(result.diagnostics.performance.meshObjectCount >= 8);
assert.ok(result.diagnostics.performance.geometryCacheSize > 0);
assert.ok(result.diagnostics.performance.materialCacheSize > 0);
assert.ok(result.diagnostics.performance.estimatedGeometryBytes > 0);

const byRaw = (raw) => result.scene.children.find((child) => child.userData.renderPrimitive === raw);
const pipe = byRaw('CYLINDER_BBOX');
assert.ok(pipe?.geometry?.type?.includes('Cylinder'));
assert.equal(pipe.name, 'PIPE-10-A');
assert.equal(pipe.userData.effectiveRenderPrimitive, 'PIPE_CYLINDER');
assert.equal(pipe.userData.renderQuality, 'bbox-derived-geometry');
assert.equal(pipe.userData.pickable, true);
assert.equal(pipe.userData.browserRvmProperties.attAttributes.LINE, 'PIPE-10-A');
assert.equal(pipe.userData.browserRvmAttAttributes.SERVICE, 'STEAM');

const torus = byRaw('TORUS_BBOX_PLACEHOLDER');
assert.ok(torus?.geometry?.type?.includes('Torus'));
assert.equal(torus.userData.effectiveRenderPrimitive, 'TORUS_RING');
assert.equal(torus.userData.renderQuality, 'bbox-promoted-geometry');

const cone = byRaw('CONE_BBOX_PLACEHOLDER');
assert.ok(cone?.geometry?.type?.includes('Cylinder'));
assert.equal(cone.userData.effectiveRenderPrimitive, 'CONE_FRUSTUM');

const box = byRaw('BOX_BBOX');
assert.ok(box?.geometry?.type?.includes('Box'));
assert.equal(box.userData.type, 'STRUCTURE');
assert.equal(box.userData.effectiveRenderPrimitive, 'BOX_SOLID');

const elbow = byRaw('ELBOW_BBOX_PLACEHOLDER');
assert.ok(elbow?.isGroup);
assert.equal(elbow.userData.effectiveRenderPrimitive, 'ELBOW_TORUS_ARC');
assert.ok(elbow.children.some((child) => child.geometry?.type?.includes('Torus')));

const tee = byRaw('TEE_BBOX_PLACEHOLDER');
assert.ok(tee?.isGroup);
assert.equal(tee.userData.effectiveRenderPrimitive, 'TEE_COMPOSITE');
assert.ok(tee.children.filter((child) => child.geometry?.type?.includes('Cylinder')).length >= 2);

const flange = byRaw('FLANGE_BBOX_PLACEHOLDER');
assert.ok(flange?.geometry?.type?.includes('Cylinder'));
assert.equal(flange.userData.effectiveRenderPrimitive, 'FLANGE_DISC');

const support = byRaw('SUPPORT_BBOX_PLACEHOLDER');
assert.ok(support?.isGroup);
assert.equal(support.userData.effectiveRenderPrimitive, 'SUPPORT_STAND');
assert.ok(support.children.some((child) => child.geometry?.type?.includes('Box')));

const exactOnly = buildBrowserRvmRenderSceneFromInstructions(instructions, { renderMode: 'exact', showUnknown: false });
assert.equal(exactOnly.diagnostics.renderOptions.renderMode, 'exact');
assert.equal(exactOnly.diagnostics.renderableCount, 8);
assert.equal(exactOnly.diagnostics.skippedReasons['hidden-by-render-toggle'], 1);

const placeholderOnly = buildBrowserRvmRenderSceneFromInstructions(instructions, { renderMode: 'placeholder' });
assert.equal(placeholderOnly.diagnostics.renderOptions.renderMode, 'placeholder');
assert.equal(placeholderOnly.diagnostics.renderableCount, 0);
assert.ok(placeholderOnly.diagnostics.skippedCount >= 9);

const emptyResult = buildBrowserRvmRenderSceneFromInstructions([{ renderPrimitive: 'UNKNOWN_BBOX_PLACEHOLDER', center: null, axisStart: null, axisEnd: null }]);
assert.equal(emptyResult.diagnostics.renderableCount, 0);
assert.equal(emptyResult.bounds.hasBounds, false);
assert.equal(emptyResult.scene.userData.bounds.hasBounds, false);

let yieldCount = 0;
const responsive = await buildResponsiveBrowserRvmRenderSceneFromInstructions(instructions, {
  maxRenderableObjects: 3,
  batchSize: 2,
  timeSliceMs: 0,
  yieldFn: async () => { yieldCount += 1; }
});
assert.equal(responsive.schemaVersion, BROWSER_RVM_RENDER_SCENE_SCHEMA);
assert.equal(responsive.scene.userData.responsiveBuilder, true);
assert.equal(responsive.diagnostics.responsiveBuilder, true);
assert.equal(responsive.diagnostics.renderableCount, 3);
assert.equal(responsive.diagnostics.skippedReasons['render-budget-limit'], 6);
assert.equal(responsive.diagnostics.performance.responsiveBuilder, true);
assert.equal(responsive.diagnostics.performance.renderBudgetSkipped, 6);
assert.ok(yieldCount >= 1);
assert.equal(responsive.bounds.hasBounds, true);
assert.equal(responsive.scene.children.length, 3);

console.log('Browser RVM render scene builder test passed');
