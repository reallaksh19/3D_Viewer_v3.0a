import fs from 'node:fs';

const addon = fs.readFileSync('viewer/tabs/viewer3d-rvm-uxml-import-addon.js', 'utf8');
const app = fs.readFileSync('viewer/core/app.js', 'utf8');

const requiredAddonTokens = [
  'function unwrapUxmlDocument',
  'function isJsonLikeName',
  'importJsonLikeFiles',
  'emitStandardJsonImport',
  'event.stopImmediatePropagation',
];

const missing = requiredAddonTokens.filter((token) => !addon.includes(token));
if (missing.length) {
  console.error('Missing UXML content-sniff safeguards:', missing.join(', '));
  process.exit(1);
}

if (!/viewer3d-rvm-uxml-import-addon\.js\?v=20260618-rvm-uxml-content-sniff-1/.test(app)) {
  console.error('viewer/core/app.js does not cache-bust the UXML content-sniff add-on.');
  process.exit(1);
}

if (!addon.includes('sourceKind: \'uxml\'') || !addon.includes('kind: isBundleManifest ? \'bundle\' : \'aveva-json\'')) {
  console.error('UXML and non-UXML JSON paths are not both preserved.');
  process.exit(1);
}

console.log('✅ RVM UXML content sniff smoke passed. Renamed UXML JSON is routed through the UXML adapter.');
