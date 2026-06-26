import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function run() {
  const tabSource = await readFile(new URL('../../../tabs/viewer3d-rvm-tab.js', import.meta.url), 'utf8');
  const labelsSource = await readFile(new URL('../../../tabs/RvmLabelPerformanceBridge.js', import.meta.url), 'utf8');

  assert.match(tabSource, /title="Load RVM \/ REV \/ ATT \/ JSON \/ UXML"/, 'RVM tab static source must advertise RVM / REV / ATT / JSON / UXML.');
  assert.match(tabSource, /id="rvm-file-input"[^>]+accept="\.json,\.jscon,\.uxml,\.uxml\.json,\.rvm,\.rev,\.att"[^>]+multiple/, 'RVM tab static file input must accept .rvm, .rev, .att sidecars, and non-primitive source files.');
  assert.match(tabSource, /data-rvm-direct-worker-load="true"/, 'RVM tab input must expose the direct worker load marker.');
  assert.match(tabSource, /Load RVM \/ REV \/ ATT \/ JSON \/ UXML to view hierarchy\./, 'RVM hierarchy empty-state text must be correct in static source.');
  assert.match(tabSource, /Load RVM \/ REV \/ ATT \/ JSON \/ UXML to begin\./, 'RVM viewport placeholder text must be correct in static source.');
  assert.doesNotMatch(tabSource, /Load JSON\/UXML to view hierarchy|Load RVM JSON \/ UXML to begin/, 'RVM tab static source must not regress to old JSON/UXML-only wording.');

  assert.match(
    tabSource,
    /import\s+\{\s*loadRvmFileInBrowser\s*\}\s+from\s+['"]\.\.\/rvm\/BrowserRvmLoadBridge\.js\?v=20260621-rvm-native-facet-primary-1['"]/, 
    'The actual RVM tab must import the current worker-first native facet load bridge directly.'
  );
  assert.match(
    tabSource,
    /RVM_TAB_JS_VERSION\s*=\s*['"]20260622-rvm-support-runtime-retired-2['"]/, 
    'The RVM tab diagnostics version must identify the support-runtime-retired worker-first path.'
  );
  assert.match(tabSource, /beforeRenderInstructions[\s\S]*__PCF_GLB_RVM_ZONE_LOD_LABELS__/, 'The direct RVM branch must pass the pre-render zone/LOD instruction hook.');
  assert.match(tabSource, /buildFlatNodeTree[\s\S]*flat:\s*true/, 'The RVM tab must render manifest nodes as flat selectable rows before Navis hierarchy bridge upgrades it.');
  assert.doesNotMatch(tabSource, /RvmSupportIndexAttributeBridge|RvmSupportSymbols|applyRvmSupportSymbolSettings|getRvmSupportSymbolSettings/, 'The RVM tab must not import retired support runtime/index/symbol engines.');
  assert.doesNotMatch(tabSource, /rvm-support-scale|rvm-support-labels|Support\s*<input/, 'The RVM tab shell must not expose retired support scale or support label controls.');
  assert.match(tabSource, /Embedded InputXML markers skipped/, 'The RVM diagnostics panel must expose skipped embedded InputXML support marker count.');

  assert.match(labelsSource, /pcf-glb-rvm-label-performance-bridge-v2-no-support-runtime/, 'Label performance bridge must use the no-support-runtime patch marker.');
  assert.match(labelsSource, /setRvmLabelLayerVisible/, 'Label performance bridge must keep the generic CSS2D label layer control.');
  assert.doesNotMatch(labelsSource, /installRvmLabelButtonBridge|applyScopedSupportLabelVisibility|rvm-support-labels/, 'Label performance bridge must not reinstall retired support label button/runtime behavior.');

  assert.match(tabSource, /const\s+rvmFile\s*=\s*files\.find\(\(file\)\s*=>\s*isLikelyRvmFileName\(file\?\.name\)\)/, 'The actual tab change handler must branch explicitly for .rvm/.rev files.');
  assert.match(tabSource, /await\s+loadDirectBrowserRvm\(\{\s*root,\s*viewer,\s*files,\s*rvmFile,\s*stateBag\s*\}\)/, 'The .rvm/.rev branch must call the direct worker load path.');
  assert.match(tabSource, /allowMainThreadParserFallback:\s*false[\s\S]*buildHierarchyFallback:\s*false/, 'The direct RVM path must forbid large main-thread fallback and old hierarchy fallback.');
  assert.doesNotMatch(tabSource, /const\s+bounds\s*=\s*payload\.browserRvmRender\?\.bounds/, 'The tab must not perform a duplicate post-load raw-bounds fit.');

  const rvmBranchStart = tabSource.indexOf('if (rvmFile)');
  const jsonBranchStart = tabSource.indexOf('const jsonFile', rvmBranchStart);
  assert.ok(rvmBranchStart > 0 && jsonBranchStart > rvmBranchStart, 'The direct RVM branch must be before JSON/UXML handling.');
  const rvmBranch = tabSource.slice(rvmBranchStart, jsonBranchStart);
  assert.doesNotMatch(rvmBranch, /loadJsonOrUxmlFile|JSON\.parse|\.text\(\)/, 'The .rvm/.rev path must never call the JSON/UXML text loader.');

  console.log('Browser RVM direct tab support-runtime-retired contract test passed');
}

run();
