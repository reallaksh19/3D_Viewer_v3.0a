import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const renderer = readFileSync('viewer/tabs/model-converters/converters/xmltocii2019_helper/weight-match-renderer.js', 'utf8');
const shell = readFileSync('viewer/tabs/model-converters/ModelConvertersTab.js', 'utf8');

assert.match(renderer, /loadDefaultWeightMasterRows/);
assert.match(renderer, /defaultWeightMasterCandidateUrls/);
assert.match(renderer, /wtValveweights\.json/);
assert.match(renderer, /cache: 'no-cache'/);
assert.match(renderer, /Default master hydration failed/);
assert.match(renderer, /ensureWeightMasterRows/);
assert.match(renderer, /await ensureWeightMasterRows\(liveConfig\)/);
assert.match(renderer, /await ensureWeightMasterRows\(enriched\.config \|\| liveConfig\)/);

assert.match(shell, /weight-hydration-2/);

assert.doesNotMatch(renderer, /function delay\s*\(/);
assert.doesNotMatch(renderer, /waitForWeightMasterRows/);

console.log('XML CII weight master hydration regression passed');
