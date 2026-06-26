import assert from 'node:assert/strict';
import {
  BROWSER_RVM_ATT_PARSER_SCHEMA,
  matchBrowserRvmAttAttributes,
  parseBrowserRvmAttText,
  summarizeBrowserRvmAtt
} from '../../../rvm/BrowserRvmAttParser.js';

const sampleAtt = `
PROJECT = RHBG
AREA: CU-PI-P

[PIPE 1 of ZONE /RHBG-1000-CU-PI-P]
LINE_NO = 1000-CU-PI-P
SPEC = A1A
INSULATION = PP

OWNER GASKET 1 of BRANCH 1 of PIPE 1 of ZONE /RHBG-1000-CU-PI-P | TAG = GSK-001
GASKET 1 of BRANCH 1 of PIPE 1 of ZONE /RHBG-1000-CU-PI-P | RATING = 150

[VALVE 3 of BRANCH 1 of PIPE 1 of ZONE /RHBG-1000-CU-PI-P]
TAG = XV-3001
TYPE = GATE
`;

function run() {
  const parsed = parseBrowserRvmAttText(sampleAtt);
  assert.equal(parsed.schemaVersion, BROWSER_RVM_ATT_PARSER_SCHEMA);
  assert.equal(parsed.globals.PROJECT, 'RHBG');
  assert.equal(parsed.globals.AREA, 'CU-PI-P');
  assert.equal(parsed.owners.length, 3, 'owner blocks and inline owner attrs should be grouped by canonical owner');

  const pipeAttrs = matchBrowserRvmAttAttributes(parsed, 'PIPE 1 of ZONE /RHBG-1000-CU-PI-P');
  assert.equal(pipeAttrs.ATT_PROJECT, 'RHBG', 'global attributes should be inherited');
  assert.equal(pipeAttrs.ATT_LINE_NO, '1000-CU-PI-P');
  assert.equal(pipeAttrs.ATT_SPEC, 'A1A');

  const gasketAttrs = matchBrowserRvmAttAttributes(parsed, 'GASKET 1 of BRANCH 1 of PIPE 1 of ZONE /RHBG-1000-CU-PI-P');
  assert.equal(gasketAttrs.ATT_TAG, 'GSK-001');
  assert.equal(gasketAttrs.ATT_RATING, '150');

  const valveAttrs = matchBrowserRvmAttAttributes(parsed, 'VALVE 3 of BRANCH 1 of PIPE 1 of ZONE /RHBG-1000-CU-PI-P');
  assert.equal(valveAttrs.ATT_TAG, 'XV-3001');
  assert.equal(valveAttrs.ATT_TYPE, 'GATE');

  const fuzzy = matchBrowserRvmAttAttributes(parsed, 'BRANCH 1 / PIPE 1 / ZONE /RHBG-1000-CU-PI-P / GASKET 1');
  assert.equal(fuzzy.ATT_TAG, 'GSK-001', 'token-overlap matching should recover reordered owner paths');

  const summary = summarizeBrowserRvmAtt(parsed);
  assert.equal(summary.schemaVersion, BROWSER_RVM_ATT_PARSER_SCHEMA);
  assert.equal(summary.globalAttributeCount, 2);
  assert.equal(summary.ownerCount, 3);
  assert.ok(summary.ownerAttributeCount >= 7);

  console.log('Browser RVM ATT parser contract test passed');
}

run();
