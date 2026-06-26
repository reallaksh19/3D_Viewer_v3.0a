import assert from 'node:assert/strict';
import { collectBrowserRvmRenderInstructions } from '../../../rvm/BrowserRvmRenderContractAdapter.js';
import {
  BROWSER_RVM_RENDER_SCENE_SCHEMA,
  buildBrowserRvmRenderSceneFromHierarchy
} from '../../../rvm/BrowserRvmRenderSceneBuilder.js';

const hierarchy = [
  {
    name: 'RHBG',
    type: 'BRANCH',
    attributes: { TYPE: 'BRANCH' },
    children: [
      {
        name: 'PIPE 1',
        type: 'BRANCH',
        attributes: { TYPE: 'BRANCH' },
        children: [
          {
            name: 'PRIM 1',
            type: 'PIPE',
            attributes: {
              TYPE: 'PIPE',
              NAME: 'PRIM 1',
              RVM_BROWSER_RENDER_PRIMITIVE: 'CYLINDER_BBOX',
              RVM_BROWSER_RENDER_SOURCE: 'bbox-derived-browser-contract',
              RVM_BROWSER_GEOMETRY_CONTRACT_VERSION: 'rvm-browser-geometry-contract/v1',
              RVM_BROWSER_CENTER: '50,0,0',
              RVM_BROWSER_AXIS_START: '0,0,0',
              RVM_BROWSER_AXIS_END: '100,0,0',
              RVM_BROWSER_LENGTH: '100',
              RVM_BROWSER_RADIUS: '10',
              RVM_BROWSER_DIAMETER: '20',
              RVM_BROWSER_ATT_ENRICHED: 'true',
              RVM_BROWSER_ATT_ENRICHER_SCHEMA: 'browser-rvm-att-enricher/v1',
              RVM_BROWSER_ATT_OWNER_QUERY: 'PIPE 1',
              RVM_BROWSER_ATT_ATTRIBUTE_COUNT: '3',
              LINE: 'P-1001-A',
              SERVICE: 'STEAM',
              SPEC: 'A106B'
            },
            children: []
          }
        ]
      }
    ]
  }
];

const instructionSet = collectBrowserRvmRenderInstructions(hierarchy);
assert.equal(instructionSet.schemaVersion, 'rvm-browser-render-instructions/v6-rvm-support-runtime-retired');
assert.equal(instructionSet.count, 1);
assert.equal(instructionSet.diagnostics.attCounts.enriched, 1);
assert.equal(Object.hasOwn(instructionSet.diagnostics, 'supportHintCount'), false);
const instruction = instructionSet.instructions[0];
assert.equal(instruction.displayName, 'P-1001-A');
assert.equal(instruction.att.enriched, true);
assert.equal(instruction.att.ownerQuery, 'PIPE 1');
assert.equal(instruction.att.attributeCount, 3);
assert.equal(instruction.attAttributes.LINE, 'P-1001-A');
assert.equal(instruction.attAttributes.SERVICE, 'STEAM');
assert.equal(instruction.attAttributes.SPEC, 'A106B');
assert.equal(instruction.attributes.RVM_BROWSER_ATT_ENRICHED, 'true');

const render = buildBrowserRvmRenderSceneFromHierarchy(hierarchy);
assert.equal(render.schemaVersion, BROWSER_RVM_RENDER_SCENE_SCHEMA);
assert.equal(render.diagnostics.attCounts.enriched, 1);
assert.equal(render.diagnostics.renderableCount, 1);
assert.equal(render.bounds.hasBounds, true);
assert.equal(render.scene.userData.bounds.hasBounds, true);
const object = render.scene.children[0];
assert.equal(object.name, 'P-1001-A');
assert.equal(object.userData.displayName, 'P-1001-A');
assert.equal(object.userData.browserRvmAttEnriched, true);
assert.equal(object.userData.browserRvmAtt.ownerQuery, 'PIPE 1');
assert.equal(object.userData.browserRvmAtt.attributeCount, 3);
assert.equal(object.userData.browserRvmAttAttributes.LINE, 'P-1001-A');
assert.equal(object.userData.browserRvmAttAttributes.SERVICE, 'STEAM');
assert.equal(object.userData.browserRvmAttAttributes.SPEC, 'A106B');

console.log('Browser RVM render ATT metadata contract test passed');