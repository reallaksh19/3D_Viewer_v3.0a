import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import {
  buildSupportOverlayHoverPreviewState,
  clearSupportOverlayHovers,
  createEmptySupportOverlayHoverState,
  hoverSupportOverlayGlyph,
  renderSupportOverlayHoverPreviewHtml,
  SUPPORT_OVERLAY_HOVER_SCHEMA,
} from '../overlays/support/SupportOverlayHover.js';

function fakeMaterial(colorHex = 0x60c864) {
  return {
    color: {
      value: colorHex,
      setHex(value) { this.value = value; },
      getHex() { return this.value; },
    },
    opacity: 0.9,
    transparent: true,
    depthTest: true,
    disposed: false,
    clone() {
      return fakeMaterial(this.color.value);
    },
    dispose() {
      this.disposed = true;
    },
  };
}

function object({ userData = {}, material = null, children = [] } = {}) {
  const node = { userData, material, children };
  node.traverse = (visit) => {
    visit(node);
    for (const child of children) child.traverse ? child.traverse(visit) : visit(child);
  };
  for (const child of children) child.parent = node;
  return node;
}

const originalA = fakeMaterial(0x60c864);
const originalB = fakeMaterial(0xffcc33);
const glyph = object({
  userData: {
    supportOverlayDetails: {
      supportId: 'PS-201',
      supportNo: 'PS-201',
      family: 'LINESTOP',
      rawType: '<LINE STOP>',
      nodeId: 'N-20',
      warnings: [{ code: 'gapVisualSeparationCapped' }, 'axis warning'],
      primitiveExcluded: true,
      rvmSearchIndexed: false,
      pickable: false,
      selectable: false,
    },
    supportTag: 'PS-201',
    supportKind: 'LINESTOP',
    pickable: false,
    selectable: false,
  },
  children: [
    object({ userData: { supportGlyphPart: 'arrow' }, material: originalA }),
    object({ userData: { supportGlyphPart: 'stem' }, material: originalB }),
  ],
});
const root = object({ userData: { nonPrimitiveSupportOverlay: true }, children: [glyph] });

const hovered = hoverSupportOverlayGlyph(glyph, [root], { supportId: 'PS-201', family: 'LINESTOP' });
assert.equal(hovered.schema, SUPPORT_OVERLAY_HOVER_SCHEMA);
assert.equal(hovered.status, 'hovered');
assert.equal(hovered.supportId, 'PS-201');
assert.equal(hovered.family, 'LINESTOP');
assert.equal(hovered.hoveredParts, 2);
assert.equal(hovered.primitiveExcluded, true);
assert.equal(hovered.rvmSearchIndexed, false);
assert.equal(hovered.pickable, false);
assert.equal(hovered.selectable, false);
assert.equal(glyph.userData.supportOverlayHovered, true);
assert.notEqual(glyph.children[0].material, originalA, 'hover clones child material instead of mutating original');
assert.notEqual(glyph.children[1].material, originalB, 'hover clones child material instead of mutating original');
assert.equal(glyph.children[0].userData.pickable, false);
assert.equal(glyph.children[0].userData.selectable, false);

const preview = buildSupportOverlayHoverPreviewState(glyph.userData.supportOverlayDetails, {
  sourceKind: 'inputxml',
  sourceFile: 'BM_CII_INPUT_managed_stage.json',
});
assert.equal(preview.schema, SUPPORT_OVERLAY_HOVER_SCHEMA);
assert.equal(preview.status, 'preview');
assert.equal(preview.supportId, 'PS-201');
assert.equal(preview.family, 'LINESTOP');
assert.equal(preview.rawType, '<LINE STOP>');
assert.equal(preview.nodeId, 'N-20');
assert.equal(preview.warningCount, 2);
assert.deepEqual(preview.warnings, ['gapVisualSeparationCapped', 'axis warning']);
assert.equal(preview.sourceKind, 'inputxml');
assert.equal(preview.primitiveExcluded, true);
assert.equal(preview.rvmSearchIndexed, false);
assert.equal(preview.pickable, false);
assert.equal(preview.selectable, false);

const html = renderSupportOverlayHoverPreviewHtml(preview);
assert.match(html, /PS-201 LINESTOP/);
assert.match(html, /&lt;LINE STOP&gt;/, 'hover preview escapes raw support type');
assert.match(html, /2 warnings/);

const cleared = clearSupportOverlayHovers([root], 'pointer-leave');
assert.equal(cleared.schema, SUPPORT_OVERLAY_HOVER_SCHEMA);
assert.equal(cleared.status, 'cleared');
assert.equal(cleared.clearedOwners, 1);
assert.equal(cleared.restoredParts, 2);
assert.equal(glyph.userData.supportOverlayHovered, false);
assert.equal(glyph.children[0].material, originalA, 'clear restores original material');
assert.equal(glyph.children[1].material, originalB, 'clear restores original material');

const selectedGlyph = object({
  userData: {
    supportOverlayHighlighted: true,
    supportOverlayDetails: { supportId: 'PS-202', family: 'GUIDE' },
  },
  children: [object({ userData: {}, material: fakeMaterial(0x66d9ff) })],
});
const selectedHover = hoverSupportOverlayGlyph(selectedGlyph, [object({ children: [selectedGlyph] })], { supportId: 'PS-202' });
assert.equal(selectedHover.status, 'skipped');
assert.equal(selectedHover.reason, 'selected-glyph-already-highlighted');

const empty = createEmptySupportOverlayHoverState('primitive-or-no-source-hierarchy');
assert.equal(empty.status, 'empty');
assert.equal(empty.primitiveExcluded, true);
assert.equal(empty.rvmSearchIndexed, false);
assert.equal(empty.pickable, false);
assert.equal(empty.selectable, false);

const helper = await fs.readFile(new URL('../overlays/support/SupportOverlayHover.js', import.meta.url), 'utf8');
const bridge = await fs.readFile(new URL('../tabs/RvmNonPrimitiveSupportOverlayHoverBridge.js', import.meta.url), 'utf8');
const deferredLoader = await fs.readFile(new URL('../tabs/RvmDeferredBridgeLoader.js', import.meta.url), 'utf8');

assert.match(helper, /support-overlay-hover\/v1/, 'hover helper exposes schema');
assert.match(helper, /__supportOverlayHoverOriginalMaterial/, 'hover helper stores original material for restore');
assert.match(helper, /material\.clone/, 'hover helper clones materials before applying hover color');
assert.match(helper, /selected-glyph-already-highlighted/, 'hover helper does not override selected glyph highlight');
assert.match(bridge, /rvm-non-primitive-support-overlay-hover\/v2/, 'hover bridge exposes navigation-safe schema');
assert.match(bridge, /HOVER_THROTTLE_MS/, 'hover bridge has a pointermove throttle budget');
assert.match(bridge, /event\.buttons/, 'hover bridge detects drag navigation by pointer buttons');
assert.match(bridge, /navigation-drag/, 'hover bridge clears/skips while orbit or pan dragging');
assert.match(bridge, /pointermove-throttled/, 'hover bridge throttles repeated pointer move raycasts');
assert.match(bridge, /duplicateOwnerSkipped/, 'hover bridge skips duplicate owner material updates');
assert.match(bridge, /pointerEvents = 'none'|pointer-events: none/, 'hover preview DOM cannot block canvas navigation');
assert.match(bridge, /nonPrimitiveSupportOverlayHoverDiagnostics/, 'hover diagnostics record navigation-safe state');
assert.match(bridge, /pointermove/, 'hover bridge listens for pointer move');
assert.match(bridge, /pointerleave/, 'hover bridge clears hover on pointer leave');
assert.match(bridge, /pointerdown/, 'hover bridge clears hover when navigation starts');
assert.match(bridge, /__RVM_NON_PRIMITIVE_SUPPORT_OVERLAY__/, 'hover bridge scopes raycast to support overlay root');
assert.match(bridge, /nonPrimitiveSupportOverlayHoverState/, 'hover state is stored outside RVM primitive selection state');
assert.match(bridge, /rvm-support-hover-preview/, 'hover bridge renders a lightweight preview tooltip');
assert.doesNotMatch(bridge, /selection\.select|selection\.pick|RvmSelectionAdapter|objectSearch/, 'hover bridge does not call RVM primitive selection or search code');
assert.match(deferredLoader, /RvmNonPrimitiveSupportOverlayHoverBridge\.js\?v=20260623-nonprimitive-support-hover-2/, 'sourcePreview deferred loader owns navigation-safe hover bridge cache key');

console.log('non-primitive support overlay hover tests passed');
