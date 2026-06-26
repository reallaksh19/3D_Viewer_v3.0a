/**
 * XML->CII(2019) unified workflow popup.
 *
 * This module owns only the popup launcher for the explicit XML->CII workflow
 * button in the Model Converters left panel.
 *
 * The popup prefers the legacy bridge's robust renderPhaseInto implementation
 * so saved mapped rows, editable preview/fill-down, weight candidates, and the
 * support mapping table stay on the same code path as the established WF2 UI.
 * The lightweight native renderer remains a visible fallback if the bridge is
 * unavailable.
 */

import { WorkflowModal } from './shared/WorkflowModal.js?v=20260624-workflow-tabs-fix-1';
import { xmlCiiWorkflowGetBridge, xmlCiiWorkflowGetSnapshot } from './xml-cii-workflow-bridge.js?v=20260624-master-tab-responsive-1';
import { xmlCiiWorkflowRequestFinalRun } from './xml-cii-workflow-runner.js?v=20260624-workflow1-workflow2-1';
import { renderXmlCiiPopupNativePhase } from './xml-cii-popup-native-panels.js?v=20260625-parsed-source-1';
import { XML_CII_WORKFLOW_PHASES, normalizeWorkflowPhaseId } from './WorkflowShell.js';
import { renderXmlCiiCustomInputPanel, bindXmlCiiCustomInputPanel } from './custom-input/custom-input-panel.js?v=20260625-parsed-source-1';

const XML_CII_WORKFLOW_POPUP_FLAG = '__xmlCiiWorkflowPopups_unified_v1';
const XML_CII_WORKFLOW_ROOT_ATTR = 'data-xml-cii-workflow-root';
const XML_CII_WORKFLOW_OVERLAY_ATTR = 'data-xml-cii-workflow-overlay';
const XML_CII_WORKFLOW_ACTIVE_PHASE_KEY = 'xmlCii2019.workflow.activePhase.v1';
const XML_CII_WORKFLOW_LEGACY_ACTIVE_PHASE_KEY = 'xmlCii2019.richWorkflow.activePhase.v1';
const XML_CII_WORKFLOW_CLICK_VERSION = '20260624-unified-wf2-1';
const XML_CII_WORKFLOW_DELEGATED_DATASET_KEY = 'xmlCiiWorkflowDelegatedPopupBound';

const XML_CII_WORKFLOW_POPUP_META = Object.freeze({
  title: 'XML->CII(2019) Workflow',
  subtitle: 'Import masters, map fields, preview enrichment, review weights, map supports, and run enriched CII conversion.',
  buttonSelector: '#model-converters-xml-cii-workflow-btn',
  legacySelectors: Object.freeze([
    '#model-converters-xml-cii-workflow1-btn',
    '#model-converters-xml-cii-workflow2-btn',
    '#model-converters-xml-cii-simple-btn',
    '#model-converters-xml-cii-rich-btn',
    '[data-xml-cii-workflow-launcher="true"]',
    '[data-xml-cii-unified-workflow-launcher="true"]',
    '[data-xml-cii-workflow1-launcher="true"]',
    '[data-xml-cii-workflow2-launcher="true"]',
    '[data-xml-cii-simple-workflow-launcher="true"]',
    '[data-xml-cii-rich-workflow-launcher="true"]',
  ]),
  boundDatasetKey: 'xmlCiiUnifiedWorkflowPopupBound',
});

function xmlCiiWorkflowBrowserReady() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function xmlCiiWorkflowReadStored(key, fallback) {
  try { return window.localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

function xmlCiiWorkflowWriteStored(key, value) {
  try { window.localStorage.setItem(key, value); } catch {}
}

function xmlCiiWorkflowRuntime() {
  if (!window[XML_CII_WORKFLOW_POPUP_FLAG]) {
    window[XML_CII_WORKFLOW_POPUP_FLAG] = { stateByRoot: new WeakMap() };
  }
  return window[XML_CII_WORKFLOW_POPUP_FLAG];
}

function xmlCiiWorkflowNormalizePhase(id) {
  return normalizeWorkflowPhaseId(id || xmlCiiWorkflowReadStored(
    XML_CII_WORKFLOW_ACTIVE_PHASE_KEY,
    xmlCiiWorkflowReadStored(XML_CII_WORKFLOW_LEGACY_ACTIVE_PHASE_KEY, 'regex'),
  ));
}

function xmlCiiWorkflowState(root) {
  const runtime = xmlCiiWorkflowRuntime();
  let state = runtime.stateByRoot.get(root);
  if (!state) {
    state = {
      appRoot: root || null,
      renderRoot: null,
      phaseId: xmlCiiWorkflowNormalizePhase(root?.dataset?.selectedPhase),
      activeMaster: 'linelist',
      previewRows: [],
      previewStatus: '',
      diagnosticsRows: [],
      diagnosticsStatus: '',
      weightRows: [],
      weightStatus: '',
      configText: null,
      configStatus: '',
      modal: null,
      mode: 'unified',
      renderRaf: 0,
    };
    runtime.stateByRoot.set(root, state);
  }
  if (!state.appRoot && root) state.appRoot = root;
  return state;
}

function xmlCiiWorkflowIsConnected(node) {
  if (!node) return false;
  if (node.isConnected === true) return true;
  try { return typeof document !== 'undefined' && document.contains(node); } catch { return false; }
}

function xmlCiiWorkflowRenderTarget(root, state) {
  if (xmlCiiWorkflowIsConnected(state?.renderRoot)) return state.renderRoot;
  return root;
}

function xmlCiiWorkflowSnapshot(root, state) {
  return xmlCiiWorkflowGetSnapshot(state?.appRoot || root);
}

function xmlCiiWorkflowSetDataset(target, state) {
  if (!target) return;
  target.dataset.selectedPhase = state.phaseId;
  target.dataset.xmlCiiWorkflowMode = state.mode || 'unified';
  target.dataset.xmlCiiActiveMaster = state.activeMaster || target.dataset.xmlCiiActiveMaster || 'linelist';
}

function xmlCiiWorkflowSetRootDataset(root, state) {
  xmlCiiWorkflowSetDataset(root, state);
  if (state?.appRoot && state.appRoot !== root) xmlCiiWorkflowSetDataset(state.appRoot, state);
}

function xmlCiiWorkflowRenderError(body, error) {
  console.warn('[XML CII Workflow] phase render failed', error);
  body.innerHTML = `<div class="model-converters-workflow-detail-note">Workflow view failed to render: ${String(error?.message || error || 'unknown error')}</div>`;
}

function xmlCiiWorkflowRenderBridgePhase(body, state) {
  if (state?.phaseId === 'custom-input') return false;
  const bridge = xmlCiiWorkflowGetBridge();
  if (!body || typeof bridge?.renderPhaseInto !== 'function') return false;
  try {
    body.dataset.xmlCiiActiveMaster = state.activeMaster || body.dataset.xmlCiiActiveMaster || 'linelist';
    body.dataset.activeMaster = body.dataset.xmlCiiActiveMaster;
    bridge.switchPhase = (phaseId) => xmlCiiWorkflowSelectPhase(state.renderRoot || body, state, phaseId);
    bridge.closePopup = () => state.modal?.close?.();
    bridge.renderPhaseInto(body, state.phaseId);
    state.activeMaster = body.dataset.xmlCiiActiveMaster || body.dataset.activeMaster || state.activeMaster || 'linelist';
    return true;
  } catch (error) {
    console.warn('[XML CII Workflow] robust bridge phase render failed, falling back to native panel', error);
    return false;
  }
}

function xmlCiiWorkflowRenderPhase(root, state) {
  if (state?.renderRaf) {
    cancelAnimationFrame(state.renderRaf);
    state.renderRaf = 0;
  }
  const renderRoot = xmlCiiWorkflowRenderTarget(root, state);
  xmlCiiWorkflowSetRootDataset(renderRoot, state);
  const body = renderRoot?.querySelector('[data-xml-cii-workflow-body]');
  if (!body) return;
  try {
    if (xmlCiiWorkflowRenderBridgePhase(body, state)) return;
    if (state.phaseId === 'custom-input') {
      body.innerHTML = renderXmlCiiCustomInputPanel();
      bindXmlCiiCustomInputPanel(body, renderRoot, state);
      return;
    }
    const data = xmlCiiWorkflowSnapshot(renderRoot, state);
    if (!data) {
      body.innerHTML = '<div class="model-converters-workflow-detail-note">XML->CII workflow bridge is not ready. Reopen the Model Converter tab and try again.</div>';
      return;
    }
    state.activeMaster = renderRoot.dataset.xmlCiiActiveMaster || state.activeMaster || 'linelist';
    body.innerHTML = renderXmlCiiPopupNativePhase(state.phaseId, data, state);
    xmlCiiWorkflowBindPhase(body, renderRoot, state);
  } catch (error) {
    xmlCiiWorkflowRenderError(body, error);
  }
}

function xmlCiiWorkflowScheduleRenderPhase(root, state, message = 'Loading workflow view...') {
  const renderRoot = xmlCiiWorkflowRenderTarget(root, state);
  xmlCiiWorkflowSetRootDataset(renderRoot, state);
  const body = renderRoot?.querySelector('[data-xml-cii-workflow-body]');
  if (body && message) {
    body.innerHTML = `<div class="model-converters-workflow-detail-note">${message}</div>`;
  }
  if (state.renderRaf) cancelAnimationFrame(state.renderRaf);
  const schedule = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (callback) => setTimeout(callback, 0);
  state.renderRaf = schedule(() => {
    state.renderRaf = 0;
    xmlCiiWorkflowRenderPhase(renderRoot, state);
  });
}

function xmlCiiWorkflowSelectPhase(root, state, phaseId) {
  const renderRoot = xmlCiiWorkflowRenderTarget(root, state);
  state.phaseId = xmlCiiWorkflowNormalizePhase(phaseId);
  xmlCiiWorkflowSetRootDataset(renderRoot, state);
  xmlCiiWorkflowWriteStored(XML_CII_WORKFLOW_ACTIVE_PHASE_KEY, state.phaseId);
  const modal = state.modal;
  if (modal?.setActiveTab) modal.setActiveTab(state.phaseId);
  xmlCiiWorkflowScheduleRenderPhase(renderRoot, state, 'Loading workflow phase...');
}

async function xmlCiiWorkflowPreloadDefaultMasters(root, state) {
  try {
    await xmlCiiWorkflowGetBridge()?.ensureDefaultMastersLoaded?.(state?.appRoot || root);
    xmlCiiWorkflowScheduleRenderPhase(root, state, 'Refreshing workflow masters...');
  } catch (error) {
    console.warn('[XML CII Workflow] default master preload failed', error);
  }
}

function xmlCiiWorkflowBindRegex(body, root, state) {
  body.querySelectorAll('[data-native-regex-path]').forEach((input) => {
    input.addEventListener('change', () => {
      xmlCiiWorkflowGetBridge()?.setPopupConfigValue?.(input.dataset.nativeRegexPath, input.value, input.type === 'number' ? 'number' : 'text');
      xmlCiiWorkflowScheduleRenderPhase(root, state, 'Updating regex configuration...');
    });
  });
}

function xmlCiiWorkflowBindMasters(body, root, state) {
  body.querySelectorAll('[data-native-master-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      root.dataset.xmlCiiActiveMaster = button.dataset.nativeMasterTab || 'linelist';
      state.activeMaster = root.dataset.xmlCiiActiveMaster;
      xmlCiiWorkflowScheduleRenderPhase(root, state, 'Switching master table...');
    });
  });
  body.querySelectorAll('[data-native-import-master]').forEach((input) => {
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      await xmlCiiWorkflowGetBridge()?.importPopupMasterFile?.(input.dataset.nativeImportMaster, file);
      xmlCiiWorkflowScheduleRenderPhase(root, state, 'Imported master. Refreshing...');
    });
  });
  body.querySelectorAll('[data-native-load-default]').forEach((button) => {
    button.addEventListener('click', async () => {
      await xmlCiiWorkflowGetBridge()?.loadPopupDefaultMaster?.(button.dataset.nativeLoadDefault);
      xmlCiiWorkflowScheduleRenderPhase(root, state, 'Loaded default master. Refreshing...');
    });
  });
  body.querySelectorAll('[data-native-auto-map]').forEach((button) => {
    button.addEventListener('click', () => {
      xmlCiiWorkflowGetBridge()?.autoMapPopupMaster?.(button.dataset.nativeAutoMap);
      xmlCiiWorkflowScheduleRenderPhase(root, state, 'Auto-mapped columns. Refreshing...');
    });
  });
  body.querySelectorAll('[data-native-save-master]').forEach((button) => {
    button.addEventListener('click', () => {
      xmlCiiWorkflowGetBridge()?.savePopupMaster?.(button.dataset.nativeSaveMaster);
      xmlCiiWorkflowScheduleRenderPhase(root, state, 'Saved master rows. Refreshing...');
    });
  });
  body.querySelectorAll('[data-native-clear-master]').forEach((button) => {
    button.addEventListener('click', () => {
      xmlCiiWorkflowGetBridge()?.clearPopupMaster?.(button.dataset.nativeClearMaster);
      xmlCiiWorkflowScheduleRenderPhase(root, state, 'Cleared master rows. Refreshing...');
    });
  });
  body.querySelectorAll('[data-native-field-map]').forEach((select) => {
    select.addEventListener('change', () => {
      xmlCiiWorkflowGetBridge()?.setPopupMasterField?.(select.dataset.nativeMasterKey, select.dataset.nativeFieldMap, select.value);
      xmlCiiWorkflowScheduleRenderPhase(root, state, 'Updated field mapping. Refreshing...');
    });
  });
}

function xmlCiiWorkflowBindPreview(body, root, state) {
  body.querySelector('[data-native-preview-parsed-source]')?.addEventListener('change', (event) => {
    const enabled = !!event.target.checked;
    xmlCiiWorkflowGetBridge()?.setPopupConfigValue?.('useParsedCustomInputSource', enabled, 'checkbox');
    xmlCiiWorkflowGetBridge()?.setPopupConfigValue?.('useParsedCustomInputSourceForPreview', enabled, 'checkbox');
    state.previewStatus = enabled ? 'Parsed Custom Input staged source enabled' : 'Sidebar staged JSON source enabled';
    xmlCiiWorkflowScheduleRenderPhase(root, state, 'Updating preview source...');
  });
  body.querySelector('[data-native-build-preview]')?.addEventListener('click', async () => {
    state.previewStatus = 'Building...';
    xmlCiiWorkflowRenderPhase(root, state);
    try {
      state.previewRows = await xmlCiiWorkflowGetBridge()?.buildPopupPreviewRows?.() || [];
      state.previewStatus = `Preview ready: ${state.previewRows.length} row(s)`;
    } catch (error) {
      state.previewStatus = `Error: ${error?.message || error}`;
    }
    xmlCiiWorkflowRenderPhase(root, state);
  });
}

function xmlCiiWorkflowBindDiagnostics(body, root, state) {
  body.querySelector('[data-native-dry-run]')?.addEventListener('click', async () => {
    state.diagnosticsStatus = 'Running...';
    xmlCiiWorkflowRenderPhase(root, state);
    try {
      state.diagnosticsRows = await xmlCiiWorkflowGetBridge()?.runPopupDiagnostics?.() || [];
      state.diagnosticsStatus = `Done: ${state.diagnosticsRows.length} row(s)`;
    } catch (error) {
      state.diagnosticsStatus = `Error: ${error?.message || error}`;
    }
    xmlCiiWorkflowRenderPhase(root, state);
  });
}

function xmlCiiWorkflowBindWeight(body, root, state) {
  body.querySelector('[data-native-compute-weights]')?.addEventListener('click', async () => {
    state.weightStatus = 'Computing...';
    xmlCiiWorkflowRenderPhase(root, state);
    try {
      state.weightRows = await xmlCiiWorkflowGetBridge()?.computePopupWeightRows?.() || [];
      state.weightStatus = `Ready: ${state.weightRows.length} row(s)`;
    } catch (error) {
      state.weightStatus = `Error: ${error?.message || error}`;
    }
    xmlCiiWorkflowRenderPhase(root, state);
  });
  body.querySelector('[data-native-apply-preferred-weights]')?.addEventListener('click', () => {
    xmlCiiWorkflowGetBridge()?.applyPopupPreferredWeights?.(state.weightRows || []);
    state.weightStatus = `Applied ${state.weightRows.length} preferred weight(s)`;
    xmlCiiWorkflowRenderPhase(root, state);
  });
  body.querySelector('[data-native-skip-weight-review]')?.addEventListener('click', () => xmlCiiWorkflowSelectPhase(root, state, 'run'));
}

function xmlCiiWorkflowBindRun(body, root, state) {
  body.querySelectorAll('[data-native-run-option]').forEach((input) => {
    input.addEventListener('change', () => {
      const value = input.type === 'checkbox' ? input.checked : input.value;
      xmlCiiWorkflowGetBridge()?.setPopupRunOption?.(input.dataset.nativeRunOption, value, input.type === 'checkbox' ? 'checkbox' : 'text');
      xmlCiiWorkflowScheduleRenderPhase(root, state, 'Updated run options. Refreshing...');
    });
  });
  body.querySelector('[data-native-review-weights]')?.addEventListener('click', () => xmlCiiWorkflowSelectPhase(root, state, 'weight-match'));
  body.querySelector('[data-native-finalise-run]')?.addEventListener('click', () => {
    xmlCiiWorkflowGetBridge()?.closePopup?.();
    xmlCiiWorkflowRequestFinalRun(state.appRoot || root, state.mode);
  });
}

function xmlCiiWorkflowBindSupport(body) {
  body.querySelector('[data-native-open-support-table]')?.addEventListener('click', () => {
    xmlCiiWorkflowGetBridge()?.renderPopupSupportTable?.(body.querySelector('[data-native-support-host]'));
  });
}

function xmlCiiWorkflowBindConfig(body, root, state) {
  const textarea = body.querySelector('[data-native-config-text]');
  body.querySelectorAll('[data-native-config-bool]').forEach((input) => {
    input.addEventListener('change', () => {
      const bools = { [input.dataset.nativeConfigBool]: input.checked };
      state.configText = xmlCiiWorkflowGetBridge()?.savePopupConfigText?.(textarea?.value || '{}', bools) || state.configText;
      state.configStatus = 'Saved';
      xmlCiiWorkflowScheduleRenderPhase(root, state, 'Saved config. Refreshing...');
    });
  });
  textarea?.addEventListener('input', () => {
    state.configText = textarea.value;
    state.configStatus = 'Unsaved changes';
  });
  body.querySelector('[data-native-save-config]')?.addEventListener('click', () => {
    try {
      const bools = {};
      body.querySelectorAll('[data-native-config-bool]').forEach((input) => { bools[input.dataset.nativeConfigBool] = input.checked; });
      state.configText = xmlCiiWorkflowGetBridge()?.savePopupConfigText?.(textarea?.value || '{}', bools) || state.configText;
      state.configStatus = 'Saved';
    } catch (error) {
      state.configStatus = `Error: ${error?.message || error}`;
    }
    xmlCiiWorkflowScheduleRenderPhase(root, state, 'Saved config. Refreshing...');
  });
  body.querySelector('[data-native-export-config]')?.addEventListener('click', () => {
    const configText = xmlCiiWorkflowGetBridge()?.exportPopupConfigText?.() || '{}';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([configText], { type: 'application/json' }));
    a.download = 'cii-enrichment-config.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  body.querySelector('[data-native-import-config]')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      xmlCiiWorkflowGetBridge()?.importPopupConfigText?.(await file.text());
      state.configText = null;
      state.configStatus = `Imported ${file.name}`;
    } catch (error) {
      state.configStatus = `Import failed: ${error?.message || error}`;
    }
    xmlCiiWorkflowScheduleRenderPhase(root, state, 'Imported config. Refreshing...');
  });
}

function xmlCiiWorkflowBindPhase(body, root, state) {
  xmlCiiWorkflowBindRegex(body, root, state);
  xmlCiiWorkflowBindMasters(body, root, state);
  if (state.phaseId === 'preview') xmlCiiWorkflowBindPreview(body, root, state);
  if (state.phaseId === 'diagnostics') xmlCiiWorkflowBindDiagnostics(body, root, state);
  if (state.phaseId === 'weight-match') xmlCiiWorkflowBindWeight(body, root, state);
  if (state.phaseId === 'run') xmlCiiWorkflowBindRun(body, root, state);
  if (state.phaseId === 'support-mapper') xmlCiiWorkflowBindSupport(body);
  if (state.phaseId === 'config') xmlCiiWorkflowBindConfig(body, root, state);
  if (state.phaseId === 'custom-input') bindXmlCiiCustomInputPanel(body, root, state);
}

function xmlCiiWorkflowCloseForeignXmlCiiWorkflowOverlays(exceptOverlay = null) {
  document.querySelectorAll('.model-converters-workflow-popup-overlay').forEach((overlay) => {
    if (overlay === exceptOverlay) return;
    const title = overlay.querySelector('.model-converters-workflow-popup-title')?.textContent || '';
    const body = overlay.textContent || '';
    const isXmlCiiWorkflow = /XML\s*[-–>]*\s*>?\s*CII\(2019\)/i.test(title) || (/XML\s*[-–>]*\s*>?\s*CII\(2019\)/i.test(body) && /Workflow/i.test(body));
    if (isXmlCiiWorkflow) overlay.remove();
  });
}

function xmlCiiWorkflowOpenPopup(container) {
  const activeBridge = xmlCiiWorkflowGetBridge();
  if (!activeBridge) return;
  const root = container?.querySelector?.('.model-converters-root') || container;
  const state = xmlCiiWorkflowState(root);
  state.appRoot = root;
  state.mode = 'unified';
  state.modal?.close?.();
  xmlCiiWorkflowCloseForeignXmlCiiWorkflowOverlays();
  const meta = XML_CII_WORKFLOW_POPUP_META;

  const modal = new WorkflowModal({
    title: meta.title,
    subtitle: meta.subtitle,
    tabs: XML_CII_WORKFLOW_PHASES,
    activeTabId: state.phaseId,
    onTabChange: (phaseId) => xmlCiiWorkflowSelectPhase(state.renderRoot || root, state, phaseId),
    onClose: () => {
      state.modal = null;
      state.renderRoot = null;
      activeBridge.closePopup = null;
      activeBridge.switchPhase = null;
    },
  });
  const body = modal.open();
  state.modal = modal;
  state.renderRoot = body;
  modal.overlayEl?.setAttribute(XML_CII_WORKFLOW_OVERLAY_ATTR, 'true');
  modal.overlayEl?.setAttribute('data-xml-cii-workflow-mode', state.mode);
  body.setAttribute(XML_CII_WORKFLOW_ROOT_ATTR, 'true');
  body.setAttribute('data-xml-cii-workflow-mode', state.mode);
  body.innerHTML = '<div data-xml-cii-workflow-body></div>';
  xmlCiiWorkflowSetRootDataset(body, state);
  activeBridge.closePopup = () => {
    state.modal?.close();
  };
  xmlCiiWorkflowRenderPhase(body, state);
  xmlCiiWorkflowPreloadDefaultMasters(body, state);
  setTimeout(() => xmlCiiWorkflowCloseForeignXmlCiiWorkflowOverlays(modal.overlayEl), 0);
}

function xmlCiiWorkflowOpenFromButtonClick(event, container) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.stopImmediatePropagation?.();
  xmlCiiWorkflowOpenPopup(container?.querySelector?.('.model-converters-root') || container);
}

function xmlCiiWorkflowIsLauncherTarget(target) {
  if (!target?.matches) return '';
  if (target.matches(XML_CII_WORKFLOW_POPUP_META.buttonSelector)) return true;
  if (XML_CII_WORKFLOW_POPUP_META.legacySelectors.some((selector) => target.matches(selector))) return true;
  return target.dataset.xmlCiiWorkflowLauncher === 'true'
    || target.dataset.xmlCiiUnifiedWorkflowLauncher === 'true'
    || target.dataset.xmlCiiWorkflow1Launcher === 'true'
    || target.dataset.xmlCiiWorkflow2Launcher === 'true'
    || target.dataset.xmlCiiSimpleWorkflowLauncher === 'true'
    || target.dataset.xmlCiiRichWorkflowLauncher === 'true';
}

function xmlCiiWorkflowBindDelegatedLauncher(container) {
  const root = container?.querySelector?.('.model-converters-root') || container;
  if (!root || root.dataset?.[XML_CII_WORKFLOW_DELEGATED_DATASET_KEY] === XML_CII_WORKFLOW_CLICK_VERSION) return;
  root.addEventListener('click', (event) => {
    const target = event.target?.closest?.([
      '[data-xml-cii-workflow-launcher="true"]',
      '[data-xml-cii-unified-workflow-launcher="true"]',
      '#model-converters-xml-cii-workflow-btn',
      '#model-converters-xml-cii-workflow1-btn',
      '#model-converters-xml-cii-workflow2-btn',
      '#model-converters-xml-cii-simple-btn',
      '#model-converters-xml-cii-rich-btn',
    ].join(', '));
    if (!target || !root.contains(target)) return;
    if (!xmlCiiWorkflowIsLauncherTarget(target)) return;
    xmlCiiWorkflowOpenFromButtonClick(event, root);
  }, { capture: true });
  root.dataset[XML_CII_WORKFLOW_DELEGATED_DATASET_KEY] = XML_CII_WORKFLOW_CLICK_VERSION;
}

function xmlCiiWorkflowBindLauncher(container) {
  const meta = XML_CII_WORKFLOW_POPUP_META;
  const button = container.querySelector?.(meta.buttonSelector)
    || meta.legacySelectors.map((selector) => container.querySelector?.(selector)).find(Boolean);
  if (!button || button.dataset[meta.boundDatasetKey] === XML_CII_WORKFLOW_CLICK_VERSION) return;
  button.addEventListener('click', (event) => xmlCiiWorkflowOpenFromButtonClick(event, container), { capture: true });
  button.dataset[meta.boundDatasetKey] = XML_CII_WORKFLOW_CLICK_VERSION;
}

export function installXmlCiiWorkflowPopup(container = document) {
  if (!xmlCiiWorkflowBrowserReady()) return;
  xmlCiiWorkflowRuntime();
  xmlCiiWorkflowBindDelegatedLauncher(container);
  xmlCiiWorkflowBindLauncher(container);
}
