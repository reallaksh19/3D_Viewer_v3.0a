const BRIDGE_VERSION = 'rvm-native-tessellation-diagnostics-bridge/v1';
const STYLE_ID = 'rvm-native-tessellation-diagnostics-style';
const PANEL_ID = 'rvm-native-tessellation-diagnostics';
const GLOBAL_STATE_KEY = '__PCF_GLB_RVM_NATIVE_TESSELLATION__';
const GLOBAL_DIAGNOSTICS_KEY = '__PCF_GLB_RVM_NATIVE_TESSELLATION_DIAGNOSTICS__';

export function installRvmNativeTessellationDiagnosticsBridge() {
  injectStyle();
  const attach = () => attachNativeTessellationPanel();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true });
  else attach();
  try { globalThis.addEventListener?.('rvm-native-tessellation-diagnostics', attach); } catch (_) {}
  for (const delay of [500, 1500, 3500, 6000]) setTimeout(attach, delay);
}

function attachNativeTessellationPanel() {
  const root = document.querySelector('[data-rvm-viewer]');
  const diagnosticsPanel = root?.querySelector?.('#rvm-browser-parse-diagnostics');
  if (!root || !diagnosticsPanel) return;
  let panel = root.querySelector(`#${PANEL_ID}`);
  if (!panel) {
    const header = document.createElement('div');
    header.className = 'rvm-panel-header';
    header.dataset.rvmNativeTessellationHeader = 'true';
    header.textContent = 'Native Tessellation';
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'rvm-tag-list rvm-native-tessellation-diagnostics';
    panel.dataset.bridgeVersion = BRIDGE_VERSION;
    diagnosticsPanel.insertAdjacentElement('afterend', panel);
    diagnosticsPanel.insertAdjacentElement('afterend', header);
    panel.addEventListener('click', onPanelClick);
  }
  renderPanel(panel, currentDiagnostics());
}

function onPanelClick(event) {
  const action = event.target?.closest?.('[data-rvm-native-action]')?.dataset?.rvmNativeAction;
  if (!action) return;
  const state = globalThis[GLOBAL_STATE_KEY];
  if (action === 'enable') state?.setEnabled?.(true);
  if (action === 'disable') state?.setEnabled?.(false);
  if (action === 'rerun') {
    if (state?.runNow) state.runNow();
    else {
      try { globalThis.dispatchEvent?.(new CustomEvent('rvm-native-tessellation-request')); } catch (_) {}
    }
  }
  setTimeout(attachNativeTessellationPanel, 80);
}

function currentDiagnostics() {
  const globalDiag = globalThis[GLOBAL_DIAGNOSTICS_KEY] || null;
  const state = globalThis[GLOBAL_STATE_KEY] || null;
  const viewer = globalThis.__3D_RVM_VIEWER__;
  const rootDiag = viewer?.modelGroup?.children?.[0]?.userData?.browserRvmNativeTessellation || null;
  return rootDiag || state?.lastDiagnostics || globalDiag || {
    enabled: state?.enabled !== false,
    schemaVersion: 'browser-rvm-native-tessellation/not-run-yet',
    scannedCount: 0,
    candidateCount: 0,
    upgradedCount: 0,
    alreadyNativeCount: 0,
    skippedCount: 0,
    kindCounts: {},
    upgradedKindCounts: {},
    skippedReasons: {},
  };
}

function renderPanel(panel, diagnostics = {}) {
  const enabled = diagnostics.enabled !== false;
  const upgraded = Number(diagnostics.upgradedCount || 0);
  const already = Number(diagnostics.alreadyNativeCount || 0);
  const candidates = Number(diagnostics.candidateCount || 0);
  const totalNative = upgraded + already;
  const rows = [
    ['Mode', enabled ? 'enabled' : 'disabled'],
    ['Schema', diagnostics.schemaVersion || '-'],
    ['Scanned', diagnostics.scannedCount ?? 0],
    ['Candidates', candidates],
    ['Upgraded this run', upgraded],
    ['Already native', already],
    ['Native total', totalNative],
    ['Skipped', diagnostics.skippedCount ?? 0],
    ['Kinds found', summarizeCounts(diagnostics.kindCounts)],
    ['Kinds upgraded', summarizeCounts(diagnostics.upgradedKindCounts)],
    ['Skipped reasons', summarizeCounts(diagnostics.skippedReasons)],
  ];
  panel.innerHTML = `
    <div class="rvm-native-tessellation-card">
      <div class="rvm-native-tessellation-actions">
        <button type="button" class="rvm-btn" data-rvm-native-action="enable" ${enabled ? 'disabled' : ''}>Native On</button>
        <button type="button" class="rvm-btn" data-rvm-native-action="disable" ${!enabled ? 'disabled' : ''}>Native Off</button>
        <button type="button" class="rvm-btn" data-rvm-native-action="rerun">Re-run</button>
      </div>
      ${enabled ? '' : '<div class="rvm-browser-diag-warning">Native tessellation is disabled. Reload the RVM file to compare fallback geometry only.</div>'}
      <div class="rvm-browser-diag-grid">${rows.map(([key, value]) => diagnosticRow(key, value)).join('')}</div>
    </div>`;
}

function summarizeCounts(value = {}) {
  const entries = Object.entries(value || {}).filter(([, count]) => Number(count) > 0);
  if (!entries.length) return '-';
  return entries.slice(0, 6).map(([key, count]) => `${key}:${count}`).join(', ');
}
function diagnosticRow(label, value) {
  return `<div class="rvm-browser-diag-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(value === undefined || value === null || value === '' ? '-' : String(value))}</b></div>`;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .rvm-native-tessellation-card { display: grid; gap: 8px; }
    .rvm-native-tessellation-actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .rvm-native-tessellation-actions .rvm-btn { padding: 4px 8px; font-size: 12px; }
    .rvm-native-tessellation-actions .rvm-btn[disabled] { opacity: .55; cursor: not-allowed; }
  `;
  document.head.appendChild(style);
}
