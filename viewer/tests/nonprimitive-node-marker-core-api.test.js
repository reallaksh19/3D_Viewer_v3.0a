import assert from 'node:assert/strict';

import {
  buildNodeMarkerCsvForXmlCii,
  buildNodeMarkerJson,
  buildNodeMarkersFromSource,
  buildNodeMarkerXmlCiiTablesFromSource,
  getDiagnostics,
  getLastBuild,
  installNodeMarkerApi,
} from '../overlays/nodes/NodeMarkerApi.js';
import { XML_CII_NODE_MARKER_HEADERS } from '../overlays/nodes/NodeMarkerXmlCiiTableMapper.js';

const source = {
  schema: 'managed-stage/staged-json-export/v1',
  sourceFile: 'BM_CII_INPUT_managed_stage.json',
  branches: [
    {
      branchName: '/BR-100/B1',
      children: [
        {
          name: 'PIPE-A',
          type: 'PIPE',
          attributes: {
            APOS: [0, 0, 0],
            LPOS: [1000, 0, 0],
            BORE: '100',
            WallThickness: '6.02',
            P1: '4140',
            T1: '260',
            T2: '151',
            T3: '5',
            FluidDensity: '983',
            ComponentRefNo: 'PIPE-REF-01',
            Description: 'PIPE 4 INCH',
          },
        },
        {
          name: 'FLANGE-A',
          type: 'FLANGE',
          attributes: {
            APOS: [1000, 0, 0],
            LPOS: [1100, 0, 0],
            ComponentRefNo: 'FLG-REF-01',
            Weight: '15.5',
            Endpoint: '2',
          },
        },
        {
          name: 'PIPE-B',
          type: 'PIPE',
          attributes: {
            APOS: [2000, 0, 0],
            LPOS: [3000, 0, 0],
            BORE: '80',
            WallThickness: '5.49',
            P1: '3000',
            T1: '220',
          },
        },
      ],
    },
  ],
  supportRecords: [
    {
      supportNo: 'PS-1001',
      type: 'GUIDE',
      branchName: '/BR-100/B1',
      POS: [3000, 0, 0],
      RestraintType: 'GUIDE',
      Gap: '10',
      Stiffness: '1.75E+12',
      Friction: '0.3',
      Direction: '+Y',
    },
  ],
};

const result = buildNodeMarkersFromSource(source, { sourceKind: 'json', sourceFile: source.sourceFile, startNodeNumber: 100, nodeStep: 10 });
assert.equal(result.schema, 'non-primitive-node-marker-build/v1');
assert.equal(result.markers.length, 2, 'pipe-to-flange and pipe-to-support markers are resolved');
assert.equal(result.diagnostics.sourceSubKind, 'staged-json-export', 'staged JSON is detected by source schema/content');
assert.equal(result.diagnostics.overrideCount, 0, 'default build has no marker overrides');

const flangeMarker = result.markers.find((marker) => marker.markerKind === 'PIPE_TO_FLANGE');
assert.ok(flangeMarker, 'pipe-to-flange marker exists');
assert.equal(flangeMarker.branchName, '/BR-100/B1');
assert.equal(flangeMarker.nodeNumber, 100);
assert.equal(flangeMarker.nodeNumberSource, 'generated');
assert.equal(flangeMarker.componentType, 'FLANGE');
assert.equal(flangeMarker.componentRefNo, 'PIPE-REF-01', 'marker carries upstream component reference by default');
assert.equal(flangeMarker.sourceSubKind, 'staged-json-export');
assert.equal(flangeMarker.status, 'exact');

const supportMarker = result.markers.find((marker) => marker.markerKind === 'PIPE_TO_SUPPORT');
assert.ok(supportMarker, 'pipe-to-support marker exists');
assert.equal(supportMarker.nodeNumber, 110);
assert.equal(supportMarker.componentType, 'SUPPORT');
assert.equal(supportMarker.downstreamRef.name, 'PS-1001');

const tables = result.tables;
assert.deepEqual(tables.headers, XML_CII_NODE_MARKER_HEADERS, 'table headers match XML-CII Custom Input contract');
assert.equal(tables.branchRows.length, 2);
assert.equal(tables.branchRows[0].BranchName, '/BR-100/B1');
assert.equal(tables.branchRows[0].NodeNumber, 100);
assert.equal(tables.branchRows[0].BoreMm, '100');
assert.equal(tables.branchRows[0].P1, '4140');
assert.equal(tables.coordinateRows[0].X, 1000);
assert.equal(tables.coordinateRows[0].Y, 0);
assert.equal(tables.weightRows.some((row) => row.ComponentType === 'FLANGE'), true, 'B Weight/Rigid rows include component interface row');
assert.equal(tables.restraintRows.length, 1, 'C Restraints rows are emitted for support markers');
assert.equal(tables.restraintRows[0].NodeName, 'PS-1001');
assert.equal(tables.restraintRows[0].Gap, '10');
assert.equal(tables.dtxrRows[0].DTXR, 'PIPE 4 INCH');

const tablesFromSource = buildNodeMarkerXmlCiiTablesFromSource(source, { sourceKind: 'json', sourceFile: source.sourceFile, startNodeNumber: 100 });
assert.equal(tablesFromSource.coordinateRows[0].NodeNumber, 100);

const csv = buildNodeMarkerCsvForXmlCii(tables);
assert.match(csv, /# branchRows\nBranchName\tNodeNumber\tBoreMm\tWallThickness\tP1\tT1\tT2\tT3\tFluidDensity/);
assert.match(csv, /# coordinateRows\nBranchName\tNodeNumber\tX\tY\tZ/);
assert.match(csv, /# weightRows\nBranchName\tNodeNumber\tComponentType\tRigid\tEndpoint\tWeight\tComponentRefNo/);
assert.match(csv, /# restraintRows\nBranchName\tNodeNumber\tNodeName\tRestraintType\tGap\tStiffness\tFriction\tDirection/);
assert.match(csv, /# dtxrRows\nBranchName\tNodeNumber\tDTXR/);

const json = buildNodeMarkerJson(result.markers, { generatedAt: '2026-01-01T00:00:00.000Z' });
assert.equal(json.schema, 'non-primitive-node-marker-json/v1');
assert.ok(json.payloadHash, 'JSON sidecar has deterministic hash');

const apiTarget = {};
const apiA = installNodeMarkerApi(apiTarget);
const apiB = installNodeMarkerApi(apiTarget);
assert.equal(apiA, apiB, 'installNodeMarkerApi is idempotent');
assert.equal(apiA.schema, 'non-primitive-node-marker-api/v3');
assert.equal(typeof apiA.applyNodeMarkerOverrides, 'function');
assert.equal(getDiagnostics().markerCount, 2);
assert.equal(getLastBuild().tables.branchRows.length, 2);

console.log('nonprimitive-node-marker-core-api passed');
