import assert from 'node:assert/strict';

import {
  classifySupportFamily,
  classifyPipeAxis,
  readRecordGapMm,
  resolveSupportSymbol,
} from '../overlays/support/NonPrimitiveSupportOverlayResolver.js';

function dirs(symbol) {
  return symbol.arrows.map((arrow) => `${Math.round(arrow.direction.x)},${Math.round(arrow.direction.y)},${Math.round(arrow.direction.z)}`).sort();
}

assert.equal(classifySupportFamily('PS-1 HOLD DOWN'), 'HOLDDOWN');
assert.equal(classifySupportFamily('PS-2 LINE STOP'), 'LINESTOP');
assert.equal(classifySupportFamily('PS-3 LIMIT'), 'LIMIT');
assert.equal(classifySupportFamily('PS-4 LIM'), 'LIM');
assert.equal(classifySupportFamily('PS-5 Can Spring'), 'SPRING_CAN');

assert.equal(classifyPipeAxis({ x: 1, y: 0, z: 0 }), 'X');
assert.equal(classifyPipeAxis({ x: 0, y: 1, z: 0 }), 'Y');
assert.equal(classifyPipeAxis({ x: 0, y: 0, z: 1 }), 'Z');

assert.equal(readRecordGapMm({ GAP: '25 mm' }), 25);
assert.equal(readRecordGapMm({}), null);
assert.equal(readRecordGapMm({ GAP: 'bad' }), null);

const rest = resolveSupportSymbol({ family: 'REST', pipeAxis: { x: 1, y: 0, z: 0 } });
assert.deepEqual(dirs(rest), ['0,1,0']);
assert.equal(rest.size.axialOdTwoThirdsApplied, false);

const hold = resolveSupportSymbol({ family: 'HOLDDOWN', pipeAxis: { x: 1, y: 0, z: 0 } });
assert.deepEqual(dirs(hold), ['0,-1,0', '0,1,0']);

const guideX = resolveSupportSymbol({ family: 'GUIDE', pipeAxis: { x: 1, y: 0, z: 0 } });
assert.deepEqual(dirs(guideX), ['0,0,-1', '0,0,1']);

const guideZ = resolveSupportSymbol({ family: 'GUIDE', pipeAxis: { x: 0, y: 0, z: 1 } });
assert.deepEqual(dirs(guideZ), ['-1,0,0', '1,0,0']);

const guideY = resolveSupportSymbol({ family: 'GUIDE', pipeAxis: { x: 0, y: 1, z: 0 } });
assert.deepEqual(dirs(guideY), ['-1,0,0', '0,0,-1', '0,0,1', '1,0,0']);

const stopPair = resolveSupportSymbol({ family: 'LINESTOP', pipeAxis: { x: 1, y: 0, z: 0 }, pipeOdMm: 300, gapMm: 10 });
assert.deepEqual(dirs(stopPair), ['-1,0,0', '1,0,0']);
assert.equal(stopPair.gapVisualSeparationMm, 100);
assert.equal(stopPair.size.axialOdTwoThirdsApplied, true);
assert.equal(stopPair.size.arrowLengthMm, 200);

const stopPositive = resolveSupportSymbol({ family: 'LINESTOP', rawText: '+ AXIS', pipeAxis: { x: 0, y: 0, z: 1 } });
assert.deepEqual(dirs(stopPositive), ['0,0,1']);

const stopNegative = resolveSupportSymbol({ family: 'LIMIT', rawText: '- AXIS', pipeAxis: { x: 0, y: 0, z: 1 } });
assert.deepEqual(dirs(stopNegative), ['0,0,-1']);

const cappedGap = resolveSupportSymbol({ family: 'LIM', pipeAxis: { x: 1, y: 0, z: 0 }, gapMm: 50 });
assert.equal(cappedGap.gapVisualSeparationMm, 200);
assert.equal(cappedGap.gapCapped, true);
assert.ok(cappedGap.warnings.includes('gapVisualSeparationCapped'));

const singleAxis = resolveSupportSymbol({ family: 'LINESTOP', pipeAxis: { x: 1, y: 0, z: 0 }, singleAxis: true });
assert.equal(singleAxis.arrows.length, 0);
assert.equal(singleAxis.popupRequired, true);
assert.ok(singleAxis.warnings.includes('unresolvedAxisSign'));

const spring = resolveSupportSymbol({ family: 'SPRING_CAN' });
assert.equal(spring.coil.role, 'spring-can-warning-coil');
assert.ok(spring.warnings.includes('springCanVisualOnly'));

const unknown = resolveSupportSymbol({ family: 'UNKNOWN' });
assert.equal(unknown.marker, 'warning');
assert.equal(unknown.popupRequired, true);

console.log('non-primitive support overlay resolver tests passed');
