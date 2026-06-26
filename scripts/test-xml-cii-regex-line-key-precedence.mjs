#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const moduleUrl = pathToFileURL(path.join(__dirname, '../viewer/converters/xml-cii2019-core/regex-line-key.js')).href;
const { tokenizeBranchName, deriveLineKeyFromBranchName } = await import(moduleUrl);

const legacyBranch = '/ASIM-1885-10"-S8810101-91261M7-HC/B1';
assert.deepEqual(tokenizeBranchName(legacyBranch), ['ASIM', '1885', '10"', 'S8810101', '91261M7', 'HC']);
assert.equal(
  deriveLineKeyFromBranchName(legacyBranch, {
    linelist: { lineKeyTokenPositions: '4', tokenDelimiter: '-', lineKeyJoiner: '' },
  }),
  'S8810101',
  'legacy token layout should still resolve line key at position 4',
);

const shiftedBranch = '/ASIM-1885-PL-10"-CS-S8810105-01/B2';
assert.deepEqual(tokenizeBranchName(shiftedBranch), ['ASIM', '1885', 'PL', '10"', 'CS', 'S8810105', '01']);
assert.equal(
  deriveLineKeyFromBranchName(shiftedBranch, {
    linelist: { lineKeyTokenPositions: '4', tokenDelimiter: '-', lineKeyJoiner: '' },
  }),
  '10"',
  'without an override, token position 4 remains the literal fallback result',
);
assert.equal(
  deriveLineKeyFromBranchName(shiftedBranch, {
    linelist: {
      branchNameRegex: '(S\\d{7})',
      lineNoGroup: 1,
      lineKeyTokenPositions: '4',
      tokenDelimiter: '-',
      lineKeyJoiner: '',
    },
  }),
  'S8810105',
  'explicit line-key regex must override stale token fallback for shifted branch formats',
);
assert.equal(
  deriveLineKeyFromBranchName(shiftedBranch, {
    linelist: { lineKeyTokenPositions: '6', tokenDelimiter: '-', lineKeyJoiner: '' },
  }),
  'S8810105',
  'updated token position 6 should also resolve shifted branch line key',
);

console.log('✅ XML CII regex line-key precedence regression test passed');
