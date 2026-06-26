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

const activeFiles = [
  '../tabs/viewer3d-rvm-tab-renderer.js',
  '../tabs/RvmDeferredBridgeLoader.js',
  '../tabs/viewer3d-rvm-tab.js',
  '../tabs/RvmBottomDiagnosticsDrawerBridge.js',
  '../tabs/RvmLabelPerformanceBridge.js',
  '../rvm/BrowserRvmRenderContractAdapter.js',
];
const activeSources = Object.fromEntries(await Promise.all(activeFiles.map(async (file) => [file, await read(file)])));
const tabSource = activeSources['../tabs/viewer3d-rvm-tab.js'];
const rendererSource = activeSources['../tabs/viewer3d-rvm-tab-renderer.js'];
const labelPerformanceSource = activeSources['../tabs/RvmLabelPerformanceBridge.js'];
const adapterSource = activeSources['../rvm/BrowserRvmRenderContractAdapter.js'];
const purgeSource = await read('../tabs/RvmRetiredSupportToolsPurgeBridge.js');

for (const [file, source] of Object.entries(activeSources)) {
  for (const retired of [
    'RvmSupportSummaryBridge',
    'RvmSupportAssemblyBridge',
    'RvmSupportAssemblyMarkerModeBridge',
    'RvmIntelligentSupportEngineBridge',
    'RvmSupportGeometryBridge',
    'RvmSupportAttMappingBridge',
    'RvmRawSupportCylinderGuardBridge',
    'RvmInputXmlSupportGraphics',
    'RvmSupportSymbols',
    'RvmSupportIndexAttributeBridge',
  ]) {
    check(!source.includes(retired), `${file} does not reference retired ${retired}`);
  }
}

for (const forbiddenUi of [
  'Support Summary',
  'SupportATT',
  'SupportEngine',
  'Support scale',
  'Support Labels',
  'Assembly marker',
  'Raw/Symbol/Both support mode',
  'rvm-support-scale',
  'rvm-support-labels',
  'data-rvm-status-chip="supports"',
  'Search hierarchy / support tag',
]) {
  check(!tabSource.includes(forbiddenUi), `RVM tab shell excludes ${forbiddenUi}`);
}

check(
  !rendererSource.includes('installRvmLabelButtonBridge') && !labelPerformanceSource.includes('installRvmLabelButtonBridge'),
  'label performance bridge no longer exposes legacy support label button wiring'
);

check(
  adapterSource.includes('rvm-browser-render-instructions/v6-rvm-support-runtime-retired'),
  'RVM render contract schema records support runtime retirement'
);
check(
  adapterSource.includes('rvm.debug.showEmbeddedInputXmlSupportMarkers') && adapterSource.includes('embeddedInputXmlSupportMarkerSkippedCount'),
  'RVM render contract skips embedded InputXML support markers by default with explicit debug key'
);
check(
  !adapterSource.includes('supportHintFor') && !adapterSource.includes('SUPPORT_BBOX_PLACEHOLDER') && !adapterSource.includes('RVM_BROWSER_SUPPORT_HINT'),
  'RVM render contract no longer promotes RVM primitives into support placeholders or support hints'
);
check(
  purgeSource.includes('__RVM_GEOMETRY_SUPPORT_SYMBOLS__')
    && purgeSource.includes('__RVM_SUPPORT_ASSEMBLY_MARKERS__')
    && purgeSource.includes('__RVM_EXPORTABLE_SUPPORT_GEOMETRY__')
    && purgeSource.includes('__RVM_SUPPORT_SYMBOLS__'),
  'purge bridge removes all retired support scene roots'
);
check(
  purgeSource.includes('viewer?.modelGroup') && purgeSource.includes('viewer?.scene'),
  'purge bridge sweeps both modelGroup and scene'
);
check(
  purgeSource.includes('INPUTXML') && purgeSource.includes('rvm.debug.showEmbeddedInputXmlSupportMarkers'),
  'purge bridge hides stale embedded InputXML marker labels unless debug key is enabled'
);
check(
  tabSource.includes('autoFit: true') && !tabSource.includes('supportSymbols'),
  'RVM viewer is constructed without support symbol options'
);

if (failed) {
  console.error(`FAILURES: ${failed}`);
  process.exit(1);
}
console.log(`All RVM support runtime retirement checks passed (${passed}).`);
