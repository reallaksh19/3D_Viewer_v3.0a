import assert from 'node:assert/strict';

import {
  collectSourcePipeSegments,
  resolveSupportPipeAxis,
} from '../overlays/support/SupportOverlayCoordinateMapper.js';

function roundVec(value) {
  return {
    x: Math.round(value.x * 1000) / 1000,
    y: Math.round(value.y * 1000) / 1000,
    z: Math.round(value.z * 1000) / 1000,
  };
}

const managedStageSource = {
  data: {
    branches: [
      {
        kind: 'BRANCH',
        properties: {
          branchName: '/ASIM-1885-PL-10/B2',
          lineNumber: '10-CS-S8810105-01',
        },
        elements: [
          {
            componentType: 'PIPE',
            properties: {
              pipeId: 'P-PROP-X',
              startPos: '16980 0 1200',
              endPos: '17080 0 1200',
              fromNode: 'N-16980',
              toNode: 'N-17080',
            },
          },
          {
            type: 'SUPPORT',
            properties: {
              id: 'PS-NOT-PIPE',
              startPos: '0 0 0',
              endPos: '100 0 0',
            },
          },
          {
            componentType: 'PIPE',
            data: {
              name: 'P-PROP-Z',
              fromPoint: { x: 17080, y: 0, z: 1200 },
              toPoint: { x: 17080, y: 0, z: 1700 },
              fromNode: 'N-17080',
              toNode: 'N-17120',
            },
          },
        ],
      },
    ],
  },
};

const segments = collectSourcePipeSegments(managedStageSource);
assert.equal(segments.length, 2);

const xSegment = segments.find((segment) => segment.id === 'P-PROP-X');
assert.ok(xSegment);
assert.deepEqual(roundVec(xSegment.from), { x: 16980, y: 0, z: 1200 });
assert.deepEqual(roundVec(xSegment.to), { x: 17080, y: 0, z: 1200 });
assert.deepEqual(roundVec(xSegment.axis), { x: 1, y: 0, z: 0 });
assert.equal(xSegment.fromNode, 'N-16980');
assert.equal(xSegment.toNode, 'N-17080');
assert.equal(xSegment.branchId, '/ASIM-1885-PL-10/B2');
assert.equal(xSegment.lineNo, '10-CS-S8810105-01');

const zSegment = segments.find((segment) => segment.id === 'P-PROP-Z');
assert.ok(zSegment);
assert.deepEqual(roundVec(zSegment.axis), { x: 0, y: 0, z: 1 });
assert.equal(zSegment.branchId, '/ASIM-1885-PL-10/B2');
assert.equal(zSegment.lineNo, '10-CS-S8810105-01');

const xAxis = resolveSupportPipeAxis({
  tag: 'PS-GUIDE-X',
  local: { x: 17010, y: 20, z: 1200 },
  branchId: '/ASIM-1885-PL-10/B2',
  lineNo: '10-CS-S8810105-01',
}, segments, { toleranceMm: 50 });
assert.equal(xAxis.source, 'nearest-segment');
assert.equal(xAxis.matchedSegmentId, 'P-PROP-X');
assert.deepEqual(roundVec(xAxis.axis), { x: 1, y: 0, z: 0 });

const zAxis = resolveSupportPipeAxis({
  tag: 'PS-GUIDE-Z',
  local: { x: 17080, y: 0, z: 1500 },
  branchId: '/ASIM-1885-PL-10/B2',
  lineNo: '10-CS-S8810105-01',
}, segments, { toleranceMm: 50 });
assert.equal(zAxis.source, 'nearest-segment');
assert.equal(zAxis.matchedSegmentId, 'P-PROP-Z');
assert.deepEqual(roundVec(zAxis.axis), { x: 0, y: 0, z: 1 });

const nodeAxis = resolveSupportPipeAxis({
  tag: 'PS-NODE',
  local: { x: 16980, y: 0, z: 1200 },
  nodeId: 'N-16980',
  branchId: '/ASIM-1885-PL-10/B2',
  lineNo: '10-CS-S8810105-01',
}, segments, { toleranceMm: 50 });
assert.equal(nodeAxis.source, 'node-match');
assert.equal(nodeAxis.matchedSegmentId, 'P-PROP-X');

console.log('non-primitive support pipe segment extraction tests passed');
