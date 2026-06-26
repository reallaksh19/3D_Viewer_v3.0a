import assert from 'node:assert/strict';

import {
  SUPPORT_OVERLAY_SOURCE_EXTRACTION_SCHEMA,
  collectNonPrimitiveSupportRecords,
  coordinateFromAttributes,
  parseSupportRecordFromSourceNode,
  pipeAxisFromAttributes,
} from '../overlays/support/SupportOverlaySourceExtraction.js';

assert.equal(SUPPORT_OVERLAY_SOURCE_EXTRACTION_SCHEMA, 'support-overlay-source-extraction/v2');

const topLevelRecord = parseSupportRecordFromSourceNode({
  type: 'ATTA',
  supportNo: 'PS-TOP-001',
  supportPosition: { easting: '100', northing: '200', elevation: '300' },
  supportType: 'Guide',
  pipeAxis: '1 0 0',
  guideGap: '12 mm',
  pipeOd: '323.9',
  branchName: '/ASIM-1885-PL-10/B2',
  lineNumber: '10-CS-S8810105-01',
});
assert.equal(topLevelRecord.tag, 'PS-TOP-001');
assert.equal(topLevelRecord.kind, 'GUIDE');
assert.equal(topLevelRecord.local.x, 100);
assert.equal(topLevelRecord.local.y, 200);
assert.equal(topLevelRecord.local.z, 300);
assert.equal(topLevelRecord.axis.x, 1);
assert.equal(topLevelRecord.gapMm, 12);
assert.equal(topLevelRecord.pipeOdMm, 323.9);
assert.equal(topLevelRecord.branchId, '/ASIM-1885-PL-10/B2');
assert.equal(topLevelRecord.lineNo, '10-CS-S8810105-01');

const managedStage = {
  data: {
    branches: [
      {
        branchName: '/ASIM-1885-PL-10/B2',
        supportRecords: [
          {
            componentType: 'ATTA',
            properties: {
              CMPSUPREFN: 'PS-GDE-16990',
              CMPSUPTYPE: 'GUIDE',
              SUPPORT_POSITION: 'E 16990 N 0 U 1200',
              RESTRAINT_AXIS: '1 0 0',
              GUIDE_GAP: '10 mm',
              CMPOD: '273.1',
              BRANCH_NAME: '/ASIM-1885-PL-10/B2',
              LINE_NUMBER: '10-CS-S8810105-01',
            },
          },
          {
            kind: 'ANCI',
            support: {
              supportRef: 'PS-LIM-17010',
              restraintType: 'LIM',
              point: [17010, 0, 1200],
              lineAxis: '1 0 0',
              axialRestraint: 'negative',
              pipeOdMm: 273.1,
            },
          },
        ],
      },
    ],
  },
};

const managedRecords = collectNonPrimitiveSupportRecords(managedStage);
assert.equal(managedRecords.length, 2);
assert.deepEqual(managedRecords.map((record) => record.tag), ['PS-GDE-16990', 'PS-LIM-17010']);
assert.equal(managedRecords[0].kind, 'GUIDE');
assert.equal(managedRecords[0].gapMm, 10);
assert.equal(managedRecords[0].pipeOdMm, 273.1);
assert.equal(managedRecords[1].kind, 'LIM');
assert.equal(managedRecords[1].explicitSign, '-');
assert.equal(managedRecords[1].axis.x, 1);

const tableLikeExport = {
  payload: {
    rows: [
      {
        TYPE: 'SUPPORT',
        PS_No: 'PS-HD-01',
        Family: 'Hold Down',
        X: '10',
        Y: '20',
        Z: '30',
        DirectionVector: { X: 0, Y: 1, Z: 0 },
        DirectionSign: 'both',
        SingleAxis: 'false',
      },
      {
        TYPE: 'PIPE',
        NAME: 'PIPE DESCRIPTION CONTAINS GUIDE BUT MUST NOT BE SUPPORT',
        POSITION: '0 0 0',
      },
      {
        TYPE: 'SUPPORT',
        SupportTag: 'PS-SPR-01',
        SupportType: 'Can Spring',
        Location: { E: 40, N: 50, U: 60 },
      },
    ],
  },
};

const tableRecords = collectNonPrimitiveSupportRecords(tableLikeExport);
assert.equal(tableRecords.length, 2);
assert.equal(tableRecords[0].tag, 'PS-HD-01');
assert.equal(tableRecords[0].kind, 'HOLDDOWN');
assert.equal(tableRecords[0].explicitSign, '+/-');
assert.equal(tableRecords[0].singleAxis, false);
assert.equal(tableRecords[1].tag, 'PS-SPR-01');
assert.equal(tableRecords[1].kind, 'SPRING_CAN');
assert.equal(tableRecords[1].local.z, 60);

const axisFromSpan = pipeAxisFromAttributes({
  startPos: { x: 0, y: 0, z: 0 },
  endPos: { x: 0, y: 0, z: 1000 },
});
assert.equal(axisFromSpan.z, 1);

const contactPoint = coordinateFromAttributes({
  contactPoint: { x: '1', y: '2', z: '3' },
});
assert.equal(contactPoint.x, 1);
assert.equal(contactPoint.y, 2);
assert.equal(contactPoint.z, 3);

console.log('non-primitive managed-stage support fixture tests passed');
