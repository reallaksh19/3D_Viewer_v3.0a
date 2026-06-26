// Previous cache marker: core/app.js?v=20260622-geometry-import-tree-1
// Previous cache marker: core/app.js?v=20260622-geometry-enriched-stagedjson-1
// Previous cache marker: core/app.js?v=20260622-geometry-support-load-inputs-1
// Previous cache marker: core/app.js?v=20260622-pipe-support-load-input-hydrator-1
// Previous cache marker: core/app.js?v=20260622-input-review-lock-1
// Previous cache marker: core/app.js?v=20260622-input-review-override-lock-1
// Previous cache marker: core/app.js?v=20260623-support-load-master-data-1
// Previous cache marker: core/app.js?v=20260623-master-data-hydrator-priority-1
// Previous cache marker: core/app.js?v=20260623-autospan-resolver-1
// Previous cache marker: core/app.js?v=20260624-selected-geometry-floating-workflow-3
// Previous cache marker: core/app.js?v=20260625-rvm-renderer-cache-chain-1
// Previous cache marker: core/app.js?v=20260625-rvm-route-preserve-preflight-1
// Previous cache marker: core/app.js?v=20260625-model-converters-finalise-run-owner-1
// Previous cache marker: core/app.js?v=20260625-empty-startup-side-effects-removed-1
// Active cache key: core/app.js?v=20260626-rvm-hierarchy-ui-selection-sync-1
function startupMount() { return document.getElementById('app') || document.getElementById('app-layout') || document.getElementById('app-shell') || document.body; }
function reportStartupError(error) { console.error('3D Viewer startup error', error); const label = document.getElementById('app-loading-label'); if (label) label.textContent = 'Viewer startup error. Check the browser console.'; const shell = startupMount(); if (!shell) return; shell.innerHTML = '<div style="padding:24px;color:#fca5a5;background:#111827;min-height:100vh;font-family:system-ui,sans-serif;"><h1 style="margin-top:0;color:#fecaca;">3D Viewer startup error</h1><p>Refresh once. If the problem remains, check the browser console.</p></div>'; }
async function startViewer() { const { init } = await import('./core/app.js?v=20260626-rvm-hierarchy-ui-selection-sync-1'); await init(startupMount()); }
startViewer().catch(reportStartupError);
