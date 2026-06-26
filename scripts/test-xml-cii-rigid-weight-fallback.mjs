import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rankXmlCiiWeightCandidates } from '../viewer/converters/xml-cii2019-core/weight-valve-hints.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const hints = read('viewer/converters/xml-cii2019-core/weight-valve-hints.js');
const model = read('viewer/converters/xml-cii2019-core/weight-match-model.js');
const flangeFallback = read('viewer/converters/xml-cii2019-core/flange-weight-fallback.js');
const renderer = read('viewer/tabs/model-converters/converters/xmltocii2019_helper/weight-match-renderer.js');
const runner = read('viewer/tabs/model-converters/converters/xmltocii2019_runner.js');

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`ok - ${message}`);
  }
}

assert(hints.includes('sameBoreRatingInterpolationFallback'), 'weight ranker has same bore/rating fallback');
assert(hints.includes("'length-interpolated'") && hints.includes("'length-extrapolated'") && hints.includes('weightMethod: method'), 'fallback emits interpolation and extrapolation methods');
assert(hints.includes("weightMethod: 'no-same-bore-rating'") && hints.includes('selectedWeight: 0'), 'fallback emits explicit zero when no same bore/rating rows exist');
assert(hints.includes('inferredWeight: true') && hints.includes('zeroFallback: true'), 'fallback candidates are traceable');
assert(hints.includes('DEFAULT_SPECIAL_VALVE_FACTOR_RULES') && hints.includes('UZV_EMERGENCY') && hints.includes('INST_PCV_FCV') && hints.includes('RELIEF_RV'), 'weight ranker has configurable non-standard valve factor rules');
assert(hints.includes('specialValveFactorCandidate') && hints.includes("weightMethod: 'special-factor'") && hints.includes('odd extrapolation ratio flagged'), 'factor rules emit traceable inferred candidates and odd-entry warnings');
assert(model.includes('!reviewNode || !reviewEndpoint || lengthMm === null'), 'post-run zero-weight review uses widened review-node and endpoint filter, not rigid-only filter');
assert(flangeFallback.includes('buildXmlCiiFlangeWeightFallback'), 'flange fallback helper exists');
assert(flangeFallback.includes("weightMethod: 'flange-length-extrapolated'"), 'flange fallback uses dedicated method');
assert(flangeFallback.includes('Flange WT scaled to ElementLength'), 'flange fallback labels proposed weight basis');
assert(renderer.includes('20260626-weight-review-2'), '4A weight-match renderer cache-busts widened review model');
assert(renderer.includes('20260626-weight-factor-1'), '4A weight-match renderer cache-busts factor-rule weight hints');
assert(renderer.includes('20260620-flange-fallback-1'), '4A renderer cache-busts flange fallback helper');
assert(renderer.includes("mergeSection(out, live, 'weight', 'masterRows')"), '4A merge preserves weight master rows');
assert(renderer.includes('Flange extrapolated') && renderer.includes('flange fallback'), '4A renderer labels flange fallback source');
assert(renderer.includes('Editable weight keyword / factor rules') && renderer.includes('data-wm-factor-row'), '4A renderer exposes editable semantic/factor rule config');
assert(runner.includes('20260626-weight-review-2'), 'final runner cache-busts widened review model');
assert(runner.includes('applyXmlCiiFlangeWeightFallbackToIssues'), 'final runner applies flange fallback before review popup');

const factorRanking = rankXmlCiiWeightCandidates({
  boreMm: 100,
  rating: '150',
  lengthMm: 150,
  dtxr: 'UZV EMERGENCY VALVE',
}, {
  weight: {
    masterRows: [
      { boreMm: 100, rating: '150', lengthMm: 100, weight: 10, typeDesc: 'CONTROL VALVE' },
      { boreMm: 100, rating: '150', lengthMm: 200, weight: 20, typeDesc: 'CONTROL VALVE' },
      { boreMm: 100, rating: '150', lengthMm: 100, weight: 7, typeDesc: 'BALL VALVE' },
      { boreMm: 100, rating: '150', lengthMm: 200, weight: 14, typeDesc: 'BALL VALVE' },
    ],
  },
}, { includeRejected: true });
assert(factorRanking.best?.weightMethod === 'special-factor', 'UZV DTXR produces a special-factor candidate');
assert(factorRanking.best?.selectedWeight === 30, 'UZV factor uses max of 2x interpolated control valve vs 2x ball valve');
