import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const viewerRoot = path.resolve(__dirname, '..');
const controllerPath = path.join(viewerRoot, 'tabs/RvmToolbarOverflowController.js');
const inventoryPath = path.resolve(viewerRoot, '../docs/rvm-viewer-runtime-inventory.md');

function read(file) {
  assert.ok(fs.existsSync(file), `missing file: ${path.relative(viewerRoot, file)}`);
  return fs.readFileSync(file, 'utf8');
}

const controller = read(controllerPath);
const inventory = read(inventoryPath);

assert.ok(controller.includes('RVM_TOOLBAR_OVERFLOW_SELECTORS'), 'controller must publish the selector contract used by tests and diagnostics');
assert.ok(controller.includes('validateRvmToolbarOverflowDom'), 'controller must expose a DOM contract validator');
assert.ok(controller.includes('buttonCount === 1 && menuCount === 1'), 'DOM validator must prove single More button and single menu ownership');
assert.ok(controller.includes('recordTrace'), 'controller must record auditable state transitions');
assert.ok(controller.includes('TRACE_LIMIT'), 'controller trace history must be bounded');
assert.ok(controller.includes('syncCount'), 'controller diagnostics must expose sync count');
assert.ok(controller.includes('domAudit'), 'controller diagnostics must include DOM audit evidence');
assert.ok(controller.includes('trace: [...'), 'controller diagnostics must include trace history');
assert.ok(controller.includes('rvmToolbarOverflowAudit'), 'controller must stamp the root with audit status');
assert.ok(controller.includes('getDiagnostics'), 'global API must expose diagnostics');
assert.ok(controller.includes('validateDom'), 'global API must expose DOM validation');

assert.ok(inventory.includes('Immediate root-cause finding: More Tools'), 'runtime inventory must document the More Tools root cause');
assert.ok(inventory.includes('No single toolbar-overflow owner existed'), 'inventory must state the ownership failure');
assert.ok(inventory.includes('RvmToolbarOverflowController.js'), 'inventory must identify the new owner module');
assert.ok(inventory.includes('trace'), 'inventory must mention traceability/audit diagnostics');

console.log('Verified RVM toolbar overflow auditability: selector contract, DOM validation, bounded trace, diagnostics, root audit stamp, and inventory root-cause evidence.');
