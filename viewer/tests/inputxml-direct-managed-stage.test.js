import assert from 'node:assert/strict';

import { buildInputXmlDirectManagedStageJson } from '../converters/inputxml-managed-stage/InputXmlDirectManagedStageBuilder.js';
import { run } from '../converters/inputxml-managed-stage/inputxml-managed-stage-runner.js';
import './inputxml-managed-stage-topology.test.js';

const xml = `<CAESARII VERSION="11.00" XML_TYPE="Input"><PIPINGMODEL JOBNAME="BM" NUMELT="2" NUMREST="8" NUMBEND="1" NUMRIGID="1" NUMISECT="1">
<PIPINGELEMENT FROM_NODE="10.000000" TO_NODE="20.000000" DELTA_X="-1.010100" DELTA_Y="-1.010100" DELTA_Z="-100.000000" DIAMETER="114.300000" WALL_THICK="6.000000" INSUL_THICK="20.000000" CORR_ALLOW="0.000000" TEMP_EXP_C1="350.000000" PRESSURE1="2.000000" HYDRO_PRESSURE="5.000000" MODULUS="203390.703125" HOT_MOD1="178960.625000" POISSONS="0.292000" PIPE_DENSITY="0.007833" INSUL_DENSITY="0.000140" FLUID_DENSITY="0.001000" MATERIAL_NUM="106.000000" MATERIAL_NAME="A106 B"><RIGID WEIGHT="186.808350" TYPE="Flange Pair" /></PIPINGELEMENT>
<PIPINGELEMENT FROM_NODE="20.000000" TO_NODE="30.000000" DELTA_X="50.000000" DELTA_Y="0.000000" DELTA_Z="0.000000" DIAMETER="-1.010100" WALL_THICK="-1.010100" MATERIAL_NAME="-1.010100"><BEND RADIUS="152.399994" ANGLE1="45.000000" NODE1="29.000000" ANGLE2="0.000000" NODE2="28.000000" /><SIF TYPE="TEE" NODE="20" /></PIPINGELEMENT>
<RESTRAINT NUM="1" NODE="10.000000" TYPE="0.000000" GAP="-1.010100" XCOSINE="0.000000" YCOSINE="0.000000" ZCOSINE="0.000000" TAG="" GUID="" />
<RESTRAINT NUM="2" NODE="20.000000" TYPE="7.000000" GAP="5.000000" XCOSINE="1.000000" YCOSINE="0.000000" ZCOSINE="0.000000" TAG="PS-123" GUID="" />
<RESTRAINT NUM="3" NODE="-1.010100" TYPE="-1.010100" GAP="-1.010100" XCOSINE="-1.010100" YCOSINE="-1.010100" ZCOSINE="-1.010100" TAG="" GUID="" />
</PIPINGMODEL></CAESARII>`;

const staged = buildInputXmlDirectManagedStageJson(xml, { sourceName: 'BM_CII_INPUT.XML' });
assert.equal(staged.schema, 'inputxml-managed-stage/v1');
assert.equal(staged.converter, 'INPUTXML->STAGEDJSON');
assert.match(staged.converterSchema, /^inputxml-direct-managed-stage\//);
assert.equal(staged.stats.components, 2);
assert.equal(staged.stats.restraintRows, 3);
assert.equal(staged.stats.validRestraints, 2);
assert.equal(staged.stats.blankRestraintRows, 1);
assert.equal(staged.stats.emittedSupports, 2);
assert.equal(staged.stats.rigids, 1);
assert.equal(staged.stats.bends, 1);
assert.equal(staged.stats.sifElements, 1);
assert.ok(staged.stats.richGeometryComponents >= 2, 'route components expose APOS/LPOS/length evidence');
assert.ok(staged.stats.uxmlReadyComponents >= 2, 'staged children expose UXML-ready coordinate anchors');

const children = staged.hierarchy[0].children;
const flange = children.find((child) => child.type === 'FLAN');
assert.ok(flange, 'rigid flange pair is emitted as FLAN');
assert.equal(flange.attributes.RIGID_WEIGHT, '186.808350');
assert.equal(flange.attributes.INSUL_THICK, '20.000000');
assert.equal(flange.attributes.HYDRO_PRESSURE, '5.000000');
assert.equal(flange.attributes.MATERIAL_NUM, '106.000000');
assert.equal(flange.attributes.SOURCE_KIND, 'CONVENTIONAL_XML');
assert.equal(flange.attributes.SOURCE_AUTHORITY, 'conventional-xml-topology-inferred');
assert.equal(flange.attributes.ROUTE_LENGTH_MM, 100);
assert.equal(flange.attributes.OUTSIDE_DIAMETER_MM, 114.3);
assert.deepEqual(flange.attributes.SOURCE_NODE_NUMBERS, ['10', '20']);

const bend = children.find((child) => child.type === 'BEND');
assert.ok(bend, 'bend component emitted');
assert.equal(bend.attributes.BEND_RADIUS, '152.399994');
assert.equal(bend.attributes.BEND_ANGLE, '45.000000');
assert.equal(bend.attributes.BEND_NODE2, '28');
assert.equal(bend.attributes.DIAMETER_SOURCE, 'inherited');
assert.equal(bend.attributes.SIF_COUNT, 1);
assert.equal(bend.attributes.ROUTE_LENGTH_MM, 50);
assert.ok(Number(bend.attributes.ELBOW_ARC_LENGTH_MM) > 0, 'bend arc length is propagated');
assert.ok(bend.attributes.CPOS, 'bend midpoint evidence is propagated');

const supports = children.filter((child) => child.type === 'ATTA');
assert.equal(supports[0].attributes.SUPPORT_KIND, 'REST');
assert.equal(supports[0].attributes.NODE_ROLE, 'support-restraint');
assert.equal(supports[1].attributes.SUPPORT_KIND, 'GUIDE');
assert.equal(supports[1].attributes.SOURCE_TAG, 'PS-123');
assert.equal(supports[1].attributes.SUPPORT_GAP_MM, 5);
assert.ok(supports[1].attributes.HOST_COMPONENT_ID, 'support host component evidence is propagated');

const response = await run({ inputFiles: [{ role: 'primary', name: 'BM_CII_INPUT.XML', text: xml }], options: { includeAuditJson: true } });
assert.equal(response.ok, true);
assert.ok(response.outputs.some((entry) => entry.name.endsWith('_managed_stage.json')));
assert.ok(response.outputs.some((entry) => entry.name.endsWith('_managed_stage.uxml.json')));
assert.ok(response.outputs.some((entry) => entry.name.endsWith('_managed_stage.audit.json')));
const uxmlOutput = response.outputs.find((entry) => entry.name.endsWith('_managed_stage.uxml.json'));
const uxml = JSON.parse(uxmlOutput.text);
assert.ok(Array.isArray(uxml.components));
assert.ok(uxml.components.length >= 2, 'UXML sidecar carries route components');
assert.ok(uxml.segments.length >= 2, 'UXML sidecar carries APOS-LPOS route segments');
assert.match(response.logs.stdout.join('\n'), /blankRestraintRows=1/);
assert.match(response.logs.stdout.join('\n'), /richGeometryComponents=/);

console.log('inputxml-direct-managed-stage: all assertions passed');
