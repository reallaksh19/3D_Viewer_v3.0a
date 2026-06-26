import assert from 'node:assert/strict';
import {
  convertUxmlDocumentToAvevaHierarchy,
  isUxmlDocument,
} from '../rvm/UxmlToAvevaJsonAdapter.js';

const uxml = {
  schemaVersion: 'uxml-topology-v1',
  profile: 'UXML-TOPOLOGY-FULL',
  header: { modelId: 'UNIT-RVM-UXML' },
  pipelines: [
    {
      id: 'pipe:P-1001',
      pipelineRef: 'P-1001',
      lineKey: 'P1001',
      lineNo: 'P-1001',
      rawAttributes: {
        NAME: 'P-1001/B1',
        OWNER: 'P-1001',
        HPOS: { x: 0, y: 0, z: 0 },
        TPOS: { x: 1000, y: 0, z: 0 },
        HREF: '=HEAD',
        TREF: '=TAIL',
      },
    },
  ],
  components: [
    {
      // Name intentionally sorts after the elbow. The adapter must preserve
      // staged/source order from the :00001 id suffix, otherwise the RVM
      // loader's sequential topology connects the wrong adjacent components.
      id: 'cmp:ZZZ-PIPE-001:00001',
      type: 'PIPE',
      normalizedType: 'PIPE',
      pipelineRef: 'pipe:P-1001',
      lineKey: 'P1001',
      refNo: 'PIPE-001',
      name: 'ZZZ PIPE 001',
      bore: 100,
      anchorIds: ['anc:pipe-001:APOS', 'anc:pipe-001:LPOS'],
      portIds: ['prt:pipe-001:APOS', 'prt:pipe-001:LPOS'],
      segmentIds: ['seg:pipe-001'],
      rawAttributes: { SPRE: 'PIPE-SPEC' },
    },
    {
      // Name intentionally sorts before the pipe. It should still remain second.
      id: 'cmp:AAA-ELBO-001:00002',
      type: 'ELBO',
      normalizedType: 'ELBOW',
      pipelineRef: 'pipe:P-1001',
      lineKey: 'P1001',
      refNo: '=ELBO-001',
      name: 'AAA ELBO 001',
      bore: 100,
      anchorIds: ['anc:elbo-001:APOS', 'anc:elbo-001:LPOS'],
      portIds: ['prt:elbo-001:APOS', 'prt:elbo-001:LPOS'],
      segmentIds: ['seg:elbo-001'],
      rawAttributes: { TYPE: 'ELBO', NAME: '=ELBO-001', REF: '=ELBO-001' },
    },
    {
      id: 'cmp:REDU-001:00003',
      type: 'REDU',
      normalizedType: 'REDUCER',
      pipelineRef: 'pipe:P-1001',
      lineKey: 'P1001',
      refNo: '=REDU-001',
      name: 'REDU =REDU-001',
      bore: 50,
      anchorIds: ['anc:redu-001:APOS', 'anc:redu-001:LPOS'],
      portIds: ['prt:redu-001:APOS', 'prt:redu-001:LPOS'],
      segmentIds: ['seg:redu-001'],
      rawAttributes: { TYPE: 'REDU', NAME: '=REDU-001', REF: '=REDU-001', ABORE: '50mm', LBORE: '25mm' },
    },
    {
      id: 'cmp:OLET-001:00004',
      type: 'OLET',
      normalizedType: 'OLET',
      pipelineRef: 'pipe:P-1001',
      lineKey: 'P1001',
      refNo: '=OLET-001',
      name: 'OLET =OLET-001',
      bore: 250,
      branchBore: 50,
      anchorIds: ['anc:olet-001:APOS', 'anc:olet-001:LPOS', 'anc:olet-001:BPOS'],
      portIds: ['prt:olet-001:APOS', 'prt:olet-001:LPOS', 'prt:olet-001:BPOS'],
      segmentIds: ['seg:olet-001'],
      rawAttributes: { TYPE: 'OLET', NAME: '=OLET-001', REF: '=OLET-001', ABORE: '250mm', LBORE: '250mm', SPRE: '/SPEC/BR3B-250x50' },
    },
    {
      id: 'cmp:support-001:00005',
      type: 'SUPPORT',
      normalizedType: 'SUPPORT',
      pipelineRef: 'pipe:P-1001',
      lineKey: 'P1001',
      refNo: 'SUP-001',
      name: 'SUPPORT 001',
      anchorIds: ['anc:support-001:POS'],
      portIds: ['prt:support-001:POS'],
      segmentIds: [],
      rawAttributes: { CMPSUPTYPE: 'GUIDE' },
    },
  ],
  anchors: [
    { id: 'anc:pipe-001:APOS', componentId: 'cmp:ZZZ-PIPE-001:00001', role: 'START', point: { x: 0, y: 0, z: 0 } },
    { id: 'anc:pipe-001:LPOS', componentId: 'cmp:ZZZ-PIPE-001:00001', role: 'END', point: { x: 1000, y: 0, z: 0 } },
    { id: 'anc:elbo-001:APOS', componentId: 'cmp:AAA-ELBO-001:00002', role: 'START', point: { x: 1000, y: 0, z: 0 } },
    { id: 'anc:elbo-001:LPOS', componentId: 'cmp:AAA-ELBO-001:00002', role: 'END', point: { x: 1000, y: 250, z: 0 } },
    { id: 'anc:redu-001:APOS', componentId: 'cmp:REDU-001:00003', role: 'START', point: { x: 1000, y: 250, z: 0 } },
    { id: 'anc:redu-001:LPOS', componentId: 'cmp:REDU-001:00003', role: 'END', point: { x: 1000, y: 500, z: 0 } },
    { id: 'anc:olet-001:APOS', componentId: 'cmp:OLET-001:00004', role: 'START', point: { x: 1200, y: 500, z: 0 } },
    { id: 'anc:olet-001:LPOS', componentId: 'cmp:OLET-001:00004', role: 'END', point: { x: 1300, y: 500, z: 0 } },
    { id: 'anc:olet-001:BPOS', componentId: 'cmp:OLET-001:00004', role: 'BRANCH', point: { x: 1250, y: 500, z: -175 } },
    { id: 'anc:support-001:POS', componentId: 'cmp:support-001:00005', role: 'CENTER', point: { x: 500, y: 0, z: 0 } },
  ],
  ports: [
    { id: 'prt:pipe-001:APOS', componentId: 'cmp:ZZZ-PIPE-001:00001', anchorId: 'anc:pipe-001:APOS', role: 'START' },
    { id: 'prt:pipe-001:LPOS', componentId: 'cmp:ZZZ-PIPE-001:00001', anchorId: 'anc:pipe-001:LPOS', role: 'END' },
    { id: 'prt:elbo-001:APOS', componentId: 'cmp:AAA-ELBO-001:00002', anchorId: 'anc:elbo-001:APOS', role: 'START' },
    { id: 'prt:elbo-001:LPOS', componentId: 'cmp:AAA-ELBO-001:00002', anchorId: 'anc:elbo-001:LPOS', role: 'END' },
    { id: 'prt:redu-001:APOS', componentId: 'cmp:REDU-001:00003', anchorId: 'anc:redu-001:APOS', role: 'START', bore: 50, boreField: 'ABORE' },
    { id: 'prt:redu-001:LPOS', componentId: 'cmp:REDU-001:00003', anchorId: 'anc:redu-001:LPOS', role: 'END', bore: 25, boreField: 'LBORE' },
    { id: 'prt:olet-001:APOS', componentId: 'cmp:OLET-001:00004', anchorId: 'anc:olet-001:APOS', role: 'START', bore: 250, boreField: 'ABORE' },
    { id: 'prt:olet-001:LPOS', componentId: 'cmp:OLET-001:00004', anchorId: 'anc:olet-001:LPOS', role: 'END', bore: 250, boreField: 'LBORE' },
    { id: 'prt:olet-001:BPOS', componentId: 'cmp:OLET-001:00004', anchorId: 'anc:olet-001:BPOS', role: 'BRANCH', bore: 50, boreField: 'BBORE', branchBore: 50, branchBoreField: 'BBORE' },
    { id: 'prt:support-001:POS', componentId: 'cmp:support-001:00005', anchorId: 'anc:support-001:POS', role: 'CENTER' },
  ],
  segments: [
    { id: 'seg:pipe-001', componentId: 'cmp:ZZZ-PIPE-001:00001', startAnchorId: 'anc:pipe-001:APOS', endAnchorId: 'anc:pipe-001:LPOS', bore: 100 },
    { id: 'seg:elbo-001', componentId: 'cmp:AAA-ELBO-001:00002', startAnchorId: 'anc:elbo-001:APOS', endAnchorId: 'anc:elbo-001:LPOS', bore: 100 },
    { id: 'seg:redu-001', componentId: 'cmp:REDU-001:00003', startAnchorId: 'anc:redu-001:APOS', endAnchorId: 'anc:redu-001:LPOS', bore: 50, startBore: 50, startBoreField: 'ABORE', endBore: 25, endBoreField: 'LBORE' },
    { id: 'seg:olet-001', componentId: 'cmp:OLET-001:00004', startAnchorId: 'anc:olet-001:APOS', endAnchorId: 'anc:olet-001:BPOS', type: 'BRANCH', bore: 250, startBore: 250, endBore: 50, endBoreField: 'BBORE', branchBore: 50 },
  ],
  supports: [
    { id: 'sup:001', componentId: 'cmp:support-001:00005', type: 'GUIDE', supportAnchorId: 'anc:support-001:POS' },
  ],
};

assert.equal(isUxmlDocument(uxml), true);

const hierarchy = convertUxmlDocumentToAvevaHierarchy(uxml, { fileName: 'unit.managed_stage.uxml.json' });
assert.equal(hierarchy.length, 1);
assert.equal(hierarchy[0].type, 'BRANCH');
assert.equal(hierarchy[0].children.length, 5);
assert.deepEqual(hierarchy[0].attributes.HPOS, { x: 0, y: 0, z: 0 });
assert.deepEqual(hierarchy[0].attributes.TPOS, { x: 1000, y: 0, z: 0 });
assert.equal(hierarchy[0].attributes.HREF, '=HEAD');
assert.equal(hierarchy[0].attributes.TREF, '=TAIL');

assert.equal(hierarchy[0].children[0].name, 'ZZZ PIPE 001', 'UXML adapter must preserve source/staged order from id suffix, not alphabetic name order');
assert.equal(hierarchy[0].children[1].name, 'AAA ELBO 001', 'ELBO must remain after the preceding pipe per source order');

const pipe = hierarchy[0].children.find((child) => child.type === 'PIPE');
assert.ok(pipe, 'PIPE component should be mapped');
assert.deepEqual(pipe.attributes.APOS, { x: 0, y: 0, z: 0 });
assert.deepEqual(pipe.attributes.LPOS, { x: 1000, y: 0, z: 0 });
assert.equal(pipe.attributes.BORE, 100);
assert.equal(pipe.attributes.ABORE, undefined, 'adapter must not expand scalar component.bore into all AVEVA endpoint bore fields');
assert.equal(pipe.attributes.SOURCE_FORMAT, 'UXML');
assert.equal(pipe.attributes.UXML_COMPONENT_ID, 'cmp:ZZZ-PIPE-001:00001');

const elbow = hierarchy[0].children.find((child) => child.name === 'AAA ELBO 001');
assert.ok(elbow, 'ELBO component should be mapped');
assert.equal(elbow.type, 'ELBO', 'UXML adapter must preserve staged short type names for RVM loader parity');
assert.equal(elbow.attributes.TYPE, 'ELBO');
assert.equal(elbow.attributes.UXML_NORMALIZED_TYPE, 'ELBOW');
assert.equal(elbow.attributes.NAME, '=ELBO-001');
assert.equal(elbow.attributes.REF, '=ELBO-001');

const reducer = hierarchy[0].children.find((child) => child.type === 'REDU');
assert.ok(reducer, 'REDU component should be mapped');
assert.equal(reducer.attributes.ABORE, '50mm');
assert.equal(reducer.attributes.LBORE, '25mm', 'UXML adapter must preserve reducer outlet/end bore, not overwrite it from component.bore');

const olet = hierarchy[0].children.find((child) => child.type === 'OLET');
assert.ok(olet, 'OLET component should be mapped');
assert.equal(olet.attributes.ABORE, '250mm');
assert.equal(olet.attributes.LBORE, '250mm');
assert.equal(olet.attributes.BBORE, '50mm', 'OLET branch bore must remain branch size, not parent pipe size');

const support = hierarchy[0].children.find((child) => child.type === 'SUPPORT');
assert.ok(support, 'SUPPORT component should be mapped');
assert.deepEqual(support.attributes.POS, { x: 500, y: 0, z: 0 });
assert.equal(support.attributes.CMPSUPTYPE, 'GUIDE');

console.log('✅ RVM UXML import adapter test passed.');
