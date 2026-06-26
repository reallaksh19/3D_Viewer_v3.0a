import assert from 'node:assert/strict';

import {
  collectSourcePipeSegments,
  createSupportCoordinateMapper,
  mapSupportCoordinate,
  resolveSupportPipeAxis,
} from '../overlays/support/SupportOverlayCoordinateMapper.js';

function roundVec(value) {
  return {
    x: Math.round(value.x * 1000) / 1000,
    y: Math.round(value.y * 1000) / 1000,
    z: Math.round(value.z * 1000) / 1000,
  };
}

const mapped = mapSupportCoordinate(
  { x: 1000, y: 2, z: 3 },
  {
    sourceUnits: 'mm',
    viewerUnits: 'm',
    axisBasis: [
      0, 1, 0,
      1, 0, 0,
      0, 0, 1,
    ],
    modelRootMatrix: [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      10, 20, 30, 1,
    ],
    sceneScale: 2,
    sceneOffset: { x: 1, y: 2, z: 3 },
    centeringOffset: { x: -5, y: 0, z: 0 },
    supportId: 'PS-1',
  }
);

assert.equal(mapped.supportId, 'PS-1');
assert.equal(mapped.unitScale, 0.001);
assert.deepEqual(roundVec(mapped.sourcePoint), { x: 1000, y: 2, z: 3 });
assert.deepEqual(roundVec(mapped.mappedPoint), { x: 16.004, y: 44, z: 63.006 });

const mapper = createSupportCoordinateMapper({ sourceUnits: 'mm', viewerUnits: 'scene', sceneOffset: { x: 10, y: 0, z: 0 } });
assert.deepEqual(roundVec(mapper.mapPoint({ x: 5, y: 0, z: 0 }).mappedPoint), { x: 15, y: 0, z: 0 });

const source = {
  children: [
    {
      type: 'PIPE',
      attributes: {
        ID: 'P-X',
        APOS: '0 0 0',
        LPOS: '1000 0 0',
        FROM_NODE: 'A',
        TO_NODE: 'B',
        BRANCH: 'B1',
        LINE_NO: 'L1',
      },
    },
    {
      type: 'PIPE',
      attributes: {
        ID: 'P-Z',
        APOS: '1000 0 0',
        LPOS: '1000 0 1000',
        FROM_NODE: 'B',
        TO_NODE: 'C',
        BRANCH: 'B1',
        LINE_NO: 'L1',
      },
    },
    {
      type: 'SUPPORT',
      attributes: {
        ID: 'PS-IGNORE',
        APOS: '0 0 0',
        LPOS: '0 100 0',
      },
    },
  ],
};

const segments = collectSourcePipeSegments(source);
assert.equal(segments.length, 2);
assert.equal(segments[0].id, 'P-X');
assert.deepEqual(roundVec(segments[0].axis), { x: 1, y: 0, z: 0 });

const nodeAxis = resolveSupportPipeAxis({
  tag: 'PS-NODE',
  local: { x: 1000, y: 0, z: 0 },
  nodeId: 'A',
  branchId: 'B1',
  lineNo: 'L1',
}, segments);

assert.equal(nodeAxis.source, 'node-match');
assert.equal(nodeAxis.matchedSegmentId, 'P-X');
assert.deepEqual(roundVec(nodeAxis.axis), { x: 1, y: 0, z: 0 });

const nearestAxis = resolveSupportPipeAxis({
  tag: 'PS-NEAR',
  local: { x: 500, y: 25, z: 0 },
  branchId: 'B1',
  lineNo: 'L1',
}, segments, { toleranceMm: 100 });

assert.equal(nearestAxis.source, 'nearest-segment');
assert.equal(nearestAxis.matchedSegmentId, 'P-X');
assert.deepEqual(roundVec(nearestAxis.axis), { x: 1, y: 0, z: 0 });

const ambiguous = resolveSupportPipeAxis({
  tag: 'PS-AMBIG',
  local: { x: 1000, y: 0, z: 0 },
  branchId: 'B1',
  lineNo: 'L1',
}, segments, { toleranceMm: 1 });

assert.equal(ambiguous.source, 'nearest-segment');
assert.ok(ambiguous.warnings.includes('ambiguousPipeAxis'));

const missing = resolveSupportPipeAxis({
  tag: 'PS-MISSING',
  local: { x: 5000, y: 0, z: 0 },
  branchId: 'B1',
  lineNo: 'L1',
}, segments, { toleranceMm: 50 });

assert.equal(missing.source, 'default-axis');
assert.ok(missing.warnings.includes('missingPipeAxis'));

console.log('non-primitive support coordinate mapper tests passed');
