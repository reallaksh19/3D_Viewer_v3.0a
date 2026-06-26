import fs from 'node:fs/promises';

let passed = 0;
let failed = 0;
function check(condition, label) {
  if (condition) { console.log(`PASS: ${label}`); passed += 1; }
  else { console.error(`FAIL: ${label}`); failed += 1; }
}

async function read(path) {
  return fs.readFile(new URL(path, import.meta.url), 'utf8');
}

const appSource = await read('../core/app.js');
const entrySource = await read('../main-rhbg-fitguard.js');
const indexSource = await read('../index.html');
const workspaceSource = await read('../geometry-workspace/GeometryExportWorkspaceBridge.js');
const hierarchySource = await read('../geometry-workspace/GeometryImportHierarchyModel.js');

check(appSource.includes('GeometryExportWorkspaceBridge.js?v=20260622-geometry-import-tree-1'), 'app retains cache-busted geometry import tree contract marker');
check(appSource.includes('GeometryExportWorkspaceBridge.js?v=20260622-geometry-mapping-1'), 'app can dynamically load geometry workspace bridge when legacy workflow is enabled');
check(appSource.includes('LEGACY_GEOMETRY_WORKFLOW_FLAG'), 'geometry workspace bridge is behind explicit legacy workflow enablement');
check(appSource.includes('installLegacyGeometryWorkflowBridges'), 'app exposes isolated legacy workspace installer');
check(!appSource.includes('\ninstallGeometryExportWorkspaceBridge();'), 'geometry workspace bridge is not installed into the default top ribbon');
check(entrySource.includes('core/app.js?v=20260622-geometry-import-tree-1'), 'entry loads geometry import tree app cache key');
check(indexSource.includes('main-rhbg-fitguard.js?v=20260622-geometry-import-tree-1'), 'index loads geometry import tree entry cache key');

check(hierarchySource.includes("GEOMETRY_IMPORT_TREE_SCHEMA = 'geometry-import-hierarchy/v1'"), 'hierarchy model exposes schema marker');
check(hierarchySource.includes('buildGeometryImportHierarchy') && hierarchySource.includes('flattenGeometryImportHierarchy'), 'hierarchy model builds and flattens tree');
check(hierarchySource.includes('collectObjectIdsForHierarchyPaths') && hierarchySource.includes('countCheckedHierarchyObjects'), 'hierarchy model supports multi-select object collection');
check(hierarchySource.includes('DEFAULT_MAX_DEPTH = 5'), 'hierarchy model defaults to top-5 levels');
check(hierarchySource.includes('hierarchyPartsFromRenderedRecord'), 'hierarchy model derives paths from rendered records');

check(workspaceSource.includes('GeometryImportHierarchyModel.js?v=20260622-geometry-import-tree-1'), 'workspace uses cache-busted import hierarchy model');
check(workspaceSource.includes('checkedHierarchyPaths') && workspaceSource.includes('expandedHierarchyPaths') && workspaceSource.includes('activeObjectIds'), 'workspace tracks checked tree paths, expansion, and active import list');
check(workspaceSource.includes('data-gew-hierarchy-search'), 'workspace has hierarchy search input');
check(workspaceSource.includes('data-gew-tree-use-checked') && workspaceSource.includes('data-gew-tree-add-checked'), 'workspace can use/add checked hierarchy nodes');
check(workspaceSource.includes('data-gew-tree-remove-checked') && workspaceSource.includes('data-gew-tree-clear'), 'workspace can remove/clear hierarchy import list');
check(workspaceSource.includes('getActiveRecords') && workspaceSource.includes('active records'), 'raw table is filtered by active import list');
check(workspaceSource.includes('hierarchy: \'geometry-import-hierarchy/v1\''), 'workspace exports hierarchy schema through global API');

if (failed) {
  console.error(`FAILED ${failed} checks, passed ${passed}`);
  process.exit(1);
}
console.log(`All geometry workspace import tree checks passed (${passed}).`);
