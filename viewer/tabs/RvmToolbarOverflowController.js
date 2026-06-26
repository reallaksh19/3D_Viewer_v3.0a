const VERSION = '20260626-rvm-toolbar-overflow-controller-2';
const CONTROLLER_KEY = '__PCF_GLB_RVM_TOOLBAR_OVERFLOW__';
const MENU_PREFIX = 'rvm-tools-menu';
const TRACE_LIMIT = 30;

export const RVM_TOOLBAR_OVERFLOW_SELECTORS = Object.freeze({
  root: '[data-rvm-viewer]',
  overflowRoot: '[data-rvm-toolbar-more-root]',
  button: '[data-rvm-toolbar-more]',
  menu: '[data-rvm-tools-menu]',
  legacyMenu: '[data-rvm-toolbar-more-panel]',
  menuItem: '[data-rvm-tools-menu-item], .rvm-ribbon-section',
});

const states = new WeakMap();
const installedRoots = new Set();
let nextMenuId = 1;
let nextTraceSeq = 1;

export function installRvmToolbarOverflow(root, options = {}) {
  const resolvedRoot = resolveRoot(root);
  if (!resolvedRoot || typeof document === 'undefined') return null;
  const existing = states.get(resolvedRoot);
  if (existing) {
    existing.installCount += 1;
    recordTrace(existing, 'repeat-install', { reason: options.reason || 'repeat-install' });
    return syncRvmToolbarOverflow(resolvedRoot, { ...options, reason: options.reason || 'repeat-install' });
  }

  const state = {
    version: VERSION,
    root: resolvedRoot,
    open: false,
    installCount: 1,
    clickCount: 0,
    closeCount: 0,
    syncCount: 0,
    traces: [],
    lastReason: options.reason || 'install',
    onClick: null,
    onKeyDown: null,
    onPointerDown: null,
  };

  state.onClick = (event) => {
    const button = closest(event?.target, RVM_TOOLBAR_OVERFLOW_SELECTORS.button);
    if (!button || !contains(resolvedRoot, button)) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    state.clickCount += 1;
    recordTrace(state, 'button-click', { nextOpen: !state.open });
    setRvmToolbarOverflowOpen(resolvedRoot, !state.open, 'button-click');
  };

  state.onKeyDown = (event) => {
    if (event?.key !== 'Escape' || !state.open) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    recordTrace(state, 'escape-close', { key: event.key });
    setRvmToolbarOverflowOpen(resolvedRoot, false, 'escape');
    getElements(resolvedRoot).button?.focus?.();
  };

  state.onPointerDown = (event) => {
    if (!state.open) return;
    const { button, menu } = getElements(resolvedRoot);
    const target = event?.target;
    if ((button && contains(button, target)) || (menu && contains(menu, target))) return;
    recordTrace(state, 'outside-close', { targetTag: String(target?.tagName || '') });
    setRvmToolbarOverflowOpen(resolvedRoot, false, 'outside-pointerdown');
  };

  resolvedRoot.addEventListener?.('click', state.onClick, true);
  document.addEventListener?.('keydown', state.onKeyDown, true);
  document.addEventListener?.('pointerdown', state.onPointerDown, true);
  states.set(resolvedRoot, state);
  installedRoots.add(resolvedRoot);
  resolvedRoot.dataset.rvmToolbarOverflowController = VERSION;
  recordTrace(state, 'install', { reason: options.reason || 'install' });
  publishApi();
  return syncRvmToolbarOverflow(resolvedRoot, { ...options, reason: options.reason || 'install' });
}

export function disposeRvmToolbarOverflow(root) {
  const resolvedRoot = resolveRoot(root);
  const state = resolvedRoot ? states.get(resolvedRoot) : null;
  if (!resolvedRoot || !state) return false;
  recordTrace(state, 'dispose', { reason: 'dispose' });
  resolvedRoot.removeEventListener?.('click', state.onClick, true);
  document.removeEventListener?.('keydown', state.onKeyDown, true);
  document.removeEventListener?.('pointerdown', state.onPointerDown, true);
  states.delete(resolvedRoot);
  installedRoots.delete(resolvedRoot);
  delete resolvedRoot.dataset.rvmToolbarOverflowController;
  return true;
}

export function syncRvmToolbarOverflow(root, options = {}) {
  const resolvedRoot = resolveRoot(root);
  if (!resolvedRoot) return null;
  const state = states.get(resolvedRoot) || null;
  const { button, menu, rootNode } = getElements(resolvedRoot);
  if (!button || !menu) return null;

  const open = Boolean(state ? state.open : button.getAttribute?.('aria-expanded') === 'true' && !menu.hidden);
  if (!menu.id) menu.id = options.menuId || `${MENU_PREFIX}-${nextMenuId++}`;
  button.setAttribute?.('aria-haspopup', 'menu');
  button.setAttribute?.('aria-controls', menu.id);
  button.setAttribute?.('aria-expanded', String(open));
  if (String(button.tagName || '').toLowerCase() === 'button' && !button.getAttribute?.('type')) button.setAttribute?.('type', 'button');
  menu.hidden = !open;
  menu.setAttribute?.('aria-hidden', String(!open));
  menu.setAttribute?.('role', 'menu');
  rootNode?.classList?.toggle?.('is-open', open);
  if (rootNode?.dataset) rootNode.dataset.rvmToolbarOverflowOpen = String(open);
  resolvedRoot.dataset.rvmToolbarOverflowOpen = String(open);
  resolvedRoot.dataset.rvmToolbarOverflowAudit = validateRvmToolbarOverflowDom(resolvedRoot).ok ? 'ok' : 'invalid';
  if (state) {
    state.syncCount += 1;
    state.lastReason = options.reason || state.lastReason || 'sync';
    recordTrace(state, 'sync', { reason: options.reason || 'sync', open });
    state.diagnostics = buildDiagnostics(resolvedRoot, state, open, options.reason || 'sync');
    return state.diagnostics;
  }
  return buildDiagnostics(resolvedRoot, null, open, options.reason || 'sync');
}

export function setRvmToolbarOverflowOpen(root, open, reason = 'api') {
  const resolvedRoot = resolveRoot(root);
  const state = resolvedRoot ? states.get(resolvedRoot) : null;
  if (!resolvedRoot || !state) return null;
  const nextOpen = Boolean(open);
  if (state.open !== nextOpen && !nextOpen) state.closeCount += 1;
  state.open = nextOpen;
  state.lastReason = reason;
  recordTrace(state, 'set-open', { reason, open: nextOpen });
  return syncRvmToolbarOverflow(resolvedRoot, { reason });
}

export function getRvmToolbarOverflowDiagnostics(root) {
  const resolvedRoot = resolveRoot(root);
  const state = resolvedRoot ? states.get(resolvedRoot) : null;
  if (!resolvedRoot) return null;
  return state?.diagnostics || syncRvmToolbarOverflow(resolvedRoot, { reason: 'diagnostics' });
}

export function validateRvmToolbarOverflowDom(root) {
  const resolvedRoot = resolveRoot(root);
  const buttonCount = resolvedRoot?.querySelectorAll?.(RVM_TOOLBAR_OVERFLOW_SELECTORS.button)?.length || 0;
  const menuCount = resolvedRoot?.querySelectorAll?.(RVM_TOOLBAR_OVERFLOW_SELECTORS.menu)?.length || 0;
  const overflowRootCount = resolvedRoot?.querySelectorAll?.(RVM_TOOLBAR_OVERFLOW_SELECTORS.overflowRoot)?.length || 0;
  const legacyPanelCount = resolvedRoot?.querySelectorAll?.(RVM_TOOLBAR_OVERFLOW_SELECTORS.legacyMenu)?.length || 0;
  return {
    version: VERSION,
    ok: buttonCount === 1 && menuCount === 1 && overflowRootCount <= 1,
    buttonCount,
    menuCount,
    overflowRootCount,
    legacyPanelCount,
  };
}

function publishApi() {
  globalThis[CONTROLLER_KEY] = {
    version: VERSION,
    selectors: RVM_TOOLBAR_OVERFLOW_SELECTORS,
    install: installRvmToolbarOverflow,
    dispose: disposeRvmToolbarOverflow,
    sync: syncRvmToolbarOverflow,
    setOpen: setRvmToolbarOverflowOpen,
    validateDom: validateRvmToolbarOverflowDom,
    getDiagnostics: getRvmToolbarOverflowDiagnostics,
    getInstalledRootCount: () => installedRoots.size,
  };
}

function buildDiagnostics(root, state, open, reason) {
  const { button, menu } = getElements(root);
  return {
    version: VERSION,
    reason,
    open,
    installed: Boolean(state),
    installCount: state?.installCount || 0,
    clickCount: state?.clickCount || 0,
    closeCount: state?.closeCount || 0,
    syncCount: state?.syncCount || 0,
    hasButton: Boolean(button),
    hasMenu: Boolean(menu),
    buttonExpanded: button?.getAttribute?.('aria-expanded') || '',
    menuHidden: Boolean(menu?.hidden),
    menuItemCount: menu?.querySelectorAll?.(RVM_TOOLBAR_OVERFLOW_SELECTORS.menuItem)?.length || 0,
    domAudit: validateRvmToolbarOverflowDom(root),
    trace: [...(state?.traces || [])],
  };
}

function recordTrace(state, event, detail = {}) {
  const entry = { seq: nextTraceSeq++, event, reason: detail.reason || state?.lastReason || '', open: Boolean(state?.open), detail };
  state.traces.push(entry);
  if (state.traces.length > TRACE_LIMIT) state.traces.splice(0, state.traces.length - TRACE_LIMIT);
  return entry;
}

function getElements(root) {
  const rootNode = root?.querySelector?.(RVM_TOOLBAR_OVERFLOW_SELECTORS.overflowRoot) || root?.querySelector?.('.rvm-toolbar-more') || null;
  const scope = rootNode || root;
  return {
    rootNode,
    button: scope?.querySelector?.(RVM_TOOLBAR_OVERFLOW_SELECTORS.button) || null,
    menu: scope?.querySelector?.(RVM_TOOLBAR_OVERFLOW_SELECTORS.menu) || scope?.querySelector?.(RVM_TOOLBAR_OVERFLOW_SELECTORS.legacyMenu) || null,
  };
}

function resolveRoot(root) {
  if (root && typeof root.querySelector === 'function') return root;
  if (typeof document !== 'undefined') return document.querySelector?.(RVM_TOOLBAR_OVERFLOW_SELECTORS.root) || null;
  return null;
}

function closest(target, selector) {
  return target?.closest?.(selector) || null;
}

function contains(parent, child) {
  if (!parent || !child) return false;
  if (parent === child) return true;
  if (typeof parent.contains === 'function') return parent.contains(child);
  let cursor = child;
  while (cursor) {
    if (cursor === parent) return true;
    cursor = cursor.parentElement || cursor.parentNode || null;
  }
  return false;
}
