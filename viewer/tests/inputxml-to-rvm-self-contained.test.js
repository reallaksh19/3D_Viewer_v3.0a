import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { run } from '../tabs/model-converters/converters/inputxml-to-rvm.js';
import { getConverterById } from '../tabs/model-converters/converter-registry.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const vendoredDir = join(here, '..', 'converters', 'inputxml-rvm');
const benchmarkXml = join(repoRoot, 'Benchmarks', 'INPUT XML to CII 2019', 'BM_CII', 'BM_CII_INPUT.XML');

// ---------------------------------------------------------------------------
// 1. Self-containment guard: the vendored converter must not import anything
//    outside its own folder (no shared viewer modules).
// ---------------------------------------------------------------------------
const importRe = /\bfrom\s+['"]([^'"]+)['"]/g;
for (const fileName of readdirSync(vendoredDir)) {
  if (!fileName.endsWith('.js')) continue;
  const src = readFileSync(join(vendoredDir, fileName), 'utf-8');
  let m;
  while ((m = importRe.exec(src)) !== null) {
    const spec = m[1];
    assert.ok(
      spec.startsWith('./') && !spec.startsWith('../') && !spec.slice(2).includes('/'),
      `${fileName} imports "${spec}" — vendored converter must only import sibling files (no shared modules).`,
    );
  }
}

// ---------------------------------------------------------------------------
// 2. Registry wiring: converter is registered exactly once and enabled.
// ---------------------------------------------------------------------------
const conv = getConverterById('inputxml_to_rvm');
assert.ok(conv, 'inputxml_to_rvm must be registered');
assert.equal(conv.disabled, false, 'inputxml_to_rvm must be enabled');
assert.equal(typeof conv.run, 'function', 'inputxml_to_rvm must have a run function');

// ---------------------------------------------------------------------------
// 3. End-to-end: benchmark Input XML -> binary RVM + .att.
// ---------------------------------------------------------------------------
const xmlText = readFileSync(benchmarkXml, 'utf-8');
const result = await run({
  inputFiles: [{ role: 'primary', name: 'BM_CII_INPUT.XML', text: xmlText }],
  options: { rvmPrecision: 3, includeAtt: true },
  setStatus() {},
  converterId: 'inputxml_to_rvm',
});

assert.equal(result.ok, true, `run must succeed; stderr: ${JSON.stringify(result?.logs?.stderr)}`);

const rvmOut = result.outputs.find((o) => /\.rvm$/i.test(o.name));
assert.ok(rvmOut, 'must emit a .rvm output');
assert.ok(typeof rvmOut.base64 === 'string' && rvmOut.base64.length > 0, '.rvm must be non-empty base64');

const attOut = result.outputs.find((o) => /\.att$/i.test(o.name));
assert.ok(attOut, 'must emit an .att output when includeAtt is true');
assert.ok(/NEW GEOMETRY/.test(attOut.text), '.att must contain a GEOMETRY group');

// GLB companion: in a browser the wrapper emits a .glb (three.js exporter);
// in Node three.js is unavailable, so it must degrade gracefully — i.e. either a
// .glb output exists OR a "GLB companion skipped" log line is present, and the
// RVM output is unaffected either way.
const glbOut = result.outputs.find((o) => /\.glb$/i.test(o.name));
const glbSkipped = (result.logs?.stdout || []).some((l) => /GLB companion skipped/.test(l));
assert.ok(glbOut || glbSkipped, 'GLB companion must either be emitted or be cleanly skipped');

// ---------------------------------------------------------------------------
// 4. Binary RVM structural validation (rvmparser-style chunk framing):
//    big-endian 24-byte headers, ascii tag packed at byte i*4+3, cumulative
//    next_chunk_offset, first chunk HEAD, terminates at END: == file length.
// ---------------------------------------------------------------------------
const buf = Buffer.from(rvmOut.base64, 'base64');
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const readTag = (o) => [0, 1, 2, 3].map((i) => String.fromCharCode(buf[o + i * 4 + 3])).join('');

assert.equal(readTag(0), 'HEAD', 'first chunk tag must be HEAD');

let offset = 0;
let chunks = 0;
const tagCounts = {};
while (offset < buf.length) {
  const tag = readTag(offset);
  const nextOff = dv.getUint32(offset + 16, false);
  tagCounts[tag] = (tagCounts[tag] || 0) + 1;
  chunks += 1;
  if (tag === 'END:') {
    offset = nextOff;
    break;
  }
  assert.ok(nextOff > offset, `next_chunk_offset must advance (tag=${tag}, off=${offset})`);
  offset = nextOff;
  assert.ok(chunks < 100000, 'chunk walk must terminate');
}

assert.equal(tagCounts['END:'], 1, 'exactly one END: chunk');
assert.equal(tagCounts.HEAD, 1, 'exactly one HEAD chunk');
assert.equal(tagCounts.MODL, 1, 'exactly one MODL chunk');
assert.ok(tagCounts.PRIM > 0, 'must contain PRIM geometry chunks');
assert.equal(tagCounts.CNTB, tagCounts.CNTE, 'CNTB and CNTE groups must balance');
assert.equal(offset, buf.length, 'cumulative offsets must land exactly at end of file');

console.log(`OK inputxml-to-rvm: ${chunks} chunks, ${tagCounts.PRIM} primitives, ${buf.length} bytes`);
