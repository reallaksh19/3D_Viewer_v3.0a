const CACHE_KEY = '20260624-rvm-diagnostics-docked-drawer-1';
const API_KEY = '__PCF_GLB_RVM_BOTTOM_DIAGNOSTICS_DRAWER__';

const PANEL_SPECS = [
  { key: 'action-errors', title: 'RVM Action Errors', selector: '[data-rvm-action-diagnostics-panel]', priority: 5 },
  { key: 'glb-selection', title: 'GLB Selection Details', selector: '[data-rvm-glb-selection-parity-panel]', priority: 10 },
  { key: 'acceptance', title: 'RVM GLB Acceptance Pack', selector: '[data-rvm-glb-acceptance-panel]', priority: 20 },
  { key: 'stagedjson', title: 'StagedJSON', selector: '[data-rvm-stagedjson-panel]', priority: 30 },
  { key: 'stagedcheck', title: 'StagedCheck', selector: '[data-rvm-stagedjson-validation-panel]', priority: 40 },
  { key: 'primitive-fallback', title: 'Primitive Fallback Review', selector: '[data-rvm-primitive-fallback-panel]', priority: 70 },
];

const EVENTS = [
  'rvm-action-diagnostics',
  'rvm-glb-selection-parity-diagnostics',
  'rvm-glb-acceptance-pack-diagnostics',
  'rvm-stagedjson-export',
  'rvm-stagedjson-validation',
  'rvm-primitive-fallback-diagnostics',
];

export function installRvmBottomDiagnosticsDrawerBridge() {
  injectStyles();
  const api = {
    version: CACHE_KEY,
    open: () => setCollapsed(false),
    close: () => setCollapsed(true),
    toggle: () => setCollapsed(!isCollapsed()),
    refresh: () => relocateAndSummarize(document.querySelector('[data-rvm-viewer]')),
    destroy: (root = document.querySelector('[data-rvm-viewer]')) => destroy(root),
  };
  globalThis[API_KEY] = api;

  let attempts = 0;
  const attach = () => {
    attempts += 1;
    const root = document.querySelector('[data-rvm-viewer]');
    if (root) bind(root);
    if (!root && attempts < 180) setTimeout(attach, 350);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true });
  else attach();
  return api;
}

function bind(root) {
  if (!root || root.dataset.rvmBottomDiagnosticsDrawer === CACHE_KEY) return;
  destroy(root);
  root.dataset.rvmBottomDiagnosticsDrawer = CACHE_KEY;
  ensureDrawer(root);
  relocateAndSummarize(root);
  const schedule = () => scheduleRefresh(root);
  for (const eventName of EVENTS) globalThis.addEventListener?.(eventName, schedule);
  const observer = new MutationObserver(schedule);
  observer.observe(root, { childList: true, subtree: true });
  const cleanup = () => {
    for (const eventName of EVENTS) globalThis.removeEventListener?.(eventName, schedule);
    observer.disconnect();
    if (root._rvmBottomDiagnosticsDrawerObserver === observer) delete root._rvmBottomDiagnosticsDrawerObserver;
    if (root._rvmBottomDiagnosticsDrawerCleanup === cleanup) delete root._rvmBottomDiagnosticsDrawerCleanup;
  };
  root._rvmBottomDiagnosticsDrawerObserver = observer;
  root._rvmBottomDiagnosticsDrawerCleanup = cleanup;
  root.addEventListener?.('rvm-tab-dispose', cleanup, { once: true });
  for (const delay of [250, 800, 1600, 3200, 6400]) setTimeout(schedule, delay);
}

function destroy(root) {
  try { root?._rvmBottomDiagnosticsDrawerCleanup?.(); } catch (_) {}
}

let refreshTimer = null;
function scheduleRefresh(root) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => relocateAndSummarize(root || document.querySelector('[data-rvm-viewer]')), 80);
}

function ensureDrawer(root) {
  let drawer = root.querySelector('[data-rvm-bottom-diagnostics-drawer]');
  if (drawer) {
    dockDrawer(root, drawer);
    return drawer;
  }
  drawer = document.createElement('aside');
  drawer.className = 'rvm-bottom-diagnostics-drawer';
  drawer.dataset.rvmBottomDiagnosticsDrawer = CACHE_KEY;
  drawer.dataset.rvmBottomDiagnosticsDocked = 'true';
  drawer.dataset.collapsed = String(isCollapsed());
  drawer.innerHTML = `
    <button class="rvm-bottom-diagnostics-header" type="button" aria-expanded="${String(!isCollapsed())}" data-rvm-bottom-diagnostics-toggle>
      <span class="rvm-bottom-diagnostics-caret" aria-hidden="true">▴</span>
      <strong>RVM Diagnostics</strong>
      <span class="rvm-bottom-diagnostics-summary" data-rvm-bottom-diagnostics-summary>collapsed</span>
    </button>
    <div class="rvm-bottom-diagnostics-body" data-rvm-bottom-diagnostics-body></div>`;
  drawer.addEventListener('click', (event) => {
    const toggle = event.target?.closest?.('[data-rvm-bottom-diagnostics-toggle]');
    if (!toggle) return;
    event.preventDefault(); event.stopPropagation(); setCollapsed(!isCollapsed(), root);
  });
  dockDrawer(root, drawer);
  return drawer;
}

function dockDrawer(root, drawer) {
  const statusbar = root.querySelector('.viewer-statusbar');
  drawer.dataset.rvmBottomDiagnosticsDocked = 'true';
  if (statusbar && drawer.nextSibling !== statusbar) root.insertBefore(drawer, statusbar);
  else if (!drawer.parentElement) root.appendChild(drawer);
}

function relocateAndSummarize(root) {
  if (!root) return null;
  const drawer = ensureDrawer(root);
  const body = drawer.querySelector('[data-rvm-bottom-diagnostics-body]');
  if (!body) return drawer;

  for (const spec of PANEL_SPECS) {
    const panel = root.querySelector(spec.selector);
    if (!panel || panel.closest('[data-rvm-bottom-diagnostics-body]') === body) continue;
    panel.dataset.rvmBottomDiagnosticsItem = spec.key;
    panel.dataset.rvmBottomDiagnosticsTitle = spec.title;
    panel.classList.add('rvm-bottom-diagnostics-card');
    body.appendChild(panel);
  }

  [...body.querySelectorAll('[data-rvm-bottom-diagnostics-item]')]
    .sort((a, b) => priorityOf(a) - priorityOf(b))
    .forEach((item) => body.appendChild(item));

  updateHeader(drawer, root);
  return drawer;
}

function priorityOf(node) {
  const key = node.dataset.rvmBottomDiagnosticsItem;
  return PANEL_SPECS.find((spec) => spec.key === key)?.priority || 999;
}

function updateHeader(drawer, root) {
  const summary = drawer.querySelector('[data-rvm-bottom-diagnostics-summary]');
  const button = drawer.querySelector('[data-rvm-bottom-diagnostics-toggle]');
  const collapsed = isCollapsed();
  drawer.dataset.collapsed = String(collapsed);
  button?.setAttribute('aria-expanded', String(!collapsed));
  const counts = summarizeDiagnostics(root);
  if (summary) {
    summary.innerHTML = [
      `<span>${counts.cardCount} panel${counts.cardCount === 1 ? '' : 's'}</span>`,
      `<span>errors ${counts.errors}</span>`,
      `<span>warnings ${counts.warnings}</span>`,
      counts.acceptance ? `<span>${escapeHtml(counts.acceptance)}</span>` : '',
    ].filter(Boolean).join(' · ');
  }
}

function summarizeDiagnostics(root) {
  const cardCount = root?.querySelectorAll?.('[data-rvm-bottom-diagnostics-item]')?.length || 0;
  const acceptance = globalThis.__PCF_GLB_RVM_GLB_ACCEPTANCE_PACK_DIAGNOSTICS__;
  const staged = globalThis.__PCF_GLB_RVM_STAGEDJSON_VALIDATION_DIAGNOSTICS__;
  const actions = globalThis.__PCF_GLB_RVM_ACTION_DIAGNOSTICS__;
  const errors = Number(acceptance?.errors?.length || 0) + Number(staged?.errors?.length || 0) + Number(actions?.failureCount || 0);
  const warnings = Number(acceptance?.warnings?.length || 0) + Number(staged?.warnings?.length || 0);
  const acceptanceText = acceptance ? `accept ${acceptance.accepted ? 'OK' : acceptance.mode || 'idle'}` : '';
  return { cardCount, errors, warnings, acceptance: acceptanceText };
}

function isCollapsed() {
  try { return localStorage.getItem('rvm_bottom_diagnostics_drawer_collapsed') !== 'false'; }
  catch { return true; }
}

function setCollapsed(value, root = document.querySelector('[data-rvm-viewer]')) {
  const collapsed = !!value;
  try { localStorage.setItem('rvm_bottom_diagnostics_drawer_collapsed', collapsed ? 'true' : 'false'); } catch (_) {}
  const drawer = root?.querySelector?.('[data-rvm-bottom-diagnostics-drawer]');
  if (drawer) {
    drawer.dataset.collapsed = String(collapsed);
    drawer.querySelector('[data-rvm-bottom-diagnostics-toggle]')?.setAttribute('aria-expanded', String(!collapsed));
  }
  if (!collapsed) scheduleRefresh(root);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

function injectStyles() {
  if (document.getElementById('rvm-bottom-diagnostics-drawer-style')) return;
  const style = document.createElement('style');
  style.id = 'rvm-bottom-diagnostics-drawer-style';
  style.textContent = `
    .rvm-bottom-diagnostics-drawer{position:relative;left:auto;right:auto;bottom:auto;z-index:20;flex:0 0 auto;margin:0;border-top:1px solid rgba(148,163,184,.30);border-right:0;border-bottom:0;border-left:0;border-radius:0;background:rgba(15,23,42,.94);box-shadow:0 -8px 22px rgba(0,0,0,.22);color:#e5e7eb;backdrop-filter:blur(8px);overflow:hidden}
    .rvm-bottom-diagnostics-drawer[data-rvm-bottom-diagnostics-docked="true"]{order:90;width:100%;max-height:42vh;}
    .rvm-bottom-diagnostics-header{display:flex;align-items:center;gap:10px;width:100%;min-height:34px;padding:7px 12px;border:0;background:linear-gradient(90deg,rgba(30,41,59,.95),rgba(15,23,42,.95));color:inherit;text-align:left;cursor:pointer;font-size:12px}
    .rvm-bottom-diagnostics-header strong{white-space:nowrap;color:#f8fafc}.rvm-bottom-diagnostics-caret{display:inline-block;transition:transform .15s ease;color:#93c5fd}.rvm-bottom-diagnostics-summary{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;color:#cbd5e1;font-size:11px}
    .rvm-bottom-diagnostics-body{display:grid;grid-template-columns:repeat(auto-fit,minmax(245px,1fr));gap:8px;max-height:34vh;overflow:auto;padding:8px;background:rgba(2,6,23,.52)}
    .rvm-bottom-diagnostics-drawer[data-collapsed="true"]{max-height:34px}.rvm-bottom-diagnostics-drawer[data-collapsed="true"] .rvm-bottom-diagnostics-body{display:none}.rvm-bottom-diagnostics-drawer[data-collapsed="true"] .rvm-bottom-diagnostics-caret{transform:rotate(180deg)}
    .rvm-bottom-diagnostics-card{margin:0!important;min-width:0;max-height:30vh;overflow:auto;border-radius:9px!important;background:rgba(15,23,42,.76)!important}.rvm-bottom-diagnostics-card h3,.rvm-bottom-diagnostics-card .rvm-glb-selection-parity-title{font-size:12px!important;margin-top:0!important}
    @media (max-width:760px){.rvm-bottom-diagnostics-summary span:nth-child(n+3){display:none}.rvm-bottom-diagnostics-body{grid-template-columns:1fr;max-height:48vh}.rvm-bottom-diagnostics-drawer[data-rvm-bottom-diagnostics-docked="true"]{max-height:56vh}}
  `;
  document.head.appendChild(style);
}
