const STARTUP_SIDE_EFFECT_MODULES = [
  './rvm/AvevaJsonAutoConnectOverride.js?v=20260618-inputxml-auto-connect-1',
  './rvm-viewer/RvmInputXmlSupportGraphicsSetModelBridge.js?v=20260624-inputxml-source-tools-panel-1',
  './rvm-viewer/RvmInputXmlSupportGraphicsUiBridge.js?v=20260624-inputxml-source-tools-panel-1',
  './tabs/model-converters/xml-cii-finalise-run-button.js?v=20260619-workflow-perf-1',
];

function startupMount() {
  return document.getElementById('app')
    || document.getElementById('app-layout')
    || document.getElementById('app-shell')
    || document.body;
}

function reportStartupError(error) {
  console.error('3D Viewer failed to start', error);

  const label = document.getElementById('app-loading-label');
  if (label) {
    label.textContent = 'Failed to start viewer. Check the browser console for details.';
  }

  const shell = startupMount();
  if (shell) {
    shell.innerHTML = `
      <div style="padding:24px;color:#fca5a5;background:#111827;min-height:100vh;font-family:system-ui,sans-serif;">
        <h1 style="margin-top:0;color:#fecaca;">3D Viewer failed to start</h1>
        <p>The startup module failed before the tab shell could render. Please refresh once; if it remains, check the browser console for the full error.</p>
        <pre style="white-space:pre-wrap;background:#0f172a;border:1px solid #7f1d1d;border-radius:8px;padding:12px;color:#fee2e2;">${String(error?.stack || error?.message || error)}</pre>
      </div>
    `;
  }
}

async function loadStartupSideEffects() {
  const results = await Promise.allSettled(STARTUP_SIDE_EFFECT_MODULES.map((specifier) => import(specifier)));
  const failures = results
    .map((result, index) => ({ result, specifier: STARTUP_SIDE_EFFECT_MODULES[index] }))
    .filter(({ result }) => result.status === 'rejected');

  for (const { result, specifier } of failures) {
    console.warn(`[3D Viewer] optional startup module failed: ${specifier}`, result.reason);
  }

  return failures;
}

async function startViewer() {
  await loadStartupSideEffects();
  const { init } = await import('./core/app.js?v=20260620-rvm-direct-tab-1');
  await init();
}

startViewer().catch(reportStartupError);
