import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  formatSupportOverlayLabel,
  shouldShowSupportOverlayLabel,
  SUPPORT_OVERLAY_LABEL_SCHEMA,
} from '../overlays/support/SupportOverlayLabels.js';

assert.equal(SUPPORT_OVERLAY_LABEL_SCHEMA, 'support-overlay-labels/v1');
assert.equal(shouldShowSupportOverlayLabel({ labels: true }), true);
assert.equal(shouldShowSupportOverlayLabel({ labels: false }), false);
assert.equal(shouldShowSupportOverlayLabel({}), false);

assert.equal(
  formatSupportOverlayLabel({ tag: 'PS-101', kind: 'GUIDE' }),
  'PS-101 GUIDE',
);

assert.equal(
  formatSupportOverlayLabel({ tag: 'RVM CYLINDER 2211 INPUTXML-16990-GUIDE GUIDE', kind: 'GUIDE' }),
  '2211-GUIDE GUIDE',
);

const bridge = fs.readFileSync(new URL('../tabs/RvmNonPrimitiveSupportOverlayBridge.js', import.meta.url), 'utf8');
const settings = fs.readFileSync(new URL('../overlays/support/SupportOverlaySettings.js', import.meta.url), 'utf8');
assert.ok(bridge.includes('CSS2DObject'));
assert.ok(bridge.includes('SupportOverlayLabels.js'));
assert.ok(bridge.includes('rvm-non-primitive-support-overlay/v9'));
assert.ok(bridge.includes('SupportOverlaySourceExtraction.js'));
assert.ok(bridge.includes('shouldShowSupportOverlayLabel(settings)'));
assert.ok(settings.includes('labelsUserSet'));
assert.ok(settings.includes('resetNonPrimitiveSupportOverlayLabels'));
assert.ok(!bridge.includes('Support Labels button'));
assert.ok(!bridge.includes('RvmSupportSymbols'));

console.log('non-primitive support overlay labels tests passed');
