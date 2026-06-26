import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tab = readFileSync('viewer/tabs/model-converters/ModelConvertersTab.js', 'utf8');
const branchSample = readFileSync('viewer/tabs/model-converters/xml-cii-branch-sample-sync.js', 'utf8');
const runtimeOverride = readFileSync('viewer/tabs/model-converters/xml-cii-runtime-override-sync.js', 'utf8');
const masterAutoloadLite = readFileSync('viewer/tabs/xml-cii-master-autoload-lite.js', 'utf8');
const workflowBridge = readFileSync('viewer/tabs/model-converters/xml-cii-workflow-bridge.js', 'utf8');

for (const token of [
  'xml-cii-master-preserve-patch',
  'installXmlCiiMasterPreservePatch',
  'xml-cii-master-autoload-patch',
  'installXmlCiiRecoveryPatch',
  'xml-cii-workflow-hotfix',
  'installXmlCiiWorkflowHotfix',
  'xml-cii-linekey-select-patch',
  'installXmlCiiLineKeySelectPatch',
  'xml-cii-condense-rigid-ui-bridge',
  'installXmlCiiCondenseRigidUiBridge',
]) {
  assert.ok(!tab.includes(token), `obsolete XML CII patch module still active in ModelConvertersTab: ${token}`);
}

for (const [name, source] of [
  ['branch sample service', branchSample],
  ['runtime override sync', runtimeOverride],
  ['lite master autoload', masterAutoloadLite],
]) {
  assert.ok(!/document\.addEventListener\(['"]input['"]/.test(source), `${name} must not install broad document input listeners`);
  assert.ok(!/document\.addEventListener\(['"]change['"]/.test(source), `${name} must not install broad document change listeners`);
}

assert.ok(!/new MutationObserver/.test(branchSample), 'branch sample service must not watch document.body');
assert.ok(!/supportConfigJson/.test(branchSample), 'branch sample service must not serialize hidden supportConfigJson');
assert.ok(!/dispatchEvent/.test(branchSample), 'branch sample service must not dispatch synthetic input/change events');
assert.ok(/ensureDefaultMastersLoaded = async \(\) => null/.test(workflowBridge), 'workflow bridge must block stale aggregate default-master preload');
assert.ok(/hydrateCondenseSnapshot/.test(workflowBridge), 'workflow bridge must own Condense Rigid state without the old bridge patch');

console.log('XML CII workflow patch-retirement guard passed');
