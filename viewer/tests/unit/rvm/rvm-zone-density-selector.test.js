import assert from 'node:assert/strict';
import { buildSelectorRows, applyZoneDensitySelection } from '../../../tabs/RvmZoneDensitySelectorBridge.js';

const instructions = [
  { sourcePath: '/STRUCTURE/BTRM-1000-CU-PI/P1', type: 'PIPE', renderPrimitive: 'PIPE_CYLINDER', displayName: 'P1' },
  { sourcePath: '/STRUCTURE/BTRM-1000-CU-SU/S1', type: 'STRUCTURE', renderPrimitive: 'BOX_BBOX', displayName: 'S1' },
  { sourcePath: '/STRUCTURE/BTRM-1000-CU-CI/GRID/G1', type: 'STRUCTURE', renderPrimitive: 'GENERIC_BBOX_PLACEHOLDER', displayName: 'G1' },
  { sourcePath: '/STRUCTURE/BTRM-1000-CU-CI/FDNS/F1', type: 'STRUCTURE', renderPrimitive: 'GENERIC_BBOX_PLACEHOLDER', displayName: 'F1' },
];

const rows = buildSelectorRows({ instructions, manifestNodes: [], fileName: 'GAS_2026Apr26-0828.rvm' });
assert.ok(rows.some((row) => row.key === '/BTRM-1000-CU-PI'));
assert.ok(rows.some((row) => row.key === '/BTRM-1000-CU-SU'));
assert.ok(rows.some((row) => row.key === '/BTRM-1000-CU-CI'));
assert.ok(rows.some((row) => row.key === '/BTRM-1000-CU-CI/GRID'));
assert.ok(rows.every((row) => Number(row.depth) <= 2));
assert.ok(rows.find((row) => row.key === '/BTRM-1000-CU-CI')?.hasChildren);

const manifestNodes = [
  { canonicalObjectId: 'root', name: 'STRUCTURE' },
  { canonicalObjectId: 'ci', parentCanonicalObjectId: 'root', name: 'BTRM-1000-CU-CI' },
  { canonicalObjectId: 'grid', parentCanonicalObjectId: 'ci', name: 'BTRM-1000-CU-CI-GRID' },
  { canonicalObjectId: 'su', parentCanonicalObjectId: 'root', name: 'BTRM-1000-CU-SU' },
  { canonicalObjectId: 'pi', parentCanonicalObjectId: 'root', name: 'BTRM-1000-CU-PI' },
];
const manifestRows = buildSelectorRows({
  instructions: [
    { canonicalObjectId: 'grid', sourcePath: '/GRID-LEAF', type: 'STRUCTURE', renderPrimitive: 'RVM_NATIVE_FACET_GROUP' },
  ],
  manifestNodes,
  fileName: 'GAS_2026Apr26-0828.rvm',
});
assert.ok(manifestRows.some((row) => row.key === '/BTRM-1000-CU-CI'), 'parent CU-CI row should be present from manifest');
assert.ok(manifestRows.some((row) => row.key === '/BTRM-1000-CU-CI/BTRM-1000-CU-CI-GRID'), 'GRID child row should be present from manifest');
assert.ok(manifestRows.some((row) => row.key === '/BTRM-1000-CU-SU'), 'sibling SU top-level row should be present even before direct instructions are counted');
assert.ok(manifestRows.some((row) => row.key === '/BTRM-1000-CU-PI'), 'sibling PI top-level row should be present even before direct instructions are counted');

const shallowManifestRows = buildSelectorRows({
  instructions: [
    {
      canonicalObjectId: 'eq-leaf',
      sourcePath: '/STRUCTURE/BTRM-1000-CU-CI/BTRM-1000-CU-CI-01-GRID-EASTINGS/FRMWORK 1/GENSEC 11',
      type: 'STRUCTURE',
      renderPrimitive: 'RVM_NATIVE_LINE',
      displayName: 'GENSEC 11',
    },
    {
      canonicalObjectId: 'eq-pipe',
      sourcePath: '/EQUIPMENT/BTRM-1000-CU-PI/PUMP-001',
      type: 'EQUIPMENT',
      renderPrimitive: 'RVM_NATIVE_FACET_GROUP',
      displayName: 'PUMP-001',
    },
  ],
  manifestNodes: [
    { canonicalObjectId: 'eq-root', name: 'EQUIPMENT' },
    { canonicalObjectId: 'eq-leaf', parentCanonicalObjectId: 'eq-root', name: 'EQUIPMENT' },
    { canonicalObjectId: 'eq-pipe', parentCanonicalObjectId: 'eq-root', name: 'EQUIPMENT' },
  ],
  fileName: 'GAS_2026Apr26-0828.rvm',
});
assert.ok(shallowManifestRows.some((row) => row.key === '/BTRM-1000-CU-CI'), 'deep owner path should win over shallow manifest /EQUIPMENT for zone selection');
assert.ok(shallowManifestRows.some((row) => row.key === '/BTRM-1000-CU-CI/BTRM-1000-CU-CI-01-GRID-EASTINGS'), 'GRID-EASTINGS child should be shown from instruction path');
assert.ok(shallowManifestRows.some((row) => row.key === '/EQUIPMENT'), 'real EQUIPMENT rows should still be retained');

const filtered = applyZoneDensitySelection({ instructions }, {
  mode: 'selected',
  selectedZones: ['/BTRM-1000-CU-PI', '/BTRM-1000-CU-CI'],
  zoneDensities: { '/BTRM-1000-CU-PI': 100, '/BTRM-1000-CU-CI': 50 },
  selectorSource: 'test',
});
assert.equal(filtered.diagnostics.zoneSelection.schemaVersion, 'browser-rvm-zone-selection/v4-density-tree');
assert.ok(filtered.instructions.every((item) => !String(item.sourcePath).includes('CU-SU')));
assert.ok(filtered.instructions.some((item) => item.sourcePath.includes('CU-PI')));
assert.equal(filtered.diagnostics.lodSelection.perZoneDensity, true);

console.log('rvm-zone-density-selector.test.js passed');
