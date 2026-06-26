import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const glyph = await fs.readFile(new URL('../overlays/nodes/NodeMarkerGlyphGeometry.js', import.meta.url), 'utf8');
const markerBridge = await fs.readFile(new URL('../tabs/RvmNonPrimitiveNodeMarkerBridge.js', import.meta.url), 'utf8');
const renderer = await fs.readFile(new URL('../tabs/viewer3d-rvm-tab-renderer.js', import.meta.url), 'utf8');

assert.match(glyph, /__RVM_NON_PRIMITIVE_NODE_MARKERS__/, 'glyph root name is stable');
assert.match(glyph, /rvmNodeMarkerRoot:\s*true/, 'root is marked as node marker root');
assert.match(glyph, /rvmNodeMarker:\s*true/, 'glyph is marked as node marker');
assert.match(glyph, /markerSelectable:\s*true/, 'glyph is dedicated-marker selectable');
assert.match(glyph, /pickable:\s*false/, 'glyph is not normal RVM pickable');
assert.match(glyph, /primitiveExcluded:\s*true/, 'glyph is excluded from primitive model semantics');
assert.match(glyph, /rvmSearchIndexed:\s*false/, 'glyph is excluded from RVM search');
assert.match(glyph, /rvmSelectionUsed:\s*false/, 'glyph does not use primitive RVM selection');
assert.match(glyph, /excludeFromRvmSearch:\s*true/, 'glyph explicitly opts out of RVM search indexing');
assert.match(glyph, /rvmNodeMarkerDetails:\s*marker/, 'glyph carries marker details for dedicated hover/click layers');
assert.match(glyph, /function createMarkerGeometry/, 'glyph geometry has a version-compatible constructor helper');
assert.match(glyph, /OctahedronGeometry|SphereGeometry|BoxGeometry/, 'glyph geometry provides safe primitive fallbacks');
assert.match(glyph, /disposeTree/, 'glyph cleanup disposes geometry/material resources');
assert.match(markerBridge, /attachNodeMarkerGlyphs/, 'node marker bridge attaches glyphs after data build');
assert.match(markerBridge, /clearNodeMarkerGlyphRoot/, 'node marker bridge clears glyph root');
assert.match(markerBridge, /ensureNodeMarkerHover/, 'node marker bridge installs hover runtime');
assert.doesNotMatch(renderer, /NodeMarkerGlyphGeometry|RvmNonPrimitiveNodeMarkerHoverBridge/, 'renderer must not eagerly import node marker glyph/hover code');

console.log('nonprimitive-node-marker-overlay passed');
