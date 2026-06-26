import assert from 'node:assert/strict';
import {
  buildSmartCivilFacetProxyObject,
  classifySmartCivilFacetInstruction,
} from '../../../rvm/BrowserRvmSmartCivilFacetPolicy.js';

const params = {
  decoded: true,
  facetGroup: true,
  kind: 11,
  polygons: [
    { contours: [{ vertices: [0, 0, 0, 3000, 0, 0, 3000, 10, 0, 0, 10, 0] }] },
  ],
};

function instruction(overrides = {}) {
  return {
    renderPrimitive: 'FACET_GROUP_BBOX_PLACEHOLDER',
    sourcePath: '/PLANT/CIVIL/FOUNDATION/SLAB_A',
    displayName: 'SLAB A',
    type: 'STRUCTURE',
    bbox: [0, 0, 0, 3000, 12, 2500],
    attributes: {
      RVM_PRIMITIVE_CODE: '11',
      RVM_TRANSFORM_3X4: JSON.stringify([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
      RVM_NATIVE_PRIMITIVE_PARAMS: JSON.stringify(params),
    },
    ...overrides,
  };
}

const grid = classifySmartCivilFacetInstruction(instruction({
  sourcePath: '/SITE/REFERENCE-GRID/GRID-A1',
  displayName: 'GRID A1',
  bbox: [0, 0, 0, 5000, 5, 5000],
}));
assert.equal(grid?.kind, 'GRID');
assert.equal(grid?.action, 'hidden');
assert.equal(grid?.deferNativeTessellation, true);

const foundation = classifySmartCivilFacetInstruction(instruction({
  sourcePath: '/AREA-01/CIVIL/FOUNDATION/SLAB-001',
  displayName: 'FOUNDATION SLAB 001',
}));
assert.equal(foundation?.kind, 'FOUNDATION');
assert.equal(foundation?.deferNativeTessellation, true);
assert.ok(['hidden', 'wireframe-proxy'].includes(foundation?.action));

const processFacet = classifySmartCivilFacetInstruction(instruction({
  sourcePath: '/AREA-01/PIPING/EQUIPMENT/PIPE-FITTING-FACET',
  displayName: 'PIPE ELBOW FACET BODY',
  type: 'PIPE',
  bbox: [0, 0, 0, 1200, 1200, 1200],
}));
assert.equal(processFacet, null, 'process/piping code-11 facets must not be default-off only because they are large');

const proxy = buildSmartCivilFacetProxyObject(instruction({
  sourcePath: '/AREA-01/CIVIL/PANEL/PANEL-001',
  displayName: 'PANEL 001',
  bbox: [0, 0, 0, 2500, 15, 1200],
}));
assert.ok(proxy, 'civil proxy should be created without tessellating native polygons');
assert.equal(proxy.userData.browserRvmSmartCivilFacetDeferred, true);
assert.equal(proxy.userData.pickable, false);
assert.equal(proxy.userData.selectable, false);

console.log('rvm-smart-civil-facet-policy.test.js passed');
