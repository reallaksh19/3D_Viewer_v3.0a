import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { buildInputXmlDirectManagedStageJson } from '../converters/inputxml-managed-stage/InputXmlDirectManagedStageBuilder.js';
import { buildNodeMarkerCsvForXmlCii, buildNodeMarkersFromSource } from '../overlays/nodes/NodeMarkerApi.js';
import { stableHash } from '../overlays/nodes/NodeMarkerDiagnostics.js';

const xmlPath = new URL('../../Benchmarks/INPUT XML to CII 2019/BM_CII/BM_CII_INPUT.XML', import.meta.url);
const xml = await fs.readFile(xmlPath, 'utf8');
const staged = buildInputXmlDirectManagedStageJson(xml, { sourceName: 'BM_CII_INPUT.XML' });
const declaredRestCount = Number(xml.match(/NUMREST="(\d+)"/)?.[1] || 0);

assert.equal(staged.schema, 'inputxml-managed-stage/v1');
assert.equal(staged.converter, 'INPUTXML->STAGEDJSON');
assert.equal(staged.stats.bends, 7, 'BM_CII staged fixture carries seven explicit BEND records');
assert.equal(declaredRestCount, 8, 'BM_CII source XML declares eight restraint rows');
assert.ok(staged.stats.emittedSupports > 0, 'BM_CII managed-stage emits support/restraint records after source filtering');
assert.ok(Array.isArray(staged.hierarchy), 'managed-stage hierarchy is present');
assert.ok(staged.hierarchy[0].children.some((child) => child.type === 'BEND'), 'BEND children are present in hierarchy');

const build = buildNodeMarkersFromSource(staged, {
  sourceKind: 'json',
  sourceFile: 'BM_CII_INPUT.XML',
  startNodeNumber: 1000,
  nodeStep: 10,
  toleranceMm: 2,
});

assert.equal(build.schema, 'non-primitive-node-marker-build/v1');
assert.equal(build.diagnostics.sourceSubKind, 'managed-stage', 'resolver detects InputXML managed-stage sourceSubKind');
assert.ok(build.diagnostics.sourceRevision, 'managed-stage build has source revision');
assert.ok(build.markers.length > 0, 'managed-stage fixture produces node markers');
assert.ok(build.markers.some((marker) => marker.markerKind.includes('PIPE')), 'managed-stage fixture includes pipe interface markers');
assert.ok(build.markers.some((marker) => marker.markerKind === 'PIPE_TO_SUPPORT'), 'managed-stage fixture includes support/restraint node markers');
assert.ok(build.markers.every((marker) => marker.sourceKind === 'json'), 'sourceKind is stable');
assert.ok(build.markers.every((marker) => marker.sourceSubKind === 'managed-stage'), 'sourceSubKind is stable on all markers');
assert.ok(build.markers.every((marker) => marker.sourcePath), 'markers carry source path context');

const tables = build.tables;
assert.ok(tables.branchRows.length > 0, 'Branch/Node table rows emitted');
assert.equal(tables.branchRows.length, tables.coordinateRows.length, 'Branch/Node and Coordinates rows align 1:1');
assert.ok(tables.restraintRows.length > 0, 'C Restraints rows emitted for managed-stage supports');
assert.ok(tables.weightRows.length > 0, 'B Weight/Rigid rows emitted for managed-stage component interfaces');
assert.ok(tables.headers.branchRows.includes('BranchName'));
assert.ok(tables.headers.coordinateRows.includes('X'));
assert.ok(tables.headers.weightRows.includes('ComponentRefNo'));
assert.ok(tables.headers.restraintRows.includes('RestraintType'));
assert.ok(tables.headers.dtxrRows.includes('DTXR'));

const csv = buildNodeMarkerCsvForXmlCii(tables);
assert.match(csv, /# branchRows\nBranchName\tNodeNumber\tBoreMm\tWallThickness\tP1\tT1\tT2\tT3\tFluidDensity/);
assert.match(csv, /# coordinateRows\nBranchName\tNodeNumber\tX\tY\tZ/);
assert.match(csv, /# weightRows\nBranchName\tNodeNumber\tComponentType\tRigid\tEndpoint\tWeight\tComponentRefNo/);
assert.match(csv, /# restraintRows\nBranchName\tNodeNumber\tNodeName\tRestraintType\tGap\tStiffness\tFriction\tDirection/);
assert.match(csv, /# dtxrRows\nBranchName\tNodeNumber\tDTXR/);

const repeat = buildNodeMarkersFromSource(staged, {
  sourceKind: 'json',
  sourceFile: 'BM_CII_INPUT.XML',
  startNodeNumber: 1000,
  nodeStep: 10,
  toleranceMm: 2,
});
assert.equal(stableHash(build.markers), stableHash(repeat.markers), 'managed-stage marker output is deterministic');
assert.equal(stableHash(tables), stableHash(repeat.tables), 'managed-stage XML-CII tables are deterministic');
assert.equal(stableHash(csv), stableHash(buildNodeMarkerCsvForXmlCii(repeat.tables)), 'managed-stage XML-CII CSV is deterministic');

console.log(`nonprimitive-node-marker-managed-stage-fixture passed: markers=${build.markers.length} branchRows=${tables.branchRows.length} restraints=${tables.restraintRows.length}`);
