import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import {
  buildSupportOverlayDetailsPanelState,
  renderSupportOverlayDetailsPanelHtml,
} from '../overlays/support/SupportOverlayDetailsPanel.js';
import {
  buildSupportOverlayDetailsExportSnapshot,
  copySupportOverlayDetailsJson,
  downloadSupportOverlayDetailsJson,
  supportOverlayDetailsExportFileName,
  supportOverlayDetailsExportJson,
  SUPPORT_OVERLAY_DETAILS_EXPORT_SCHEMA,
} from '../overlays/support/SupportOverlayDetailsExport.js';

const state = buildSupportOverlayDetailsPanelState({
  overlayKind: 'support',
  supportId: 'PS-201',
  supportNo: 'PS-201',
  family: 'LINESTOP',
  rawType: 'LINE STOP +X',
  nodeId: 'N-201',
  sourceKind: 'inputxml',
  sourceFile: 'BM_CII_INPUT_managed_stage.json',
  sourceCoordinate: { x: 2500, y: 0, z: 0 },
  mappedCoordinate: { x: 2.5, y: 0, z: 0 },
  pipeAxis: { x: 1, y: 0, z: 0 },
  pipeAxisSource: 'node-match',
  matchedPipeSegmentId: 'PIPE-201',
  explicitSign: '+',
  gapMm: 10,
  gapVisualSeparationMm: 100,
  pipeOdMm: 168.3,
  warnings: ['gapVisualSeparationApplied'],
  attributes: {
    SUPPORT_NO: 'PS-201',
    SUPPORT_TYPE: 'LINE STOP +X',
  },
});

const snapshot = buildSupportOverlayDetailsExportSnapshot(state, {
  now: () => new Date('2026-06-23T01:02:03.000Z'),
});
assert.equal(snapshot.schema, SUPPORT_OVERLAY_DETAILS_EXPORT_SCHEMA);
assert.equal(snapshot.snapshotKind, 'non-primitive-support-overlay-details');
assert.equal(snapshot.status, 'selected');
assert.equal(snapshot.generatedAt, '2026-06-23T01:02:03.000Z');
assert.equal(snapshot.primitiveExcluded, true);
assert.equal(snapshot.rvmSearchIndexed, false);
assert.equal(snapshot.pickable, false);
assert.equal(snapshot.selectable, false);
assert.equal(snapshot.support.supportNo, 'PS-201');
assert.equal(snapshot.support.family, 'LINESTOP');
assert.deepEqual(snapshot.support.mappedCoordinate, { x: 2.5, y: 0, z: 0 });
assert.deepEqual(snapshot.support.pipeAxis, { x: 1, y: 0, z: 0 });
assert.equal(snapshot.support.matchedPipeSegmentId, 'PIPE-201');
assert.equal(snapshot.support.gapMm, 10);
assert.ok(snapshot.support.warnings.includes('gapVisualSeparationApplied'));

const json = supportOverlayDetailsExportJson(state, {
  now: () => new Date('2026-06-23T01:02:03.000Z'),
});
assert.match(json, /"schema": "support-overlay-details-export\/v1"/);
assert.match(json, /"supportNo": "PS-201"/);
assert.match(json, /"rvmSearchIndexed": false/);

const fileName = supportOverlayDetailsExportFileName(snapshot);
assert.equal(fileName, 'nonprimitive-support-details-inputxml-PS-201-2026-06-23T01-02-03-000Z.json');

let copiedText = '';
const copyResult = await copySupportOverlayDetailsJson(state, {
  now: () => new Date('2026-06-23T01:02:03.000Z'),
  clipboard: { writeText: async (text) => { copiedText = text; } },
});
assert.equal(copyResult.status, 'copied');
assert.match(copiedText, /"supportNo": "PS-201"/);

const noClipboard = await copySupportOverlayDetailsJson(state, {
  now: () => new Date('2026-06-23T01:02:03.000Z'),
  clipboard: null,
});
assert.equal(noClipboard.status, 'skipped');
assert.equal(noClipboard.reason, 'clipboard-unavailable');

const noDownload = downloadSupportOverlayDetailsJson(state, {
  now: () => new Date('2026-06-23T01:02:03.000Z'),
  document: null,
  URL: null,
  Blob: null,
});
assert.equal(noDownload.status, 'skipped');
assert.equal(noDownload.reason, 'download-unavailable');
assert.equal(noDownload.fileName, fileName);

const html = renderSupportOverlayDetailsPanelHtml(state);
assert.match(html, /data-support-details-action="copy-json"/);
assert.match(html, /data-support-details-action="download-json"/);
assert.match(html, /data-support-details-action="clear"/);

const bridge = await fs.readFile(new URL('../tabs/RvmNonPrimitiveSupportOverlayDetailsPanelBridge.js', import.meta.url), 'utf8');
const deferredLoader = await fs.readFile(new URL('../tabs/RvmDeferredBridgeLoader.js', import.meta.url), 'utf8');
assert.match(bridge, /SUPPORT_OVERLAY_DETAILS_EXPORT_SCHEMA/, 'details panel bridge exposes the export schema constant');
assert.match(bridge, /copySupportOverlayDetailsJson/, 'details panel bridge wires copy JSON action');
assert.match(bridge, /downloadSupportOverlayDetailsJson/, 'details panel bridge wires download JSON action');
assert.match(bridge, /supportDetailsExportStatus/, 'details panel publishes panel-local export status');
assert.match(bridge, /mode === 'source-preview' && isNonPrimitiveKind\(kind\)/, 'details export stays source-preview gated through details panel');
assert.doesNotMatch(bridge, /RvmSupportSymbols|RvmSupportGeometryBridge|RvmRawSupportCylinderGuardBridge/, 'details export does not revive retired RVM support modules');
assert.match(deferredLoader, /RvmNonPrimitiveSupportOverlayDetailsPanelBridge\.js\?v=20260623-nonprimitive-support-details-panel-4/, 'sourcePreview deferred loader owns details panel bridge with export cache key');

console.log('non-primitive support overlay details export tests passed');
