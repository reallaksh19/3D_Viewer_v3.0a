import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');

const liteAutoloadPath = path.join(repoRoot, 'viewer/tabs/xml-cii-master-autoload-lite.js');
const masterContextPath = path.join(repoRoot, 'viewer/converters/xml-cii2019-core/master-context.js');
const tabPath = path.join(repoRoot, 'viewer/tabs/model-converters/ModelConvertersTab.js');
const workflowBridgePath = path.join(repoRoot, 'viewer/tabs/model-converters/xml-cii-workflow-bridge.js');

const liteAutoloadSource = fs.readFileSync(liteAutoloadPath, 'utf8');
const masterContextSource = fs.readFileSync(masterContextPath, 'utf8');
const tabSource = fs.readFileSync(tabPath, 'utf8');
const workflowBridgeSource = fs.readFileSync(workflowBridgePath, 'utf8');

// Active-runtime contract: ModelConvertersTab must use the one-shot lite
// autoloader only. The old broad autoload patch may remain in the repository as
// dead compatibility/reference code, but it must not be imported from the active
// Model Converter tab path.
assert.match(tabSource, /xml-cii-master-autoload-lite\.js\?v=20260624-startup-autoload-noise-1/);
assert.doesNotMatch(tabSource, /xml-cii-master-autoload-patch\.js/, 'ModelConvertersTab must not activate the broad master autoload patch');
assert.match(tabSource, /installXmlCiiDefaultMasterAutoloadLite/);
assert.doesNotMatch(tabSource, /installXmlCiiRecoveryPatch/, 'ModelConvertersTab must not install the old recovery autoload patch');

assert.match(liteAutoloadSource, /DEFAULT_MASTER_PATHS/);
assert.ok(!liteAutoloadSource.includes('Piping_class_master.json'), 'lite autoload source must not fetch removed Piping_class_master.json');
assert.ok(!/document\.addEventListener\(['"]click['"]/.test(liteAutoloadSource), 'lite autoload must not run from popup/master tab clicks');
assert.ok(!/document\.addEventListener\(['"]input['"]/.test(liteAutoloadSource), 'lite autoload must not run from hidden config input churn');
assert.ok(!/document\.addEventListener\(['"]change['"]/.test(liteAutoloadSource), 'lite autoload must not run from every config/master change');

assert.ok(!masterContextSource.includes('Piping_class_master.json'), 'core master context must not probe removed Piping_class_master.json');
assert.match(masterContextSource, /SpecwisePipingClass\/index\.json/);
assert.match(workflowBridgeSource, /ensureDefaultMastersLoaded = async \(\) => null/, 'workflow bridge must not call legacy default-master preload');
assert.match(workflowBridgeSource, /masterKey === 'pipingClass'/, 'workflow bridge must block obsolete aggregate piping-class default load');

console.log('XML CII master autoload active-runtime guard passed');
