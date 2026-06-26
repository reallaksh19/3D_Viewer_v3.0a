import assert from 'node:assert/strict';
import {
  normalizeSupportTag as normalizeDtxrSupportTag,
  buildStagedDtxrIndex,
  buildStagedDtxrPositionIndex,
  xmlCiiCalibrateDtxrPositionIndex,
  resolveDtxrForXmlNode,
  xmlCiiDtxrPosForNode,
} from '../viewer/converters/xml-cii2019-core/dtxr-resolver.js';
import {
  normalizeSupportTag as normalizeMappingSupportTag,
  buildStagedSupportIndex,
  calibrateStagedSupportIndexCoordinates,
  xmlCiiRestraintEntriesFromSupportMatch,
} from '../viewer/converters/xml-cii2019-core/support-mapping.js';
import { normalizeSupportTag as normalizePcfSupportTag, resolveSupportMatchForPcfRow } from '../viewer/converters/xml-cii2019-core/support-pcf-row-matcher.js';
import { normalizePsKey, psCandidateKeys } from '../viewer/converters/xml-cii2019-core/sideload-resolver.js';

for (const normalize of [normalizeDtxrSupportTag, normalizeMappingSupportTag, normalizePcfSupportTag]) {
  assert.equal(normalize('PS-11236.8'), 'PS-11236.8');
  assert.equal(normalize('/ps-11236.8'), 'PS-11236.8');
  assert.equal(normalize('PS-11236'), 'PS-11236');
}
assert.equal(normalizePsKey('/ps-11236.8'), 'PS11236.8');
assert.deepEqual(psCandidateKeys('PS-11236.8'), ['PS11236.8']);

const stagedJson = JSON.stringify({ type: 'BRANCH', children: [
  { type: 'SUPPORT', attributes: { TYPE: 'SUPPORT', DTXR_PS: 'PS-11236', SUPPORT_KIND: 'GUIDE', CMPSUPGAP: '10' } },
  { type: 'SUPPORT', attributes: { TYPE: 'SUPPORT', DTXR_PS: 'PS-11236.8', SUPPORT_KIND: 'LINESTOP', CMPSUPGAP: '25' } },
] });

const xmlSupportNode = { ComponentType: 'SUPPORT', NodeName: '/ps-11236.8', ComponentRefNo: 'PS-11236.8', SupportTag: '/ps-11236.8' };
const resolved = resolveDtxrForXmlNode({ xmlNode: xmlSupportNode, context: buildStagedDtxrIndex(stagedJson), purpose: 'support-restraint', trustExistingXmlDtxr: false });
assert.equal(resolved.matchedKey, 'PS-11236.8');
assert.equal(resolved.dtxrPs, 'PS-11236.8');
assert.equal(resolved.cmpSupGap, '25');

const supportConfig = { supportKindToXmlType: { GUIDE: ['GUI'], LINESTOP: ['LIM'] } };
const supportIndex = buildStagedSupportIndex(stagedJson, supportConfig, []);
assert.equal(supportIndex.byTag.get('PS-11236.8')?.[0]?.attrs?.DTXR_PS, 'PS-11236.8');
assert.ok(!supportIndex.byTag.get('PS-11236.8')?.some((item) => item.attrs?.DTXR_PS === 'PS-11236'));
const supportMatch = resolveSupportMatchForPcfRow({ nodeName: '/ps-11236.8' }, supportIndex, supportConfig);
assert.equal(supportMatch?.attrs?.DTXR_PS, 'PS-11236.8');
assert.equal(supportMatch?.primaryKind, 'LINESTOP');
const restraints = xmlCiiRestraintEntriesFromSupportMatch(supportMatch, null, supportConfig);
assert.equal(restraints[0]?.supportKind, 'LINESTOP');
assert.equal(restraints[0]?.type, 'LIM');

const dtxrPositionConfig = {
  coordinateTolerance: 0.5,
  dtxrCoordinateToleranceMm: 0.5,
  dtxrPositionOffset: { enabled: false, tolerance: 0.5 },
  supportKindToXmlType: { GUIDE: ['GUI'], LINESTOP: ['LIM'] },
};

function fakeXmlNode(fields) {
  return {
    ...fields,
    childNodes: Object.entries(fields).map(([localName, value]) => ({
      nodeType: 1,
      localName,
      nodeName: localName,
      textContent: String(value),
    })),
  };
}

const psOnlyPositionJson = JSON.stringify({ type: 'BRANCH', children: [
  { type: 'SUPPORT', attributes: { TYPE: 'SUPPORT', DTXR_PS: 'PS-22001.8', SUPPORT_KIND: 'GUIDE', POSI: '10 20 30' } },
] });
const dtxrPositionIndex = buildStagedDtxrPositionIndex(psOnlyPositionJson, dtxrPositionConfig);
const dtxrPosResult = xmlCiiDtxrPosForNode(fakeXmlNode({
  ComponentType: 'ATTA',
  NodeNumber: '100',
  NodeName: '/PS-22001.8',
  Position: '10 20 30',
}), dtxrPositionIndex, dtxrPositionConfig);
assert.equal(dtxrPosResult.text, 'PS-22001.8', 'PS-only staged rows with POSI must still populate DTXR_POS by position');

const relaxedSamePositionJson = JSON.stringify({ type: 'BRANCH', children: [
  { type: 'SUPPORT', attributes: { TYPE: 'SUPPORT', DTXR_PS: 'PS-33001', SUPPORT_KIND: 'GUIDE', POSI: '0 0 0' } },
] });
const relaxedDtxr = resolveDtxrForXmlNode({
  xmlNode: { ComponentType: 'SUPPORT', NodeName: '/PS-33001.8', ComponentRefNo: 'PS-33001.8', Position: '0 0 0' },
  context: buildStagedDtxrIndex(relaxedSamePositionJson, dtxrPositionConfig),
  purpose: 'support-restraint',
  trustExistingXmlDtxr: false,
  config: dtxrPositionConfig,
});
assert.equal(relaxedDtxr.matchedBy, 'ps-tag-relaxed-same-dtxr-pos');
assert.equal(relaxedDtxr.dtxrPs, 'PS-33001');

const relaxedSupportIndex = buildStagedSupportIndex(relaxedSamePositionJson, dtxrPositionConfig, []);
const relaxedSupportMatch = resolveSupportMatchForPcfRow({ nodeName: '/PS-33001.8', position: '0 0 0' }, relaxedSupportIndex, dtxrPositionConfig);
assert.equal(relaxedSupportMatch?.attrs?.DTXR_PS, 'PS-33001', 'relaxed PS support match is allowed at the same DTXR_POS/position');
const rejectedDifferentPosition = resolveSupportMatchForPcfRow({ nodeName: '/PS-33001.8', position: '99 0 0' }, relaxedSupportIndex, dtxrPositionConfig);
assert.equal(rejectedDifferentPosition?.attrs?.DTXR_PS || '', '', 'relaxed PS support match must not cross DTXR_POS/position');

const offsetClusterJson = JSON.stringify({ type: 'BRANCH', children: [
  { type: 'SUPPORT', attributes: { TYPE: 'ATTA', NAME: '/PS-44001.8', SUPPORT_KIND: 'REST', POSI: '10 20 30', DTXR: 'Pipe Rest XRT01' } },
  { type: 'SUPPORT', attributes: { TYPE: 'ATTA', NAME: '/PS-44001.5', PREV_NAME: '/PS-44001.9', MDSGUIDEREF: '/PS-44001.8', SUPPORT_KIND: 'REST', MDSSUPPTYPE: 'ST06', POSI: '10 20 30', DTXR: 'Directional Anchor On Shoe 6-XST06-40' } },
] });
const offsetConfig = {
  coordinateTolerance: 0.5,
  dtxrPositionOffset: { enabled: true, xOffset: 999, yOffset: 999, zOffset: 999, tolerance: 0.5, autoCalibrateMinSamples: 1 },
};
const anchorNode = fakeXmlNode({
  ComponentType: 'ATTA',
  NodeNumber: '200',
  NodeName: '/PS-44001.8',
  Position: '110 220 330',
});
const fakeDocument = { getElementsByTagName: (name) => (name === 'Node' ? [anchorNode] : []) };
const calibratedDtxrIndex = xmlCiiCalibrateDtxrPositionIndex(buildStagedDtxrPositionIndex(offsetClusterJson, offsetConfig), fakeDocument, offsetConfig);
assert.deepEqual(calibratedDtxrIndex.inferredOffset, { x: 100, y: 200, z: 300 });
const calibratedDtxrPos = xmlCiiDtxrPosForNode(anchorNode, calibratedDtxrIndex, offsetConfig);
assert.match(calibratedDtxrPos.text, /Directional Anchor/);

const calibratedSupportIndex = calibrateStagedSupportIndexCoordinates(buildStagedSupportIndex(offsetClusterJson, offsetConfig, []), calibratedDtxrIndex.inferredOffset, offsetConfig);
const calibratedSupportMatches = calibratedSupportIndex.byCoord.get('220|440|660') || [];
assert.equal(calibratedSupportMatches.length, 2, 'calibrated same-POSI support cluster must be available by XML position');
const lineStopClusterMatch = calibratedSupportMatches.find((match) => String(match.attrs?.DTXR || '').includes('Directional Anchor'));
assert.equal(lineStopClusterMatch?.primaryKind, 'LINESTOP', 'ST06/XST directional anchor must override generated REST support kind');

console.log('XML CII exact decimal PS tag restraint regression passed');
