import fs from 'node:fs';

const patch = fs.readFileSync('viewer/rvm/AvevaJsonVisibleFallbackPatch.js', 'utf8');
const app = fs.readFileSync('viewer/core/app.js', 'utf8');
const uxmlAddon = fs.readFileSync('viewer/tabs/viewer3d-rvm-uxml-import-addon.js', 'utf8');

const requiredPatchTokens = [
  'installAvevaJsonVisibleFallbackPatch',
  'AvevaJsonLoader.prototype.load',
  'appendFallbackGeometry',
  'collectRenderableCandidates',
  'APOS',
  'LPOS',
  'HPOS',
  'TPOS',
  'BPOS',
  'POS',
  'AVEVA_VISIBLE_GEOMETRY_FALLBACK',
];

const missing = requiredPatchTokens.filter((token) => !patch.includes(token));
if (missing.length) {
  console.error('Missing visible fallback patch token(s):', missing.join(', '));
  process.exit(1);
}

if (!app.includes("../rvm/AvevaJsonVisibleFallbackPatch.js?v=20260618-staged-visible-fallback-1")) {
  console.error('RVM app loader does not install the staged visible fallback patch.');
  process.exit(1);
}

if (uxmlAddon.includes('new RvmViewer3D') || uxmlAddon.includes('clearViewportForStandaloneViewer')) {
  console.error('UXML add-on must not create a standalone RVM viewer; it must use the active RVM model-loaded pipeline.');
  process.exit(1);
}

if (!uxmlAddon.includes('AvevaJsonLoader') || !uxmlAddon.includes('loader.load(hierarchy')) {
  console.error('UXML add-on does not route UXML hierarchy through AvevaJsonLoader.');
  process.exit(1);
}

console.log('✅ RVM staged/UXML visible fallback smoke passed.');
