import { collectRvmModelHealth } from './RvmModelHealthBridge.js?v=20260621-rvm-health-issues-1';

const INSTALL_FLAG = Symbol.for('pcf-glb-rvm-model-health-issues-bridge-v1');
const BRIDGE_VERSION = '20260621-rvm-health-issues-1';
const FALLBACK_RATIO_WARN = 0.25;
const FALLBACK_ABSOLUTE_WARN = 500;
const WIREFRAME_WARN = 250;

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function rootEl() {
  return typeof document === 'undefined' ? null : document.querySelector('[data-rvm-viewer]');
}

function viewer() {
  return globalThis.__3D_RVM_VIEWER__ || null;
}

function pct(part, total) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function pushIssue(issues, severity, code, title, detail, actionId = null, actionLabel = null) {
  issues.push({ severity, code, title, detail, actionId, actionLabel });
}

function lodRiskRows(summary) {
  return (summary?.lodCounts || []).filter((row) => {
    const name = String(row?.name || '').toLowerCase();
    return name && name !== 'normal' && Number(row?.count || 0) > 0;
  });
}

export function collectRvmHealthIssues(summary = collectRvmModelHealth()) {
  const issues = [];
  const rendered = Number(summary?.renderedObjects || 0);
  const visible = Number(summary?.visibleObjects || 0);
  const hidden = Number(summary?.hiddenObjects || 0);
  const fallback = Number(summary?.fallbackObjects || 0);
  const wireframe = Number(summary?.wireframePlaceholders || 0);
  const blocked = Number(summary?.blockedSlabPromotions || 0);
  const nativeFacets = Number(summary?.nativeFacetObjects || 0);
  const fallbackPercent = pct(fallback, rendered);

  if (!rendered) {
    pushIssue(issues, 'info', 'NO_MODEL', 'No rendered RVM model', 'Load an RVM file before running health issues.', 'open-health', 'Open Health');
  }

  if (summary?.capped) {
    pushIssue(issues, 'warn', 'SCAN_CAPPED', 'Health scan capped', `Scanned ${Number(summary.scanned || 0).toLocaleString()} object(s); full model may contain additional issues.`, 'open-health', 'Open Health');
  }

  if (rendered && fallback > Math.max(FALLBACK_ABSOLUTE_WARN, rendered * FALLBACK_RATIO_WARN)) {
    pushIssue(issues, 'warn', 'HIGH_FALLBACK_RATIO', 'High fallback geometry ratio', `${fallback.toLocaleString()} fallback object(s), about ${fallbackPercent}% of rendered geometry. Native tessellation or source decode should be reviewed.`, 'open-health', 'Open Health');
  } else if (fallback > 0) {
    pushIssue(issues, 'info', 'FALLBACK_PRESENT', 'Fallback geometry present', `${fallback.toLocaleString()} diagnostic fallback object(s) are present. These should remain wireframe/diagnostic, not solid model geometry.`, 'open-health', 'Open Health');
  }

  if (wireframe > WIREFRAME_WARN) {
    pushIssue(issues, 'warn', 'MANY_WIREFRAME_PLACEHOLDERS', 'Many wireframe placeholders', `${wireframe.toLocaleString()} bbox placeholders are wireframe diagnostics. Consider zone filtering or native decode improvements.`, 'open-health', 'Open Health');
  }

  if (blocked > 0) {
    pushIssue(issues, 'info', 'SLAB_PROMOTION_BLOCKED', 'BBox slab promotion blocked', `${blocked.toLocaleString()} bbox placeholder(s) were prevented from becoming solid slabs.`, 'open-health', 'Open Health');
  }

  if (rendered && nativeFacets === 0 && fallback > 0) {
    pushIssue(issues, 'warn', 'NO_NATIVE_FACETS', 'No native facets detected', 'The model is still relying on fallback geometry for non-primitive objects. Verify code-11 facet decode path for this RVM.', 'open-health', 'Open Health');
  }

  if (summary?.labelRisk === 'high') {
    pushIssue(issues, 'warn', 'LABEL_RISK_HIGH', 'Label risk is high', `${visible.toLocaleString()} visible object(s). Keep labels off, then enable labels only after selecting a hierarchy branch.`, 'labels-off', 'Labels Off');
  } else if (summary?.labelRisk === 'medium') {
    pushIssue(issues, 'info', 'LABEL_RISK_MEDIUM', 'Label risk is medium', `${visible.toLocaleString()} visible object(s). Prefer scoped labels on a selected branch.`, 'labels-off', 'Labels Off');
  }

  if (summary?.pcfReadiness === 'not-ready') {
    pushIssue(issues, 'warn', 'PCF_NOT_READY', 'PCF extraction not ready', 'No bundle index or synthetic rendered index is available for this model yet.', 'open-health', 'Open Health');
  }

  if (hidden > 0 && hidden >= visible && rendered > 0) {
    pushIssue(issues, 'warn', 'MOSTLY_HIDDEN', 'Most geometry is hidden', `${hidden.toLocaleString()} hidden object(s) versus ${visible.toLocaleString()} visible object(s).`, 'show-all', 'Show All');
  } else if (hidden > 0) {
    pushIssue(issues, 'info', 'HIDDEN_OBJECTS', 'Some geometry is hidden', `${hidden.toLocaleString()} object(s) are hidden by visibility, isolate, zone, or LOD controls.`, 'show-all', 'Show All');
  }

  const lodRows = lodRiskRows(summary);
  if (lodRows.length) {
    const label = lodRows.map((row) => `${row.name}:${row.count}`).join(', ');
    pushIssue(issues, 'info', 'LOD_OVERRIDES_ACTIVE', 'LOD/zone overrides active', `Active LOD states: ${label}. Use hierarchy context menu or saved views to manage detail levels.`, 'open-health', 'Open Health');
  }

  if (!issues.length) {
    pushIssue(issues, 'ok', 'NO_ACTION_REQUIRED', 'No health issues detected', 'Rendered-object health is within current browser guardrails.', 'open-health', 'Open Health');
  }

  const issueCounts = issues.reduce((acc, issue) => {
    acc[issue.severity] = (acc[issue.severity] || 0) + 1;
    return acc;
  }, {});

  return Object.freeze({
    schema: 'rvm-model-health-issues/v1',
    version: BRIDGE_VERSION,
    generatedAt: new Date().toISOString(),
    summary,
    issues: Object.freeze(issues),
    issueCounts: Object.freeze(issueCounts),
  });
}

function setStatus(text, warning = false) {
  const el = rootEl()?.querySelector?.('#rvm-sb-msg');
  if (!el) return;
  el.textContent = text;
  el.style.color = warning ? '#ffcf70' : '';
}

function issueBadge(issue) {
  return `<span class="rvm-health-issue-badge is-${esc(issue.severity)}">${esc(issue.severity)}</span>`;
}

function renderIssueList(report) {
  return report.issues.map((issue) => `
    <article class="rvm-health-issue-row is-${esc(issue.severity)}" data-rvm-health-issue-code="${esc(issue.code)}">
      <div>${issueBadge(issue)}<b>${esc(issue.title)}</b><small>${esc(issue.code)}</small></div>
      <p>${esc(issue.detail)}</p>
      ${issue.actionId ? `<button type="button" data-rvm-health-issue-action="${esc(issue.actionId)}">${esc(issue.actionLabel || issue.actionId)}</button>` : ''}
    </article>`).join('');
}

function renderIssues(report = collectRvmHealthIssues()) {
  const dialog = ensureDialog();
  const body = dialog.querySelector('[data-rvm-health-issues-body]');
  const counts = report.issueCounts || {};
  if (body) {
    body.innerHTML = `
      <div class="rvm-health-issue-summary">
        <span><b>${Number(counts.warn || 0).toLocaleString()}</b> warning(s)</span>
        <span><b>${Number(counts.info || 0).toLocaleString()}</b> info</span>
        <span><b>${Number(counts.ok || 0).toLocaleString()}</b> ok</span>
        <span><b>${Number(report.summary?.renderedObjects || 0).toLocaleString()}</b> rendered</span>
      </div>
      <div class="rvm-health-issue-list">${renderIssueList(report)}</div>`;
  }
  const toolbarSummary = rootEl()?.querySelector?.('[data-rvm-health-issues-summary]');
  if (toolbarSummary) toolbarSummary.textContent = `Issues: ${Number(counts.warn || 0)} warn · ${Number(counts.info || 0)} info`;
  setStatus(`Health issues: ${Number(counts.warn || 0)} warning(s), ${Number(counts.info || 0)} info.`, Number(counts.warn || 0) > 0);
  return report;
}

function openDialog() {
  const dialog = ensureDialog();
  dialog.classList.add('is-open');
  dialog.setAttribute('aria-hidden', 'false');
  renderIssues();
}

function closeDialog() {
  const dialog = document.getElementById('rvm-model-health-issues-dialog');
  if (!dialog) return;
  dialog.classList.remove('is-open');
  dialog.setAttribute('aria-hidden', 'true');
}

async function copyIssues(report = collectRvmHealthIssues()) {
  const lines = [
    `RVM health issues ${report.summary?.fileKey || ''}`,
    `Rendered=${report.summary?.renderedObjects || 0} Visible=${report.summary?.visibleObjects || 0} Hidden=${report.summary?.hiddenObjects || 0}`,
    ...report.issues.map((issue) => `${issue.severity.toUpperCase()} ${issue.code}: ${issue.title} - ${issue.detail}`),
  ];
  try {
    await navigator.clipboard?.writeText?.(lines.join('\n'));
    setStatus('Health issues: copied to clipboard.');
  } catch (_) {
    setStatus('Health issues: clipboard unavailable.', true);
  }
  return report;
}

function labelsOff() {
  const v = viewer();
  try { v?.setSupportSymbolLabelsVisible?.(false); } catch (_) {}
  try { v?.setRvmLabelLayerVisible?.(false); } catch (_) {}
  rootEl()?.querySelectorAll?.('#rvm-support-labels').forEach((button) => {
    button.setAttribute('aria-pressed', 'false');
    button.textContent = 'Labels Off';
    button.classList.remove('is-active');
  });
  v?.requestRvmRender?.();
  setStatus('Health issues: labels switched off.');
}

function runAction(actionId) {
  if (actionId === 'show-all') {
    const ok = globalThis.__PCF_GLB_RVM_VISIBILITY__?.showAll?.();
    setTimeout(() => renderIssues(), 80);
    if (!ok) setStatus('Health issues: Show All action unavailable.', true);
    return;
  }
  if (actionId === 'labels-off') {
    labelsOff();
    setTimeout(() => renderIssues(), 80);
    return;
  }
  if (actionId === 'open-health') {
    globalThis.__PCF_GLB_RVM_MODEL_HEALTH__?.open?.();
    return;
  }
  if (actionId === 'refresh') {
    renderIssues();
    return;
  }
  if (actionId === 'copy') copyIssues();
}

function bindDialog(dialog) {
  dialog.addEventListener('click', (event) => {
    const close = event.target?.closest?.('[data-rvm-health-issues-close]');
    if (close) { closeDialog(); return; }
    const refresh = event.target?.closest?.('[data-rvm-health-issues-refresh]');
    if (refresh) { renderIssues(); return; }
    const copy = event.target?.closest?.('[data-rvm-health-issues-copy]');
    if (copy) { copyIssues(); return; }
    const action = event.target?.closest?.('[data-rvm-health-issue-action]');
    if (action) runAction(action.dataset.rvmHealthIssueAction);
  }, true);
}

function ensureDialog() {
  let dialog = document.getElementById('rvm-model-health-issues-dialog');
  if (dialog) return dialog;
  dialog = document.createElement('div');
  dialog.id = 'rvm-model-health-issues-dialog';
  dialog.className = 'rvm-model-health-issues-dialog';
  dialog.setAttribute('aria-hidden', 'true');
  dialog.innerHTML = `
    <div class="rvm-model-health-issues-card" role="dialog" aria-modal="false" aria-label="RVM health issues">
      <div class="rvm-model-health-issues-head">
        <div><b>RVM Health Issues</b><small>${esc(BRIDGE_VERSION)}</small></div>
        <button type="button" data-rvm-health-issues-close="true" aria-label="Close health issues">×</button>
      </div>
      <div data-rvm-health-issues-body class="rvm-model-health-issues-body">Click refresh to classify model health issues.</div>
      <div class="rvm-model-health-issues-actions">
        <button type="button" data-rvm-health-issues-refresh="true">Refresh</button>
        <button type="button" data-rvm-health-issues-copy="true">Copy Issues</button>
      </div>
    </div>`;
  document.body.appendChild(dialog);
  bindDialog(dialog);
  return dialog;
}

function injectToolbar(root) {
  const ribbon = root?.querySelector?.('.geo-top-ribbon');
  if (!ribbon) return;
  let section = ribbon.querySelector('.rvm-model-health-issues-tool-group');
  if (section?.dataset?.rvmModelHealthIssues === BRIDGE_VERSION) return;
  if (!section) {
    section = document.createElement('div');
    section.className = 'rvm-ribbon-section rvm-tool-group rvm-model-health-issues-tool-group';
    const health = ribbon.querySelector('.rvm-model-health-tool-group');
    ribbon.insertBefore(section, health?.nextSibling || ribbon.querySelector('.rvm-policy-info-tool-group') || null);
  }
  section.dataset.rvmModelHealthIssues = BRIDGE_VERSION;
  section.innerHTML = `
    <span class="rvm-ribbon-label">Health+</span>
    <div class="rvm-ribbon-button-row">
      <button type="button" class="rvm-tool-btn" data-rvm-health-issues-open="true" title="Show actionable RVM health issues"><span aria-hidden="true">!</span><span>Issues</span></button>
      <button type="button" class="rvm-tool-btn" data-rvm-health-issues-refresh-toolbar="true" title="Refresh health issue classification"><span aria-hidden="true">↻</span><span>Check</span></button>
    </div>
    <div class="rvm-health-issues-summary" data-rvm-health-issues-summary>Issues: load model to inspect</div>`;
}

function onDocumentClick(event) {
  if (event.target?.closest?.('[data-rvm-health-issues-open]')) {
    event.preventDefault();
    event.stopPropagation();
    openDialog();
    return;
  }
  if (event.target?.closest?.('[data-rvm-health-issues-refresh-toolbar]')) {
    event.preventDefault();
    event.stopPropagation();
    renderIssues();
  }
}

function injectStyles() {
  if (document.getElementById('rvm-model-health-issues-style')) return;
  const style = document.createElement('style');
  style.id = 'rvm-model-health-issues-style';
  style.textContent = `
    .rvm-model-health-issues-tool-group .rvm-tool-btn span:first-child{font-size:12px;color:#fde68a}.rvm-health-issues-summary{margin-top:3px;color:#94a3b8;font-size:9.5px;white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis}
    .rvm-model-health-issues-dialog{position:fixed;inset:0;display:none;align-items:flex-start;justify-content:center;padding-top:88px;background:rgba(2,6,23,.46);z-index:12030}.rvm-model-health-issues-dialog.is-open{display:flex}
    .rvm-model-health-issues-card{width:min(760px,calc(100vw - 44px));max-height:calc(100vh - 120px);overflow:auto;display:grid;gap:10px;border:1px solid rgba(250,204,21,.28);border-radius:12px;background:#0b1424;box-shadow:0 22px 70px rgba(0,0,0,.50);padding:12px;color:#dbeafe}.rvm-model-health-issues-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.rvm-model-health-issues-head b{font-size:14px;color:#fde68a}.rvm-model-health-issues-head small{display:block;color:#9ca3af;font-size:9px}.rvm-model-health-issues-head button{border:1px solid rgba(148,163,184,.28);background:#111827;color:#e5e7eb;border-radius:7px;width:28px;height:26px}
    .rvm-health-issue-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.rvm-health-issue-summary span{border:1px solid rgba(250,204,21,.16);border-radius:8px;background:rgba(255,255,255,.035);padding:8px;font-size:11px;color:#cbd5e1}.rvm-health-issue-summary b{display:block;color:#fef3c7;font-size:15px}.rvm-health-issue-list{display:grid;gap:8px}.rvm-health-issue-row{border:1px solid rgba(148,163,184,.16);border-radius:9px;background:rgba(255,255,255,.03);padding:9px}.rvm-health-issue-row.is-warn{border-color:rgba(245,158,11,.35);background:rgba(245,158,11,.07)}.rvm-health-issue-row.is-ok{border-color:rgba(34,197,94,.28)}.rvm-health-issue-row>div{display:flex;align-items:center;gap:8px}.rvm-health-issue-row b{color:#e0f2fe}.rvm-health-issue-row small{margin-left:auto;color:#94a3b8;font-size:9px}.rvm-health-issue-row p{margin:7px 0;color:#cbd5e1;font-size:12px}.rvm-health-issue-row button,.rvm-model-health-issues-actions button{border:1px solid rgba(126,190,255,.24);border-radius:7px;background:#132238;color:#dbeafe;padding:6px 9px}.rvm-health-issue-badge{display:inline-flex;border-radius:999px;padding:2px 7px;font-weight:700;font-size:10px;text-transform:uppercase}.rvm-health-issue-badge.is-warn{background:rgba(245,158,11,.17);color:#fde68a}.rvm-health-issue-badge.is-info{background:rgba(59,130,246,.16);color:#bfdbfe}.rvm-health-issue-badge.is-ok{background:rgba(34,197,94,.15);color:#86efac}.rvm-model-health-issues-actions{display:flex;gap:8px;flex-wrap:wrap}
    @media(max-width:820px){.rvm-health-issue-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `;
  document.head.appendChild(style);
}

function attach() {
  const root = rootEl();
  if (!root) return false;
  injectToolbar(root);
  return true;
}

export function installRvmModelHealthIssuesBridge() {
  if (typeof document === 'undefined') return;
  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;
  injectStyles();
  document.addEventListener('click', onDocumentClick, true);
  let attempts = 0;
  const waitAttach = () => {
    attempts += 1;
    const ok = attach();
    if (!ok && attempts < 180) setTimeout(waitAttach, 300);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitAttach, { once: true });
  else waitAttach();
  globalThis.addEventListener?.('rvm-model-loaded', () => setTimeout(() => {
    attach();
    renderIssues();
  }, 520));
  globalThis.addEventListener?.('rvm-visibility-changed', () => setTimeout(() => renderIssues(), 120));
  globalThis.__PCF_GLB_RVM_HEALTH_ISSUES__ = {
    version: BRIDGE_VERSION,
    collectRvmHealthIssues,
    renderIssues,
    open: openDialog,
    copyIssues,
    runAction,
    thresholds: { FALLBACK_RATIO_WARN, FALLBACK_ABSOLUTE_WARN, WIREFRAME_WARN },
  };
}
