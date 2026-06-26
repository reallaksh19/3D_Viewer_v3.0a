import assert from 'node:assert/strict';

import { buildInputXmlDirectManagedStageJson } from '../converters/inputxml-managed-stage/InputXmlDirectManagedStageBuilder.js';
import { resolveNonPrimitiveAutoBends } from '../overlays/autobend/NonPrimitiveAutoBendResolver.js';
import { collectExplicitNonPrimitiveAutoBends, collectNonPrimitiveAutoBendSegments } from '../overlays/autobend/NonPrimitiveAutoBendSourceAdapter.js';

const xml = `<CAESARII VERSION="11.00" XML_TYPE="Input"><PIPINGMODEL JOBNAME="BM" NUMELT="3" NUMREST="0" NUMBEND="1">
<PIPINGELEMENT FROM_NODE="10.000000" TO_NODE="20.000000" DELTA_X="1000.000000" DELTA_Y="0.000000" DELTA_Z="0.000000" DIAMETER="114.300000" WALL_THICK="6.000000" />
<PIPINGELEMENT FROM_NODE="20.000000" TO_NODE="30.000000" DELTA_X="100.000000" DELTA_Y="0.000000" DELTA_Z="100.000000" DIAMETER="-1.010100" WALL_THICK="-1.010100"><BEND RADIUS="152.399994" ANGLE1="45.000000" NODE1="29.000000" ANGLE2="0.000000" NODE2="28.000000" /></PIPINGELEMENT>
<PIPINGELEMENT FROM_NODE="30.000000" TO_NODE="40.000000" DELTA_X="0.000000" DELTA_Y="0.000000" DELTA_Z="1000.000000" DIAMETER="-1.010100" WALL_THICK="-1.010100" />
</PIPINGMODEL></CAESARII>`;

const staged = buildInputXmlDirectManagedStageJson(xml, { sourceName: 'BM_CII_INPUT.XML' });
const explicitBends = collectExplicitNonPrimitiveAutoBends(staged);
assert.equal(explicitBends.length, 1, 'InputXML staged JSON exposes the real BEND record');
assert.equal(explicitBends[0].radiusMm, 152.399994);
assert.equal(explicitBends[0].turnAngleDeg, 45);
assert.equal(explicitBends[0].source, 'explicit-inputxml-bend');
assert.equal(explicitBends[0].bendNode1, '29');
assert.equal(explicitBends[0].bendNode2, '28');

const segments = collectNonPrimitiveAutoBendSegments(staged);
const result = resolveNonPrimitiveAutoBends({ sourceKind: 'json', segments, explicitBends });
assert.equal(result.bends.length, 1, 'explicit BEND record is rendered as the bend source of truth');
assert.equal(result.bends[0].source, 'explicit-inputxml-bend');
assert.equal(result.bends[0].radiusMm, 152.399994);
assert.equal(result.bends[0].turnAngleDeg, 45);
assert.equal(result.trims.length, 0, 'explicit staged BEND records do not trigger synthetic 1.5D endpoint trims');
assert.equal(result.diagnostics.explicitBendCount, 1);
assert.equal(result.diagnostics.syntheticSuppressedByExplicitBendCount, 1);
assert.equal(result.diagnostics.emittedBendCount, 1);
assert.equal(result.diagnostics.warnings.some((w) => w.code === 'explicitBendSourceOfTruth'), true, 'diagnostics declare explicit bend source of truth');

console.log('nonprimitive-auto-bend-explicit-bend passed');
