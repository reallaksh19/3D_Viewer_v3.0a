/**
 * test-model-converters-domain.mjs
 *
 * Phase 3 unit tests for the XML→CII(2019) domain modules surfaced through
 * the xml-cii-domain.js barrel.
 *
 * Tests:
 *   1. regex-line-key  — tokenize, token-at-position, derive line key
 *   2. element-length  — SRSS correctness (Math.hypot)
 *   3. linelist-mapping — canon, clean, field detection basics
 *   4. dtxr-resolver   — buildStagedDtxrIndex smoke
 */

import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const {
  tokenizeBranchName,
  tokenAtPosition,
  xmlCiiLineKeyFromBranchTokens,
  deriveLineKeyFromBranchName,
} = await import('../viewer/tabs/model-converters/xml-cii-domain.js');

const { computeElementLengthFromCiiVector } = await import(
  '../viewer/tabs/model-converters/xml-cii-domain.js'
);

const { canon, clean, detectLineListFieldMap } = await import(
  '../viewer/tabs/model-converters/xml-cii-domain.js'
);

const { buildStagedDtxrIndex } = await import(
  '../viewer/tabs/model-converters/xml-cii-domain.js'
);

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

async function test(label, fn) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${label}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// 1. regex-line-key
// ---------------------------------------------------------------------------
console.log('\n1. regex-line-key');

await test('tokenizeBranchName splits on delimiter', () => {
  const tokens = tokenizeBranchName('/ASIM-1885-10"-S8810101-91261M7-HC/B1', '-');
  // Strip leading slash prefix and trailing /BN, then split
  // Expected tokens: ASIM, 1885, 10, S8810101, 91261M7, HC/B1  (or similar)
  assert.ok(Array.isArray(tokens));
  assert.ok(tokens.length >= 4, `Expected >= 4 tokens, got ${tokens.length}: ${tokens.join('|')}`);
});

await test('tokenAtPosition returns 1-based token', () => {
  const branch = 'A-B-C-D-E';
  assert.equal(tokenAtPosition(branch, '-', 1), 'A');
  assert.equal(tokenAtPosition(branch, '-', 3), 'C');
  assert.equal(tokenAtPosition(branch, '-', 5), 'E');
});

await test('tokenAtPosition returns empty string for out-of-range index', () => {
  assert.equal(tokenAtPosition('A-B', '-', 99), '');
});

await test('xmlCiiLineKeyFromBranchTokens extracts key from token positions', () => {
  const config = { linelist: { lineKeyTokenPositions: '4', tokenDelimiter: '-' } };
  const branch = '/ASIM-1885-10"-S8810101-91261M7-HC/B1';
  const key = xmlCiiLineKeyFromBranchTokens(branch, config);
  assert.equal(typeof key, 'string');
  assert.ok(key.length > 0, 'Expected non-empty line key');
});

await test('deriveLineKeyFromBranchName returns empty string for blank input', () => {
  const config = { linelist: { lineKeyTokenPositions: '4' } };
  assert.equal(deriveLineKeyFromBranchName('', config), '');
});

// ---------------------------------------------------------------------------
// 2. element-length (SRSS)
// ---------------------------------------------------------------------------
console.log('\n2. element-length (SRSS)');

await test('computeElementLengthFromCiiVector — pure X axis', () => {
  assert.equal(computeElementLengthFromCiiVector(3, 0, 0), 3);
});

await test('computeElementLengthFromCiiVector — pure Y axis', () => {
  assert.equal(computeElementLengthFromCiiVector(0, 4, 0), 4);
});

await test('computeElementLengthFromCiiVector — 3-4-5 right triangle', () => {
  assert.equal(computeElementLengthFromCiiVector(3, 4, 0), 5);
});

await test('computeElementLengthFromCiiVector — 3D diagonal (1,1,1) ≈ √3', () => {
  const length = computeElementLengthFromCiiVector(1, 1, 1);
  assert.ok(Math.abs(length - Math.sqrt(3)) < 1e-10, `Expected ~${Math.sqrt(3)}, got ${length}`);
});

await test('computeElementLengthFromCiiVector — all zeros → 0', () => {
  assert.equal(computeElementLengthFromCiiVector(0, 0, 0), 0);
});

await test('computeElementLengthFromCiiVector — handles string inputs', () => {
  // CII fields come in as strings; must coerce to number
  const length = computeElementLengthFromCiiVector('100', '0', '0');
  assert.equal(length, 100);
});

await test('computeElementLengthFromCiiVector — handles NaN/undefined as zero', () => {
  const length = computeElementLengthFromCiiVector(undefined, NaN, '');
  assert.equal(length, 0);
});

// ElementLengthMm SRSS vs CII ELEMENT fields 3/4/5 invariant:
// fields 3/4/5 are DX/DY/DZ; ElementLengthMm must equal hypot(DX,DY,DZ).
await test('SRSS invariant: ElementLengthMm = hypot(DX,DY,DZ)', () => {
  const dx = 123.4, dy = 56.7, dz = 8.9;
  const expected = Math.hypot(dx, dy, dz);
  const actual = computeElementLengthFromCiiVector(dx, dy, dz);
  assert.equal(actual, expected);
});

// ---------------------------------------------------------------------------
// 3. linelist-mapping
// ---------------------------------------------------------------------------
console.log('\n3. linelist-mapping');

await test('canon normalises value to lowercase trimmed string', () => {
  assert.equal(canon('  TEMP MAX  '), 'temp max');
  assert.equal(canon(null), '');
  assert.equal(canon(undefined), '');
});

await test('clean uppercases and strips whitespace', () => {
  const result = clean('  temp max  ');
  assert.equal(result, 'TEMPMAX');
});

await test('detectLineListFieldMap returns an object with at least one mapping for simple headers', () => {
  const rows = [
    { 'Line Key': 'LK001', 'Piping Class': 'A1', 'T1': '150', 'T2': '50' },
  ];
  const config = {};
  const fieldMap = detectLineListFieldMap(rows, {}, config);
  assert.ok(typeof fieldMap === 'object' && fieldMap !== null);
  // At minimum T1 or T2 should be detected
  const mappedFields = Object.keys(fieldMap).filter((k) => fieldMap[k]);
  assert.ok(mappedFields.length > 0, `Expected at least one mapped field, got: ${JSON.stringify(fieldMap)}`);
});

// ---------------------------------------------------------------------------
// 4. dtxr-resolver
// ---------------------------------------------------------------------------
console.log('\n4. dtxr-resolver');

await test('buildStagedDtxrIndex returns index object for empty staged JSON', () => {
  const index = buildStagedDtxrIndex({}, {});
  assert.ok(typeof index === 'object' && index !== null);
});

await test('buildStagedDtxrIndex returns index object for null input', () => {
  const index = buildStagedDtxrIndex(null, {});
  assert.ok(typeof index === 'object' && index !== null);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${'─'.repeat(50)}`);
if (failed === 0) {
  console.log(`\n✅ All ${passed} domain tests passed.\n`);
  process.exit(0);
} else {
  console.error(`\n❌ ${failed} test(s) failed out of ${passed + failed}.\n`);
  process.exit(1);
}
