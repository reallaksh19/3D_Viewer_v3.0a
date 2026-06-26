import assert from 'node:assert/strict';
import { TextEncoder } from 'node:util';
import { parseRvmArrayBuffer, isLikelyRvmFileName } from '../../../rvm/BrowserRvmParser.js';

function bufferFromText(text) {
  const bytes = new TextEncoder().encode(text);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function makeWideTagRecord(tag, ints, payloadBytes = new Uint8Array()) {
  return { tag, ints, payloadBytes };
}

function asciiBytes(text) {
  return new TextEncoder().encode(text);
}

function floatBytes(values) {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setFloat32(index * 4, value, false));
  return bytes;
}

function buildSampleAvevaBinaryRvm() {
  const records = [
    makeWideTagRecord('HEAD', [1, 2, 22], asciiBytes('AVEVA E3D Design Design Mk3.1.7.2\0')),
    makeWideTagRecord('MODL', [1, 1, 1], asciiBytes('RBB\0/RBB1\0')),
    makeWideTagRecord('CNTB', [1, 2, 4], asciiBytes('PIPE 1 of ZONE /RHBG-1000-CU-PI-P\0')),
    makeWideTagRecord('PRIM', [1, 1, 8], floatBytes([
      0, 0, 0.001,
      0.001, 0, 0,
      0, 0.001, 0,
      100, 20, 0,
      -50, -10, -10,
      50, 10, 10,
      10, 100
    ])),
    makeWideTagRecord('END:', [1, 1, 0], new Uint8Array())
  ];

  const lengths = records.map((record) => 32 + record.payloadBytes.length);
  const offsets = [];
  let cursor = 0;
  for (const len of lengths) {
    offsets.push(cursor);
    cursor += len;
  }
  const bytes = new Uint8Array(cursor);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    const offset = offsets[i];
    for (let c = 0; c < 4; c += 1) view.setUint32(offset + c * 4, record.tag.charCodeAt(c), false);
    view.setUint32(offset + 16, offset + lengths[i], false);
    view.setUint32(offset + 20, record.ints[0], false);
    view.setUint32(offset + 24, record.ints[1], false);
    view.setUint32(offset + 28, record.ints[2], false);
    bytes.set(record.payloadBytes, offset + 32);
  }
  return bytes.buffer;
}

async function run() {
  assert.equal(isLikelyRvmFileName('model.rvm'), true);
  assert.equal(isLikelyRvmFileName('model.rev'), true);
  assert.equal(isLikelyRvmFileName('model.json'), false);

  const sample = [
    'AVEVA RVM BINARY TEST HEADER',
    'CYLI PIPE MAIN RUN',
    'FLAN 150RF',
    'VALV GATE VALVE',
    'SUPPORT GUIDE'
  ].join('\u0000');
  const result = await parseRvmArrayBuffer(bufferFromText(sample), { fileName: 'sample.rvm' });
  assert.equal(result.ok, true);
  assert.equal(result.sourceFormat, 'RVM_BINARY_BROWSER_FALLBACK');
  assert.ok(Array.isArray(result.hierarchy));
  assert.ok(result.hierarchy[0].children.length >= 4, 'primitive strings should create fallback render nodes');
  assert.ok(result.hierarchy[0].children.some((child) => child.type === 'PIPE'));
  assert.ok(result.hierarchy[0].children.some((child) => child.type === 'FLANGE'));
  assert.ok(result.hierarchy[0].children.some((child) => child.type === 'VALVE'));
  assert.ok(result.hierarchy[0].children.some((child) => child.type === 'SUPPORT'));
  assert.ok(result.diagnostics.unsupportedBinaryDecoding, 'string-marker fallback must remain honest about binary decoding');

  const structured = await parseRvmArrayBuffer(bufferFromText([
    'AVEVA REVIEW RVM',
    'CYLI APOS 0 0 0 LPOS 1000 0 0 HBOR 57.15',
    'BOX BBOX -10 -20 -30 10 20 30',
    'VALV 1000 0 0 1200 0 0 90'
  ].join('\u0000')), { fileName: 'structured.rvm' });
  assert.equal(structured.ok, true);
  assert.equal(structured.diagnostics.parseFidelity, 'PARTIAL_PRIMITIVE_RECORDS');
  assert.equal(structured.diagnostics.structuredRecordCount, 3);
  assert.equal(structured.diagnostics.unsupportedBinaryDecoding, false);
  const pipe = structured.hierarchy[0].children.find((child) => child.type === 'PIPE');
  assert.ok(pipe, 'structured CYLI should create PIPE node');
  assert.deepEqual(pipe.attributes.APOS, { x: 0, y: 0, z: 0 });
  assert.deepEqual(pipe.attributes.LPOS, { x: 1000, y: 0, z: 0 });
  assert.equal(pipe.attributes.HBOR, '57.15');
  assert.equal(pipe.attributes.BROWSER_PARSE_METHOD, 'named-endpoints');
  const box = structured.hierarchy[0].children.find((child) => child.type === 'BOX');
  assert.deepEqual(box.bbox, [-10, -20, -30, 10, 20, 30]);

  const binary = await parseRvmArrayBuffer(buildSampleAvevaBinaryRvm(), { fileName: 'RHBG.RVM' });
  assert.equal(binary.ok, true);
  assert.equal(binary.diagnostics.parseFidelity, 'PARTIAL_BINARY_PRIM_RECORDS');
  assert.equal(binary.diagnostics.binaryPrimitiveRecordCount, 1);
  assert.equal(binary.diagnostics.rvmRecordTags.PRIM, 1);
  assert.equal(binary.diagnostics.unsupportedBinaryDecoding, false);
  const binaryPipe = binary.hierarchy[0].children.find((child) => child.type === 'PIPE');
  assert.ok(binaryPipe, 'wide-tag PRIM record should create a PIPE node from owner CNTB name');
  assert.equal(binaryPipe.attributes.BROWSER_PARSE_METHOD, 'binary-rvm-record');
  assert.equal(binaryPipe.attributes.RVM_PRIMITIVE_CODE, '8');
  assert.equal(binaryPipe.attributes.RVM_OWNER_NAME, 'PIPE 1 of ZONE /RHBG-1000-CU-PI-P');
  assert.deepEqual(binaryPipe.bbox, [50, 10, -10, 150, 30, 10]);
  assert.deepEqual(binaryPipe.attributes.APOS, { x: 50, y: 20, z: 0 });
  assert.deepEqual(binaryPipe.attributes.LPOS, { x: 150, y: 20, z: 0 });

  const emptyBinary = await parseRvmArrayBuffer(new ArrayBuffer(32), { fileName: 'empty.rvm' });
  assert.equal(emptyBinary.ok, true);
  assert.equal(emptyBinary.hierarchy[0].children.length, 1, 'unrecognised RVM should still open as placeholder');
  assert.equal(emptyBinary.diagnostics.parseFidelity, 'PLACEHOLDER_ONLY');

  console.log('Browser RVM parser smoke test passed');
}

run();
