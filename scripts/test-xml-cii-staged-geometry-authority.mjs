import assert from 'node:assert/strict';
import { applyXmlCiiStagedGeometryAuthority } from '../viewer/converters/xml-cii2019-core/staged-geometry-authority.js';

const xml = `<?xml version="1.0"?>
<Root>
  <Branch>
    <Branchname>/ASIM-1835-6&quot;-S8811946-91261M7-HC/B1</Branchname>
    <Node>
      <NodeNumber>950</NodeNumber>
      <ComponentType>FLAN</ComponentType>
      <ComponentRefNo>=1006649732/114148</ComponentRefNo>
      <OutsideDiameter>88.9</OutsideDiameter>
      <Position>200623.60 -1098125.00 101144.45</Position>
      <BoreMm>150.000</BoreMm>
      <ElementLengthMm>2191.010</ElementLengthMm>
    </Node>
    <Node>
      <NodeNumber>960</NodeNumber>
      <ComponentType>RIGID</ComponentType>
      <ComponentRefNo>=1006649732/114152</ComponentRefNo>
      <OutsideDiameter>88.9</OutsideDiameter>
      <Position>201248.00 -1098125.00 101144.45</Position>
      <BoreMm>150.000</BoreMm>
      <ElementLengthMm>624.400</ElementLengthMm>
    </Node>
  </Branch>
</Root>`;

const staged = JSON.stringify([
  {
    type: 'BRANCH',
    name: '/ASIM-1835-6"-S8811946-91261M7-HC/B1',
    children: [
      {
        type: 'FLAN',
        name: 'FLAN =1006649732/114148',
        attributes: {
          TYPE: 'FLAN',
          NAME: '=1006649732/114148',
          REF: '=1006649732/114148',
          OWNER: '/ASIM-1835-6"-S8811946-91261M7-HC/B1',
          ABORE: '80mm',
          LBORE: '80mm',
          DTXR: 'WELDING NECK FLANGE 900# - HOLD',
          APOS: { x: 146123.6, y: 723875, z: 1144.45 },
          LPOS: { x: 146232.6, y: 723875, z: 1144.45 },
        },
      },
      {
        type: 'FLAN',
        name: 'FLAN =1006649732/114152',
        attributes: {
          TYPE: 'FLAN',
          NAME: '=1006649732/114152',
          REF: '=1006649732/114152',
          OWNER: '/ASIM-1835-6"-S8811946-91261M7-HC/B1',
          ABORE: '80mm',
          LBORE: '80mm',
          DTXR: 'WELDING NECK FLANGE 900# - HOLD',
          APOS: { x: 146639, y: 723875, z: 1144.45 },
          LPOS: { x: 146748, y: 723875, z: 1144.45 },
        },
      },
    ],
  },
]);

const result = applyXmlCiiStagedGeometryAuthority(xml, staged);

assert.match(result.xmlText, /<NodeNumber>950<\/NodeNumber>[\s\S]*?<BoreMm>80\.000<\/BoreMm>[\s\S]*?<ElementLengthMm>109\.000<\/ElementLengthMm>/);
assert.match(result.xmlText, /<NodeNumber>960<\/NodeNumber>[\s\S]*?<BoreMm>80\.000<\/BoreMm>[\s\S]*?<ElementLengthMm>109\.000<\/ElementLengthMm>/);
assert.equal(result.stats.stagedGeometryMatches, 2);
assert.equal(result.stats.stagedLengthAnnotations, 2);
assert.equal(result.stats.stagedBoreAnnotations, 2);
assert.doesNotMatch(result.xmlText, /<NodeNumber>960<\/NodeNumber>[\s\S]*?<ElementLengthMm>624\.400<\/ElementLengthMm>/);
assert.doesNotMatch(result.xmlText, /<NodeNumber>960<\/NodeNumber>[\s\S]*?<BoreMm>150\.000<\/BoreMm>/);

console.log('XML CII staged geometry authority regression passed.');
