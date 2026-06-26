import assert from 'node:assert/strict';
import { enrichBrowserRvmHierarchyWithAtt } from '../../../rvm/BrowserRvmAttEnricher.js';

const hierarchy = [{
  name: 'RHBG',
  type: 'BRANCH',
  attributes: { TYPE: 'BRANCH' },
  children: [{
    name: 'RVM PIPE 1',
    type: 'PIPE',
    bbox: [0, 0, 0, 100, 10, 10],
    attributes: {
      TYPE: 'PIPE',
      RVM_OWNER_NAME: 'PIPE 1 of ZONE /RHBG-1000-CU-PI-P'
    }
  }, {
    name: 'RVM GASKET 1',
    type: 'GASK',
    bbox: [100, 0, 0, 110, 30, 30],
    attributes: {
      TYPE: 'GASK',
      RVM_OWNER_NAME: 'GASKET 1 of BRANCH 1 of PIPE 1 of ZONE /RHBG-1000-CU-PI-P'
    }
  }]
}];

const attText = `
PROJECT = RHBG
AREA = CU-PI-P

[PIPE 1 of ZONE /RHBG-1000-CU-PI-P]
LINE_NO = 1000-CU-PI-P
SPEC = A1A

GASKET 1 of BRANCH 1 of PIPE 1 of ZONE /RHBG-1000-CU-PI-P | TAG = GSK-001
GASKET 1 of BRANCH 1 of PIPE 1 of ZONE /RHBG-1000-CU-PI-P | RATING = 150
`;

function run() {
  const result = enrichBrowserRvmHierarchyWithAtt(hierarchy, attText);
  assert.equal(result.diagnostics.attAvailable, true);
  assert.equal(result.diagnostics.globalAttributeCount, 2);
  assert.equal(result.diagnostics.ownerCount, 2);
  assert.ok(result.diagnostics.enrichedNodeCount >= 2);

  const pipe = result.hierarchy[0].children[0];
  assert.equal(pipe.attributes.RVM_BROWSER_ATT_ENRICHED, 'true');
  assert.equal(pipe.attributes.ATT_PROJECT, 'RHBG');
  assert.equal(pipe.attributes.ATT_LINE_NO, '1000-CU-PI-P');
  assert.equal(pipe.attributes.ATT_SPEC, 'A1A');

  const gasket = result.hierarchy[0].children[1];
  assert.equal(gasket.attributes.ATT_PROJECT, 'RHBG');
  assert.equal(gasket.attributes.ATT_TAG, 'GSK-001');
  assert.equal(gasket.attributes.ATT_RATING, '150');

  assert.equal(hierarchy[0].children[0].attributes.ATT_LINE_NO, undefined, 'enrichment must not mutate source hierarchy');
  console.log('Browser RVM ATT hierarchy enricher contract test passed');
}

run();
