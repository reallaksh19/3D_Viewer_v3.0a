import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { buildInputXmlDirectManagedStageJson } from '../converters/inputxml-managed-stage/InputXmlDirectManagedStageBuilder.js';

const xml = `<CAESARII VERSION="11.00" XML_TYPE="Input"><PIPINGMODEL JOBNAME="BEND-LEN" NUMELT="3" NUMREST="0" NUMBEND="1">
<PIPINGELEMENT FROM_NODE="10.000000" TO_NODE="20.000000" DELTA_X="1000.000000" DELTA_Y="0.000000" DELTA_Z="0.000000" DIAMETER="114.300000" WALL_THICK="6.000000" />
<PIPINGELEMENT FROM_NODE="20.000000" TO_NODE="30.000000" DELTA_X="100.000000" DELTA_Y="0.000000" DELTA_Z="100.000000" DIAMETER="-1.010100" WALL_THICK="-1.010100"><BEND RADIUS="152.399994" ANGLE1="45.000000" NODE1="29.000000" ANGLE2="0.000000" NODE2="28.000000" /></PIPINGELEMENT>
<PIPINGELEMENT FROM_NODE="30.000000" TO_NODE="40.000000" DELTA_X="0.000000" DELTA_Y="0.000000" DELTA_Z="1000.000000" DIAMETER="-1.010100" WALL_THICK="-1.010100" />
</PIPINGMODEL></CAESARII>`;

const staged = buildInputXmlDirectManagedStageJson(xml, { sourceName: 'bend-length.xml' });
const bend = staged.hierarchy[0].children.find((child) => child.type === 'BEND');
assert.ok(bend, 'managed-stage output contains a BEND child');

const attrs = bend.attributes;
const expected = Number((152.399994 * 45 * Math.PI / 180).toFixed(6));
assert.equal(attrs.BEND_RADIUS, '152.399994');
assert.equal(attrs.BEND_ANGLE, '45.000000');
assert.equal(attrs.BEND_NODE1, '29');
assert.equal(attrs.BEND_NODE2, '28');
assert.equal(attrs.BEND_ELEMENT_LENGTH_MM, expected, 'BEND_ELEMENT_LENGTH_MM uses radius × angleRadians');
assert.equal(attrs.ELEMENT_LENGTH_IN_MM, expected, 'normalized element length is populated');
assert.equal(attrs.ElementLengthInMm, expected, 'display-style element length is populated');
assert.equal(attrs.ELBOW_ARC_LENGTH_MM, expected, 'elbow arc alias is populated');
assert.equal(attrs.BEND_ELEMENT_LENGTH_SOURCE, 'bend-radius-times-angle-radians');
assert.equal(staged.stats.bends, 1);
assert.equal(staged.stats.bendElementLengthRows, 1);
assert.ok(staged.audit.retainedFields.some((field) => /element length/.test(field)), 'audit documents bend element length retention');

const bmXml = await fs.readFile(new URL('../../Benchmarks/INPUT XML to CII 2019/BM_CII/BM_CII_INPUT.XML', import.meta.url), 'utf8');
const bm = buildInputXmlDirectManagedStageJson(bmXml, { sourceName: 'BM_CII_INPUT.XML' });
const bmBends = bm.hierarchy[0].children.filter((child) => child.type === 'BEND');
assert.equal(bm.stats.bends, 7, 'BM_CII has seven staged BEND records');
assert.equal(bm.stats.bendElementLengthRows, 7, 'BM_CII computes element length for all BEND records');
assert.ok(bmBends.every((child) => Number(child.attributes.ElementLengthInMm) > 0), 'all BM_CII bends carry positive ElementLengthInMm');
assert.ok(bmBends.every((child) => child.attributes.BEND_ELEMENT_LENGTH_SOURCE === 'bend-radius-times-angle-radians'), 'all BM_CII bend lengths are source-derived');

console.log('inputxml-bend-element-length passed');
