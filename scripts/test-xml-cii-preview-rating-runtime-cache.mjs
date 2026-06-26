import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const must = (text, needle, label) => {
  if (!text.includes(needle)) throw new Error(label);
};

const filldown = read('viewer/tabs/model-converters/shared/preview-filldown.js');
const weightMatch = read('viewer/tabs/model-converters/converters/xmltocii2019_helper/weight-match-renderer.js');
const tab = read('viewer/tabs/model-converters/ModelConvertersTab.js');
const sync = read('viewer/tabs/model-converters/xml-cii-runtime-override-sync.js');

must(filldown, 'RUNTIME_OVERRIDE_STORAGE_KEY', 'runtime cache key missing');
must(filldown, 'getXmlCiiPreviewRuntimeConfig', 'runtime config export missing');
must(filldown, "setRuntimeProcessValue(key, 'rating', cleanValue)", 'rating override is not mirrored to processData runtime cache');
must(filldown, "setRuntimeBucketValue('rating', lineKey, cleanValue)", 'process rating is not mirrored to rating runtime cache');

must(weightMatch, 'getXmlCiiPreviewRuntimeConfig', '4A weight match does not read preview runtime overrides');
must(weightMatch, 'runtime cache before ranking', '4A help text does not document runtime cache use');
must(weightMatch, 'getXmlCiiPreviewRuntimeConfig())', '4A compute does not merge preview runtime overrides');

must(sync, 'syncSupportConfigTextarea', 'supportConfigJson sync helper missing');
must(sync, 'getXmlCiiPreviewRuntimeConfig', 'sync installer does not read runtime overrides');
must(tab, 'installXmlCiiRuntimeOverrideSync', 'runtime override sync installer not registered');
must(tab, '20260620-rating-runtime-1', 'rich workflow cache keys not bumped');

console.log('XML CII preview rating runtime cache regression checks passed.');
