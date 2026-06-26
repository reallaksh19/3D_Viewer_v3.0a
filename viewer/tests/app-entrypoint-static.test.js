import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const viewerRoot = path.join(repoRoot, 'viewer');
const indexPath = path.join(viewerRoot, 'index.html');
const runtimeEventsPath = path.join(viewerRoot, 'contracts/runtime-events.js');
const appPath = path.join(viewerRoot, 'core/app.js');
const eventBusPath = path.join(viewerRoot, 'core/event-bus.js');
const rvmRendererPath = path.join(viewerRoot, 'tabs/viewer3d-rvm-tab-renderer.js');
const rvmTabPath = path.join(viewerRoot, 'tabs/viewer3d-rvm-tab.js');
const rvmModuleContractPath = path.join(viewerRoot, 'tabs/rvm-viewer-module-contract.js');

function stripUrlSuffix(value) {
  return String(value || '').split('?')[0].split('#')[0];
}

function isExternalOrBareImport(value) {
  const text = String(value || '').trim();
  return /^https?:\/\//i.test(text) || /^(data|blob):/i.test(text) || (!text.startsWith('./') && !text.startsWith('../') && !text.startsWith('/'));
}

function resolveViewerAsset(fromDir, assetRef) {
  const cleanRef = stripUrlSuffix(assetRef);
  if (!cleanRef) return null;
  if (/^https?:\/\//i.test(cleanRef) || /^(data|blob):/i.test(cleanRef)) return null;

  const resolved = cleanRef.startsWith('/')
    ? path.resolve(viewerRoot, `.${cleanRef}`)
    : path.resolve(fromDir, cleanRef);

  assert.ok(
    resolved === viewerRoot || resolved.startsWith(viewerRoot + path.sep),
    `asset must stay inside viewer artifact: ${assetRef}`,
  );

  return resolved;
}

function resolveViewerRuntimeFetchAsset(assetRef) {
  const cleanRef = stripUrlSuffix(assetRef);
  if (!cleanRef) return null;
  assert.ok(
    !cleanRef.startsWith('../'),
    `runtime fetch asset must not escape deployed viewer root: ${assetRef}`,
  );
  return resolveViewerAsset(viewerRoot, cleanRef);
}

function assertFileExists(resolved, label) {
  assert.ok(fs.existsSync(resolved), `${label} does not exist: ${path.relative(viewerRoot, resolved)}`);
  assert.ok(fs.statSync(resolved).isFile(), `${label} is not a file: ${path.relative(viewerRoot, resolved)}`);
}

function extractHtmlRefs(indexHtml, tagName, attrName, filter = () => true) {
  const refs = [];
  const tagRegex = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  const attrRegex = new RegExp(`${attrName}=["']([^"']+)["']`, 'i');

  for (const tagMatch of indexHtml.matchAll(tagRegex)) {
    const tag = tagMatch[0];
    if (!filter(tag)) continue;
    const attrMatch = tag.match(attrRegex);
    if (attrMatch?.[1]) refs.push(attrMatch[1]);
  }

  return refs;
}

function extractLocalJsImports(sourceText) {
  const imports = new Set();
  const patterns = [
    /import\s+(?:[^'";]+?\s+from\s+)?["']([^"']+)["']/g,
    /import\s*\(\s*["']([^"']+)["']\s*\)/g,
    /export\s+(?:[^'";]+?\s+from\s+)["']([^"']+)["']/g,
  ];

  for (const pattern of patterns) {
    for (const match of sourceText.matchAll(pattern)) {
      const specifier = match[1];
      if (!isExternalOrBareImport(specifier)) imports.add(specifier);
    }
  }

  return [...imports];
}

function verifyModuleGraph(entryFiles) {
  const visited = new Set();
  const stack = [...entryFiles];

  while (stack.length) {
    const file = stack.pop();
    const key = path.resolve(file);
    if (visited.has(key)) continue;
    visited.add(key);

    assertFileExists(key, 'module');
    const text = fs.readFileSync(key, 'utf8');
    const fromDir = path.dirname(key);

    for (const specifier of extractLocalJsImports(text)) {
      const resolved = resolveViewerAsset(fromDir, specifier);
      if (!resolved) continue;
      assertFileExists(resolved, `module import ${specifier}`);
      stack.push(resolved);
    }
  }

  return visited;
}

function readRuntimeEventKeys() {
  const text = fs.readFileSync(runtimeEventsPath, 'utf8');
  const match = text.match(/RuntimeEvents\s*=\s*Object\.freeze\s*\(\s*\{([\s\S]*?)\}\s*\)/);
  assert.ok(match, 'RuntimeEvents object must be statically parseable');

  const keys = new Set();
  for (const keyMatch of match[1].matchAll(/\b([A-Z][A-Z0-9_]*)\s*:/g)) {
    keys.add(keyMatch[1]);
  }
  assert.ok(keys.size > 0, 'RuntimeEvents object must define at least one event');
  return keys;
}

function verifyRuntimeEventReferences(moduleFiles) {
  const validKeys = readRuntimeEventKeys();
  const missing = [];

  for (const file of moduleFiles) {
    const text = fs.readFileSync(file, 'utf8');
    for (const ref of text.matchAll(/RuntimeEvents\.([A-Z][A-Z0-9_]*)/g)) {
      const key = ref[1];
      if (!validKeys.has(key)) {
        missing.push(`${path.relative(viewerRoot, file)} -> RuntimeEvents.${key}`);
      }
    }
  }

  assert.deepEqual(missing, [], `RuntimeEvents references must be registered:\n${missing.join('\n')}`);
}

function verifyRuntimeFetchAssets(moduleFiles) {
  const missing = [];

  for (const file of moduleFiles) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/const\s+([A-Z0-9_]*URL)\s*=\s*["']([^"']+)["']/g)) {
      const name = match[1];
      const assetRef = match[2];
      if (!assetRef.includes('/')) continue;
      if (/^https?:\/\//i.test(assetRef)) continue;

      try {
        const resolved = resolveViewerRuntimeFetchAsset(assetRef);
        if (resolved) assertFileExists(resolved, `${name} runtime fetch asset`);
      } catch (error) {
        missing.push(`${path.relative(viewerRoot, file)} ${name}=${assetRef}: ${error.message}`);
      }
    }
  }

  assert.deepEqual(missing, [], `runtime fetch assets must exist inside deployed viewer root:\n${missing.join('\n')}`);
}

function verifyAppTabLifecycleIsolation() {
  const appSource = fs.readFileSync(appPath, 'utf8');
  const eventBusSource = fs.readFileSync(eventBusPath, 'utf8');

  assert.ok(appSource.includes('let activeTabDestroy'), 'app.js must keep active tab cleanup separate from app cleanup');
  assert.ok(appSource.includes('let appDestroy'), 'app.js must keep app cleanup separate from active tab cleanup');
  assert.ok(appSource.includes('function cleanupActiveTab'), 'app.js must centralize active tab cleanup');
  assert.ok(!appSource.includes('mountedDestroy = mountApp'), 'app.js must not store app cleanup in the active tab cleanup slot');
  assert.ok(appSource.includes('renderTabError'), 'app.js must render a tab error boundary instead of killing navigation');
  assert.ok(appSource.includes('tabRendererCache'), 'app.js must lazy-load/cache tab renderers');
  assert.ok(!/import\s+\{\s*renderViewer3D\s*\}/.test(appSource), 'app.js must not eagerly import tab renderers at startup');

  assert.ok(eventBusSource.includes('return () => off(event, fn);'), 'event-bus.on() must return an unsubscribe function');
  assert.ok(eventBusSource.includes('listener failed'), 'event-bus.emit() must isolate listener failures');
}

function verifyStartupBlankPageGuard(moduleScripts) {
  const scriptPaths = moduleScripts.map(stripUrlSuffix);
  assert.deepEqual(
    scriptPaths.length,
    1,
    'viewer/index.html must expose exactly one guarded module entrypoint; optional addons belong behind tab-owned dynamic imports',
  );
  assert.ok(
    /^\.\/main(?:-[A-Za-z0-9_-]+)?\.js$/.test(scriptPaths[0]),
    `viewer/index.html module entrypoint must be a guarded local main*.js file: ${moduleScripts[0]}`,
  );

  const activeMainPath = resolveViewerAsset(viewerRoot, moduleScripts[0]);
  assertFileExists(activeMainPath, `guarded module entrypoint ${moduleScripts[0]}`);
  const mainSource = fs.readFileSync(activeMainPath, 'utf8');

  assert.ok(
    !/^\s*import\s+(?!\()/m.test(mainSource),
    `${path.relative(viewerRoot, activeMainPath)} must not use eager static imports because module-load failures bypass reportStartupError and can blank the page`,
  );
  assert.ok(!mainSource.includes('STARTUP_SIDE_EFFECT_MODULES'), `${path.relative(viewerRoot, activeMainPath)} must not keep a global startup side-effect module list`);
  assert.ok(!mainSource.includes('loadStartupSideEffects'), `${path.relative(viewerRoot, activeMainPath)} must not keep a no-op startup side-effect loader`);
  assert.ok(!mainSource.includes('scheduleDeferredStartupSideEffects'), `${path.relative(viewerRoot, activeMainPath)} must not schedule empty startup side effects`);
  assert.ok(!mainSource.includes('optional startup module failed'), `${path.relative(viewerRoot, activeMainPath)} must not contain dead optional-startup logging`);
  assert.ok(/import\s*\(\s*["']\.\/core\/app\.js\?v=/.test(mainSource), `${path.relative(viewerRoot, activeMainPath)} must dynamically import core/app.js through the guarded startup path`);
  assert.ok(mainSource.includes('startViewer().catch(reportStartupError)'), `${path.relative(viewerRoot, activeMainPath)} must catch startup failures and render the startup error boundary`);
  assert.ok(mainSource.includes("document.getElementById('app-layout')"), 'startup error boundary must target the deployed #app-layout mount');
}

function extractRvmViewerImportSpecifiers(sourceText) {
  const specs = [];
  for (const match of sourceText.matchAll(/from\s+["']([^"']*RvmViewer3D\.js\?v=[^"']+)["']/g)) {
    specs.push(match[1]);
  }
  return specs;
}

function verifyRvmViewerModuleIdentityContract() {
  const contractSource = fs.readFileSync(rvmModuleContractPath, 'utf8');
  const rendererSource = fs.readFileSync(rvmRendererPath, 'utf8');
  const tabSource = fs.readFileSync(rvmTabPath, 'utf8');
  const keyMatch = contractSource.match(/RVM_VIEWER3D_MODULE_CACHE_KEY\s*=\s*["']([^"']+)["']/);
  assert.ok(keyMatch, 'RVM viewer module contract must expose RVM_VIEWER3D_MODULE_CACHE_KEY');
  const expectedSuffix = `RvmViewer3D.js?v=${keyMatch[1]}`;
  const imports = [
    ...extractRvmViewerImportSpecifiers(rendererSource),
    ...extractRvmViewerImportSpecifiers(tabSource),
  ];
  assert.ok(imports.length >= 2, 'RVM renderer and mounted tab must both import RvmViewer3D.js');
  assert.deepEqual(
    [...new Set(imports.map((specifier) => specifier.slice(specifier.lastIndexOf('RvmViewer3D.js'))))],
    [expectedSuffix],
    `RVM renderer and mounted tab must use one RvmViewer3D module identity from ${path.relative(viewerRoot, rvmModuleContractPath)}`,
  );
  assert.ok(rendererSource.includes('installToolbarActionCompatibility'), 'RVM renderer must publish handleToolbarAction compatibility for the mounted toolbar binding');
  assert.ok(rendererSource.includes('RVM_VIEWER3D_MODULE_SPECIFIER'), 'RVM renderer must publish the module identity contract for live diagnostics');
}

const indexHtml = fs.readFileSync(indexPath, 'utf8');
const moduleScripts = extractHtmlRefs(indexHtml, 'script', 'src', (tag) => /type=["']module["']/i.test(tag));
const stylesheets = extractHtmlRefs(indexHtml, 'link', 'href', (tag) => /rel=["']stylesheet["']/i.test(tag));

assert.ok(moduleScripts.length > 0, 'viewer/index.html must declare at least one module script entrypoint');

const entryFiles = [];
for (const scriptSrc of moduleScripts) {
  assert.ok(!/^https?:\/\//i.test(scriptSrc), `module script must be local for deploy preflight: ${scriptSrc}`);
  const resolved = resolveViewerAsset(viewerRoot, scriptSrc);
  assertFileExists(resolved, `module script referenced by viewer/index.html: ${scriptSrc}`);
  entryFiles.push(resolved);
}

for (const href of stylesheets) {
  const resolved = resolveViewerAsset(viewerRoot, href);
  if (!resolved) continue;
  assertFileExists(resolved, `stylesheet referenced by viewer/index.html: ${href}`);
}

verifyStartupBlankPageGuard(moduleScripts);
const checkedModules = verifyModuleGraph(entryFiles);
verifyRuntimeEventReferences(checkedModules);
verifyRuntimeFetchAssets(checkedModules);
verifyAppTabLifecycleIsolation();
verifyRvmViewerModuleIdentityContract();
console.log(`Verified ${moduleScripts.length} viewer module entrypoint(s), ${stylesheets.length} stylesheet(s), ${checkedModules.size} local module file(s), runtime events, runtime fetch assets, startup blank-page guard, app tab lifecycle isolation, and RVM viewer module identity.`);
