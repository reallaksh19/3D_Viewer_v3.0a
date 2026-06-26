#!/usr/bin/env node
import assert from 'node:assert/strict';
import { applyXmlCiiPostSplitElementLengthCleanup } from '../viewer/converters/xml-cii2019-core/post-split-element-length-cleanup.js';
import {
  applyXmlCiiTopologyElementLengths,
  collectXmlCiiTopologyElementLengthAssignments,
} from '../viewer/converters/xml-cii2019-core/topology/xml-cii-topology-element-length.js';

function tag(name, value = '') { return `<${name}>${value}</${name}>`; }
function restraint(type, stiffness = 0, gap = 0, friction = 0.3) {
  return `<Restraint>${tag('Type', type)}${tag('Stiffness', stiffness)}${tag('Gap', gap)}${tag('Friction', friction)}</Restraint>`;
}
function node(fields, extra = '') {
  return '<Node>' + Object.entries(fields).map(([key, value]) => tag(key, value)).join('') + extra + '</Node>';
}
function doc(nodes) {
  return '<?xml version="1.0"?><Root><Branch><Branchname>/TEST/B1</Branchname>' + nodes.join('\n') + '</Branch></Root>';
}
function nodeBlocks(xmlText) { return String(xmlText || '').match(/<Node\b[\s\S]*?<\/Node>/gi) || []; }
function nodeBlock(xmlText, nodeNumber) { return nodeBlocks(xmlText).find((item) => item.includes(tag('NodeNumber', nodeNumber))) || ''; }
function byNode(assignments, nodeNumber) {
  return assignments.find((assignment) => String(assignment.nodeNumber) === String(nodeNumber));
}
function skippedByNode(skipped, nodeNumber) {
  return skipped.find((item) => String(item.nodeNumber) === String(nodeNumber));
}
function lengthFromXml(xmlText, nodeNumber) {
  const block = nodeBlock(xmlText, nodeNumber);
  const value = block.match(/<ElementLengthMm>([\s\S]*?)<\/ElementLengthMm>/i)?.[1];
  return Number(value);
}
function assertLength(xmlText, nodeNumber, expected, message) {
  assert.equal(lengthFromXml(xmlText, nodeNumber), expected, message || `node ${nodeNumber} length`);
}

const supportElbowOletFixture = doc([
  node({ NodeNumber: 440, NodeName: 'PS-11314/DATUM', Endpoint: 0, ComponentType: 'ATTA', ComponentRefNo: '=1006649732/114320', Position: '189526.22 -1101825.00 102509.55' }, restraint('+Y', 1751270031350)),
  node({ NodeNumber: 450, NodeName: 'PS-11314/SREF', Endpoint: 0, ComponentType: 'ATTA', ComponentRefNo: '=1006649732/114321', Position: '189526.22 -1101825.00 102509.55' }),
  node({ NodeNumber: 460, NodeName: 'PS-11314.1', Endpoint: 0, ComponentType: 'ATTA', ComponentRefNo: '=1006649732/114322', Position: '189526.22 -1101825.00 102509.55' }, restraint('Z')),
  node({ NodeNumber: -1, Endpoint: 1, ComponentType: 'ELBO', ComponentRefNo: '=1006649732/114323', Position: '189078.22 -1101825.00 102509.55', BendRadius: 305 }),
  node({ NodeNumber: 470, Endpoint: 0, ComponentType: 'ELBO', ComponentRefNo: '=1006649732/114323', Position: '188773.22 -1101825.00 102509.55', BendRadius: 305 }),
  node({ NodeNumber: -1, Endpoint: 2, ComponentType: 'ELBO', ComponentRefNo: '=1006649732/114323', Position: '188773.22 -1101520.00 102509.55', BendRadius: 305 }),
  node({ NodeNumber: -1, Endpoint: 1, ComponentType: 'ELBO', ComponentRefNo: '=1006649732/114324', Position: '188773.22 -1100930.00 102509.55', BendRadius: 305 }),
  node({ NodeNumber: 480, Endpoint: 0, ComponentType: 'ELBO', ComponentRefNo: '=1006649732/114324', Position: '188773.22 -1100625.00 102509.55', BendRadius: 305 }),
  node({ NodeNumber: -1, Endpoint: 2, ComponentType: 'ELBO', ComponentRefNo: '=1006649732/114324', Position: '188468.22 -1100625.00 102509.55', BendRadius: 305 }),
  node({ NodeNumber: -1, Endpoint: 1, ComponentType: 'ELBO', ComponentRefNo: '=1006649732/114325', Position: '187578.22 -1100625.00 102509.55', BendRadius: 305 }),
  node({ NodeNumber: 490, Endpoint: 0, ComponentType: 'ELBO', ComponentRefNo: '=1006649732/114325', Position: '187273.22 -1100625.00 102509.55', BendRadius: 305 }),
  node({ NodeNumber: -1, Endpoint: 2, ComponentType: 'ELBO', ComponentRefNo: '=1006649732/114325', Position: '187273.22 -1100625.00 102204.55', BendRadius: 305 }),
  node({ NodeNumber: -1, Endpoint: 1, ComponentType: 'OLET', ComponentRefNo: '=1006649732/114326', Position: '187273.22 -1100625.00 101654.55' }),
  node({ NodeNumber: -1, Endpoint: 3, ComponentType: 'OLET', ComponentRefNo: '=1006649732/114326', Position: '187273.22 -1100477.35 101654.55' }),
  node({ NodeNumber: 500, Endpoint: 0, ComponentType: 'OLET', ComponentRefNo: '=1006649732/114326', Position: '187273.22 -1100625.00 101654.55' }),
]);

const supportElbowOlet = collectXmlCiiTopologyElementLengthAssignments(supportElbowOletFixture);
assert.equal(byNode(supportElbowOlet.assignments, 470).lengthMm, 753.000, 'node 470 must store support-location to elbow-node incoming span');
assert.equal(byNode(supportElbowOlet.assignments, 480).lengthMm, 1200.000, 'node 480 must store 470->480 incoming route span');
assert.equal(byNode(supportElbowOlet.assignments, 490).lengthMm, 1500.000, 'node 490 must store 480->490 incoming route span');
assert.equal(byNode(supportElbowOlet.assignments, 500).lengthMm, 855.000, 'node 500 must store 490->OLET incoming route span');
assert.equal(skippedByNode(supportElbowOlet.skipped, 450).reason, 'support-reference-sref', 'SREF node must be reference-only, not a route span target');
assert.equal(skippedByNode(supportElbowOlet.skipped, 440).reason, 'support-restraint-no-element-length', 'support restraint must not receive ElementLengthMm');

const appliedSupportElbowOlet = applyXmlCiiTopologyElementLengths(supportElbowOletFixture);
assertLength(appliedSupportElbowOlet.xmlText, 470, 753.000);
assertLength(appliedSupportElbowOlet.xmlText, 480, 1200.000);
assertLength(appliedSupportElbowOlet.xmlText, 490, 1500.000);
assertLength(appliedSupportElbowOlet.xmlText, 500, 855.000);

const postSplitSupportElbowOlet = applyXmlCiiPostSplitElementLengthCleanup(supportElbowOletFixture, { config: { shortElementLengthDropThresholdMm: 0 } });
assert.equal(postSplitSupportElbowOlet.stats.topologyElementLengthMode, 'apply', 'post-split cleanup must use topology mode by default');
assertLength(postSplitSupportElbowOlet.xmlText, 470, 753.000, 'post-split path must write topology length at 470');
assertLength(postSplitSupportElbowOlet.xmlText, 480, 1200.000, 'post-split path must write topology length at 480');
assertLength(postSplitSupportElbowOlet.xmlText, 490, 1500.000, 'post-split path must write topology length at 490');
assertLength(postSplitSupportElbowOlet.xmlText, 500, 855.000, 'post-split path must write topology length at 500');
assert.ok(postSplitSupportElbowOlet.diagnostics.some((d) => d.type === 'xml-cii-topology-element-length-applied'), 'post-split path must emit topology apply diagnostic');

const rigidBeforeSplitFixture = doc([
  node({ NodeNumber: 100, Endpoint: 0, ComponentType: 'PIPE', ComponentRefNo: '=P1', Position: '0 0 0' }),
  node({ NodeNumber: 110, Endpoint: 0, ComponentType: 'RIGID', ComponentRefNo: '=R1', Position: '600 0 0', ElementLengthMm: '0.000' }),
  node({ NodeNumber: 120, Endpoint: 0, ComponentType: 'PIPE', ComponentRefNo: '=P2', Position: '900 0 0' }),
]);
const rigidBeforeSplit = collectXmlCiiTopologyElementLengthAssignments(rigidBeforeSplitFixture);
assert.equal(byNode(rigidBeforeSplit.assignments, 110).lengthMm, 600.000, 'single pre-split RIGID node must store incoming route span');
assert.equal(byNode(rigidBeforeSplit.assignments, 120).lengthMm, 300.000, 'downstream pipe must continue from corrected RIGID route point');
const rigidBeforePostSplit = applyXmlCiiPostSplitElementLengthCleanup(rigidBeforeSplitFixture, { config: { shortElementLengthDropThresholdMm: 0 } });
assertLength(rigidBeforePostSplit.xmlText, 110, 600.000, 'post-split path must correct pre-split RIGID length');
assertLength(rigidBeforePostSplit.xmlText, 120, 300.000, 'post-split path must correct downstream after pre-split RIGID');

const rigidAfterSplitFixture = doc([
  node({ NodeNumber: 100, Endpoint: 0, ComponentType: 'PIPE', ComponentRefNo: '=P1', Position: '0 0 0' }),
  node({ NodeNumber: 105, Endpoint: 1, ComponentType: 'RIGID', ComponentRefNo: '=R1', Position: '3.2 0 0', ElementLengthMm: '600.000' }),
  node({ NodeNumber: 110, Endpoint: 2, ComponentType: 'RIGID', ComponentRefNo: '=R1', Position: '603.2 0 0', ElementLengthMm: '600.000' }),
  node({ NodeNumber: 120, Endpoint: 0, ComponentType: 'PIPE', ComponentRefNo: '=P2', Position: '900 0 0' }),
]);
const rigidAfterSplit = collectXmlCiiTopologyElementLengthAssignments(rigidAfterSplitFixture);
assert.equal(byNode(rigidAfterSplit.assignments, 105).lengthMm, 3.200, 'post-split RIGID endpoint 1 must store incoming short gap');
assert.equal(byNode(rigidAfterSplit.assignments, 110).lengthMm, 600.000, 'post-split RIGID endpoint 2 must store RIGID component span');
assert.equal(byNode(rigidAfterSplit.assignments, 120).lengthMm, 296.800, 'downstream pipe must continue after RIGID endpoint 2');
const rigidAfterPostSplitNoDrop = applyXmlCiiPostSplitElementLengthCleanup(rigidAfterSplitFixture, { config: { shortElementLengthDropThresholdMm: 0 } });
assertLength(rigidAfterPostSplitNoDrop.xmlText, 105, 3.200, 'post-split cleanup must first assign endpoint 1 gap');
assertLength(rigidAfterPostSplitNoDrop.xmlText, 110, 600.000, 'post-split cleanup must assign endpoint 2 span');
assertLength(rigidAfterPostSplitNoDrop.xmlText, 120, 296.800, 'post-split cleanup must keep downstream route length after endpoint 2');
const rigidAfterPostSplitDrop = applyXmlCiiPostSplitElementLengthCleanup(rigidAfterSplitFixture, {});
assert.equal(nodeBlock(rigidAfterPostSplitDrop.xmlText, 105), '', 'default short cleanup must remove 3.2 mm RIGID endpoint 1 after topology assignment');
assert.notEqual(nodeBlock(rigidAfterPostSplitDrop.xmlText, 110), '', 'default short cleanup must retain 600 mm RIGID endpoint 2 after topology assignment');

const valveSplitFixture = doc([
  node({ NodeNumber: 1466, Endpoint: 2, ComponentType: 'FLAN', ComponentRefNo: '=F1', ElementLengthMm: '147.000', Position: '189617.99 -1103125.00 101184.15' }),
  node({ NodeNumber: 1467, Endpoint: 1, ComponentType: 'VALV', ComponentRefNo: '=V1', ElementLengthMm: '610.000', Position: '189621.19 -1103125.00 101184.15' }),
  node({ NodeNumber: 1468, Endpoint: 2, ComponentType: 'VALV', ComponentRefNo: '=V1', ElementLengthMm: '610.000', Position: '190231.19 -1103125.00 101184.15' }),
]);
const valveSplit = collectXmlCiiTopologyElementLengthAssignments(valveSplitFixture);
assert.equal(byNode(valveSplit.assignments, 1467).lengthMm, 3.200, 'VALV endpoint 1 must store incoming gap from previous FLAN endpoint');
assert.equal(byNode(valveSplit.assignments, 1468).lengthMm, 610.000, 'VALV endpoint 2 must store valve pair span');
const valvePostSplitNoDrop = applyXmlCiiPostSplitElementLengthCleanup(valveSplitFixture, { config: { shortElementLengthDropThresholdMm: 0 } });
assertLength(valvePostSplitNoDrop.xmlText, 1467, 3.200, 'post-split path must write VALV endpoint 1 incoming gap');
assertLength(valvePostSplitNoDrop.xmlText, 1468, 610.000, 'post-split path must write VALV endpoint 2 component span');
const valvePostSplitDrop = applyXmlCiiPostSplitElementLengthCleanup(valveSplitFixture, {});
assert.equal(nodeBlock(valvePostSplitDrop.xmlText, 1467), '', 'default short cleanup must remove 3.2 mm VALV endpoint 1 after topology assignment');
assert.notEqual(nodeBlock(valvePostSplitDrop.xmlText, 1468), '', 'default short cleanup must retain 610 mm VALV endpoint 2 after topology assignment');

console.log('XML CII topology element length test passed', {
  supportElbowOletAssignments: supportElbowOlet.assignments.length,
  rigidBeforeSplitAssignments: rigidBeforeSplit.assignments.length,
  rigidAfterSplitAssignments: rigidAfterSplit.assignments.length,
  valveSplitAssignments: valveSplit.assignments.length,
});
