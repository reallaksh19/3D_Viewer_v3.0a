import assert from 'node:assert/strict';

import {
  SUPPORT_OVERLAY_SOURCE_EXTRACTION_SCHEMA,
  collectNonPrimitiveSupportRecords,
  coordinateFromAttributes,
  explicitSignFromAttributes,
  parseSupportRecordFromSourceNode,
  pipeAxisFromAttributes,
} from '../overlays/support/SupportOverlaySourceExtraction.js';

assert.equal(SUPPORT_OVERLAY_SOURCE_EXTRACTION_SCHEMA, 'support-overlay-source-extraction/v2');

const point = coordinateFromAttributes({ SUPPORT_POSITION: '100, 200, 300' });
assert.equal(point.x, 100);
assert.equal(point.y, 200);
assert.equal(point.z, 300);

const directional = coordinateFromAttributes({ LOCATION: 'E 10 N 20 U 30' });
assert.equal(directional.x, 10);
assert.equal(directional.y, 20);
assert.equal(directional.z, 30);

const split = coordinateFromAttributes({ EASTING: '1', NORTHING: '2', ELEVATION: '3' });
assert.equal(split.x, 1);
assert.equal(split.y, 2);
assert.equal(split.z, 3);

const axis = pipeAxisFromAttributes({ RESTRAINT_AXIS: '0 0 -1' });
assert.equal(axis.x, 0);
assert.equal(axis.y, 0);
assert.equal(axis.z, -1);

assert.equal(explicitSignFromAttributes({ AXIS_SIGN: 'POSITIVE' }, ''), '+');
assert.equal(explicitSignFromAttributes({ RESTRAINT_SIGN: 'NEGATIVE' }, ''), '-');
assert.equal(explicitSignFromAttributes({ DIRECTION_SIGN: 'BOTH' }, ''), '+/-');

const support = parseSupportRecordFromSourceNode({
  type: 'ATTA',
  name: 'Managed support record',
  attributes: {
    SUPPORT_NO: 'PS.X-101',
    SUPPORT_POSITION: { X: '1000', Y: '0', Z: '250' },
    STYP: 'Hold Down',
    RESTRAINT_AXIS: '0 1 0',
    AXIS_SIGN: '+',
    GUIDE_GAP: '10 mm',
    PIPEOD: '273.1',
    BRANCH_NAME: 'B1',
    LINE_NUMBER: '10-CS-001',
  },
});
assert.equal(support.tag, 'PS.X-101');
assert.equal(support.kind, 'HOLDDOWN');
assert.equal(support.explicitSign, '+');
assert.equal(support.gapMm, 10);
assert.equal(support.pipeOdMm, 273.1);
assert.equal(support.branchId, 'B1');
assert.equal(support.lineNo, '10-CS-001');

const managedStage = {
  children: [
    {
      type: 'PIPE',
      attributes: {
        NAME: 'Not a support GUIDE text inside pipe description',
        POSITION: '0 0 0',
      },
    },
  ],
  supports: [
    {
      kind: 'Support',
      attrs: {
        PSNO: 'PS-ANCH-01',
        COORDINATES: [10, 20, 30],
        SUPPORTTYPE: 'Fixed Anchor',
        SIGN: 'both',
      },
    },
    {
      kind: 'Support',
      attrs: {
        SUPPORTREF: 'PS-STOP-01',
        XYZ: '40 50 60',
        SUPPORTTYPE: 'Stopper',
        LINEAXIS: '1 0 0',
      },
    },
  ],
};
const records = collectNonPrimitiveSupportRecords(managedStage);
assert.equal(records.length, 2);
assert.equal(records[0].tag, 'PS-ANCH-01');
assert.equal(records[0].kind, 'LINESTOP');
assert.equal(records[0].explicitSign, '+/-');
assert.equal(records[1].tag, 'PS-STOP-01');
assert.equal(records[1].kind, 'LINESTOP');
assert.equal(records[1].axis.x, 1);

console.log('non-primitive support source extraction tests passed');
