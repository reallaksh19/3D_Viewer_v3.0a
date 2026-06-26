#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const read = (file) => fs.readFileSync(path.join(repoRoot, file), 'utf8');

const files = {
  legacyShim: 'viewer/tabs/model-converters-tab.js',
  tab: 'viewer/tabs/model-converters/ModelConvertersTab.js',
  buttonScope: 'viewer/tabs/model-converters/xml-cii-workflow-button-scope.js',
  workflowPopup: 'viewer/tabs/model-converters/xml-cii-workflow-popup.js',
  workflowModal: 'viewer/tabs/model-converters/shared/WorkflowModal.js',
  workflowBridge: 'viewer/tabs/model-converters/xml-cii-workflow-bridge.js',
  nativePanels: 'viewer/tabs/model-converters/xml-cii-popup-native-panels.js',
  simpleController: 'viewer/tabs/model-converters/xml-cii-simple-workflow-controller.js',
  branchSample: 'viewer/tabs/model-converters/xml-cii-branch-sample-sync.js',
  runtimeOverrideSync: 'viewer/tabs/model-converters/xml-cii-runtime-override-sync.js',
  masterAutoloadLite: 'viewer/tabs/xml-cii-master-autoload-lite.js',
  oldPopupShim: 'viewer/tabs/model-converters/xml-cii-conversion-workflow-popup.js',
  oldRichPopupShim: 'viewer/tabs/model-converters/xml-cii-rich-workflow-popup.js',
};

const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

assert(/export\s*\{\s*renderModelConvertersTab\s*\}\s*from\s*['"]\.\/model-converters\/index\.js(?:\?[^'"]*)?['"]/.test(source.legacyShim), 'legacy shim must delegate renderModelConvertersTab to canonical model-converters entrypoint');
assert(/renderLegacyModelConvertersTab\(container, ctx\)/.test(source.tab), 'canonical model converter tab must render legacy adapter first');
assert(/scheduleInstallerQueue\(container\)/.test(source.tab), 'optional installers must be scheduled through one guarded queue');
assert(/requestIdleCallback/.test(source.tab), 'installer queue should prefer requestIdleCallback when available');
assert(!/setTimeout\(/.test(source.tab), 'ModelConvertersTab must not emit repeated setTimeout startup handlers');

for (const token of [
  'xml-cii-workflow-hotfix',
  'installXmlCiiWorkflowHotfix',
  'xml-cii-condense-rigid-ui-bridge',
  'installXmlCiiCondenseRigidUiBridge',
  'xml-cii-linekey-select-patch',
  'installXmlCiiLineKeySelectPatch',
  'xml-cii-master-autoload-patch',
  'installXmlCiiRecoveryPatch',
  'xml-cii-master-preserve-patch',
  'installXmlCiiMasterPreservePatch',
]) {
  assert(!source.tab.includes(token), `canonical tab must not actively import/install ${token}`);
}

assert(/xml-cii-workflow-button-scope\.js\?v=20260624-unified-wf2-1/.test(source.tab), 'button scope must use unified WF2 cache key');
assert(/xml-cii-workflow-popup\.js\?v=20260625-service-1/.test(source.tab), 'workflow popup must use service cache key');
assert(/xml-cii-branch-sample-sync\.js\?v=20260624-workflow-consolidation-1/.test(source.tab), 'branch sample service must use consolidation cache key');
assert(/installXmlCiiDefaultMasterAutoloadLite/.test(source.tab), 'canonical tab must keep lightweight one-shot XML CII master autoload');
assert(!/installXmlCiiDefaultMasterAutoload[^L]/.test(source.tab), 'canonical tab must not install the legacy broad-listener master autoload');

assert(/xmlCiiWorkflowButtonScopeSync/.test(source.buttonScope), 'button scope must expose a sync function');
assert(/XML_CII_CONVERTER_ID\s*=\s*'xml_to_cii'/.test(source.buttonScope), 'button scope must key workflow visibility from xml_to_cii converter id');
assert(/model-converters-xml-cii-workflow-btn/.test(source.buttonScope), 'button scope must create the unified workflow launcher button');
assert(/data-xml-cii-unified-workflow-launcher/.test(source.buttonScope), 'button scope must mark the unified workflow launcher');
assert(/XML->CII Workflow/.test(source.buttonScope), 'left panel unified launcher must be labelled XML->CII Workflow');
assert(!/XML->CII Workflow 1/.test(source.buttonScope), 'left panel must not show retired Workflow 1 label');
assert(!/XML->CII Workflow 2/.test(source.buttonScope), 'left panel must not show retired Workflow 2 label');
assert(/xmlCiiWorkflowButtonScopeHideAdvancedOptions/.test(source.buttonScope), 'button scope must hide generic XML CII advanced options from the left panel');
assert(!/new MutationObserver/.test(source.buttonScope), 'button scope must not use a broad observer to chase UI mutations');
assert(!/setTimeout\(/.test(source.buttonScope), 'button scope must not schedule repeated delayed startup repairs');

assert(/xmlCiiSimpleWorkflowRestoreRunButton/.test(source.simpleController), 'simple controller must keep a named restore function for non-XML CII converters');
assert(/XML_CII_CONVERTER_ID/.test(source.simpleController), 'simple controller must know xml_to_cii is popup-only');
assert(/return null/.test(source.simpleController), 'simple controller must skip direct-run restore for XML CII');
assert(!/setTimeout\(/.test(source.simpleController), 'simple controller must not schedule repeated delayed direct-run repairs');
assert(!/document\.querySelector\('#model-converters-run'\)/.test(source.simpleController), 'simple controller must not use a global run-button fallback');

assert(!/new MutationObserver/.test(source.workflowPopup), 'lean workflow popup launcher must not install MutationObserver');
assert(!/function interceptRun/.test(source.workflowPopup), 'workflow popup must not define old simple-run interception');
assert(!/document\.addEventListener\('click', interceptRun, true\)/.test(source.workflowPopup), 'workflow popup must not capture the legacy Run Conversion click');
assert(/XML->CII\(2019\) Workflow/.test(source.workflowPopup), 'unified popup title must be explicit');
assert(!/XML->CII\(2019\) Workflow 1/.test(source.workflowPopup), 'popup must not expose retired Workflow 1 title');
assert(!/XML->CII\(2019\) Workflow 2/.test(source.workflowPopup), 'popup must not expose retired Workflow 2 title');
assert(/xmlCiiWorkflowRenderBridgePhase/.test(source.workflowPopup), 'popup must prefer the robust bridge phase renderer');
assert(/bridge\.renderPhaseInto/.test(source.workflowPopup), 'popup must use renderPhaseInto for WF2 features');
assert(/state\?\.phaseId === 'custom-input'/.test(source.workflowPopup), 'popup must bypass legacy bridge rendering for Custom Input');
assert(/renderXmlCiiCustomInputPanel/.test(source.workflowPopup), 'popup must render Custom Input directly');
assert(/bindXmlCiiCustomInputPanel/.test(source.workflowPopup), 'popup must bind Custom Input actions directly');
assert(/state\.mode = 'unified'/.test(source.workflowPopup), 'popup open state must use unified workflow mode');
assert(/xmlCiiWorkflowBindDelegatedLauncher/.test(source.workflowPopup), 'popup module must delegate launcher clicks from the stable model-converters root');
assert(/XML_CII_WORKFLOW_DELEGATED_DATASET_KEY/.test(source.workflowPopup), 'delegated launcher binding must be installed once per root');
assert(/data-xml-cii-workflow-launcher/.test(source.workflowPopup), 'delegated launcher binding must catch future-created unified workflow buttons');
assert(/data-xml-cii-unified-workflow-launcher/.test(source.workflowPopup), 'delegated launcher binding must catch the explicit unified workflow button');
assert(/WorkflowModal\.js\?v=20260624-workflow-tabs-fix-1/.test(source.workflowPopup), 'workflow popup must cache-bust the modal delegated-tab implementation');
assert(/xml-cii-popup-native-panels\.js\?v=20260625-service-1/.test(source.workflowPopup), 'workflow popup must cache-bust the service native fallback renderer');
assert(/xmlCiiWorkflowBindLauncher\(container\)/.test(source.workflowPopup), 'popup module must keep direct unified launcher binding for existing buttons');
assert(!/xmlCiiWorkflowBindLauncher\(container, 'workflow1'\)/.test(source.workflowPopup), 'popup module must not keep direct Workflow 1 launcher binding');
assert(!/xmlCiiWorkflowBindLauncher\(container, 'workflow2'\)/.test(source.workflowPopup), 'popup module must not keep direct Workflow 2 launcher binding');
assert(/stopImmediatePropagation/.test(source.workflowPopup), 'workflow popup click handler must block stale cached popup listeners on the same click');
assert(/xmlCiiWorkflowCloseForeignXmlCiiWorkflowOverlays/.test(source.workflowPopup), 'workflow popup must close duplicate legacy XML CII workflow overlays');
assert(/xmlCiiWorkflowScheduleRenderPhase/.test(source.workflowPopup), 'workflow popup must schedule heavy phase/master rerenders outside click/change handlers');
assert(/requestAnimationFrame/.test(source.workflowPopup), 'workflow popup scheduled rendering must use requestAnimationFrame when available');
assert(/xmlCiiWorkflowRenderError/.test(source.workflowPopup), 'workflow popup must surface render errors instead of making tabs look inert');

assert(/data-modal-tabs/.test(source.workflowModal), 'workflow modal must expose a stable tab host');
assert(/tabHost\.addEventListener\('click'/.test(source.workflowModal), 'workflow modal must delegate phase tab clicks from the tab host');
assert(/data-modal-tab/.test(source.workflowModal), 'workflow modal delegated handler must target data-modal-tab buttons');

assert(/ensureDefaultMastersLoaded = async \(\) => null/.test(source.workflowBridge), 'workflow bridge must block obsolete legacy default-master preload');
assert(/legacy-adapter\.js\?v=20260625-service-1/.test(source.workflowBridge), 'workflow bridge must cache-bust the service legacy adapter');
assert(/masterKey === 'pipingClass'/.test(source.workflowBridge), 'workflow bridge must block obsolete aggregate piping-class default load');
assert(/sanitizeSnapshot/.test(source.workflowBridge), 'workflow bridge must sanitize stale default URLs from popup snapshots');
assert(/XML_CII_WORKFLOW_SNAPSHOT_TTL_MS/.test(source.workflowBridge), 'workflow bridge must cache popup snapshots to avoid rebuilding all master metadata on every tab click');
assert(/hydrateCondenseSnapshot/.test(source.workflowBridge), 'workflow bridge must own Condense Rigid run/config hydration');
assert(/mergeCondenseBoolKeys/.test(source.workflowBridge), 'workflow bridge must persist XSD and Resolved condense aliases together');
assert(!/xml-cii-condense-rigid-ui-bridge/.test(source.workflowBridge), 'workflow bridge must not depend on the old condense wrapper module');

assert(/master\.key === 'pipingClass'/.test(source.nativePanels), 'native panels must disable default loading for piping-class master');
assert(/data-xml-cii-unified-master-preview/.test(source.nativePanels), 'fallback popup must expose enhanced per-master preview rows');
assert(!/Workflow 1 keeps master setup compact/.test(source.nativePanels), 'fallback popup must not show retired Workflow 1 compact wording');
assert(!/Workflow 1 \/ Workflow 2/.test(source.nativePanels), 'fallback popup config notes must not expose retired dual-workflow wording');
assert(/Record source\/XSD condensed rigid intent/.test(source.nativePanels), 'Run Options must show source/XSD condensed rigid intent in both workflows');
assert(/Apply resolved split for condensed valve\/flange\/rigid nodes/.test(source.nativePanels), 'Run Options must show resolved condensed split action in both workflows');
assert(/Suppress CII support tag\/name labels/.test(source.nativePanels), 'Config must clarify support tag and support-kind NODENAME suppression');
assert(/Use JSON Trace staged source/.test(source.nativePanels), 'native Preview panel must expose JSON Trace staged-source toggle');

assert(!/new MutationObserver/.test(source.branchSample), 'branch sample service must not observe the whole document');
assert(!/setTimeout\(/.test(source.branchSample), 'branch sample service must not use delayed startup repair loops');
assert(!/supportConfigJson/.test(source.branchSample), 'branch sample service must not serialize hidden supportConfigJson');
assert(!/dispatchEvent/.test(source.branchSample), 'branch sample service must not dispatch synthetic input/change churn');
assert(/syncLoadedXmlCiiBranchSample/.test(source.branchSample), 'branch sample service must expose explicit XML file sync');

assert(!/root\.addEventListener\('change'/.test(source.runtimeOverrideSync), 'runtime override sync must not install broad capture-phase change handler');
assert(/explicit preview\/weight\/run actions/.test(source.runtimeOverrideSync), 'runtime override sync must document explicit-action-only behavior');
assert(/data-native-build-preview/.test(source.runtimeOverrideSync), 'runtime override sync must still sync before popup preview actions');
assert(/data-native-finalise-run/.test(source.runtimeOverrideSync), 'runtime override sync must still sync before final workflow run');

assert(!/document\.addEventListener\('click'/.test(source.masterAutoloadLite), 'lite master autoload must not schedule on every popup click/master tab click');
assert(!/document\.addEventListener\('input'/.test(source.masterAutoloadLite), 'lite master autoload must not schedule on hidden config input churn');
assert(!/document\.addEventListener\('change'/.test(source.masterAutoloadLite), 'lite master autoload must not schedule on every config/master change');
assert(!/Piping_class_master\.json/.test(source.masterAutoloadLite), 'lite master autoload must not probe obsolete aggregate piping class master');
assert(/DEFAULT_MASTER_PATHS/.test(source.masterAutoloadLite), 'lite master autoload must still define default material/weight master paths');

assert(/Deprecated compatibility shim/.test(source.oldPopupShim), 'old generic popup filename must be a compatibility shim only');
assert(!/restoreSimpleRunButton/.test(source.oldPopupShim), 'old generic popup shim must not restore simple Run Conversion visibility');
assert(/Deprecated compatibility shim/.test(source.oldRichPopupShim), 'old rich popup filename must be a compatibility shim only');
assert(/installXmlCiiWorkflowPopup as installXmlCiiRichWorkflowPopup/.test(source.oldRichPopupShim), 'old rich popup shim must re-export the neutral workflow popup installer');

console.log('model converters tab XML CII workflow consolidation guard passed', {
  xmlCiiLeftPanel: 'popup-only unified workflow, no generic advanced options',
  activePatchModules: 'removed from ModelConvertersTab active import path',
  clickReliability: 'delegated root launcher clicks + delegated modal phase tabs',
  masterTabResponsiveness: 'scheduled popup rendering + cached bridge snapshot + explicit runtime override sync',
  startupNoise: 'no repeated startup repair setTimeout loops in XML CII shell/button/simple/branch services',
});
