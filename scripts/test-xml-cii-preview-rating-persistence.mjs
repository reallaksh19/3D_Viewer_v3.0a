#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const previewPath = 'viewer/tabs/model-converters/converters/xmltocii2019_helper/preview-renderer.js';
const source = fs.readFileSync(path.join(root, previewPath), 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ${message}`);
    process.exit(1);
  }
}

assert(source.includes('function _savePreviewOverride'), 'Preview must centralize override saving');
assert(source.includes("if (editType === 'rating')"), 'Preview must special-case rating overrides');
assert(source.includes('overrides.rating[key] = cleanValue'), 'Rating override must be stored under stable keys');
assert(source.includes("_setProcessDataField(overrides, key, 'rating', cleanValue)"), 'Rating override must also be stored under processData');
assert(source.includes('const manualRating = _ratingOverride(config, ratingKeys)'), 'Preview rerender must read manual rating before row/class fallback');
assert(source.includes("if (editType === 'rating' && row.lineKey) markPreviewProcessManual"), 'Rating save must mark processData metadata as manual');
assert(source.includes("if (actualField === 'rating' && cleanVal)"), 'Direct processData rating edits must mirror into rating override bucket');

console.log('✅ XML CII preview rating persistence static test passed');
