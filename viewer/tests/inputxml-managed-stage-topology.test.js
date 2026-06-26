import assert from 'node:assert/strict';

import { buildInputXmlDirectManagedStageJson } from '../converters/inputxml-managed-stage/InputXmlDirectManagedStageBuilder.js';

const xml = `<CAESARII VERSION="11.00" XML_TYPE="Input"><PIPINGMODEL JOBNAME="BM_CII" NUMELT="4" NUMREST="1" NUMBEND="0" NUMRIGID="2" NUMISECT="0">
<PIPINGELEMENT FROM_NODE="10.000000" TO_NODE="20.000000" DELTA_X="-1.010100" DELTA_Y="-1.010100" DELTA_Z="-107.999992" DIAMETER="114.299995" WALL_THICK="6.000000" INSUL_THICK="20.000000" TEMP_EXP_C1="350.000000" PRESSURE1="2.000000" HYDRO_PRESSURE="5.000000" MATERIAL_NAME="A106 B"><RIGID WEIGHT="186.808350" TYPE="Flange Pair"/></PIPINGELEMENT>
<PIPINGELEMENT FROM_NODE="20.000000" TO_NODE="30.000000" DELTA_X="-1.010100" DELTA_Y="-1.010100" DELTA_Z="-992.000000" DIAMETER="-1.010100" WALL_THICK="-1.010100" INSUL_THICK="-1.010100" TEMP_EXP_C1="-1.010100" PRESSURE1="-1.010100" HYDRO_PRESSURE="-1.010100" MATERIAL_NAME="-1.010100"/>
<PIPINGELEMENT FROM_NODE="30.000000" TO_NODE="35.000000" DELTA_X="-1.010100" DELTA_Y="-1.010100" DELTA_Z="-1542.291992" DIAMETER="-1.010100" WALL_THICK="-1.010100" INSUL_THICK="-1.010100" TEMP_EXP_C1="-1.010100" PRESSURE1="-1.010100" HYDRO_PRESSURE="-1.010100" MATERIAL_NAME="-1.010100"/>
<PIPINGELEMENT FROM_NODE="35.000000" TO_NODE="70.000000" DELTA_X="-1.010100" DELTA_Y="-1.010100" DELTA_Z="-500.000000" DIAMETER="-1.010100" WALL_THICK="-1.010100" INSUL_THICK="-1.010100" TEMP_EXP_C1="-1.010100" PRESSURE1="-1.010100" HYDRO_PRESSURE="-1.010100" MATERIAL_NAME="-1.010100"><RIGID WEIGHT="111.199997" TYPE="Flange"/></PIPINGELEMENT>
<RESTRAINT NUM="1" NODE="35.000000" TYPE="17.000000" GAP="-1.010100" XCOSINE="0.000000" YCOSINE="1.000000" ZCOSINE="0.000000" TAG="" GUID="" />
</PIPINGMODEL></CAESARII>`;

const staged = buildInputXmlDirectManagedStageJson(xml, { sourceName: 'BM_CII_INPUT.XML' });
const children = staged.hierarchy[0].children;
const components = children.filter((child) => child.type !== 'ATTA');

assert.equal(staged.stats.components, 4, 'all source PIPINGELEMENT rows are emitted');
assert.deepEqual(
  components.map((child) => `${child.attributes.FROM_NODE}->${child.attributes.TO_NODE}:${child.attributes.DTXR}`),
  ['10->20:FLANGE_PAIR', '20->30:PIPE', '30->35:PIPE', '35->70:FLANGE'],
  'source row order and span identity are preserved across self-closing rows before rigid rows',
);
assert.equal(components[1].attributes.DIAMETER, '114.299995');
assert.equal(components[1].attributes.DIAMETER_SOURCE, 'inherited');

const support35 = children.find((child) => child.type === 'ATTA' && child.attributes.NODE === '35');
assert.ok(support35, 'support at node 35 is emitted');
assert.equal(support35.attributes.POS.z, -2642.291984, 'support node uses cumulative topology through self-closing rows');
assert.equal(support35.attributes.ATTACHED_PIPE_OD, '114.299995mm');

console.log('inputxml-managed-stage-topology: all assertions passed');
