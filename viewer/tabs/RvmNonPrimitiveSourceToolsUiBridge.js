import { RvmViewer3D } from '../rvm-viewer/RvmViewer3D.js?v=20260622-rvm-leaf-picking-2';
import { readNonPrimitiveAutoBendSettings, writeNonPrimitiveAutoBendSettings } from '../overlays/autobend/NonPrimitiveAutoBendSettings.js';
import { readNonPrimitiveSupportOverlaySettings, writeNonPrimitiveSupportOverlaySettings } from '../overlays/support/SupportOverlaySettings.js';
import { readSourceAxisTransformSettings, writeSourceAxisTransformSettings } from '../overlays/source-tools/SourceAxisTransform.js';
import {
  buildNonPrimitiveSourceToolsDiagnosticsSnapshot,
  sourceToolsDiagnosticsFileName,
} from '../overlays/source-tools/NonPrimitiveSourceToolsDiagnostics.js';

export const RVM_NON_PRIMITIVE_SOURCE_TOOLS_UI_SCHEMA = 'rvm-non-primitive-source-tools-ui/v7';

const PATCH_FLAG = Symbol.for('pcf-glb-rvm-non-primitive-source-tools-ui-v7');
const VIEWER_PATCH_FLAG = Symbol.for('pcf-glb-rvm-non-primitive-source-tools-ui-viewer-v7');
const STYLE_FLAG = Symbol.for('pcf-glb-rvm-non-primitive-source-tools-ui-style-v7');
const ROOT_SELECTOR = '[data-rvm-viewer]';
const PANEL_ID = 'rvm-nonprimitive-source-tools-panel';
const SOURCE_KIND_RE = /^(json|jscon|inputxml|txt|source-preview)$/i;
const PRIMITIVE_KIND_RE = /^(rvm|glb|gltf|rev)$/i;
const SUPPORT_FILTER_FAMILIES = Object.freeze(['REST', 'GUIDE', 'LINESTOP', 'LIMIT', 'LIM', 'HOLDDOWN', 'SPRING_CAN', 'UNKNOWN']);
const AUTO_TOOLS = new Set(['auto-enabled', 'auto-radius-mode', 'auto-diagnostics']);
const SUPPORT_TOOLS = new Set(['support-enabled', 'support-scale', 'support-labels', 'support-warnings', 'support-filter']);
const MAX_INLINE_WARNINGS = 3;
const MAX_DISABLED_FAMILIES = 4;
const viewerContexts = new WeakMap();

export function installRvmNonPrimitiveSourceToolsUiBridge() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;
  globalThis.__PCF_GLB_RVM_NON_PRIMITIVE_SOURCE_TOOLS_UI__ = {
    schema: RVM_NON_PRIMITIVE_SOURCE_TOOLS_UI_SCHEMA,
    sync: syncAllSourceToolsUi,
    render: renderSourceToolsUi,
    reapply: reapplyFromControls,
    reapplyAutoBendOnly: reapplyAutoBendFromControls,
    reapplySupportOverlayOnly: reapplySupportOverlayFromControls,
    clear: clearSourceToolsUi,
    snapshot: buildSourceToolsDiagnosticsSnapshot,
    copyDiagnostics: copySourceToolsDiagnostics,
    downloadDiagnostics: downloadSourceToolsDiagnostics,
  };
  installSourceToolsStyles();
  patchRvmViewerSetModelForSourceToolsUi();
  try { globalThis.addEventListener?.('rvm-model-loaded', () => syncAllSourceToolsUi()); } catch (_) {}
  queueMicrotask(syncAllSourceToolsUi);
}

function installSourceToolsStyles() {
  if (globalThis[STYLE_FLAG]) return;
  globalThis[STYLE_FLAG] = true;
  const doc = globalThis.document;
  if (!doc?.createElement) return;
  const style = doc.createElement('style');
  style.dataset.rvmNonPrimitiveSourceToolsStyle = 'v7';
  style.textContent = `
    .rvm-source-tools-panel{flex:0 0 auto;max-height:min(52vh,620px);padding:7px;border-bottom:1px solid var(--geo-border,#333);background:rgba(16,22,31,.86);overflow:auto;}
    .rvm-source-tools-grid--grouped{display:grid;grid-template-columns:1fr;gap:8px;min-width:0;}
    .rvm-source-tools-group{display:grid;grid-template-columns:minmax(0,1fr);gap:5px;padding:7px;border:1px solid rgba(116,139,171,.26);border-radius:8px;background:rgba(27,34,45,.72);min-width:0;}
    .rvm-source-tools-group-title,.rvm-source-tools-row,.rvm-source-tools-actions,.rvm-source-tools-filters{display:flex;align-items:center;gap:6px;min-width:0;}
    .rvm-source-tools-group-title{justify-content:space-between;color:#d9e7ff;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.055em;}
    .rvm-source-tools-subtitle{color:#8fa5c7;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;}
    .rvm-source-tools-row{justify-content:space-between;min-height:22px;color:#a9b9d4;font-size:11px;}
    .rvm-source-tools-row select,.rvm-source-tools-row input[type=range]{min-width:92px;max-width:130px;}
    .rvm-source-tools-axis-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;}
    .rvm-source-tools-axis-grid .rvm-source-tools-row{gap:4px;}
    .rvm-source-tools-badge{min-width:44px;padding:2px 6px;border-radius:999px;border:1px solid rgba(126,182,246,.38);color:#d9e7ff;background:rgba(74,158,255,.14);font-size:10px;text-align:center;text-transform:none;letter-spacing:0;}
    .rvm-source-tools-badge.is-warn{border-color:rgba(226,153,74,.66);color:#ffd59a;background:rgba(226,153,74,.16);}
    .rvm-source-tools-diag{color:#91a1ba;font-size:10.5px;line-height:1.35;}
    .rvm-source-tools-filters{align-items:flex-start;flex-wrap:wrap;padding-top:2px;}
    .rvm-source-tools-filters>span{flex:0 0 100%;color:#8fa5c7;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;}
    .rvm-source-tools-chip{display:inline-flex;align-items:center;gap:3px;padding:2px 5px;border:1px solid rgba(116,139,171,.28);border-radius:999px;background:rgba(22,29,39,.86);color:#b8c8e4;font-size:10px;white-space:nowrap;}
    .rvm-source-tools-actions{align-items:flex-start;flex-wrap:wrap;padding:7px;border:1px solid rgba(116,139,171,.2);border-radius:8px;background:rgba(12,17,24,.7);}
    .rvm-source-tools-actions button,.rvm-source-tools-group button{min-height:23px;padding:3px 7px;border:1px solid rgba(116,139,171,.34);border-radius:5px;background:rgba(35,44,58,.9);color:#d9e7ff;font-size:10.5px;cursor:pointer;}
    .rvm-source-tools-actions [data-source-tool-diag=diagnostics-snapshot]{flex:1 1 100%;}
    @media(max-width:1150px){.rvm-source-tools-panel{max-height:44vh}.rvm-source-tools-row,.rvm-source-tools-actions{align-items:flex-start;flex-direction:column}.rvm-source-tools-axis-grid{grid-template-columns:1fr;}}
  `;
  doc.head?.appendChild?.(style);
}

function patchRvmViewerSetModelForSourceToolsUi() {
  const proto = RvmViewer3D?.prototype;
  if (!proto || proto[VIEWER_PATCH_FLAG] || typeof proto.setModel !== 'function') return;
  const originalSetModel = proto.setModel;
  proto.setModel = function setModelWithNonPrimitiveSourceToolsUi(model, upAxis = 'Y') {
    const result = originalSetModel.call(this, model, upAxis);
    const context = contextFromModel(model, this);
    if (context.source && isNonPrimitiveKind(context.sourceKind)) viewerContexts.set(this, context);
    else {
      viewerContexts.delete(this);
      clearNonPrimitiveRuntime(this, 'primitive-or-no-source-hierarchy');
    }
    syncAllSourceToolsUi();
    return result;
  };
  proto[VIEWER_PATCH_FLAG] = true;
}

function contextFromModel(model, viewer) {
  const source = model?.userData?.__rvmNonPrimitiveAutoBendSourceHierarchy
    || model?.userData?.__rvmNonPrimitiveSourceHierarchy
    || null;
  const supportSource = model?.userData?.__rvmNonPrimitiveSourceHierarchy || source;
  const sourceKind = normalizeSourceKind(
    model?.userData?.__rvmNonPrimitiveAutoBendSourceKind
      || model?.userData?.__rvmNonPrimitiveSourceKind
      || model?.userData?.sourceKind
      || viewer?.sourceKind
      || ''
  );
  return { source, supportSource, sourceKind, fileName: model?.userData?.fileName || '' };
}

function contextForViewer(root, viewer) {
  const model = viewer?.modelGroup || viewer?.scene || null;
  const stored = viewer ? viewerContexts.get(viewer) : null;
  const fallback = contextFromModel(model, viewer || {});
  const kind = normalizeSourceKind(root?.dataset?.rvmLoadedSourceKind || stored?.sourceKind || fallback.sourceKind || '');
  return {
    source: stored?.source || fallback.source,
    supportSource: stored?.supportSource || fallback.supportSource || stored?.source || fallback.source,
    sourceKind: kind,
    fileName: stored?.fileName || fallback.fileName || '',
  };
}

export function syncAllSourceToolsUi() {
  const roots = globalThis.document?.querySelectorAll?.(ROOT_SELECTOR) || [];
  for (const root of roots) renderSourceToolsUi(root, globalThis.__3D_RVM_VIEWER__);
}

export function renderSourceToolsUi(root, viewer = globalThis.__3D_RVM_VIEWER__) {
  if (!root) return null;
  const mode = String(root.dataset?.rvmModelPrimitiveMode || '').toLowerCase();
  const kind = normalizeSourceKind(root.dataset?.rvmLoadedSourceKind || viewerContexts.get(viewer)?.sourceKind || '');
  const shouldShow = mode === 'source-preview' && isNonPrimitiveKind(kind);
  const panel = ensurePanel(root);
  if (!panel) return null;
  if (!shouldShow) return clearSourceToolsUi(panel, viewer, 'primitive-or-unsupported-source');
  panel.hidden = false;
  panel.dataset.sourceToolsActive = 'true';
  delete panel.dataset.sourceToolsCleared;
  panel.innerHTML = renderPanelHtml({ auto: readNonPrimitiveAutoBendSettings(), support: readNonPrimitiveSupportOverlaySettings(), viewer });
  bindPanel(root, panel, viewer);
  return panel;
}

function ensurePanel(root) {
  let panel = root.querySelector(`#${PANEL_ID}`);
  if (panel) return panel;
  const rightPanel = root.querySelector('.rvm-right-panel');
  if (!rightPanel) return null;
  const header = globalThis.document?.createElement?.('div');
  panel = globalThis.document?.createElement?.('div');
  if (!header || !panel) return null;
  header.className = 'rvm-panel-header';
  header.dataset.rvmNonPrimitiveSourceToolsHeader = 'true';
  header.textContent = 'Source Tools';
  panel.id = PANEL_ID;
  panel.className = 'rvm-source-tools-panel rvm-tag-list';
  panel.dataset.rvmNonPrimitiveSourceTools = 'true';
  const diagnosticsHeader = rightPanel.querySelector('[data-rvm-browser-diagnostics-header="true"]');
  if (diagnosticsHeader) {
    rightPanel.insertBefore(header, diagnosticsHeader);
    rightPanel.insertBefore(panel, diagnosticsHeader);
  } else {
    rightPanel.append(header, panel);
  }
  return panel;
}

export function clearSourceToolsUi(panel, viewer = globalThis.__3D_RVM_VIEWER__, reason = 'clear') {
  if (panel) {
    panel.hidden = true;
    panel.dataset.sourceToolsActive = 'false';
    panel.dataset.sourceToolsCleared = reason;
    panel.innerHTML = '';
  }
  clearNonPrimitiveRuntime(viewer, reason);
  if (viewer) {
    viewer.nonPrimitiveSourceToolsDiagnostics = {
      schema: RVM_NON_PRIMITIVE_SOURCE_TOOLS_UI_SCHEMA,
      status: 'cleared',
      reason,
      primitiveExcluded: true,
    };
  }
  return panel;
}

function clearNonPrimitiveRuntime(viewer, reason = 'clear') {
  if (!viewer) return { status: 'skipped', reason: 'viewer-missing' };
  const auto = globalThis.__PCF_GLB_RVM_NON_PRIMITIVE_AUTO_BEND__?.clear?.(viewer, reason) || null;
  const support = globalThis.__PCF_GLB_RVM_NON_PRIMITIVE_SUPPORT_OVERLAY__?.clear?.(viewer, reason) || null;
  return { status: 'cleared', reason, auto, support };
}

function renderPanelHtml({ auto, support, viewer }) {
  const autoDiag = viewer?.nonPrimitiveAutoBendDiagnostics || {};
  const supportDiag = viewer?.nonPrimitiveSupportOverlayDiagnostics || {};
  const axis = readSourceAxisTransformSettings();
  const supportWarningCount = Number(supportDiag.warningCount ?? supportDiag.warnings?.length ?? 0) || 0;
  const acceptedSupports = Number(supportDiag.acceptedSupports ?? supportDiag.sourceSupports ?? 0) || 0;
  const snapshot = buildSourceToolsDiagnosticsSnapshot(viewer);
  return `
    <div class="rvm-source-tools-grid rvm-source-tools-grid--grouped" data-source-tools-layout="grouped-v2" data-source-tools-schema="${escapeHtml(RVM_NON_PRIMITIVE_SOURCE_TOOLS_UI_SCHEMA)}">
      <section class="rvm-source-tools-group" data-source-tools-group="inputxml-family">
        <div class="rvm-source-tools-group-title"><span>InputXML Family</span><strong class="rvm-source-tools-badge" data-source-tool-badge="auto">${escapeHtml(autoDiag.status || 'idle')}</strong></div>
        <label class="rvm-source-tools-row"><span>Auto Bend</span><input id="rvm-inputxml-auto-bend" type="checkbox" data-source-tool="auto-enabled" ${auto.enabled ? 'checked' : ''}></label>
        <label class="rvm-source-tools-row"><span>Radius</span><select data-source-tool="auto-radius-mode"><option value="source-or-od" ${auto.radiusMode === 'source-or-od' ? 'selected' : ''}>Source / OD×${escapeHtml(auto.defaultRadiusFactor)}</option><option value="source-only" ${auto.radiusMode === 'source-only' ? 'selected' : ''}>Source only</option></select></label>
        <label class="rvm-source-tools-row"><span>Bend diagnostics</span><input type="checkbox" data-source-tool="auto-diagnostics" ${auto.showDiagnostics ? 'checked' : ''}></label>
        <div class="rvm-source-tools-diag" data-source-tool-diag="auto">Bends: ${escapeHtml(autoDiag.bendCount ?? 0)} · Trims: ${escapeHtml(autoDiag.trimCount ?? 0)}</div>
        <div class="rvm-source-tools-subtitle">Axis</div>
        <div class="rvm-source-tools-axis-grid" data-source-tools-axis-grid="true">
          ${axisSelectHtml('rvm-inputxml-vertical-axis', axis.verticalAxis || 'Y', 'Vertical')}
          ${axisSelectHtml('rvm-inputxml-north-axis', axis.northAxis || 'X', 'North')}
        </div>
        <div class="rvm-source-tools-row"><span data-rvm-inputxml-transform-status>Ready</span><button type="button" id="rvm-inputxml-apply-transform" data-source-tool-action="apply-axis">Apply</button></div>
      </section>
      <section class="rvm-source-tools-group" data-source-tools-group="support-overlay">
        <div class="rvm-source-tools-group-title"><span>Support Overlay</span><strong class="rvm-source-tools-badge ${supportWarningCount ? 'is-warn' : ''}" data-source-tool-badge="support">${escapeHtml(supportWarningCount)} warn</strong></div>
        <label class="rvm-source-tools-row"><span>Symbol</span><input id="rvm-inputxml-support-symbols" type="checkbox" data-source-tool="support-enabled" ${support.enabled ? 'checked' : ''}></label>
        <label class="rvm-source-tools-row"><span>Support scale</span><input id="rvm-inputxml-support-scale" type="range" min="0.2" max="10" step="0.1" value="${escapeHtml(support.scale)}" data-source-tool="support-scale"><strong data-source-tool-scale-value>${escapeHtml(formatScale(support.scale))}</strong></label>
        <label class="rvm-source-tools-row"><span>Label</span><input id="rvm-inputxml-support-labels" type="checkbox" data-source-tool="support-labels" ${support.labels ? 'checked' : ''}></label>
        <label class="rvm-source-tools-row"><span>Warnings only</span><input type="checkbox" data-source-tool="support-warnings" ${support.warningsOnly ? 'checked' : ''}></label>
        <div class="rvm-source-tools-filters" data-source-tool-filters="support"><span>Family filters</span>${renderSupportFamilyFilters(support.filters)}</div>
        <div class="rvm-source-tools-diag" data-source-tool-diag="support">Supports: ${escapeHtml(supportDiag.created ?? 0)}/${escapeHtml(acceptedSupports)} · Filtered: ${escapeHtml(supportDiag.filteredOut ?? 0)} · ${escapeHtml(supportDiag.status || 'idle')}</div>
        ${renderSupportFilterSummary(supportDiag)}
        ${renderSupportWarnings(supportDiag.warnings)}
      </section>
      <div class="rvm-source-tools-actions" data-source-tool-actions="diagnostics">
        <button type="button" data-source-tool-action="copy-diagnostics">Copy diagnostics JSON</button>
        <button type="button" data-source-tool-action="download-diagnostics">Download diagnostics JSON</button>
        <span class="rvm-source-tools-diag" data-source-tool-diag="diagnostics-snapshot">Snapshot: auto ${escapeHtml(snapshot.autoBend.status || 'idle')} · support ${escapeHtml(snapshot.supportOverlay.status || 'idle')}</span>
      </div>
    </div>`;
}

function axisSelectHtml(id, value, label) {
  const safe = ['X', 'Y', 'Z'].includes(String(value).toUpperCase()) ? String(value).toUpperCase() : 'Y';
  return `<label class="rvm-source-tools-row"><span>${escapeHtml(label)}</span><select id="${escapeHtml(id)}" data-source-tool="axis-select" data-source-axis="${escapeHtml(label.toLowerCase())}">${['X', 'Y', 'Z'].map((axis) => `<option value="${axis}" ${axis === safe ? 'selected' : ''}>${axis}</option>`).join('')}</select></label>`;
}

function renderSupportFamilyFilters(filters = {}) {
  return SUPPORT_FILTER_FAMILIES.map((family) => {
    const checked = filters?.[family] !== false;
    const label = family === 'SPRING_CAN' ? 'SPRING' : family;
    return `<label class="rvm-source-tools-chip" data-source-tool-family-chip="${escapeHtml(family)}"><input type="checkbox" data-source-tool="support-filter" data-source-tool-family="${escapeHtml(family)}" ${checked ? 'checked' : ''}>${escapeHtml(label)}</label>`;
  }).join('');
}

function renderSupportFilterSummary(supportDiag = {}) {
  const filtered = Number(supportDiag.filteredOut || 0) || 0;
  const duplicates = Number(supportDiag.skippedDuplicates || 0) || 0;
  const glyphs = Number(supportDiag.skippedGlyphs || 0) || 0;
  const disabled = Array.isArray(supportDiag.disabledFamilies) ? supportDiag.disabledFamilies : [];
  if (!filtered && !duplicates && !glyphs && !disabled.length) return '<div class="rvm-source-tools-diag" data-source-tool-diag="support-filter-summary">Filters: all families visible.</div>';
  const shownDisabled = disabled.slice(0, MAX_DISABLED_FAMILIES).join(', ');
  const extra = disabled.length > MAX_DISABLED_FAMILIES ? ` +${disabled.length - MAX_DISABLED_FAMILIES}` : '';
  const disabledText = disabled.length ? `Disabled: ${shownDisabled}${extra}` : 'Disabled: none';
  return `<div class="rvm-source-tools-diag" data-source-tool-diag="support-filter-summary">Filtered: ${escapeHtml(filtered)} · ${escapeHtml(disabledText)} · Skipped: ${escapeHtml(duplicates + glyphs)}</div>`;
}

function renderSupportWarnings(warnings = []) {
  const rows = Array.isArray(warnings) ? warnings.slice(0, MAX_INLINE_WARNINGS) : [];
  if (!rows.length) return '<div class="rvm-source-tools-diag" data-source-tool-diag="support-warnings">No support overlay warnings.</div>';
  const items = rows.map((warning) => {
    const id = warning.supportId || warning.nodeId || warning.family || 'support';
    const code = warning.code || warning.message || String(warning);
    return `<li>${escapeHtml(id)}: ${escapeHtml(code)}</li>`;
  }).join('');
  return `<div class="rvm-source-tools-diag" data-source-tool-diag="support-warnings"><span>Top warnings</span><ul>${items}</ul></div>`;
}

function bindPanel(root, panel, viewer) {
  if (panel.dataset.boundSourceToolsUi === 'true') return;
  panel.dataset.boundSourceToolsUi = 'true';
  const handleControl = (event) => {
    const control = event.target?.closest?.('[data-source-tool]');
    if (!control) return;
    const tool = control.dataset.sourceTool;
    if (AUTO_TOOLS.has(tool)) {
      writeAutoSetting(tool, control);
      reapplyAutoBendFromControls(root, viewer || globalThis.__3D_RVM_VIEWER__);
    } else if (SUPPORT_TOOLS.has(tool)) {
      writeSupportSetting(tool, control);
      reapplySupportOverlayFromControls(root, viewer || globalThis.__3D_RVM_VIEWER__);
    } else if (tool === 'axis-select') {
      writeAxisSetting(control);
      updateAxisStatus(panel, 'Axis pending');
    }
  };
  panel.addEventListener('change', handleControl);
  panel.addEventListener('input', handleControl);
  panel.addEventListener('click', (event) => {
    const control = event.target?.closest?.('[data-source-tool-action]');
    if (!control) return;
    const action = control.dataset.sourceToolAction;
    const activeViewer = viewer || globalThis.__3D_RVM_VIEWER__;
    if (action === 'apply-axis') {
      event.preventDefault();
      reapplyFromControls(root, activeViewer);
      updateAxisStatus(panel, 'Applied');
    } else if (action === 'copy-diagnostics') {
      copySourceToolsDiagnostics(activeViewer).catch?.(() => {});
    } else if (action === 'download-diagnostics') {
      downloadSourceToolsDiagnostics(activeViewer);
    }
  });
}

function writeAutoSetting(tool, control) {
  if (tool === 'auto-enabled') {
    writeNonPrimitiveAutoBendSettings({ enabled: !!control.checked });
    globalThis.__PCF_GLB_RVM_INPUTXML_SOURCE_TOOLS__?.persist?.('autoBendEnabled', !!control.checked);
  } else if (tool === 'auto-radius-mode') writeNonPrimitiveAutoBendSettings({ radiusMode: control.value || 'source-or-od' });
  else if (tool === 'auto-diagnostics') writeNonPrimitiveAutoBendSettings({ showDiagnostics: !!control.checked });
}

function writeSupportSetting(tool, control) {
  if (tool === 'support-enabled') {
    writeNonPrimitiveSupportOverlaySettings({ enabled: !!control.checked });
    globalThis.__PCF_GLB_RVM_INPUTXML_SOURCE_TOOLS__?.persist?.('supportSymbolsEnabled', !!control.checked);
  } else if (tool === 'support-scale') {
    writeNonPrimitiveSupportOverlaySettings({ scale: Number(control.value) || 1 });
    globalThis.__PCF_GLB_RVM_INPUTXML_SOURCE_TOOLS__?.persist?.('scaleMultiplier', Number(control.value) || 1);
  } else if (tool === 'support-labels') {
    writeNonPrimitiveSupportOverlaySettings({ labels: !!control.checked });
    globalThis.__PCF_GLB_RVM_INPUTXML_SOURCE_TOOLS__?.persist?.('labelsVisible', !!control.checked);
  } else if (tool === 'support-warnings') writeNonPrimitiveSupportOverlaySettings({ warningsOnly: !!control.checked });
  else if (tool === 'support-filter') writeNonPrimitiveSupportOverlaySettings({ filters: nextSupportFilters(control) });
}

function writeAxisSetting(control) {
  const axis = String(control.value || '').toUpperCase();
  if (!['X', 'Y', 'Z'].includes(axis)) return;
  if (control.dataset.sourceAxis === 'vertical') {
    writeSourceAxisTransformSettings({ verticalAxis: axis });
    globalThis.__PCF_GLB_RVM_INPUTXML_SOURCE_TOOLS__?.persist?.('verticalAxis', axis);
  } else if (control.dataset.sourceAxis === 'north') {
    writeSourceAxisTransformSettings({ northAxis: axis });
    globalThis.__PCF_GLB_RVM_INPUTXML_SOURCE_TOOLS__?.persist?.('northAxis', axis);
  }
}

function updateAxisStatus(panel, text) {
  const status = panel?.querySelector?.('[data-rvm-inputxml-transform-status]');
  if (status) status.textContent = text || 'Ready';
}

function nextSupportFilters(control) {
  const family = String(control.dataset?.sourceToolFamily || '').toUpperCase();
  const current = readNonPrimitiveSupportOverlaySettings().filters || {};
  if (!SUPPORT_FILTER_FAMILIES.includes(family)) return current;
  return { ...current, [family]: !!control.checked };
}

export function reapplyAutoBendFromControls(root, viewer = globalThis.__3D_RVM_VIEWER__) {
  const context = contextForViewer(root, viewer);
  if (!viewer || !context.source || !isNonPrimitiveKind(context.sourceKind)) {
    globalThis.__PCF_GLB_RVM_NON_PRIMITIVE_AUTO_BEND__?.clear?.(viewer, 'missing-nonprimitive-context');
    return { status: 'skipped', reason: 'missing-nonprimitive-context', system: 'auto-bend' };
  }
  const auto = readNonPrimitiveAutoBendSettings();
  if (auto.enabled) globalThis.__PCF_GLB_RVM_NON_PRIMITIVE_AUTO_BEND__?.applyFromSource?.({ viewer, source: context.source, sourceKind: context.sourceKind, fileName: context.fileName });
  else globalThis.__PCF_GLB_RVM_NON_PRIMITIVE_AUTO_BEND__?.clear?.(viewer, 'source-tools-disabled');
  globalThis.__PCF_GLB_RVM_INPUTXML_SOURCE_TOOLS__?.refreshAutoBendOnly?.(viewer);
  renderSourceToolsUi(root, viewer);
  return { status: 'applied', autoEnabled: auto.enabled };
}

export function reapplySupportOverlayFromControls(root, viewer = globalThis.__3D_RVM_VIEWER__) {
  const context = contextForViewer(root, viewer);
  if (!viewer || !context.supportSource || !isNonPrimitiveKind(context.sourceKind)) {
    globalThis.__PCF_GLB_RVM_NON_PRIMITIVE_SUPPORT_OVERLAY__?.clear?.(viewer, 'missing-nonprimitive-context');
    return { status: 'skipped', reason: 'missing-nonprimitive-context', system: 'support-overlay' };
  }
  const support = readNonPrimitiveSupportOverlaySettings();
  if (support.enabled) globalThis.__PCF_GLB_RVM_NON_PRIMITIVE_SUPPORT_OVERLAY__?.applyFromSource?.({ viewer, source: context.supportSource, sourceKind: context.sourceKind, fileName: context.fileName });
  else globalThis.__PCF_GLB_RVM_NON_PRIMITIVE_SUPPORT_OVERLAY__?.clear?.(viewer, 'source-tools-disabled');
  globalThis.__PCF_GLB_RVM_INPUTXML_SOURCE_TOOLS__?.refreshSupportOverlayOnly?.(viewer);
  renderSourceToolsUi(root, viewer);
  return { status: 'applied', supportEnabled: support.enabled };
}

export function reapplyFromControls(root, viewer = globalThis.__3D_RVM_VIEWER__) {
  const autoResult = reapplyAutoBendFromControls(root, viewer);
  const supportResult = reapplySupportOverlayFromControls(root, viewer);
  globalThis.__PCF_GLB_RVM_INPUTXML_SOURCE_TOOLS__?.refresh?.(viewer);
  return { status: 'applied', auto: autoResult, support: supportResult };
}

export function buildSourceToolsDiagnosticsSnapshot(viewer = globalThis.__3D_RVM_VIEWER__, context = {}) {
  return buildNonPrimitiveSourceToolsDiagnosticsSnapshot({ viewer, context, uiSchema: RVM_NON_PRIMITIVE_SOURCE_TOOLS_UI_SCHEMA, normalizeSourceKind });
}

export async function copySourceToolsDiagnostics(viewer = globalThis.__3D_RVM_VIEWER__, context = {}) {
  const text = JSON.stringify(buildSourceToolsDiagnosticsSnapshot(viewer, context), null, 2);
  if (globalThis.navigator?.clipboard?.writeText) {
    await globalThis.navigator.clipboard.writeText(text);
    return { status: 'copied', bytes: text.length };
  }
  const textarea = globalThis.document?.createElement?.('textarea');
  if (!textarea) return { status: 'unavailable', reason: 'clipboard-api-missing', bytes: text.length };
  textarea.value = text;
  textarea.setAttribute('readonly', 'readonly');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  globalThis.document.body?.appendChild?.(textarea);
  textarea.select?.();
  let copied = false;
  try { copied = !!globalThis.document.execCommand?.('copy'); } catch (_) { copied = false; }
  textarea.remove?.();
  return { status: copied ? 'copied' : 'unavailable', bytes: text.length };
}

export function downloadSourceToolsDiagnostics(viewer = globalThis.__3D_RVM_VIEWER__, context = {}) {
  const snapshot = buildSourceToolsDiagnosticsSnapshot(viewer, context);
  const text = JSON.stringify(snapshot, null, 2);
  const doc = globalThis.document;
  const BlobCtor = globalThis.Blob;
  const URLApi = globalThis.URL;
  if (!doc?.createElement || !BlobCtor || !URLApi?.createObjectURL) return { status: 'unavailable', reason: 'download-api-missing', bytes: text.length };
  const blob = new BlobCtor([text], { type: 'application/json' });
  const url = URLApi.createObjectURL(blob);
  const link = doc.createElement('a');
  link.href = url;
  link.download = sourceToolsDiagnosticsFileName(snapshot);
  link.style.display = 'none';
  doc.body?.appendChild?.(link);
  link.click?.();
  link.remove?.();
  setTimeout(() => URLApi.revokeObjectURL?.(url), 0);
  return { status: 'downloaded', fileName: link.download, bytes: text.length };
}

function isNonPrimitiveKind(value) {
  const normalized = normalizeSourceKind(value);
  return SOURCE_KIND_RE.test(normalized) && !PRIMITIVE_KIND_RE.test(normalized);
}

function normalizeSourceKind(value) {
  const kind = String(value || '').trim().toLowerCase().replace(/^\./, '');
  if (!kind || kind === 'aveva-json' || kind === 'source-preview') return 'json';
  if (kind === 'xml' || kind === 'uxml') return 'inputxml';
  return kind;
}

function formatScale(value) {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 1;
  return `${Math.round(safe * 100)}%`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
