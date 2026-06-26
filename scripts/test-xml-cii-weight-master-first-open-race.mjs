import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(root, 'viewer/tabs/model-converters/converters/xmltocii2019_helper/weight-match-renderer.js'), 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`ok - ${message}`);
  }
}

assert(!source.includes('function delay('), '4A renderer has no polling delay helper');
assert(!source.includes('waitForWeightMasterRows'), '4A renderer has no timer-based wait loop');
assert(source.includes('function hasWeightMasterRows'), '4A renderer checks weight master readiness');
assert(source.includes('renderWeightMasterBlocked'), '4A renderer blocks instead of ranking without master rows');
assert(source.includes('false <strong>0 / No match</strong> rows'), 'blocked state explains false zero/no-match prevention');
assert(source.includes('if (!hasWeightMasterRows(liveConfig))'), 'compute stops before dry-run when master rows are missing');
assert(source.includes('if (!hasWeightMasterRows(cfg))'), 'compute stops after dry-run merge if master rows are still missing');
