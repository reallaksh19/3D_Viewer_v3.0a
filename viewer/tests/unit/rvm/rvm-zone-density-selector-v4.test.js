import assert from 'node:assert/strict';
import { buildSelectorRows, applyZoneDensitySelection } from '../../../tabs/RvmZoneDensitySelectorBridgeV5.js';

const instructions = [
  {
    canonicalObjectId: 'eq-grid-east',
    sourcePath: '/EQUIPMENT',
    displayName: 'GAS_2026Apr26-0828/STRUCTURE /BTRM-1000-CU-CI-01-GRID-LD-EAST/FRMWORK 1/GENSEC 11/RVM RVM_PRIM_CODE_10 316',
    type: 'STRUCTURE',
    renderPrimitive: 'RVM_NATIVE_LINE',
  },
  {
    canonicalObjectId: 'eq-grid-north',
    sourcePath: '/EQUIPMENT',
    displayName: 'GAS_2026Apr26-0828/STRUCTURE /BTRM-1000-CU-CI-01-GRID-LL-NORTH/FRMWORK 1/GENSEC 12/RVM RVM_PRIM_CODE_10 317',
    type: 'STRUCTURE',
    renderPrimitive: 'RVM_NATIVE_LINE',
  },
  {
    canonicalObjectId: 'pi-pipe',
    sourcePath: '/EQUIPMENT',
    displayName: 'GAS_2026Apr26-0828/EQUIPMENT /BTRM-1000-CU-PI/PUMP-001/RVM RVM_PRIM_CODE_11 1',
    type: 'EQUIPMENT',
    renderPrimitive: 'RVM_NATIVE_FACET_GROUP',
  },
  {
    canonicalObjectId: 'su-steel',
    sourcePath: '/STRUCTURE',
    displayName: 'GAS_2026Apr26-0828/STRUCTURE /BTRM-1000-CU-SU/FRMW/RVM RVM_PRIM_CODE_11 2',
    type: 'STRUCTURE',
    renderPrimitive: 'RVM_NATIVE_FACET_GROUP',
  },
];

const rows = buildSelectorRows({
  instructions,
  manifestNodes: [
    { canonicalObjectId: 'eq-root', name: 'EQUIPMENT' },
    { canonicalObjectId: 'eq-grid-east', parentCanonicalObjectId: 'eq-root', name: 'EQUIPMENT' },
    { canonicalObjectId: 'eq-grid-north', parentCanonicalObjectId: 'eq-root', name: 'EQUIPMENT' },
    { canonicalObjectId: 'pi-pipe', parentCanonicalObjectId: 'eq-root', name: 'EQUIPMENT' },
    { canonicalObjectId: 'su-steel', parentCanonicalObjectId: 'eq-root', name: 'EQUIPMENT' },
  ],
  fileName: 'GAS_2026Apr26-0828.rvm',
});

assert.ok(rows.some((row) => row.key === '/BTRM-1000-CU-CI'), 'synthetic tree must recover the main CI parent zone, not only GRID leaves');
assert.ok(rows.some((row) => row.key === '/BTRM-1000-CU-CI/BTRM-1000-CU-CI-GRID'), 'synthetic tree must group GRID leaves below CI');
assert.ok(rows.some((row) => row.key === '/BTRM-1000-CU-PI'), 'PI top row should be recovered from shallow /EQUIPMENT manifest');
assert.ok(rows.some((row) => row.key === '/BTRM-1000-CU-SU'), 'SU top row should be recovered from shallow /STRUCTURE manifest');
assert.equal(rows.some((row) => row.key === '/EQUIPMENT' && Number(row.count || 0) > 0), false, 'shallow /EQUIPMENT must not be the counted selector root when deep paths exist');
assert.equal(rows.find((row) => row.key === '/BTRM-1000-CU-CI')?.count, 2, 'CI parent rolls up both grid leaves');

const filtered = applyZoneDensitySelection({ instructions }, {
  mode: 'selected',
  selectedZones: ['/BTRM-1000-CU-PI', '/BTRM-1000-CU-SU'],
  zoneDensities: { '/BTRM-1000-CU-PI': 100, '/BTRM-1000-CU-SU': 50 },
  selectorSource: 'test',
});
assert.equal(filtered.diagnostics.zoneSelection.schemaVersion, 'browser-rvm-zone-selection/v6-synthetic-navis-density-tree');
assert.ok(filtered.instructions.some((item) => String(item.displayName).includes('CU-PI')));
assert.ok(filtered.instructions.every((item) => !String(item.displayName).includes('CU-CI-01-GRID')));

const ciFiltered = applyZoneDensitySelection({ instructions }, {
  mode: 'selected',
  selectedZones: ['/BTRM-1000-CU-CI'],
  zoneDensities: { '/BTRM-1000-CU-CI': 100 },
  selectorSource: 'test',
});
assert.equal(ciFiltered.instructions.length, 2, 'selecting parent CI renders all synthetic CI descendants');

console.log('rvm-zone-density-selector-v4.test.js passed');
