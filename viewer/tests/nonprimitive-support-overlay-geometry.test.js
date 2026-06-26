import assert from 'node:assert/strict';
import fs from 'node:fs';

import { resolveSupportSymbol } from '../overlays/support/NonPrimitiveSupportOverlayResolver.js';
import {
  SUPPORT_OVERLAY_GLYPH_GEOMETRY_SCHEMA,
  planSupportOverlayGlyph,
} from '../overlays/support/SupportOverlayGlyphGeometry.js';

const rest = planSupportOverlayGlyph(
  resolveSupportSymbol({ family: 'REST', pipeAxis: { x: 1, y: 0, z: 0 } }),
  { glyphSize: 40 },
);
assert.equal(rest.schema, SUPPORT_OVERLAY_GLYPH_GEOMETRY_SCHEMA);
assert.equal(rest.usesLineSegments, false);
assert.equal(rest.operations.length, 1);
assert.equal(rest.operations[0].kind, 'arrow');
assert.deepEqual(rest.operations[0].components.map((component) => component.geometry), ['cylinder', 'cone']);
assert.equal(rest.operations[0].materialCategory, 'support');

const stop = planSupportOverlayGlyph(
  resolveSupportSymbol({ family: 'LINESTOP', pipeAxis: { x: 1, y: 0, z: 0 }, pipeOdMm: 300, gapMm: 10 }),
  { glyphSize: 40 },
);
assert.equal(stop.operations.length, 2);
assert.ok(stop.operations.every((operation) => operation.axial));
assert.ok(stop.operations.every((operation) => operation.gap === 100));
assert.ok(stop.operations.every((operation) => operation.length >= 40));
assert.ok(stop.operations.every((operation) => operation.components.some((component) => component.geometry === 'cone')));

const spring = planSupportOverlayGlyph(
  resolveSupportSymbol({ family: 'SPRING_CAN' }),
  { glyphSize: 40 },
);
assert.equal(spring.operations.length, 1);
assert.equal(spring.operations[0].kind, 'coil');
assert.equal(spring.operations[0].materialCategory, 'warning');
assert.ok(spring.operations[0].components.some((component) => component.geometry === 'torus'));
assert.ok(spring.operations[0].components.some((component) => component.geometry === 'cylinder'));

const unknown = planSupportOverlayGlyph(
  resolveSupportSymbol({ family: 'UNKNOWN' }),
  { glyphSize: 40 },
);
assert.equal(unknown.operations.length, 1);
assert.equal(unknown.operations[0].kind, 'warning-marker');
assert.equal(unknown.operations[0].components.length, 3);
assert.ok(unknown.operations[0].components.every((component) => component.geometry === 'cylinder'));

const bridge = fs.readFileSync(new URL('../tabs/RvmNonPrimitiveSupportOverlayBridge.js', import.meta.url), 'utf8');
assert.ok(bridge.includes('SupportOverlayGlyphGeometry.js'));
assert.ok(/rvm-non-primitive-support-overlay\/v[456789]/.test(bridge));
assert.ok(!bridge.includes('new THREE.LineSegments'));
assert.ok(!bridge.includes('LineBasicMaterial'));

console.log('non-primitive support overlay geometry tests passed');
