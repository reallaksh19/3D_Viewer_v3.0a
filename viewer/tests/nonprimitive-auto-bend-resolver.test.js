import { resolveNonPrimitiveAutoBends, buildVisualTrimLookup, isRealTurnDirection } from '../overlays/autobend/NonPrimitiveAutoBendResolver.js';
import { buildAutoBendOverlayContract, sampleBendArc } from '../overlays/autobend/NonPrimitiveAutoBendGeometry.js';

let passed = 0;
let failed = 0;
function check(condition, label) {
  if (condition) { console.log(`PASS: ${label}`); passed += 1; }
  else { console.error(`FAIL: ${label}`); failed += 1; }
}
function pipe(id, fromNode, toNode, from, to, extra = {}) {
  return {
    id,
    fromNode,
    toNode,
    from: { x: from[0], y: from[1], z: from[2] },
    to: { x: to[0], y: to[1], z: to[2] },
    componentType: 'PIPE',
    ...extra,
  };
}
function close(a, b, tol = 1e-6) { return Math.abs(a - b) <= tol; }

const lShape = resolveNonPrimitiveAutoBends({
  sourceKind: 'json',
  segments: [
    pipe('S1', 'A', 'B', [0, 0, 0], [1000, 0, 0], { pipeOdMm: 100 }),
    pipe('S2', 'B', 'C', [1000, 0, 0], [1000, 0, 1000], { pipeOdMm: 100 }),
  ],
});
check(lShape.bends.length === 1, 'auto-bend emits one bend for L-shaped degree-2 node');
check(close(Math.round(lShape.bends[0].turnAngleDeg), 90), 'auto-bend computes 90 degree turn');
check(close(lShape.bends[0].radiusMm, 150), 'auto-bend default radius is OD x 1.5');
check(lShape.trims.length === 2 && lShape.trims.every((trim) => close(trim.trimFromNodeMm, 150)), 'auto-bend emits two visual trims');
const trimLookup = buildVisualTrimLookup(lShape.trims);
check(close(trimLookup.get('S1:B'), 150) && close(trimLookup.get('S2:B'), 150), 'auto-bend visual trim lookup is segment/node scoped');

const straight = resolveNonPrimitiveAutoBends({
  sourceKind: 'json',
  segments: [
    pipe('S1', 'A', 'B', [0, 0, 0], [1000, 0, 0]),
    pipe('S2', 'B', 'C', [1000, 0, 0], [2000, 0, 0]),
  ],
});
check(straight.bends.length === 0 && straight.diagnostics.skippedCollinearCount === 1, 'auto-bend skips straight collinear intermediate node');
check(straight.diagnostics.warnings.some((w) => w.code === 'collinear'), 'auto-bend reports collinear straight continuation reason');

const portAStraightChain = resolveNonPrimitiveAutoBends({
  sourceKind: 'inputxml',
  segments: [
    pipe('PORT-A-1', 'PORT-A', 'N2', [0, 0, 0], [750, 0, 0], { branchId: 'PORT-A' }),
    pipe('PORT-A-2', 'N2', 'N3', [750, 0, 0], [1500, 0, 0], { branchId: 'PORT-A' }),
    pipe('PORT-A-3', 'N3', 'PORT-A-END', [1500, 0, 0], [2250, 0, 0], { branchId: 'PORT-A' }),
  ],
});
check(portAStraightChain.bends.length === 0, 'PORT-A straight chain does not emit auto bends');
check(portAStraightChain.diagnostics.skippedCollinearCount === 2, 'PORT-A straight chain records both collinear degree-2 candidates');

const sameSideStraightChain = resolveNonPrimitiveAutoBends({
  sourceKind: 'inputxml',
  segments: [
    pipe('R1', 'A', 'B', [0, 0, 0], [1000, 0, 0]),
    pipe('R2', 'C', 'B', [0, 0, 0], [1000, 0, 0]),
  ],
});
check(sameSideStraightChain.bends.length === 0 && sameSideStraightChain.diagnostics.skippedStraightContinuationCount === 1, 'same-side straight chain is rejected as straight continuation');
check(sameSideStraightChain.diagnostics.warnings.some((w) => w.code === 'straightContinuation'), 'straight continuation rejection is diagnostic-visible');

const tee = resolveNonPrimitiveAutoBends({
  sourceKind: 'inputxml',
  segments: [
    pipe('S1', 'A', 'B', [0, 0, 0], [1000, 0, 0]),
    pipe('S2', 'B', 'C', [1000, 0, 0], [2000, 0, 0]),
    pipe('S3', 'B', 'D', [1000, 0, 0], [1000, 0, 1000]),
  ],
});
check(tee.bends.length === 0 && tee.diagnostics.candidateNodeCount === 0, 'auto-bend skips tee/branch nodes with three incident pipes');

const explicitComponent = resolveNonPrimitiveAutoBends({
  sourceKind: 'inputxml',
  existingNodeKinds: { B: 'SUPPORT' },
  segments: [
    pipe('S1', 'A', 'B', [0, 0, 0], [1000, 0, 0]),
    pipe('S2', 'B', 'C', [1000, 0, 0], [1000, 0, 1000]),
  ],
});
check(explicitComponent.bends.length === 0 && explicitComponent.diagnostics.skippedExistingComponentCount === 1, 'auto-bend skips explicit support/attachment component nodes');

const branchMismatch = resolveNonPrimitiveAutoBends({
  sourceKind: 'json',
  segments: [
    pipe('S1', 'A', 'B', [0, 0, 0], [1000, 0, 0], { branchId: 'BR1' }),
    pipe('S2', 'B', 'C', [1000, 0, 0], [1000, 0, 1000], { branchId: 'BR2' }),
  ],
});
check(branchMismatch.bends.length === 0 && branchMismatch.diagnostics.skippedAmbiguousBranchCount === 1, 'auto-bend skips ambiguous branch mismatch');

const shortSpan = resolveNonPrimitiveAutoBends({
  sourceKind: 'json',
  segments: [
    pipe('S1', 'A', 'B', [0, 0, 0], [20, 0, 0]),
    pipe('S2', 'B', 'C', [20, 0, 0], [20, 0, 20]),
  ],
});
check(shortSpan.bends.length === 0 && shortSpan.diagnostics.skippedShortSegmentCount === 1, 'auto-bend skips too-short segments');

const frozen = Object.freeze([
  Object.freeze(pipe('S1', 'A', 'B', [0, 0, 0], [1000, 0, 0], { pipeOdMm: 100 })),
  Object.freeze(pipe('S2', 'B', 'C', [1000, 0, 0], [1000, 0, 1000], { pipeOdMm: 100 })),
]);
const immutableResult = resolveNonPrimitiveAutoBends({ sourceKind: 'json', segments: frozen });
check(immutableResult.bends.length === 1 && frozen[0].to.x === 1000 && frozen[0].to.z === 0, 'auto-bend does not mutate original source segment coordinates');

check(isRealTurnDirection({ x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }), 'real turn helper accepts a 90 degree turn');
check(!isRealTurnDirection({ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), 'real turn helper rejects collinear straight continuation');

const arcPoints = sampleBendArc(lShape.bends[0], 12);
check(arcPoints.length === 13, 'auto-bend geometry samples arc points');
const contract = buildAutoBendOverlayContract({ bends: lShape.bends, sourceKind: 'json' });
check(contract.name === '__NON_PRIMITIVE_AUTO_BEND_OVERLAY__' && contract.children.length === 1, 'auto-bend geometry contract creates disposable overlay root');

if (failed) {
  console.error(`FAILURES: ${failed}`);
  process.exit(1);
}
console.log(`All non-primitive auto-bend resolver checks passed (${passed}).`);
