import assert from 'node:assert/strict';

import {
  collectNonPrimitiveSupportRecords,
} from '../overlays/support/SupportOverlaySourceExtraction.js';
import {
  collectSourcePipeSegments,
  createSupportCoordinateMapper,
  resolveSupportPipeAxis,
} from '../overlays/support/SupportOverlayCoordinateMapper.js';
import {
  resolveSupportSymbol,
} from '../overlays/support/NonPrimitiveSupportOverlayResolver.js';
import {
  planSupportOverlayGlyph,
} from '../overlays/support/SupportOverlayGlyphGeometry.js';

function roundedDir(arrow) {
  const { x, y, z } = arrow.direction;
  return `${Math.round(x)},${Math.round(y)},${Math.round(z)}`;
}

function compileOverlayDiagnostic(record, pipeSegments, mapper) {
  const coordinateMapping = mapper.mapPoint(record.local, { supportId: record.tag });
  const pipeAxisResolution = resolveSupportPipeAxis(record, pipeSegments, { toleranceMm: 100 });
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

  return {
    supportId: record.tag,
    family: record.kind,
    coordinateMapping,
    pipeAxisResolution,
    symbol,
    glyphPlan,
  };
}

const managedStageSourcePreview = {
  name: 'BM_CII source-preview support smoke fixture',
  children: [
    {
      kind: 'BRANCH',
      attributes: {
        BRANCH: '/ASIM-1885-PL-10/B2',
        LINE_NUMBER: '10-CS-S8810105-01',
      },
      children: [
        {
          type: 'PIPE',
          attributes: {
            NAME: 'P-16980-17080',
            APOS: [16980, 0, 1200],
            LPOS: [17080, 0, 1200],
            FROM_NODE: 'N-16980',
            TO_NODE: 'N-17080',
            BRANCH: '/ASIM-1885-PL-10/B2',
            LINE_NUMBER: '10-CS-S8810105-01',
          },
        },
      ],
      supportRecords: [
        {
          type: 'ATTA',
          properties: {
            CMPSUPREFN: 'PS-GDE-16990',
            CMPSUPTYPE: 'GUIDE',
            SUPPORT_POSITION: [16990, 0, 1200],
            BRANCH: '/ASIM-1885-PL-10/B2',
            LINE_NUMBER: '10-CS-S8810105-01',
            CMPOD: 273.1,
            GUIDE_GAP: '10 mm',
          },
        },
        {
          type: 'ATTA',
          properties: {
            CMPSUPREFN: 'PS-LIM-17010',
            CMPSUPTYPE: 'LIM',
            SUPPORT_POSITION: [17010, 0, 1200],
            BRANCH: '/ASIM-1885-PL-10/B2',
            LINE_NUMBER: '10-CS-S8810105-01',
            CMPOD: 300,
            GAP: '25 mm',
            RESTRAINT_SIGN: 'negative',
          },
        },
        {
          type: 'ATTA',
          properties: {
            CMPSUPREFN: 'PS-HD-17030',
            CMPSUPTYPE: 'Hold Down',
            SUPPORT_POSITION: [17030, 0, 1200],
            BRANCH: '/ASIM-1885-PL-10/B2',
            LINE_NUMBER: '10-CS-S8810105-01',
          },
        },
        {
          type: 'ATTA',
          properties: {
            CMPSUPREFN: 'PS-SPR-17060',
            CMPSUPTYPE: 'Spring Can',
            SUPPORT_POSITION: [17060, 0, 1200],
            BRANCH: '/ASIM-1885-PL-10/B2',
            LINE_NUMBER: '10-CS-S8810105-01',
          },
        },
      ],
    },
  ],
};

const records = collectNonPrimitiveSupportRecords(managedStageSourcePreview);
const pipeSegments = collectSourcePipeSegments(managedStageSourcePreview);
const mapper = createSupportCoordinateMapper({
  sourceUnits: 'mm',
  viewerUnits: 'scene',
  sceneScale: 0.001,
  sceneOffset: { x: 10, y: 20, z: 30 },
});
const diagnostics = records.map((record) => compileOverlayDiagnostic(record, pipeSegments, mapper));
const byId = new Map(diagnostics.map((item) => [item.supportId, item]));

assert.equal(records.length, 4);
assert.equal(pipeSegments.length, 1);
assert.equal(diagnostics.length, 4);
assert.ok(diagnostics.every((item) => item.coordinateMapping.mappedPoint));
assert.ok(diagnostics.every((item) => item.glyphPlan.operations.length > 0));
assert.ok(diagnostics.every((item) => item.glyphPlan.usesLineSegments === false));

const guide = byId.get('PS-GDE-16990');
assert.equal(guide.pipeAxisResolution.source, 'nearest-segment');
assert.equal(guide.pipeAxisResolution.matchedSegmentId, 'P-16980-17080');
assert.deepEqual(guide.symbol.arrows.map(roundedDir).sort(), ['0,0,-1', '0,0,1']);
assert.equal(guide.glyphPlan.operations.length, 2);
assert.equal(guide.coordinateMapping.mappedPoint.x, 26.990000000000002);
assert.equal(guide.coordinateMapping.mappedPoint.y, 20);
assert.equal(guide.coordinateMapping.mappedPoint.z, 31.2);

const lim = byId.get('PS-LIM-17010');
assert.equal(lim.pipeAxisResolution.source, 'nearest-segment');
assert.deepEqual(lim.symbol.arrows.map(roundedDir), ['-1,0,0']);
assert.equal(lim.symbol.gapVisualSeparationMm, 200);
assert.equal(lim.symbol.gapCapped, true);
assert.ok(lim.symbol.warnings.includes('gapVisualSeparationCapped'));
assert.equal(lim.symbol.size.axialOdTwoThirdsApplied, true);
assert.equal(lim.glyphPlan.operations.length, 1);
assert.equal(lim.glyphPlan.operations[0].axial, true);

const holdDown = byId.get('PS-HD-17030');
assert.deepEqual(holdDown.symbol.arrows.map(roundedDir).sort(), ['0,-1,0', '0,1,0']);
assert.equal(holdDown.glyphPlan.operations.length, 2);

const spring = byId.get('PS-SPR-17060');
assert.equal(spring.symbol.coil.role, 'spring-can-warning-coil');
assert.equal(spring.glyphPlan.operations[0].kind, 'coil');
assert.equal(spring.glyphPlan.operations[0].materialCategory, 'warning');

const smokeSummary = {
  created: diagnostics.length,
  sourceSupports: records.length,
  sourcePipeSegments: pipeSegments.length,
  byFamily: diagnostics.reduce((acc, item) => {
    acc[item.family] = (acc[item.family] || 0) + 1;
    return acc;
  }, {}),
  warnings: diagnostics.flatMap((item) => item.symbol.warnings.map((code) => ({ supportId: item.supportId, code }))),
};

assert.deepEqual(smokeSummary.byFamily, {
  GUIDE: 1,
  LIM: 1,
  HOLDDOWN: 1,
  SPRING_CAN: 1,
});
assert.ok(smokeSummary.warnings.some((warning) => warning.supportId === 'PS-LIM-17010' && warning.code === 'gapVisualSeparationCapped'));
assert.ok(smokeSummary.warnings.some((warning) => warning.supportId === 'PS-SPR-17060' && warning.code === 'springCanVisualOnly'));

console.log('non-primitive support preview smoke fixture tests passed');
