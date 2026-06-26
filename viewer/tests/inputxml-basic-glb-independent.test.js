import assert from 'node:assert/strict';
import fs from 'node:fs';

import { run } from '../converters/inputxml-basic-glb/inputxml-basic-glb-runner.js';
import { buildInputXmlManagedStageJson } from '../converters/inputxml-basic-glb/InputXmlBasicStagedJsonBuilder.js';

const xml = `<CAESARII VERSION="11.00" XML_TYPE="Input"><PIPINGMODEL JOBNAME="BASIC">
<PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="1000" DELTA_Y="0" DELTA_Z="0" DIAMETER="100" />
<PIPINGELEMENT FROM_NODE="20" TO_NODE="30" DELTA_X="0" DELTA_Y="500" DELTA_Z="0" DIAMETER="100"><VALVE /><RESTRAINT NODE="20" TYPE="17" XCOSINE="0" YCOSINE="0" ZCOSINE="1" /></PIPINGELEMENT>
<PIPINGELEMENT FROM_NODE="30" TO_NODE="40" DELTA_X="0" DELTA_Y="0" DELTA_Z="350" DIAMETER="100"><BEND RADIUS="150" ANGLE="90" /><HANGER NODE="40" /></PIPINGELEMENT>
</PIPINGMODEL></CAESARII>`;

// ---------------------------------------------------------------------------
// 1. Runner: three.js may not be available in Node; degrade gracefully
// ---------------------------------------------------------------------------
const response = await run({ inputFiles: [{ role: 'primary', name: 'basic.xml', text: xml }], options: { includeSidecarJson: true, includeManagedStageJson: true } });
assert.equal(response.ok, true, `run must succeed; stderr: ${JSON.stringify(response?.logs?.stderr)}`);

// GLB and sidecar JSON are emitted in browser (three.js available); in Node.js they are skipped
const glb_output = response.outputs.find((o) => o.name.endsWith('basic.glb'));
const staged_output = response.outputs.find((o) => o.name.endsWith('basic_managed_stage.json'));
const sidecar_output = response.outputs.find((o) => o.name.endsWith('basic-inputxml-glb-sidecar.json'));
if (glb_output) {
  assert.equal(glb_output.mime, 'model/gltf-binary');
  assert.ok(glb_output.base64.length > 0, 'GLB must be non-empty');
  assert.ok(staged_output, 'browser conversion must emit managed-stage JSON sidecar');
  const staged = JSON.parse(staged_output.text);
  assert.equal(staged.schema, 'inputxml-managed-stage/v1');
  assert.ok(Array.isArray(staged.hierarchy), 'managed-stage JSON must expose hierarchy[] for 3D RVM Viewer');
  assert.ok(staged.hierarchy[0].children.some((child) => child.type === 'ATTA'), 'managed-stage JSON must include ATTA support nodes');
  if (sidecar_output) {
    const sidecar = JSON.parse(sidecar_output.text);
    assert.equal(sidecar.schema, 'inputxml-glb-sidecar/v1');
    assert.ok(typeof sidecar.componentCount === 'number', 'sidecar must include componentCount');
    assert.ok(sidecar.managedStageJson?.outputName?.endsWith('_managed_stage.json'), 'audit must mention managed-stage output');
  }
} else {
  const skipped = response.logs.stdout.some((line) => /Basic GLB skipped/.test(line));
  assert.ok(skipped, 'GLB skipped log must be present when three.js is unavailable');
}

// ---------------------------------------------------------------------------
// 2. Managed-stage builder contract for 3D RVM Viewer
// ---------------------------------------------------------------------------
const sampleModel = {
  elements: [{
    id: 'PE_001_PIPE_10_TO_20',
    fromNode: '10',
    toNode: '20',
    from: { id: '10', x: 0, y: 0, z: 0 },
    to: { id: '20', x: 1000, y: 0, z: 0 },
    dx: 1000,
    dy: 0,
    dz: 0,
    type: 'PIPE',
    rawType: 'PIPE',
    props: { id: 'PE_001_PIPE_10_TO_20', refNo: 'PE_001_PIPE_10_TO_20', type: 'PIPE', boreMm: 100, bore: { value: '100', source: 'explicit' }, lineNo: 'L-001', lineNoSource: 'test' },
  }],
  nodes: new Map([
    ['10', { id: '10', x: 0, y: 0, z: 0 }],
    ['20', { id: '20', x: 1000, y: 0, z: 0 }],
  ]),
  restraints: [{ id: 'R1', node: '20', typeCode: '7', rawType: '7', xCos: 0, yCos: 0, zCos: 1, gapMm: 5 }],
};
const staged = buildInputXmlManagedStageJson(sampleModel, { sourceName: 'unit.xml' });
assert.equal(staged.schema, 'inputxml-managed-stage/v1');
assert.equal(staged.profile, 'AVEVA_JSON_FOR_3D_RVM_VIEWER');
assert.equal(staged.hierarchy.length, 1);
const branch = staged.hierarchy[0];
assert.equal(branch.type, 'BRANCH');
const pipe = branch.children.find((child) => child.type === 'PIPE');
assert.ok(pipe, 'managed-stage hierarchy must include pipe component');
assert.deepEqual(pipe.attributes.APOS, { x: 0, y: 0, z: 0 });
assert.deepEqual(pipe.attributes.LPOS, { x: 1000, y: 0, z: 0 });
assert.equal(pipe.attributes.BORE, '100mm');
const support = branch.children.find((child) => child.type === 'ATTA');
assert.ok(support, 'managed-stage hierarchy must include restraint support node');
assert.equal(support.attributes.SUPPORT_KIND, 'GUIDE');
assert.equal(support.attributes.SUPPORT_MAPPER_KIND, 'GUIDE');
assert.deepEqual(support.attributes.SUPPORTCOORD, { x: 1000, y: 0, z: 0 });
assert.equal(support.attributes.ATTACHED_PIPE_BORE, '100mm');
assert.equal(support.attributes.SUPPORT_GAP_MM, 5);

// ---------------------------------------------------------------------------
// 3. Source integrity checks
// ---------------------------------------------------------------------------
const runnerSource = fs.readFileSync(new URL('../converters/inputxml-basic-glb/inputxml-basic-glb-runner.js', import.meta.url), 'utf8');
assert.equal(/inputxml-dxf|pcf2glb\/glb\/buildExportScene|inputxml-glb\/inputxml-to-glb-runner/.test(runnerSource), false, 'runner must not import shared converter modules');
assert.match(runnerSource, /buildInputXmlManagedStageJson/, 'runner must emit managed-stage JSON sidecar');

const bridgeSource = fs.readFileSync(new URL('../tabs/model-converters/inputxml-basic-glb-bridge.js', import.meta.url), 'utf8');
assert.match(bridgeSource, /inputxml_to_basic_glb/);
assert.match(bridgeSource, /InputXML→Basic GLB/);

const tabSource = fs.readFileSync(new URL('../tabs/model-converters-tab.js', import.meta.url), 'utf8');
assert.match(tabSource, /installInputXmlBasicGlbBridge/);
assert.match(tabSource, /inputxml-basic-glb-bridge/);

console.log('inputxml-basic-glb-independent: all assertions passed');
