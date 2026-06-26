import { loadStickyState, state, setActiveTab } from './state.js';
import { RuntimeEvents } from '../contracts/runtime-events.js';
import { emit, on } from './event-bus.js';
import { hideLoading } from './loading.js';
import { initDevDebugWindow } from '../debug/dev-debug-window.js';

// Active RVM renderer cache chain:
// viewer3d-rvm-tab-renderer.js?v=20260626-rvm-hierarchy-ui-selection-sync-1
// Previous RVM renderer cache chain: viewer3d-rvm-tab-renderer.js?v=20260625-rvm-renderer-cache-chain-1
const TAB_VISIBILITY_URL = new URL('../config/tab-visibility.json', import.meta.url).href;
const APP_ICON_URL = new URL('../assets/app-icon.svg?v=20260621-app-brand-icon-1', import.meta.url).href;
const RVM_RENDERER_PREFLIGHT_MODULES = [
  '../rvm/AvevaJsonAutoConnectOverride.js?v=20260618-inputxml-auto-connect-1',
  '../rvm/RvmFileLoadedBridge.js?v=20260618-modular-rvm-file-loaded-1',
  '../rvm/AvevaJsonVisibleFallbackPatch.js?v=20260618-staged-visible-fallback-1',
  '../rvm-viewer/RvmSupportSymbols.js?v=20260618-support-kind-authority-1',
  '../rvm-viewer/RvmSupportIndexAttributeBridge.js?v=20260620-rvm-direct-tab-1',
  '../tabs/viewer3d-rvm-file-dialog-singleton.js?v=20260618-rvm-file-dialog-singleton-1',
  '../tabs/viewer3d-rvm-uxml-import-addon.js?v=20260618-support-kind-authority-1',
];
const TAB_ID_ALIASES = new Map([
  ['viewer', 'viewer3d'], ['viewer3d', 'viewer3d'], ['rvm-viewer', 'viewer3d-rvm'], ['viewer3d-rvm', 'viewer3d-rvm'],
  ['converter', 'model-converters'], ['model-converters', 'model-converters'], ['basic-glb-pcf', 'basic-glb-pcf'],
  ['pcfx-converter', 'pcfx-converter'], ['model-exchange', 'model-exchange'], ['interchange-config', 'interchange-config'],
  ['support-mapping-config', 'support-mapping-config'], ['adapter-mapping', 'adapter-mapping'], ['rvm-json-pcf', 'rvm-json-pcf'],
  ['universal-xml', 'universal-xml'], ['xml-compare', 'xml-compare'], ['psnm-utility', 'psnm-utility'],
]);
const TAB_ICONS = new Map([
  ['viewer3d', 'cube'], ['viewer3d-rvm', 'pipe'], ['model-converters', 'convert'], ['basic-glb-pcf', 'pipe'],
  ['pcfx-converter', 'convert'], ['model-exchange', 'exchange'], ['interchange-config', 'gear'], ['support-mapping-config', 'support'],
  ['adapter-mapping', 'map'], ['rvm-json-pcf', 'convert'], ['universal-xml', 'xml'], ['xml-compare', 'compare'], ['psnm-utility', 'tool'],
]);
const TAB_ICON_SVGS = {
  cube: '<path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
  pipe: '<path d="M4 15h6a4 4 0 0 0 4-4V5"/><path d="M14 5h5"/><circle cx="4" cy="15" r="1.5"/><circle cx="19" cy="5" r="1.5"/>',
  convert: '<path d="M5 7h12l-3-3M17 17H5l3 3"/><path d="M17 7 14 10M5 17l3-3"/>',
  exchange: '<path d="M4 8h12l-3-3M20 16H8l3 3"/><path d="M16 8h4v8M8 16H4V8"/>',
  gear: '<path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  support: '<path d="M5 19h14M8 19l4-12 4 12M9.4 15h5.2"/><path d="M7 7h10"/>',
  map: '<path d="M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2V6Z"/><path d="M9 4v14M15 6v14"/>',
  xml: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13 6l-2 12"/>',
  compare: '<path d="M7 5h10M7 19h10M8 5v14M16 5v14"/><path d="M4 9h7M13 15h7"/>',
  tool: '<path d="M14.5 5.5 18 2l4 4-3.5 3.5"/><path d="M15 6 5 16l-1 4 4-1L18 9"/>',
};
let activeTabDestroy = null;
let appDestroy = null;
const tabRendererCache = new Map();

function cleanupActiveTab() {
  if (!activeTabDestroy) return;
  try { activeTabDestroy(); } catch (error) { console.warn('Tab cleanup failed', error); }
  finally { activeTabDestroy = null; }
}

function hideStartupOverlay() {
  try { hideLoading(); } catch {}
  const overlay = document.getElementById('app-loading-overlay');
  if (overlay) {
    overlay.classList.remove('is-visible');
    overlay.setAttribute('aria-hidden', 'true');
  }
}

function pickRenderer(module, exportName, tabId) {
  const renderer = module?.[exportName];
  if (typeof renderer !== 'function') throw new Error(`Tab ${tabId} did not export renderer ${exportName}`);
  return renderer;
}

async function loadPsnmUtilityRenderer() {
  await Promise.allSettled([
    import('../tabs/psnm-utility/psnm-ui-p2-enhancements.js?v=20260609-p2-1'),
    import('../tabs/psnm-utility/psnm-phase4c-hardening.js?v=20260609-phase4c-1'),
    import('../tabs/psnm-utility/psnm-phase4d-persistence.js?v=20260609-phase4d-1'),
  ]);
  return import('../tabs/psnm-utility-tab.js?v=20260613-psnm-anchor-no-blocker-1').then((module) => pickRenderer(module, 'renderPSNM_UtilityTab', 'psnm-utility'));
}

async function loadRvmViewerRenderer() {
  const results = await Promise.allSettled(RVM_RENDERER_PREFLIGHT_MODULES.map((specifier) => import(specifier)));
  results.forEach((result, index) => {
    if (result.status === 'rejected') console.warn(`[3D Viewer] optional RVM preflight module failed: ${RVM_RENDERER_PREFLIGHT_MODULES[index]}`, result.reason);
  });
  return import('../tabs/viewer3d-rvm-tab-renderer.js?v=20260626-rvm-hierarchy-ui-selection-sync-1').then((module) => pickRenderer(module, 'renderViewer3DRvm', 'viewer3d-rvm'));
}

async function loadBasicGlbPcfRenderer() {
  await import('../js/pcf2glb/ui/basicGlbPcfUiEnhancer.js?v=20260618-resizable-properties-1');
  return import('../js/pcf2glb/ui/BasicGlbPcfPanel.js?v=20260618-resizable-properties-1').then((module) => pickRenderer(module, 'renderBasicGlbPcfPanel', 'basic-glb-pcf'));
}

const TABS = [
  { id: 'viewer3d', label: '3D Viewer', load: () => import('../tabs/viewer3d-tab.js?v=20260518-statusbar-theme-12').then((module) => pickRenderer(module, 'renderViewer3D', 'viewer3d')) },
  { id: 'viewer3d-rvm', label: '3D RVM Viewer', load: loadRvmViewerRenderer },
  { id: 'model-converters', label: '3D Model Converters', load: () => import('../tabs/model-converters-tab.js?v=20260625-model-converters-finalise-run-owner-1').then((module) => pickRenderer(module, 'renderModelConvertersTab', 'model-converters')) },
  { id: 'basic-glb-pcf', label: 'Basic GLB-PCF', load: loadBasicGlbPcfRenderer },
  { id: 'pcfx-converter', label: 'PCFX Converter', load: () => import('../tabs/pcfx-converter-tab.js').then((module) => pickRenderer(module, 'renderPcfxConverterTab', 'pcfx-converter')) },
  { id: 'model-exchange', label: 'Model Exchange', load: () => import('../tabs/model-exchange-tab.js').then((module) => pickRenderer(module, 'renderModelExchangeTab', 'model-exchange')) },
  { id: 'interchange-config', label: 'Interchange Config', load: () => import('../tabs/interchange-config-tab.js').then((module) => pickRenderer(module, 'renderInterchangeConfigTab', 'interchange-config')) },
  { id: 'support-mapping-config', label: 'Support Mapping', load: () => import('../tabs/support-mapping-config-tab.js').then((module) => pickRenderer(module, 'renderSupportMappingTab', 'support-mapping-config')) },
  { id: 'adapter-mapping', label: 'Adapter Mapping', load: () => import('../tabs/adapter-mapping-tab.js').then((module) => pickRenderer(module, 'renderAdapterMappingTab', 'adapter-mapping')) },
  { id: 'rvm-json-pcf', label: 'RVM JSON→PCF', load: () => import('../tabs/rvm-json-pcf-extract-tab-workflow-wired.js').then((module) => pickRenderer(module, 'mount', 'rvm-json-pcf')) },
  { id: 'universal-xml', label: 'Universal XML', load: () => import('../tabs/universal-xml-converter-tab.js').then((module) => pickRenderer(module, 'renderUniversalXmlConverterTab', 'universal-xml')) },
  { id: 'xml-compare', label: 'XML Compare', load: () => import('../tabs/xml-compare-tab.js').then((module) => pickRenderer(module, 'renderXmlCompareTab', 'xml-compare')) },
  { id: 'psnm-utility', label: 'Utilities', load: loadPsnmUtilityRenderer },
];
const TAB_GROUPS = [
  { label: 'Viewers', ids: ['viewer3d', 'viewer3d-rvm'] },
  { label: 'Converters', ids: ['model-converters', 'basic-glb-pcf', 'pcfx-converter', 'rvm-json-pcf', 'universal-xml', 'xml-compare'] },
  { label: 'Exchange', ids: ['model-exchange', 'interchange-config', 'support-mapping-config', 'adapter-mapping'] },
  { label: 'Utilities', ids: ['psnm-utility'] },
];

function createAppShell(root) {
  root.innerHTML = '';
  const shell = document.createElement('div');
  shell.className = 'app-shell';
  const nav = document.createElement('nav');
  nav.className = 'app-nav';
  nav.setAttribute('aria-label', 'Application tabs');
  const content = document.createElement('main');
  content.className = 'app-content';
  shell.append(nav, content);
  root.appendChild(shell);
  return { nav, content };
}

async function visibleTabs() {
  try {
    const response = await fetch(TAB_VISIBILITY_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const config = await response.json();
    const hidden = new Set(Array.isArray(config?.hiddenTabs) ? config.hiddenTabs : []);
    return TABS.filter((tab) => !hidden.has(tab.id));
  } catch {
    return TABS;
  }
}

function tabGroupFor(tabId) { return TAB_GROUPS.find((group) => group.ids.includes(tabId))?.label || ''; }

function createBrandRail() {
  const brand = document.createElement('div');
  brand.className = 'app-brand-rail';
  brand.setAttribute('aria-label', 'PCF GLB RVM Viewer');
  const icon = document.createElement('img');
  icon.className = 'app-brand-icon';
  icon.src = APP_ICON_URL;
  icon.alt = '';
  icon.decoding = 'async';
  icon.loading = 'eager';
  icon.setAttribute('aria-hidden', 'true');
  const copy = document.createElement('div');
  copy.className = 'app-brand-copy';
  const title = document.createElement('div');
  title.className = 'app-brand-title';
  title.textContent = 'PCF GLB Viewer';
  const sub = document.createElement('div');
  sub.className = 'app-brand-subtitle';
  sub.textContent = 'RVM • GLB • XML Review';
  copy.append(title, sub);
  brand.append(icon, copy);
  return brand;
}

function createTabIcon(tabId) {
  const iconKey = TAB_ICONS.get(tabId) || 'cube';
  const span = document.createElement('span');
  span.className = `app-tab-icon app-tab-icon-${iconKey}`;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" focusable="false" role="img"><g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${TAB_ICON_SVGS[iconKey] || TAB_ICON_SVGS.cube}</g></svg>`;
  return span;
}

function renderNav(nav, tabs, content) {
  nav.innerHTML = '';
  nav.appendChild(createBrandRail());
  const groups = [];
  for (const tab of tabs) {
    const label = tabGroupFor(tab.id);
    let group = groups.find((entry) => entry.label === label);
    if (!group) { group = { label, tabs: [] }; groups.push(group); }
    group.tabs.push(tab);
  }
  groups.forEach((group) => {
    const section = document.createElement('section');
    section.className = 'app-nav-group';
    if (group.label) {
      const heading = document.createElement('div');
      heading.className = 'app-nav-group-label';
      heading.textContent = group.label;
      section.appendChild(heading);
    }
    group.tabs.forEach((tab) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'app-tab';
      button.dataset.tab = tab.id;
      button.dataset.group = group.label || '';
      button.appendChild(createTabIcon(tab.id));
      const label = document.createElement('span');
      label.textContent = tab.label;
      button.appendChild(label);
      button.addEventListener('click', () => setActiveTab(tab.id));
      section.appendChild(button);
    });
    nav.appendChild(section);
  });
  updateActiveTabButton(nav, state.activeTabId);
  content.setAttribute('data-active-tab', state.activeTabId || '');
}

function updateActiveTabButton(nav, tabId) {
  nav.querySelectorAll('.app-tab').forEach((btn) => btn.classList.toggle('is-active', btn.dataset.tab === tabId));
}

async function renderActiveTab(content, nav, tabs) {
  cleanupActiveTab();
  const active = tabs.find((tab) => tab.id === state.activeTabId) || tabs[0];
  if (!active) return;
  if (state.activeTabId !== active.id) state.activeTabId = active.id;
  updateActiveTabButton(nav, active.id);
  content.setAttribute('data-active-tab', active.id);
  content.innerHTML = '<div class="tab-loading">Loading…</div>';
  try {
    const renderer = await active.load();
    content.innerHTML = '';
    const maybeDestroy = renderer(content, { state, emit, on, setActiveTab });
    activeTabDestroy = typeof maybeDestroy === 'function' ? maybeDestroy : null;
    emit(RuntimeEvents.TAB_RENDERED, { id: active.id });
  } catch (error) {
    console.error(`Failed to render tab ${active.id}`, error);
    content.innerHTML = `<div class="tab-error"><h2>Could not load ${active.label}</h2><pre>${String(error?.message || error)}</pre></div>`;
  }
}

export async function init(root) {
  if (!root) throw new Error('App root is required');
  loadStickyState();
  const { nav, content } = createAppShell(root);
  const tabs = await visibleTabs();
  if (!state.activeTabId || !tabs.some((tab) => tab.id === state.activeTabId)) state.activeTabId = tabs[0]?.id || 'viewer3d';
  renderNav(nav, tabs, content);
  hideStartupOverlay();
  initDevDebugWindow();
  const off = on(RuntimeEvents.TAB_CHANGED, () => renderActiveTab(content, nav, tabs));
  appDestroy = () => { off?.(); cleanupActiveTab(); };
  await renderActiveTab(content, nav, tabs);
}

export function destroy() {
  appDestroy?.();
  appDestroy = null;
}
