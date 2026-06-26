#!/usr/bin/env node
import assert from 'node:assert/strict';
import { cleanXmlCiiNodeBlocks } from '../viewer/converters/xml-cii2019-core/xml-cii-node-block-cleanup.js';
import { applyXmlCiiPostSplitElementLengthCleanup } from '../viewer/converters/xml-cii2019-core/post-split-element-length-cleanup.js';
import { collectXmlCiiAutoRigidWeightsFromIssues } from '../viewer/converters/xml-cii2019-core/rigid-weight-auto-apply.js';

function tag(name, value = '') { return `<${name}>${value}</${name}>`; }
function node(fields) { return '<Node>' + Object.entries(fields).map(([key, value]) => tag(key, value)).join('') + '</Node>'; }
function doc(nodes) { return '<?xml version="1.0"?><Root><Branch><Branchname>/TEST/B1</Branchname>' + nodes.join('\n') + '</Branch></Root>'; }
function nodeBlocks(xmlText) { return String(xmlText || '').match(/<Node\b[\s\S]*?<\/Node>/gi) || []; }
function nodeBlock(xmlText, nodeNumber) { return nodeBlocks(xmlText).find((block) => block.includes(tag('NodeNumber', nodeNumber))) || ''; }
function assertNoShortNodes(xmlText, threshold = 6) {
  for (const block of nodeBlocks(xmlText)) {
    const length = Number(block.match(/<ElementLengthMm>([\s\S]*?)<\/ElementLengthMm>/i)?.[1]);
    const type = block.match(/<ComponentType>([\s\S]*?)<\/ComponentType>/i)?.[1] || '';
    assert.notEqual(type, 'GASK', 'GASK node block must be removed');
    assert.ok(!Number.isFinite(length) || length > threshold, `short node survived: ${type} ${length}`);
  }
}

const directFixture = doc([
  node({ NodeNumber: 10, ComponentType: 'PIPE', ComponentRefNo: 'P1', ElementLengthMm: 100, Position: '0 0 0' }),
  node({ NodeNumber: 20, ComponentType: 'GASK', ComponentRefNo: 'G1', ElementLengthMm: 3.2, Position: '10 0 0' }),
  node({ NodeNumber: 30, ComponentType: 'ATTA', ComponentRefNo: 'A1', ElementLengthMm: 0.0, Position: '20 0 0' }),
  node({ NodeNumber: 40, ComponentType: 'OLET', ComponentRefNo: 'O1', ElementLengthMm: 0.02, Position: '30 0 0' }),
  node({ NodeNumber: 50, ComponentType: 'RIGID', ComponentRefNo: 'R1', ElementLengthMm: 5.9, Position: '40 0 0' }),
  node({ NodeNumber: 60, ComponentType: 'PIPE', ComponentRefNo: 'P2', ElementLengthMm: 250, Position: '250 0 0' }),
]);
const direct = cleanXmlCiiNodeBlocks(directFixture, { stage: 'unit-pre-enrichment-source' });
assert.equal(direct.stats.gasketNodesDropped, 1);
assert.equal(direct.stats.shortElementLengthNodesDropped, 4);
assert.equal(direct.stats.shortElementLengthNodesDroppedByType.GASK, 1);
assert.equal(direct.stats.shortElementLengthNodesDroppedByType.ATTA, 1);
assert.equal(direct.stats.shortElementLengthNodesDroppedByType.OLET, 1);
assert.equal(direct.stats.shortElementLengthNodesDroppedByType.RIGID, 1);
assertNoShortNodes(direct.xmlText);
assert.match(direct.xmlText, /<ComponentType>PIPE<\/ComponentType>/);

const valveFixture = doc([
  node({ NodeNumber: 1466, Endpoint: 2, ComponentType: 'FLAN', ComponentRefNo: '=F1', ElementLengthMm: '147.000', Position: '189617.99 -1103125.00 101184.15' }),
  node({ NodeNumber: 1467, Endpoint: 1, ComponentType: 'VALV', ComponentRefNo: '=V1', ElementLengthMm: '610.000', Position: '189621.19 -1103125.00 101184.15' }),
  node({ NodeNumber: 1468, Endpoint: 2, ComponentType: 'VALV', ComponentRefNo: '=V1', ElementLengthMm: '610.000', Position: '190231.19 -1103125.00 101184.15' }),
]);
const valveNoDrop = applyXmlCiiPostSplitElementLengthCleanup(valveFixture, { config: { shortElementLengthDropThresholdMm: 0 } });
assert.match(nodeBlock(valveNoDrop.xmlText, 1467), /<ElementLengthMm>3\.200<\/ElementLengthMm>/, 'Endpoint 1 VALV must use incoming 3.2 mm adjacent gap');
assert.match(nodeBlock(valveNoDrop.xmlText, 1468), /<ElementLengthMm>610\.000<\/ElementLengthMm>/, 'Endpoint 2 VALV must retain paired valve span');
const valveDrop = applyXmlCiiPostSplitElementLengthCleanup(valveFixture, {});
assert.equal(nodeBlock(valveDrop.xmlText, 1467), '', 'Endpoint 1 VALV with 3.2 mm length must be removed');
assert.notEqual(nodeBlock(valveDrop.xmlText, 1468), '', 'Endpoint 2 VALV with 610 mm length must be retained');

const autoWeights = collectXmlCiiAutoRigidWeightsFromIssues([
  { key: '/TEST/B1::1468', branchName: '/TEST/B1', nodeNumber: '1468', componentType: 'VALV', candidates: [{ preferred: true, selectedWeight: 378, weightMethod: 'master', typeDesc: 'Gate Valve' }] },
  { key: '/TEST/B1::1466', branchName: '/TEST/B1', nodeNumber: '1466', componentType: 'FLAN', flangeWeightFallback: true, candidates: [{ selectedWeight: 59, weightMethod: 'flange-length-extrapolated', typeDesc: 'Flange WT scaled to ElementLength' }] },
  { key: '/TEST/B1::9999', branchName: '/TEST/B1', nodeNumber: '9999', componentType: 'VALV', candidates: [{ zeroFallback: true, selectedWeight: 0 }] },
]);
assert.equal(autoWeights.appliedCount, 2, 'Resolved preferred and flange fallback weights should auto-apply');
assert.equal(autoWeights.weightsByKey['/TEST/B1::1468'], 378);
assert.equal(autoWeights.weightsByKey['/TEST/B1::1466'], 59);
assert.equal(autoWeights.remainingIssues.length, 1);
console.log('XML CII short node invariant cleanup test passed', { direct: direct.stats, autoWeights: autoWeights.appliedCount });
