import { installRvmToolbarOverflow, syncRvmToolbarOverflow } from './RvmToolbarOverflowController.js?v=20260626-rvm-toolbar-overflow-controller-1';

const VERSION = '20260626-rvm-toolbar-compact-policy-2';
const INSTALL_FLAG = Symbol.for('pcf-glb-rvm-toolbar-compact-policy-2');
const GLOBAL_KEY = '__PCF_GLB_RVM_TOOLBAR_POLICY__';
const ROOT_SELECTOR = '[data-rvm-viewer]';
const CORE_LABELS = new Set(['Navigate', 'View']);
let scheduledReconcile = 0;
let scheduledReason = '';

export function installRvmToolbarCompactBridge() {
  if (typeof document === 'undefined') return null;
  if (globalThis[INSTALL_FLAG]) return globalThis[INSTALL_FLAG];
  injectStyles();
  const state = {
    version: VERSION,
    runs: 0,
    movedCount: 0,
    duplicateCount: 0,
    lastRunAt: '',
    reconcile: () => reconcileToolbar('api'),
    getDiagnostics: () => globalThis[GLOBAL_KEY]?.diagnostics || null,
  };
  globalThis[INSTALL_FLAG] = state;
  globalThis[GLOBAL_KEY] = state;
  scheduleToolbarReconcile('install');
  for (const delay of [80, 250, 750, 1500, 3000]) setTimeout(() => reconcileToolbar(`install-${delay}`), delay);
  try { globalThis.addEventListener?.('rvm-model-loaded', () => scheduleToolbarReconcile('model-loaded')); } catch (_) {}
  try { globalThis.addEventListener?.('rvm-action-diagnostics', () => scheduleToolbarReconcile('action-diagnostics')); } catch (_) {}
  const observer = new MutationObserver(() => scheduleToolbarReconcile('toolbar-mutation'));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  state.observer = observer;
  return state;
}

function scheduleToolbarReconcile(reason) {
  scheduledReason = scheduledReason || reason;
  if (scheduledReconcile) return;
  scheduledReconcile = setTimeout(() => {
    const nextReason = scheduledReason || 'scheduled';
    scheduledReason = '';
    scheduledReconcile = 0;
    reconcileToolbar(nextReason);
  }, 0);
}

function reconcileToolbar(reason = 'manual') {
  const state = globalThis[INSTALL_FLAG];
  const root = document.querySelector(ROOT_SELECTOR);
  const ribbon = root?.querySelector?.('.geo-top-ribbon');
  if (!state || !root || !ribbon) return null;
  const more = ensureMoreTools(ribbon);
  installRvmToolbarOverflow(root, { reason: `toolbar-${reason}` });
  const panel = more.querySelector('[data-rvm-tools-menu]');
  let moved = 0;
  let duplicates = 0;
  const seen = new Set();

  for (const section of [...ribbon.querySelectorAll(':scope > .rvm-ribbon-section')]) {
    if (section === more || section.closest('[data-rvm-tools-menu], [data-rvm-toolbar-more-panel]')) continue;
    const label = sectionLabel(section);
    const core = isCoreTopLevelSection(section, label);
    section.dataset.rvmToolbarGroupLabel = label;
    if (core) {
      section.dataset.rvmToolbarPolicy = 'core';
      seen.add(groupKey(section, label));
      continue;
    }
    const key = groupKey(section, label);
    if (seen.has(key)) {
      section.hidden = true;
      section.dataset.rvmToolbarPolicy = 'duplicate-hidden';
      section.dataset.rvmToolbarDuplicate = 'true';
      duplicates += 1;
      continue;
    }
    seen.add(key);
    section.hidden = false;
    section.dataset.rvmToolbarPolicy = 'advanced';
    section.dataset.rvmToolsMenuItem = label;
    panel.appendChild(section);
    moved += 1;
  }

  for (const section of [...panel.querySelectorAll('.rvm-ribbon-section')]) {
    const label = sectionLabel(section);
    const key = groupKey(section, label);
    section.dataset.rvmToolsMenuItem = section.dataset.rvmToolsMenuItem || label;
    if (!section.dataset.rvmToolbarGroupLabel) section.dataset.rvmToolbarGroupLabel = label;
    if (!section.dataset.rvmToolbarPolicy) section.dataset.rvmToolbarPolicy = 'advanced';
    if (seen.has(key) && section.dataset.rvmToolbarPolicy !== 'advanced') continue;
    seen.add(key);
  }

  const overflowDiagnostics = syncRvmToolbarOverflow(root, { reason: `toolbar-${reason}` });
  state.runs += 1;
  state.movedCount = Number(state.movedCount || 0) + moved;
  state.duplicateCount = Number(state.duplicateCount || 0) + duplicates;
  state.lastRunAt = new Date().toISOString();
  const diagnostics = {
    version: VERSION,
    reason,
    runs: state.runs,
    topLevelGroups: [...ribbon.querySelectorAll(':scope > .rvm-ribbon-section')].filter((el) => el !== more && !el.hidden).map(sectionLabel),
    advancedGroups: [...panel.querySelectorAll('.rvm-ribbon-section')].filter((el) => !el.hidden).map(sectionLabel),
    movedThisRun: moved,
    duplicatesThisRun: duplicates,
    totalMoved: state.movedCount,
    totalDuplicates: state.duplicateCount,
    overflow: overflowDiagnostics,
  };
  state.diagnostics = diagnostics;
  root.dataset.rvmToolbarPolicyVersion = VERSION;
  root.dataset.rvmToolbarAdvancedGroups = String(diagnostics.advancedGroups.length);
  root.dataset.rvmToolbarTopLevelGroups = String(diagnostics.topLevelGroups.length);
  return diagnostics;
}

function ensureMoreTools(ribbon) {
  let more = ribbon.querySelector(':scope > [data-rvm-toolbar-more-root]');
  const legacyDetails = ribbon.querySelector(':scope > details[data-rvm-toolbar-more]');
  if (!more) {
    more = document.createElement('div');
    more.className = 'rvm-toolbar-more rvm-ribbon-section';
    more.dataset.rvmToolbarMoreRoot = VERSION;
    more.innerHTML = '<button type="button" class="rvm-tool-btn rvm-toolbar-more-summary" data-rvm-toolbar-more aria-expanded="false"><span aria-hidden="true">⋯</span><span>More tools</span></button><div class="rvm-toolbar-more-panel" data-rvm-tools-menu data-rvm-toolbar-more-panel hidden></div>';
  }
  const panel = more.querySelector('[data-rvm-tools-menu]');
  if (legacyDetails && legacyDetails !== more) {
    const legacyPanel = legacyDetails.querySelector('[data-rvm-toolbar-more-panel]');
    for (const section of [...(legacyPanel?.querySelectorAll?.('.rvm-ribbon-section') || [])]) panel.appendChild(section);
    legacyDetails.remove();
  }
  for (const duplicate of [...ribbon.querySelectorAll(':scope > [data-rvm-toolbar-more-root]')].filter((el) => el !== more)) {
    const duplicatePanel = duplicate.querySelector('[data-rvm-tools-menu], [data-rvm-toolbar-more-panel]');
    for (const section of [...(duplicatePanel?.querySelectorAll?.('.rvm-ribbon-section') || [])]) panel.appendChild(section);
    duplicate.remove();
  }
  if (!more.parentElement) {
    const search = ribbon.querySelector('.rvm-ribbon-search');
    ribbon.insertBefore(more, search || ribbon.querySelector('.mode-chip') || null);
  }
  return more;
}

function isCoreTopLevelSection(section, label) {
  if (section.classList.contains('rvm-ribbon-load')) return true;
  if (section.dataset.rvmToolbarAlwaysTop === 'true') return true;
  if (!section.classList.contains('rvm-tool-group')) return false;
  return CORE_LABELS.has(label);
}

function sectionLabel(section) {
  const label = section?.querySelector?.('.rvm-ribbon-label')?.textContent || section?.getAttribute?.('aria-label') || section?.className || 'Tools';
  return String(label).replace(/\s+tools$/i, '').replace(/\s+/g, ' ').trim() || 'Tools';
}

function groupKey(section, label) {
  const datasetKey = section?.dataset?.rvmToolbarKey || section?.dataset?.rvmMeasureToolbar || section?.dataset?.rvmStagedjsonExport || section?.dataset?.rvmStagedjsonValidation || section?.dataset?.rvmGlbAcceptancePack || '';
  return `${label.toLowerCase()}::${String(datasetKey || section?.className || '').replace(/\s+/g, '.')}`;
}

function injectStyles() {
  if (document.getElementById('rvm-toolbar-compact-policy-style')) return;
  const style = document.createElement('style');
  style.id = 'rvm-toolbar-compact-policy-style';
  style.textContent = `
    .geo-top-ribbon{position:relative;align-items:flex-start;}
    .rvm-toolbar-more{position:relative;display:inline-flex;align-items:flex-start;z-index:60;}
    .rvm-toolbar-more > .rvm-toolbar-more-summary{list-style:none;user-select:none;}
    .rvm-toolbar-more.is-open > .rvm-toolbar-more-summary{background:var(--geo-accent,#4a9eff);color:#fff;border-color:var(--geo-accent,#4a9eff);}
    .rvm-toolbar-more-panel{position:absolute;left:0;top:calc(100% + 6px);display:grid;grid-template-columns:repeat(2,minmax(180px,max-content));gap:7px;max-width:min(760px,calc(100vw - 40px));max-height:min(60vh,520px);overflow:auto;padding:8px;border:1px solid rgba(126,190,255,.30);border-radius:10px;background:rgba(10,18,32,.98);box-shadow:0 18px 60px rgba(0,0,0,.45);}
    .rvm-toolbar-more-panel[hidden],.rvm-toolbar-more:not(.is-open) .rvm-toolbar-more-panel{display:none!important;}
    .rvm-toolbar-more-panel .rvm-ribbon-section{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:6px;padding:6px;border:1px solid rgba(148,163,184,.18);border-radius:8px;background:rgba(15,23,42,.62);}
    .rvm-toolbar-more-panel .rvm-ribbon-label{min-width:68px;color:#9ec5ff;font-size:10px;text-transform:uppercase;letter-spacing:.05em;}
    .rvm-toolbar-more-panel .rvm-ribbon-button-row,.rvm-toolbar-more-panel .rvm-stagedjson-buttons,.rvm-toolbar-more-panel .rvm-stagedjson-validation-buttons{display:flex;flex-wrap:wrap;gap:4px;}
  `;
  document.head.appendChild(style);
}
