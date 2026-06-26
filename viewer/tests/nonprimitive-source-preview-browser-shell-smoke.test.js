import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

import { collectExistingAutoBendNodeKinds, collectNonPrimitiveAutoBendSegments } from '../overlays/autobend/NonPrimitiveAutoBendSourceAdapter.js';
import { resolveNonPrimitiveAutoBends } from '../overlays/autobend/NonPrimitiveAutoBendResolver.js';
import { collectNonPrimitiveSupportRecords } from '../overlays/support/SupportOverlaySourceExtraction.js';
import {
  collectSourcePipeSegments,
  createSupportCoordinateMapper,
  resolveSupportPipeAxis,
} from '../overlays/support/SupportOverlayCoordinateMapper.js';
import { resolveSupportSymbol } from '../overlays/support/NonPrimitiveSupportOverlayResolver.js';
import { planSupportOverlayGlyph } from '../overlays/support/SupportOverlayGlyphGeometry.js';
import { buildNonPrimitiveSourceToolsDiagnosticsSnapshot } from '../overlays/source-tools/NonPrimitiveSourceToolsDiagnostics.js';

const rendererSource = await fs.readFile(new URL('../tabs/viewer3d-rvm-tab-renderer.js', import.meta.url), 'utf8');
const sourceToolsSource = await fs.readFile(new URL('../tabs/RvmNonPrimitiveSourceToolsUiBridge.js', import.meta.url), 'utf8');
const supportBridgeSource = await fs.readFile(new URL('../tabs/RvmNonPrimitiveSupportOverlayBridge.js', import.meta.url), 'utf8');
const autoBendBridgeSource = await fs.readFile(new URL('../tabs/RvmNonPrimitiveAutoBendBridge.js', import.meta.url), 'utf8');

function pipe(name, apos, lpos, extra = {}) {
  return {
    name,
    type: 'PIPE',
    attributes: {
      APOS: apos,
      LPOS: lpos,
      BORE: '100',
      OD: '114.3',
      ...extra,
    },
  };
}

function support(tag, family, position, extra = {}) {
  return {
    type: 'ATTA',
    properties: {
      CMPSUPREFN: tag,
      CMPSUPTYPE: family,
      SUPPORT_POSITION: position,
      BRANCH: '/ASIM-1885-PL-10/B2',
      LINE_NUMBER: '10-CS-S8810105-01',
      CMPOD: 114.3,
      ...extra,
    },
  };
}

function roundedDir(arrow) {
  const { x, y, z } = arrow.direction;
  return `${Math.round(x)},${Math.round(y)},${Math.round(z)}`;
}

const sourcePreviewFixture = {
  name: 'browser-shell-source-preview-smoke',
  type: 'BRANCH',
  attributes: {
    BRANCH: '/ASIM-1885-PL-10/B2',
    LINE_NUMBER: '10-CS-S8810105-01',
  },
  children: [
    pipe('PIPE-A', [0, 0, 0], [1000, 0, 0]),
    pipe('PIPE-B', [1000, 0, 0], [1000, 0, 1000]),
  ],
  supportRecords: [
    support('PS-GUIDE-0500', 'GUIDE', [500, 0, 0], { GUIDE_GAP: '5 mm' }),
    support('PS-LSTOP-0800', 'LINE STOP', [800, 0, 0], { RESTRAINT_SIGN: '+', GAP: '10 mm' }),
    support('PS-HOLD-1200', 'HOLD DOWN', [1000, 0, 200]),
  ],
};

const autoSegments = collectNonPrimitiveAutoBendSegments(sourcePreviewFixture);
const autoResult = resolveNonPrimitiveAutoBends({
  sourceKind: 'json',
  segments: autoSegments,
  existingNodeKinds: collectExistingAutoBendNodeKinds(sourcePreviewFixture),
});

assert.equal(autoSegments.length, 2, 'source-preview browser shell fixture extracts two auto-bend pipe segments');
assert.equal(autoResult.bends.length, 1, 'source-preview browser shell fixture emits one bend overlay contract');
assert.equal(autoResult.trims.length, 2, 'source-preview browser shell fixture emits two visual trim contracts');
assert.equal(Math.round(autoResult.bends[0].turnAngleDeg), 90, 'browser shell smoke keeps L-corner bend at 90 degrees');

const supportRecords = collectNonPrimitiveSupportRecords(sourcePreviewFixture);
const supportPipeSegments = collectSourcePipeSegments(sourcePreviewFixture);
const mapper = createSupportCoordinateMapper({
  sourceUnits: 'mm',
  viewerUnits: 'scene',
  sceneScale: 0.001,
  sceneOffset: { x: 10, y: 20, z: 30 },
});

const supportItems = supportRecords.map((record) => {
  const coordinateMapping = mapper.mapPoint(record.local, { supportId: record.tag });
  const pipeAxisResolution = resolveSupportPipeAxis(record, supportPipeSegments, { toleranceMm: 150 });
  const symbol = resolveSupportSymbol({
    family: record.kind,
    rawType: record.rawType,
    rawText: record.rawText,
    pipeAxis: pipeAxisResolution.axis || record.axis,
    gapMm: record.gapMm,
    explicitSign: record.explicitSign,
    pipeOdMm: record.pipeOdMm,
    singleAxis: record.singleAxis,
    warnings: [...coordinateMapping.warnings, ...pipeAxisResolution.warnings],
  }, { baseSizeMm: 40 });
  const glyphPlan = planSupportOverlayGlyph(symbol, { glyphSize: 40 });
  return { record, coordinateMapping, pipeAxisResolution, symbol, glyphPlan };
});

const bySupportId = new Map(supportItems.map((item) => [item.record.tag, item]));

assert.equal(supportRecords.length, 3, 'source-preview browser shell fixture extracts three support records');
assert.equal(supportPipeSegments.length, 2, 'source-preview browser shell fixture exposes source pipe segments for support axis fallback');
assert.ok(supportItems.every((item) => item.coordinateMapping.mappedPoint), 'all support records map into viewer space');
assert.ok(supportItems.every((item) => item.glyphPlan.operations.length > 0), 'all support records become glyph operations');

assert.deepEqual(bySupportId.get('PS-GUIDE-0500').symbol.arrows.map(roundedDir).sort(), ['0,0,-1', '0,0,1'], 'GUIDE on X pipe resolves lateral +/-Z arrows');
assert.deepEqual(bySupportId.get('PS-LSTOP-0800').symbol.arrows.map(roundedDir), ['1,0,0'], 'explicit positive LINE STOP resolves +axis only');
assert.deepEqual(bySupportId.get('PS-HOLD-1200').symbol.arrows.map(roundedDir).sort(), ['0,-1,0', '0,1,0'], 'HOLDDOWN resolves +/-Y arrows');
assert.equal(bySupportId.get('PS-LSTOP-0800').symbol.size.axialOdTwoThirdsApplied, true, 'ODx2/3 is applied to final axial support symbols');

const supportDiagnostics = {
  schema: 'browser-shell-support-overlay-smoke/v1',
  status: 'applied',
  sourceKind: 'json',
  sourceFile: 'browser-shell-smoke.json',
  created: supportItems.length,
  sourceSupports: supportRecords.length,
  acceptedSupports: supportRecords.length,
  filteredOut: 0,
  disabledFamilies: [],
  skippedDuplicates: 0,
  skippedGlyphs: 0,
  sourcePipeSegments: supportPipeSegments.length,
  warningCount: supportItems.flatMap((item) => item.symbol.warnings).length,
  coordinateMappings: supportItems.map((item) => item.coordinateMapping),
  pipeAxisResolutions: supportItems.map((item) => item.pipeAxisResolution),
  byFamily: supportItems.reduce((acc, item) => {
    acc[item.record.kind] = (acc[item.record.kind] || 0) + 1;
    return acc;
  }, {}),
  primitiveExcluded: true,
};

const autoDiagnostics = {
  schema: 'browser-shell-auto-bend-smoke/v1',
  status: 'applied',
  sourceKind: 'json',
  sourceFile: 'browser-shell-smoke.json',
  segmentCount: autoSegments.length,
  bendCount: autoResult.bends.length,
  trimCount: autoResult.trims.length,
  overlayChildren: autoResult.bends.length,
  primitiveExcluded: true,
  resolver: autoResult.diagnostics,
};

const viewer = {
  sourceKind: 'json',
  nonPrimitiveAutoBendDiagnostics: autoDiagnostics,
  nonPrimitiveSupportOverlayDiagnostics: supportDiagnostics,
};
const snapshot = buildNonPrimitiveSourceToolsDiagnosticsSnapshot({
  viewer,
  uiSchema: 'browser-shell-source-tools-smoke/v1',
  now: () => new Date('2026-06-23T00:00:00.000Z'),
});

assert.equal(snapshot.sourceKind, 'json', 'source tools snapshot reports non-primitive source kind');
assert.equal(snapshot.primitiveExcluded, true, 'source tools snapshot preserves primitive exclusion marker');
assert.equal(snapshot.counts.autoBendBends, 1, 'snapshot includes auto-bend overlay count');
assert.equal(snapshot.counts.autoBendTrims, 2, 'snapshot includes visual trim count');
assert.equal(snapshot.counts.supportCreated, 3, 'snapshot includes support overlay created count');
assert.equal(snapshot.counts.supportPipeSegments, 2, 'snapshot includes support pipe-axis source segment count');
assert.equal(snapshot.supportOverlay.coordinateMappings.length, 3, 'snapshot preserves coordinate mapping diagnostics');
assert.equal(snapshot.supportOverlay.pipeAxisResolutions.length, 3, 'snapshot preserves pipe-axis diagnostics');

assert.match(rendererSource, /installRvmNonPrimitiveSupportOverlayBridge\(\)[\s\S]*installRvmNonPrimitiveAutoBendBridge\(\)[\s\S]*installRvmNonPrimitiveSourceToolsUiBridge\(\)/, 'renderer installs non-primitive overlay bridges before source tools UI sync');
assert.match(rendererSource, /RvmNonPrimitiveSupportOverlayBridge\.js\?v=20260623-nonprimitive-support-overlay-9/, 'renderer imports support overlay bridge with current cache key');
assert.match(rendererSource, /RvmNonPrimitiveAutoBendBridge\.js\?v=20260623-nonprimitive-auto-bend-preview-2/, 'renderer imports auto-bend bridge with current cache key');
assert.match(rendererSource, /RvmNonPrimitiveSourceToolsUiBridge\.js\?v=20260624-source-tools-grouped-1/, 'renderer imports source tools UI bridge with grouped cache key');

assert.match(sourceToolsSource, /mode === 'source-preview' && isNonPrimitiveKind\(kind\)/, 'source tools UI is source-preview gated');
assert.match(sourceToolsSource, /PRIMITIVE_KIND_RE[\s\S]*rvm\|glb\|gltf\|rev/, 'source tools UI explicitly excludes primitive formats');
assert.match(sourceToolsSource, /data-source-tools-layout="grouped-v2"/, 'source tools UI uses grouped layout schema');
assert.match(sourceToolsSource, /data-source-tools-group="inputxml-family"[\s\S]*data-source-tools-group="support-overlay"/, 'source tools UI groups InputXML family and support controls');
assert.match(sourceToolsSource, /rvm-source-tools-badge/, 'source tools UI surfaces compact status badges');
assert.match(sourceToolsSource, /panel\.innerHTML = ''/, 'primitive reload clears stale Source Tools panel content');
assert.match(sourceToolsSource, /clearNonPrimitiveRuntime[\s\S]*NON_PRIMITIVE_AUTO_BEND[\s\S]*NON_PRIMITIVE_SUPPORT_OVERLAY/, 'primitive reload clears both non-primitive overlay runtimes');
assert.match(sourceToolsSource, /support-labels[\s\S]*writeNonPrimitiveSupportOverlaySettings\(\{ labels:/, 'support labels are controlled by Source Tools and persisted as non-primitive settings');
assert.match(sourceToolsSource, /rvm-inputxml-vertical-axis[\s\S]*rvm-inputxml-north-axis[\s\S]*rvm-inputxml-apply-transform/, 'Source Tools owns InputXML axis controls in the right panel');
assert.match(sourceToolsSource, /copySourceToolsDiagnostics[\s\S]*downloadSourceToolsDiagnostics/, 'Source Tools exposes copy/download diagnostics actions');
assert.doesNotMatch(sourceToolsSource, /Support Summary|SupportATT|SupportEngine|Raw\/Symbol\/Both|rvm_support_render_mode_v1|rvm_support_geometry_mode_v1/, 'Source Tools does not revive retired RVM support UI');

assert.match(supportBridgeSource, /__RVM_NON_PRIMITIVE_SUPPORT_OVERLAY__/, 'support overlay uses scoped non-primitive root');
assert.match(supportBridgeSource, /createSupportOverlayLabelObject/, 'support overlay labels are scoped and opt-in through label factory');
assert.match(supportBridgeSource, /supportOverlayDetails/, 'support overlay glyphs carry source-backed details metadata');
assert.match(supportBridgeSource, /rvmSearchIndexed = false/, 'support overlay details stay out of RVM search indexing');
assert.match(supportBridgeSource, /obj\.element\?\.remove\?\.\(\)/, 'support overlay clear path removes CSS2D label DOM elements');
assert.match(supportBridgeSource, /isNonPrimitiveSource[\s\S]*rvm[\s\S]*glb[\s\S]*gltf/, 'support overlay excludes RVM/GLB/GLTF sources');
assert.doesNotMatch(supportBridgeSource, /RvmSupportSymbols|RvmSupportGeometryBridge|RvmRawSupportCylinderGuardBridge/, 'support overlay does not import retired RVM support runtime');

assert.match(autoBendBridgeSource, /__NON_PRIMITIVE_AUTO_BEND_OVERLAY__/, 'auto-bend overlay uses scoped non-primitive root');
assert.match(autoBendBridgeSource, /restoreVisualTrimmedSegments/, 'auto-bend clear path restores original source-preview pipe spans');
assert.match(autoBendBridgeSource, /canUseAutoBend/, 'auto-bend bridge uses central primitive-exclusion gate');
assert.doesNotMatch(autoBendBridgeSource, /RvmSupportSymbols|RvmSupportGeometryBridge|RvmRawSupportCylinderGuardBridge/, 'auto-bend bridge does not import retired RVM support runtime');

console.log('nonprimitive-source-preview-browser-shell-smoke passed');
