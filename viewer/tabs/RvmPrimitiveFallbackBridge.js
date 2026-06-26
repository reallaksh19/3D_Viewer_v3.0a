const VERSION = 'rvm-primitive-fallback-review/v2-clickable-rows';
const PANEL_ID = 'rvm-primitive-fallback-review';
const GLOBAL_KEY = '__PCF_GLB_RVM_PRIMITIVE_FALLBACK_DIAGNOSTICS__';
const API_KEY = '__PCF_GLB_RVM_PRIMITIVE_FALLBACK_REVIEW__';
const NATIVE_RE = /native-cpp|tessellated|capped/i;
const FALLBACK_RE = /BBOX|PLACEHOLDER|BOX_SOLID|FALLBACK|UNKNOWN/i;
const registry = new Map();

export function installRvmPrimitiveFallbackBridge() {
  injectStyle();
  const state = {
    version: VERSION,
    runNow: renderReview,
    selectFallback: (id) => selectFallback(id),
    getDiagnostics: () => globalThis[GLOBAL_KEY] || null,
  };
  globalThis[API_KEY] = state;
  const schedule = () => renderReview();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true }); else schedule();
  for (const eventName of ['rvm-browser-parse-diagnostics','rvm-native-tessellation-diagnostics','rvm-remaining-primitive-diagnostics','rvm-torus-parity-diagnostics','rvm-snout-parity-diagnostics','rvm-dish-tessellation-diagnostics']) {
    try { globalThis.addEventListener?.(eventName, schedule); } catch (_) {}
  }
  for (const delay of [900, 1800, 3600, 7000]) setTimeout(schedule, delay);
  return state;
}

function renderReview() {
  const root = document.querySelector('[data-rvm-viewer]');
  const basePanel = root?.querySelector?.('#rvm-browser-parse-diagnostics');
  if (!root || !basePanel) return null;
  let panel = root.querySelector(`#${PANEL_ID}`);
  if (!panel) {
    const header = document.createElement('div');
    header.className = 'rvm-panel-header';
    header.textContent = 'Primitive Fallback Review';
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'rvm-tag-list rvm-primitive-fallback-review';
    const after = root.querySelector('#rvm-native-tessellation-diagnostics') || basePanel;
    after.insertAdjacentElement('afterend', panel);
    after.insertAdjacentElement('afterend', header);
  }
  const diagnostics = collectDiagnostics();
  const rows = diagnostics.fallbackObjects.slice(0, 32).map((item) => `
    <button type="button" class="rvm-fallback-row" data-rvm-fallback-id="${esc(item.id)}" title="Select and fit fallback primitive">
      <span class="rvm-fallback-code">${esc(item.code || '?')}</span>
      <span class="rvm-fallback-main">${esc(item.name || item.owner || item.path || item.uuid)}</span>
      <span class="rvm-fallback-reason">${esc(item.reason)}</span>
    </button>`).join('');
  panel.innerHTML = `<div class="rvm-primitive-fallback-card"><div class="rvm-tree-action-row"><button type="button" class="rvm-btn" data-rvm-primitive-fallback-rescan="true">Re-scan</button><span class="rvm-muted">Click a fallback row to select + fit</span></div><div class="rvm-browser-diag-grid">${row('Schema', VERSION)}${row('Scanned', diagnostics.scannedObjectCount)}${row('Native upgraded', diagnostics.nativeUpgradedObjectCount)}${row('Fallback objects', diagnostics.fallbackObjectCount)}${row('Decoded by code', counts(diagnostics.primitiveDecodedKindCounts))}${row('Native by code', counts(diagnostics.primitiveNativeUpgradedKindCounts))}${row('Fallback by code', counts(diagnostics.primitiveFallbackKindCounts))}${row('Fallback reasons', counts(diagnostics.fallbackReasonCounts))}</div><div class="rvm-fallback-list">${rows || '<div class="rvm-empty-state">No fallback primitives found after current runtime upgrades.</div>'}</div></div>`;
  panel.querySelector('[data-rvm-primitive-fallback-rescan]')?.addEventListener('click', renderReview, { once: true });
  panel.querySelectorAll('[data-rvm-fallback-id]').forEach((button) => button.addEventListener('click', () => selectFallback(button.dataset.rvmFallbackId)));
  return diagnostics;
}

function collectDiagnostics() {
  registry.clear();
  const out = { schemaVersion: VERSION, capturedAt: new Date().toISOString(), scannedObjectCount: 0, nativeUpgradedObjectCount: 0, fallbackObjectCount: 0, primitiveDecodedKindCounts: {}, primitiveNativeUpgradedKindCounts: {}, primitiveFallbackKindCounts: {}, primitiveNonNativeRenderedKindCounts: {}, fallbackReasonCounts: {}, fallbackObjects: [] };
  const viewer = globalThis.__3D_RVM_VIEWER__;
  viewer?.modelGroup?.traverse?.((object) => {
    if (!object?.isMesh && !object?.isLine && !object?.isPoints) return;
    out.scannedObjectCount += 1;
    const attrs = object.userData?.browserRvmAttributes || object.userData?.attributes || object.userData?.browserRvmProperties?.attributes || {};
    const params = parse(attrs.RVM_NATIVE_PRIMITIVE_PARAMS);
    const code = String(Math.trunc(Number(params?.kind || attrs.RVM_PRIMITIVE_CODE || 0)) || '');
    if (!code) return;
    bump(out.primitiveDecodedKindCounts, code);
    const text = renderText(object, attrs);
    if (isNative(object, text)) { out.nativeUpgradedObjectCount += 1; bump(out.primitiveNativeUpgradedKindCounts, code); return; }
    bump(out.primitiveNonNativeRenderedKindCounts, code);
    if (FALLBACK_RE.test(text) || attrs.RVM_RECORD_TAG === 'PRIM') {
      const item = fallbackItem(object, attrs, params, code, text);
      out.fallbackObjectCount += 1;
      bump(out.primitiveFallbackKindCounts, code);
      bump(out.fallbackReasonCounts, item.reason);
      out.fallbackObjects.push(item);
      registry.set(item.id, object);
    }
  });
  out.fallbackObjects.sort((a, b) => String(a.code).localeCompare(String(b.code)) || String(a.name).localeCompare(String(b.name)));
  globalThis[GLOBAL_KEY] = out;
  try { globalThis.dispatchEvent?.(new CustomEvent('rvm-primitive-fallback-diagnostics', { detail: out })); } catch (_) {}
  return out;
}

function selectFallback(id) {
  const object = registry.get(id);
  const root = document.querySelector('[data-rvm-viewer]');
  const api = globalThis.__PCF_GLB_RVM_INTERACTION__;
  if (!object || !api?.setSelectionFromObjects) return false;
  api.setSelectionFromObjects([object], { sourceObject: object });
  api.fitSelection?.();
  renderSelectedFallbackDetails(root, object);
  root?.querySelectorAll?.('.rvm-fallback-row.is-selected').forEach((rowEl) => rowEl.classList.remove('is-selected'));
  root?.querySelector?.(`[data-rvm-fallback-id="${css(id)}"]`)?.classList.add('is-selected');
  return true;
}

function renderSelectedFallbackDetails(root, object) {
  const panel = root?.querySelector?.('#rvm-attributes-panel');
  if (!panel) return;
  const data = object.userData || {};
  const props = data.browserRvmProperties || {};
  const attrs = data.browserRvmAttributes || data.attributes || props.attributes || {};
  const params = parse(attrs.RVM_NATIVE_PRIMITIVE_PARAMS);
  const detailRows = [
    ['Picked fallback', props.displayName || data.displayName || object.name || object.uuid],
    ['Source path', props.sourcePath || data.sourcePath || '-'],
    ['Type', props.type || data.type || attrs.TYPE || '-'],
    ['PRIM code', params?.kind || attrs.RVM_PRIMITIVE_CODE || '-'],
    ['Kind name', params?.kindName || attrs.RVM_PRIMITIVE_KIND_NAME || '-'],
    ['Render primitive', data.effectiveRenderPrimitive || data.renderPrimitive || attrs.RVM_BROWSER_RENDER_PRIMITIVE || '-'],
    ['Fallback reason', reason(renderText(object, attrs), params)],
    ['Byte offset', attrs.RVM_BYTE_OFFSET || '-'],
  ];
  panel.innerHTML = `<div class="rvm-canvas-selection-card"><div class="rvm-tree-selection-title">Primitive fallback selection</div><div class="rvm-tree-action-row"><button type="button" class="rvm-btn" data-fallback-action="fit">Fit Selection</button><button type="button" class="rvm-btn" data-fallback-action="hide">Hide</button><button type="button" class="rvm-btn" data-fallback-action="clear">Clear</button></div><div class="rvm-browser-diag-grid">${detailRows.map(([k, v]) => row(k, v)).join('')}</div></div>`;
  const api = globalThis.__PCF_GLB_RVM_INTERACTION__;
  panel.querySelector('[data-fallback-action="fit"]')?.addEventListener('click', () => api?.fitSelection?.());
  panel.querySelector('[data-fallback-action="hide"]')?.addEventListener('click', () => api?.hideSelection?.());
  panel.querySelector('[data-fallback-action="clear"]')?.addEventListener('click', () => api?.clearSelection?.());
}

function fallbackItem(object, attrs, params, code, text) {
  const data = object.userData || {};
  const props = data.browserRvmProperties || {};
  const id = String(object.uuid || `${code}-${attrs.RVM_BYTE_OFFSET || ''}-${attrs.NAME || object.name || ''}`);
  return { id, uuid: object.uuid || '', code, name: props.displayName || data.displayName || attrs.NAME || object.name || '', owner: attrs.RVM_OWNER_NAME || '', path: props.sourcePath || data.sourcePath || attrs.RVM_OWNER_PATH || '', reason: reason(text, params), renderPrimitive: data.effectiveRenderPrimitive || data.renderPrimitive || attrs.RVM_BROWSER_RENDER_PRIMITIVE || '', byteOffset: attrs.RVM_BYTE_OFFSET || '' };
}

function renderText(object, attrs) { return `${object.userData?.effectiveRenderPrimitive || ''} ${object.userData?.renderPrimitive || ''} ${object.userData?.renderQuality || ''} ${attrs.RVM_BROWSER_RENDER_PRIMITIVE || ''}`; }
function isNative(object, text) { return /^RVM_NATIVE_/i.test(text) || NATIVE_RE.test(text) || object.userData?.browserRvmRemainingPrimitiveUpgraded || object.userData?.browserRvmSnoutParityUpgraded || object.userData?.browserRvmDishTessellated || object.userData?.browserRvmTorusParityUpgraded; }
function reason(text, params) { const upper = String(text).toUpperCase(); if (upper.includes('BBOX')) return 'bbox-placeholder'; if (upper.includes('BOX_SOLID')) return 'box-solid-fallback'; if (!params?.decoded) return 'native-params-not-decoded'; return 'not-native-upgraded'; }
function parse(value) { try { return value ? JSON.parse(String(value)) : null; } catch (_) { return null; } }
function bump(map, key) { map[key || 'UNKNOWN'] = (map[key || 'UNKNOWN'] || 0) + 1; }
function counts(map) { const entries = Object.entries(map || {}).filter(([, value]) => Number(value) > 0); return entries.length ? entries.slice(0, 12).map(([key, value]) => `${key}:${value}`).join(', ') : '-'; }
function row(key, value) { return `<div class="rvm-browser-diag-row"><span>${esc(key)}</span><b>${esc(value ?? '-')}</b></div>`; }
function esc(value) { return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
function css(value) { return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }
function injectStyle() { if (document.getElementById('rvm-primitive-fallback-review-style')) return; const style = document.createElement('style'); style.id = 'rvm-primitive-fallback-review-style'; style.textContent = '.rvm-primitive-fallback-card{display:grid;gap:8px}.rvm-primitive-fallback-card .rvm-btn{width:max-content;padding:4px 8px;font-size:12px}.rvm-muted{opacity:.72;font-size:12px}.rvm-fallback-list{display:grid;gap:4px;max-height:260px;overflow:auto}.rvm-fallback-row{display:grid;grid-template-columns:34px minmax(0,1fr) max-content;gap:8px;align-items:center;width:100%;padding:5px 6px;border:1px solid rgba(148,163,184,.26);border-radius:8px;background:rgba(15,23,42,.42);color:inherit;text-align:left;cursor:pointer}.rvm-fallback-row:hover,.rvm-fallback-row.is-selected{border-color:rgba(96,165,250,.9);background:rgba(37,99,235,.24)}.rvm-fallback-code{font:700 11px/1 ui-monospace,monospace;color:#bfdbfe}.rvm-fallback-main{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.rvm-fallback-reason{font-size:11px;opacity:.78}'; document.head.appendChild(style); }
