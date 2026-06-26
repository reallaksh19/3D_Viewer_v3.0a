#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const files = {
  workflowPopup: 'viewer/tabs/model-converters/xml-cii-workflow-popup.js',
  workflowModal: 'viewer/tabs/model-converters/shared/WorkflowModal.js',
  bridge: 'viewer/tabs/model-converters/xml-cii-workflow-bridge.js',
  runner: 'viewer/tabs/model-converters/xml-cii-workflow-runner.js',
  buttonScope: 'viewer/tabs/model-converters/xml-cii-workflow-button-scope.js',
  oldGenericShim: 'viewer/tabs/model-converters/xml-cii-conversion-workflow-popup.js',
  oldRichShim: 'viewer/tabs/model-converters/xml-cii-rich-workflow-popup.js',
  modelTab: 'viewer/tabs/model-converters/ModelConvertersTab.js',
  nativePanels: 'viewer/tabs/model-converters/xml-cii-popup-native-panels.js',
  legacyAdapter: 'viewer/tabs/model-converters/legacy-adapter.js',
  enrichmentRunParity: 'viewer/tabs/model-converters/converters/xmltocii2019_helper/enrichment-run-parity.js',
  invocationBuilder: 'viewer/converters/invocation-builder.js',
};

for (const rel of Object.values(files)) {
  assert(fs.existsSync(path.join(root, rel)), `required XML CII workflow file is missing: ${rel}`);
}

const workflowPopup = read(files.workflowPopup);
const workflowModal = read(files.workflowModal);
const bridge = read(files.bridge);
const runner = read(files.runner);
const buttonScope = read(files.buttonScope);
const oldGenericShim = read(files.oldGenericShim);
const oldRichShim = read(files.oldRichShim);
const modelTab = read(files.modelTab);
const nativePanels = read(files.nativePanels);
const legacyAdapter = read(files.legacyAdapter);
const enrichmentRunParity = read(files.enrichmentRunParity);
const invocationBuilder = read(files.invocationBuilder);

assert(buttonScope.includes('model-converters-xml-cii-workflow-btn'), 'button scope must create the unified XML CII workflow launcher');
assert(buttonScope.includes('data-xml-cii-unified-workflow-launcher'), 'button scope must mark the unified launcher explicitly');
assert(buttonScope.includes('XML->CII Workflow'), 'left panel unified workflow launcher label must be explicit');
assert(!buttonScope.includes('XML->CII Workflow 1'), 'left panel must not show retired Workflow 1 launcher label');
assert(!buttonScope.includes('XML->CII Workflow 2'), 'left panel must not show retired Workflow 2 launcher label');
assert(!buttonScope.includes('XML->CII Simple Workflow'), 'left panel must not use Simple workflow labels');
assert(!buttonScope.includes('XML->CII Rich Workflow'), 'left panel must not use Rich workflow labels');
assert(buttonScope.includes('xmlCiiWorkflowButtonScopeHideAdvancedOptions'), 'button scope must hide generic XML CII advanced options');
assert(!buttonScope.includes('Simple/direct workflow options'), 'left panel must not show Simple/direct workflow options');
assert(buttonScope.includes('cloneNode(true)'), 'workflow launchers must be cloned to strip stale anonymous listeners');
assert(!buttonScope.includes('new MutationObserver'), 'button scope must not use a broad observer');
assert(!buttonScope.includes('setTimeout('), 'button scope must not use delayed startup repair timers');

assert(workflowPopup.includes('XML->CII(2019) Workflow'), 'unified popup title must be explicit');
assert(workflowPopup.includes('Import masters, map fields, preview enrichment, review weights, map supports, and run enriched CII conversion.'), 'unified popup subtitle must describe the restored WF2-capable flow');
assert(!workflowPopup.includes('XML->CII(2019) Workflow 1'), 'popup must not expose retired Workflow 1 title');
assert(!workflowPopup.includes('XML->CII(2019) Workflow 2'), 'popup must not expose retired Workflow 2 title');
assert(workflowPopup.includes('xmlCiiWorkflowRenderBridgePhase'), 'popup must prefer the robust bridge phase renderer');
assert(workflowPopup.includes('bridge.renderPhaseInto'), 'popup must render through legacy-adapter renderPhaseInto for saved rows, preview edits, weights, and support mapping');
assert(workflowPopup.includes("state?.phaseId === 'custom-input'"), 'popup must skip legacy bridge rendering for Custom Input because legacy renderPhaseInto has no custom-input branch');
assert(workflowPopup.includes('renderXmlCiiCustomInputPanel'), 'popup must render Custom Input panel directly instead of showing a blank bridge body');
assert(workflowPopup.includes('bindXmlCiiCustomInputPanel'), 'popup must bind Custom Input panel actions after direct render');
assert(workflowPopup.includes("state.mode = 'unified'"), 'popup open state must use unified workflow mode');
assert(workflowPopup.includes("target.dataset.xmlCiiWorkflowMode = state.mode || 'unified'"), 'popup dataset must default to unified workflow mode');
assert(workflowPopup.includes('xmlCiiWorkflowBindLauncher(container)'), 'popup module must bind the unified launcher directly');
assert(!workflowPopup.includes("xmlCiiWorkflowBindLauncher(container, 'workflow1')"), 'popup module must not keep direct Workflow 1 launcher binding');
assert(!workflowPopup.includes("xmlCiiWorkflowBindLauncher(container, 'workflow2')"), 'popup module must not keep direct Workflow 2 launcher binding');
assert(workflowPopup.includes('xmlCiiWorkflowBindDelegatedLauncher'), 'popup module must delegate launcher clicks from the stable root so future-created buttons respond');
assert(workflowPopup.includes('data-xml-cii-workflow-launcher'), 'delegated popup launcher binding must catch current and future unified buttons');
assert(workflowPopup.includes('data-xml-cii-unified-workflow-launcher'), 'delegated popup launcher binding must catch the explicit unified launcher');
assert(workflowPopup.includes('XML_CII_WORKFLOW_DELEGATED_DATASET_KEY'), 'delegated popup launcher binding must be guarded once per model-converters root');
assert(workflowPopup.includes('WorkflowModal.js?v=20260624-workflow-tabs-fix-1'), 'popup module must cache-bust the modal delegated-tab binding');
assert(workflowPopup.includes('xml-cii-popup-native-panels.js?v=20260625-parsed-source-1'), 'popup module must cache-bust the parsed-source native fallback renderer');
assert(workflowPopup.includes('stopImmediatePropagation'), 'popup click handler must block stale duplicate popup listeners');
assert(workflowPopup.includes('{ capture: true }'), 'popup click handler must bind in capture phase');
assert(!workflowPopup.includes("document.querySelector('#model-converters-run')"), 'popup module must not directly click legacy Run Conversion');
assert(!workflowPopup.includes('./legacy-adapter.js'), 'popup module must not import legacy adapter directly');
assert(workflowPopup.includes('xmlCiiWorkflowRenderError'), 'popup phase rendering must fail visibly instead of making tabs look inert');

assert(workflowModal.includes('data-modal-tabs'), 'modal must expose a stable tab host');
assert(workflowModal.includes("tabHost.addEventListener('click'"), 'modal phase tabs must use delegated host click handling');
assert(workflowModal.includes('data-modal-tab'), 'modal delegated handler must target phase tab buttons');

assert(bridge.includes('./legacy-adapter.js'), 'legacy adapter dependency must remain isolated to bridge boundary');
assert(bridge.includes('legacy-adapter.js?v=20260625-parsed-source-1'), 'workflow bridge must cache-bust the parsed-source legacy adapter');
assert(bridge.includes('ensureDefaultMastersLoaded = async () => null'), 'bridge must block obsolete default-master preload');
assert(bridge.includes("masterKey === 'pipingClass'"), 'bridge must block obsolete aggregate piping-class default load');
assert(bridge.includes('hydrateCondenseSnapshot'), 'bridge must own Condense Rigid option hydration without the old bridge patch');
assert(runner.includes('xmlCiiWorkflowRequestFinalRun'), 'final run handoff must remain in workflow runner boundary');
assert(runner.includes("document.querySelector('#model-converters-run')"), 'legacy run click handoff must remain contained in runner boundary only');

assert(modelTab.includes('installXmlCiiWorkflowButtonScope'), 'ModelConvertersTab must install button scope');
assert(modelTab.includes('installXmlCiiWorkflowPopup'), 'ModelConvertersTab must install workflow popup binding');
assert(!modelTab.includes('installXmlCiiWorkflowHotfix'), 'ModelConvertersTab must not install the retired workflow hotfix module');
assert(modelTab.includes('xml-cii-workflow-button-scope.js?v=20260624-unified-wf2-1'), 'ModelConvertersTab must cache-bust the unified workflow button scope');
assert(modelTab.includes('xml-cii-workflow-popup.js?v=20260625-parsed-source-1'), 'ModelConvertersTab must cache-bust the parsed-source workflow popup fix');
assert(workflowPopup.includes('data-native-preview-parsed-source'), 'popup fallback binding must persist the parsed Custom Input staged-source toggle');

assert(oldGenericShim.includes('Deprecated compatibility shim'), 'old generic popup filename must remain a compatibility shim');
assert(oldRichShim.includes('Deprecated compatibility shim'), 'old rich popup filename must remain a compatibility shim');
assert(oldRichShim.includes('installXmlCiiWorkflowPopup as installXmlCiiRichWorkflowPopup'), 'old rich popup shim must forward to neutral popup boundary');

assert(nativePanels.includes('Record source/XSD condensed rigid intent'), 'XSD condense option must remain rendered in popup with clear metadata-only label');
assert(nativePanels.includes('Apply resolved split for condensed valve/flange/rigid nodes'), 'Resolved condense option must remain rendered in popup with clear action label');
assert(nativePanels.includes('Suppress CII support tag/name labels'), 'support tag suppress option must clarify that support-kind NODENAME labels are also blanked');
assert(nativePanels.includes('Use parsed Custom Input staged source'), 'native Preview panel must expose parsed Custom Input staged-source toggle');
assert(legacyAdapter.includes('xmlCiiParsedCustomInputStagedSource'), 'legacy adapter must synthesize staged-source JSON from parsed Custom Input tables');
assert(legacyAdapter.includes('parsed_custom_input_staged_source.json'), 'final XML->CII run must inject parsed Custom Input staged source as the secondary input when enabled');
assert(legacyAdapter.includes('data-xml-cii-config-bool="condenseRigidXsd"'), 'legacy config tab must expose source/XSD condensed rigid intent option');
assert(legacyAdapter.includes('data-xml-cii-config-bool="splitCondensedValveFlange"'), 'legacy config tab must expose resolved condensed split option');
assert(legacyAdapter.includes('Suppress ON blanks Support Tag/GUID restraint records and support-kind-only NODENAME rows'), 'legacy config tab must document support-kind-only NODENAME suppression');
assert(nativePanels.includes('data-xml-cii-unified-master-preview'), 'fallback popup must expose enhanced per-master preview rows for the unified workflow');
assert(!nativePanels.includes('Workflow 1 keeps master setup compact'), 'fallback popup must not show retired Workflow 1 compact wording');
assert(!nativePanels.includes('Workflow 1 / Workflow 2'), 'fallback popup config notes must not expose retired dual-workflow wording');
assert(nativePanels.includes("master.key === 'pipingClass'"), 'native panels must disable default loading for piping-class master');
assert(enrichmentRunParity.includes('process-provenance') && enrichmentRunParity.includes('Hydro/Test Pressure'), 'process provenance diagnostics must still include Hydro/Test Pressure');
assert(enrichmentRunParity.includes('split-condensed-valve-flange-resolved'), 'resolved condense diagnostics must still exist');
assert(invocationBuilder.includes('--split-condensed-valve-flange'), 'worker invocation must still forward split-condensed flag');

console.log('XML CII workflow popup identity smoke validation passed', {
  leftPanel: 'popup-only unified workflow, no generic advanced options',
  workflow: 'restored WF2-capable popup with saved master rows, preview edits, weight review, support mapping, config, and run',
  duplicateGuard: 'capture-phase stopImmediatePropagation and foreign overlay cleanup',
  clickReliability: 'delegated root launcher clicks + delegated modal phase tabs',
  consolidation: 'workflow hotfix removed from active importer; bridge owns condense state',
});
