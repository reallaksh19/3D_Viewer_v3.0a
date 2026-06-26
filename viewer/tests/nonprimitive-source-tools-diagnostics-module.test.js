import assert from 'node:assert/strict';
import {
  buildNonPrimitiveSourceToolsDiagnosticsSnapshot,
  sanitizeDiagnosticsJson,
  sourceToolsDiagnosticsFileName,
  NON_PRIMITIVE_SOURCE_TOOLS_DIAGNOSTICS_SCHEMA,
} from '../overlays/source-tools/NonPrimitiveSourceToolsDiagnostics.js';

const circular = { name: 'root' };
circular.self = circular;
const snapshot = buildNonPrimitiveSourceToolsDiagnosticsSnapshot({
  uiSchema: 'rvm-non-primitive-source-tools-ui/test',
  now: () => new Date('2026-06-23T00:00:00.000Z'),
  viewer: {
    sourceKind: 'source-preview',
    nonPrimitiveAutoBendDiagnostics: {
      status: 'applied',
      sourceKind: 'inputxml',
      sourceFile: 'BM_CII_INPUT_managed_stage.inputxml',
      segmentCount: 4,
      bendCount: 1,
      trimCount: 2,
      circular,
    },
    nonPrimitiveSupportOverlayDiagnostics: {
      status: 'applied',
      sourceSupports: 3,
      created: 3,
      warningCount: 1,
      sourcePipeSegments: 4,
      coordinateMappings: [{ supportId: 'PS-101' }],
      pipeAxisResolutions: [{ supportId: 'PS-101', source: 'nearest-segment' }],
    },
  },
});

assert.equal(snapshot.schema, 'rvm-non-primitive-source-tools-ui/test');
assert.equal(snapshot.diagnosticsSchema, NON_PRIMITIVE_SOURCE_TOOLS_DIAGNOSTICS_SCHEMA);
assert.equal(snapshot.snapshotKind, 'non-primitive-source-tools-diagnostics');
assert.equal(snapshot.generatedAt, '2026-06-23T00:00:00.000Z');
assert.equal(snapshot.sourceKind, 'inputxml');
assert.equal(snapshot.sourceFile, 'BM_CII_INPUT_managed_stage.inputxml');
assert.equal(snapshot.primitiveExcluded, true);
assert.deepEqual(snapshot.counts, {
  autoBendSegments: 4,
  autoBendBends: 1,
  autoBendTrims: 2,
  supportSourceRecords: 3,
  supportCreated: 3,
  supportWarnings: 1,
  supportPipeSegments: 4,
});
assert.equal(snapshot.autoBend.circular.self, '[circular]');
assert.equal(snapshot.supportOverlay.coordinateMappings[0].supportId, 'PS-101');
assert.equal(snapshot.supportOverlay.pipeAxisResolutions[0].source, 'nearest-segment');

const huge = sanitizeDiagnosticsJson({ rows: Array.from({ length: 1200 }, (_, i) => i) });
assert.equal(huge.rows.length, 1000, 'snapshot sanitizer caps large arrays');
assert.equal(sourceToolsDiagnosticsFileName(snapshot), 'nonprimitive-source-tools-diagnostics-inputxml-2026-06-23T00-00-00-000Z.json');

console.log('nonprimitive-source-tools-diagnostics-module passed');
