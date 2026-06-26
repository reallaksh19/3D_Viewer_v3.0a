const INSTALL_FLAG = Symbol.for('pcf-glb-rvm-left-panel-resize-collapse-v2');
const STYLE_ID = 'rvm-left-panel-resize-collapse-style';
const VERSION = '20260624-rvm-panel-resize-1';

const PANEL_SELECTORS = [
  '[data-rvm-support-att-panel]',
  '[data-rvm-support-engine-panel]',
];

const HIERARCHY_KEYS = Object.freeze({
  width: 'rvm.hierarchy.width',
  kindWidth: 'rvm.hierarchy.kindWidth',
  countWidth: 'rvm.hierarchy.countWidth',
  actionWidth: 'rvm.hierarchy.actionWidth',
});

const PANEL_WIDTH_KEYS = Object.freeze({
  left: 'rvm.panel.leftWidth',
  right: 'rvm.panel.rightWidth',
});

export function installRvmLeftPanelResizeCollapseBridge() {
  if (typeof document === 'undefined') return null;
  if (globalThis[INSTALL_FLAG]) return globalThis[INSTALL_FLAG];
  injectStyles();
  const state = { version: VERSION, runs: 0, scan };
  globalThis[INSTALL_FLAG] = state;
  scan();
  const observer = new MutationObserver(() => scan());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  state.observer = observer;
  return state;
}

function scan() {
  const root = document.querySelector('[data-rvm-viewer]');
  const left = root?.querySelector?.('.rvm-left-panel');
  if (!root || !left) return;
  left.dataset.rvmLeftPanelResizable = 'true';
  enhanceMainPanelResizers(root);
  const tree = left.querySelector('#rvm-tree');
  if (tree) {
    tree.dataset.rvmResizablePanel = 'hierarchy';
    enhanceHierarchyWidthControls(left, tree);
    applyHierarchyWidths(left, tree);
  }
  movePanelsToLeft(root, left);
  for (const selector of PANEL_SELECTORS) {
    root.querySelectorAll(selector).forEach((panel) => enhancePanel(panel));
  }
}

function enhanceMainPanelResizers(root) {
  const body = root?.querySelector?.('.rvm-body');
  const left = root?.querySelector?.('.rvm-left-panel');
  const right = root?.querySelector?.('.rvm-right-panel');
  if (!root || !body || !left || !right) return;
  left.dataset.rvmLeftPanelResizable = 'true';
  right.dataset.rvmRightPanelResizable = 'true';
  applyStoredPanelWidth(root, 'left');
  applyStoredPanelWidth(root, 'right');
  ensurePanelResizer(root, left, 'left');
  ensurePanelResizer(root, right, 'right');
}

function ensurePanelResizer(root, panel, side) {
  if (!panel || panel.querySelector(`[data-rvm-panel-resizer="${side}"]`)) return;
  const handle = document.createElement('div');
  handle.className = `rvm-panel-resizer rvm-panel-resizer-${side}`;
  handle.dataset.rvmPanelResizer = side;
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'vertical');
  handle.setAttribute('aria-label', side === 'left' ? 'Resize hierarchy panel' : 'Resize properties panel');
  panel.appendChild(handle);
  let drag = null;
  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const body = root.querySelector('.rvm-body');
    const rect = body?.getBoundingClientRect?.();
    if (!rect?.width) return;
    drag = { pointerId: event.pointerId, side, rect };
    handle.classList.add('is-dragging');
    handle.setPointerCapture?.(event.pointerId);
    document.body.style.cursor = 'col-resize';
    event.preventDefault();
  });
  handle.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const width = panelWidthFromPointer(drag.side, drag.rect, event.clientX);
    setPanelWidth(root, drag.side, `${width}px`);
  });
  handle.addEventListener('pointerup', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag = null;
    handle.classList.remove('is-dragging');
    document.body.style.cursor = '';
  });
  handle.addEventListener('pointercancel', () => {
    drag = null;
    handle.classList.remove('is-dragging');
    document.body.style.cursor = '';
  });
}

function panelWidthFromPointer(side, rect, clientX) {
  const raw = side === 'left' ? clientX - rect.left : rect.right - clientX;
  const min = side === 'left' ? 180 : 210;
  const max = side === 'left' ? 560 : 760;
  return Math.max(min, Math.min(max, Math.round(raw)));
}

function applyStoredPanelWidth(root, side) {
  const key = PANEL_WIDTH_KEYS[side];
  if (!key) return;
  const value = readCssSize(key, side === 'left' ? '260px' : '300px');
  setPanelWidth(root, side, value);
}

function setPanelWidth(root, side, value) {
  const variable = side === 'left' ? '--rvm-left-w' : '--rvm-right-w';
  const contractVariable = side === 'left' ? '--rvm-left-panel-width' : '--rvm-right-panel-width';
  const body = root?.querySelector?.('.rvm-body');
  root?.style?.setProperty(variable, value);
  root?.style?.setProperty(contractVariable, value);
  body?.style?.setProperty(variable, value);
  body?.style?.setProperty(contractVariable, value);
  try { localStorage.setItem(PANEL_WIDTH_KEYS[side], value); } catch (_) {}
  try { window.dispatchEvent(new Event('resize')); } catch (_) {}
  try { globalThis.__3D_RVM_VIEWER__?.onWindowResize?.(); } catch (_) {}
  try { globalThis.__3D_RVM_VIEWER__?.resize?.(); } catch (_) {}
}

function movePanelsToLeft(root, left) {
  for (const selector of PANEL_SELECTORS) {
    const panel = root.querySelector(selector);
    if (panel && panel.parentElement !== left) left.appendChild(panel);
  }
}

function enhanceHierarchyWidthControls(left, tree) {
  if (!left || !tree || left.querySelector('[data-rvm-hierarchy-width-controls]')) return;
  const controls = document.createElement('div');
  controls.className = 'rvm-hierarchy-width-controls';
  controls.dataset.rvmHierarchyWidthControls = 'true';
  controls.innerHTML = `
    <label title="Hierarchy tree width"><span>Tree W</span><input type="range" min="220" max="680" step="10" data-rvm-hierarchy-width-field="width"></label>
    <label title="Kind badge column width"><span>Kind</span><input type="range" min="26" max="96" step="2" data-rvm-hierarchy-width-field="kindWidth"></label>
    <label title="Count column width"><span>Count</span><input type="range" min="32" max="96" step="2" data-rvm-hierarchy-width-field="countWidth"></label>
    <label title="On/Off action column width"><span>Act</span><input type="range" min="28" max="84" step="2" data-rvm-hierarchy-width-field="actionWidth"></label>
  `;
  left.insertBefore(controls, tree);
  syncHierarchyControlValues(controls);
  controls.addEventListener('input', (event) => {
    const input = event.target?.closest?.('[data-rvm-hierarchy-width-field]');
    if (!input) return;
    const field = input.dataset.rvmHierarchyWidthField;
    const key = HIERARCHY_KEYS[field];
    if (!key) return;
    const unit = field === 'width' ? 'px' : 'px';
    const value = `${Math.round(Number(input.value) || fallbackValue(field))}${unit}`;
    try { localStorage.setItem(key, value); } catch (_) {}
    applyHierarchyWidths(left, tree);
  });
}

function syncHierarchyControlValues(controls) {
  controls?.querySelectorAll?.('[data-rvm-hierarchy-width-field]').forEach((input) => {
    const field = input.dataset.rvmHierarchyWidthField;
    const key = HIERARCHY_KEYS[field];
    const value = readCssSize(key, `${fallbackValue(field)}px`);
    input.value = String(parseInt(value, 10) || fallbackValue(field));
  });
}

function applyHierarchyWidths(left, tree) {
  if (!left || !tree) return;
  const width = readCssSize(HIERARCHY_KEYS.width, '320px');
  const kindWidth = readCssSize(HIERARCHY_KEYS.kindWidth, '42px');
  const countWidth = readCssSize(HIERARCHY_KEYS.countWidth, '54px');
  const actionWidth = readCssSize(HIERARCHY_KEYS.actionWidth, '40px');
  tree.style.setProperty('--rvm-hierarchy-w', width);
  tree.style.setProperty('--rvm-tree-kind-w', kindWidth);
  tree.style.setProperty('--rvm-tree-count-w', countWidth);
  tree.style.setProperty('--rvm-tree-action-w', actionWidth);
}

function readCssSize(key, fallback) {
  try {
    const raw = String(localStorage.getItem(key) || '').trim();
    if (/^\d+(?:\.\d+)?px$/.test(raw)) return raw;
  } catch (_) {}
  return fallback;
}

function fallbackValue(field) {
  if (field === 'width') return 320;
  if (field === 'kindWidth') return 42;
  if (field === 'countWidth') return 54;
  if (field === 'actionWidth') return 40;
  return 40;
}

function enhancePanel(panel) {
  if (!panel || panel.dataset.rvmResizeCollapseEnhanced === VERSION) return;
  panel.dataset.rvmResizeCollapseEnhanced = VERSION;
  panel.classList.add('rvm-left-collapsible-panel');
  const title = panel.querySelector('h3') || firstHeading(panel);
  if (!title) return;
  title.classList.add('rvm-left-collapsible-title');
  if (!title.querySelector('[data-rvm-left-panel-collapse]')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rvm-left-panel-collapse-btn';
    button.dataset.rvmLeftPanelCollapse = 'true';
    button.setAttribute('aria-label', `Toggle ${title.textContent || 'panel'}`);
    button.textContent = '▸';
    title.insertBefore(button, title.firstChild);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setCollapsed(panel, panel.dataset.rvmCollapsed !== 'true');
    });
  }
  setCollapsed(panel, true);
}

function firstHeading(panel) {
  for (const child of [...panel.children]) {
    if (/^H[1-6]$/i.test(child.tagName)) return child;
  }
  return null;
}

function setCollapsed(panel, collapsed) {
  panel.dataset.rvmCollapsed = collapsed ? 'true' : 'false';
  panel.classList.toggle('is-collapsed', collapsed);
  const btn = panel.querySelector('[data-rvm-left-panel-collapse]');
  if (btn) btn.textContent = collapsed ? '▸' : '▾';
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .rvm-tab-root{--rvm-left-panel-width:var(--rvm-left-w,260px);--rvm-right-panel-width:var(--rvm-right-w,300px);}
    .rvm-body{min-width:0;}
    .rvm-left-panel[data-rvm-left-panel-resizable="true"]{position:relative;overflow:auto;gap:6px;padding-bottom:8px;width:var(--rvm-left-panel-width,var(--rvm-left-w,260px))!important;min-width:180px;max-width:min(560px,calc(100% - 420px));flex:0 0 var(--rvm-left-panel-width,var(--rvm-left-w,260px))!important;}
    .rvm-right-panel[data-rvm-right-panel-resizable="true"]{position:relative;width:var(--rvm-right-panel-width,var(--rvm-right-w,300px))!important;min-width:210px;max-width:min(760px,calc(100% - 420px));flex:0 0 var(--rvm-right-panel-width,var(--rvm-right-w,300px))!important;}
    .rvm-viewport{min-width:240px;}
    .rvm-hierarchy-width-controls{flex:0 0 auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;margin:4px 5px 2px;padding:5px;border:1px solid rgba(126,190,255,.20);border-radius:8px;background:rgba(15,23,42,.62);}
    .rvm-hierarchy-width-controls label{display:flex;align-items:center;gap:4px;min-width:0;color:#a9c3e8;font:600 9px/1.1 system-ui,sans-serif;}
    .rvm-hierarchy-width-controls span{min-width:34px;white-space:nowrap;}
    .rvm-hierarchy-width-controls input{min-width:0;width:100%;}
    .rvm-left-panel[data-rvm-left-panel-resizable="true"] #rvm-tree[data-rvm-resizable-panel="hierarchy"]{flex:0 0 auto;min-width:220px;width:min(100%,var(--rvm-hierarchy-w,320px));min-height:120px;height:clamp(150px,34vh,420px);max-height:70vh;resize:both;overflow:auto;border-bottom:1px solid rgba(126,190,255,.22);}
    .rvm-left-panel[data-rvm-left-panel-resizable="true"] #rvm-tree .rvm-navis-row{grid-template-columns:16px minmax(0,1fr) var(--rvm-tree-action-w,40px) var(--rvm-tree-action-w,40px);}
    .rvm-left-panel[data-rvm-left-panel-resizable="true"] #rvm-tree .rvm-navis-select{grid-template-columns:auto var(--rvm-tree-kind-w,42px) minmax(72px,1fr) var(--rvm-tree-count-w,54px);}
    .rvm-left-collapsible-panel{flex:0 0 auto;min-height:34px;max-height:60vh;resize:vertical;overflow:auto;margin:6px 6px 0;border:1px solid rgba(96,165,250,.28);border-radius:10px;background:rgba(15,23,42,.70);}
    .rvm-left-collapsible-panel.is-collapsed{height:auto!important;min-height:32px;max-height:36px;resize:none;overflow:hidden;}
    .rvm-left-collapsible-panel.is-collapsed > :not(.rvm-left-collapsible-title):not(h3){display:none!important;}
    .rvm-left-collapsible-title{display:flex!important;align-items:center;gap:6px;margin:0!important;padding:8px 9px!important;cursor:default;}
    .rvm-left-panel-collapse-btn{width:20px;height:20px;display:inline-grid;place-items:center;border:1px solid rgba(126,190,255,.35);border-radius:5px;background:#101a2b;color:#dbeafe;cursor:pointer;font-size:11px;padding:0;}
    .rvm-left-panel-collapse-btn:hover{background:#1d3150;border-color:#60a5fa;}
    .rvm-panel-resizer{position:absolute;top:0;bottom:0;width:8px;z-index:35;cursor:col-resize;background:linear-gradient(90deg,transparent,rgba(78,140,214,.24),transparent);opacity:.42;touch-action:none;}
    .rvm-panel-resizer:hover,.rvm-panel-resizer.is-dragging{opacity:1;background:rgba(74,158,255,.34);}
    .rvm-panel-resizer-left{right:-4px;}
    .rvm-panel-resizer-right{left:-4px;}
  `;
  document.head.appendChild(style);
}
