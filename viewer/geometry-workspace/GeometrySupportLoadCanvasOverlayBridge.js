import * as THREE from 'three';
import {
  buildSupportLoadCanvasOverlayPlan,
  summarizeSupportLoadCanvasOverlayPlan,
  SUPPORT_LOAD_CANVAS_OVERLAY_SCHEMA,
  SUPPORT_LOAD_CANVAS_OVERLAY_VERSION,
} from './GeometrySupportLoadCanvasOverlayModel.js?v=20260623-support-load-canvas-overlay-1';

const INSTALL_FLAG = Symbol.for('pcf-glb-geometry-support-load-canvas-overlay-bridge-v1');
const ROOT_NAME = '__GEOMETRY_SUPPORT_LOAD_CANVAS_OVERLAY__';
let lastPlan = null;

function esc(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function state() { return globalThis.__PCF_GLB_GEOMETRY_EXPORT_WORKSPACE__?.state?.() || {}; }
function viewer() { return globalThis.__3D_RVM_VIEWER__ || null; }
function formulaApi() { return globalThis.__PCF_GLB_GEOMETRY_SUPPORT_LOAD_FORMULAS__ || null; }
function dialog() { return document.getElementById('geometry-support-load-canvas-overlay-dialog'); }

function currentFormulaResults() {
  return formulaApi()?.lastResults?.() || state().supportLoadFormulaResults || null;
}

function disposeTree(root) {
  root?.traverse?.((obj) => {
    obj.geometry?.dispose?.();
    if (Array.isArray(obj.material)) obj.material.forEach(mat => mat?.dispose?.());
    else obj.material?.dispose?.();
  });
}

function clearOverlay(reason = 'clear') {
  const v = viewer();
  let removed = 0;
  const roots = [];
  v?.scene?.traverse?.((obj) => { if (obj?.name === ROOT_NAME || obj?.userData?.supportLoadCanvasOverlay) roots.push(obj); });
  for (const root of roots) {
    root.parent?.remove?.(root);
    disposeTree(root);
    removed += 1;
  }
  const result = { schema: SUPPORT_LOAD_CANVAS_OVERLAY_SCHEMA, version: SUPPORT_LOAD_CANVAS_OVERLAY_VERSION, status: 'CLEARED', reason, removed };
  if (v) v.supportLoadCanvasOverlay = result;
  const s = state();
  if (s && typeof s === 'object') s.supportLoadCanvasOverlay = result;
  requestRender(v);
  render();
  return result;
}

function requestRender(v) {
  try { v?.requestRender?.(); } catch (_) {}
  try { v?.render?.(); } catch (_) {}
  try { v?.renderer?.render?.(v.scene, v.camera); } catch (_) {}
}

function colorFor(kind) {
  if (kind === 'VERTICAL_OPE') return 0xfacc15;
  if (kind === 'GUIDE_HORIZONTAL') return 0x38bdf8;
  if (kind === 'LINESTOP_HORIZONTAL') return 0xfb7185;
  return 0xdbeafe;
}

function vector(value, fallback = { x: 0, y: 0, z: 0 }) {
  return new THREE.Vector3(
    Number(value?.x ?? fallback.x) || 0,
    Number(value?.y ?? fallback.y) || 0,
    Number(value?.z ?? fallback.z) || 0,
  );
}

function makeArrowLine(arrow) {
  const start = vector(arrow.start);
  const dir = vector(arrow.direction, { x: 1, y: 0, z: 0 });
  if (dir.lengthSq() <= 1e-9) dir.set(1, 0, 0);
  dir.normalize();
  const length = Math.max(1, Number(arrow.length) || 1);
  const end = start.clone().add(dir.clone().multiplyScalar(length));
  const headLength = Math.max(8, Math.min(38, length * 0.18));
  let side = new THREE.Vector3(0, 1, 0).cross(dir);
  if (side.lengthSq() <= 1e-9) side = new THREE.Vector3(1, 0, 0).cross(dir);
  side.normalize().multiplyScalar(headLength * 0.45);
  const base = end.clone().sub(dir.clone().multiplyScalar(headLength));
  const points = [
    start, end,
    end, base.clone().add(side),
    end, base.clone().sub(side),
  ];
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: colorFor(arrow.kind), depthTest: false, transparent: true, opacity: 0.95 });
  const line = new THREE.LineSegments(geometry, material);
  line.name = `SUPPORT_LOAD_${arrow.kind}_${arrow.supportTag || arrow.supportId}`;
  line.userData = {
    supportLoadCanvasOverlay: true,
    schema: 'support-load-canvas-overlay-arrow/v1',
    pickable: false,
    source: 'calculatedFields.supportLoadReference',
    supportId: arrow.supportId,
    supportTag: arrow.supportTag,
    supportType: arrow.supportType,
    associatedPipeId: arrow.associatedPipeId,
    kind: arrow.kind,
    loadN: arrow.loadN,
    label: arrow.label,
  };
  return line;
}

function applyOverlay() {
  const v = viewer();
  const formulaResults = currentFormulaResults();
  lastPlan = buildSupportLoadCanvasOverlayPlan({ formulaResults });
  const s = state();
  if (s && typeof s === 'object') s.supportLoadCanvasOverlay = lastPlan;
  if (!v?.scene) {
    render();
    return { ...lastPlan, status: 'BLOCKED', reason: 'viewer-scene-missing' };
  }
  clearOverlay('before-apply-support-load-canvas-overlay');
  if (!lastPlan.arrows?.length) {
    if (v) v.supportLoadCanvasOverlay = lastPlan;
    render();
    return lastPlan;
  }
  const root = new THREE.Group();
  root.name = ROOT_NAME;
  root.userData = {
    supportLoadCanvasOverlay: true,
    schema: SUPPORT_LOAD_CANVAS_OVERLAY_SCHEMA,
    version: SUPPORT_LOAD_CANVAS_OVERLAY_VERSION,
    inputSource: 'calculatedFields.supportLoadReference',
    mutationPolicy: 'READ_ONLY_OVERLAY',
    renderPolicy: 'LINE_SEGMENTS_ONLY',
    pickable: false,
  };
  for (const arrow of lastPlan.arrows) root.add(makeArrowLine(arrow));
  v.scene.add(root);
  v.supportLoadCanvasOverlay = lastPlan;
  requestRender(v);
  render();
  return lastPlan;
}

function summary(plan = lastPlan) {
  const s = summarizeSupportLoadCanvasOverlayPlan(plan || {});
  return `<div class="gslco-summary"><div><b>${esc(s.status)}</b><span>status</span></div><div><b>${esc(s.supportCount)}</b><span>supports</span></div><div><b>${esc(s.arrowCount)}</b><span>arrows</span></div><div><b>${esc(s.warningCount)}</b><span>warnings</span></div><div><b>${esc(s.maxLoadN)}</b><span>max N</span></div></div>`;
}

function rows(plan = lastPlan) {
  const supportRows = Array.isArray(plan?.supportRows) ? plan.supportRows.slice(0, 160) : [];
  if (!supportRows.length) return '<div class="gslco-empty">No calculated support-load references found. Run LOAD → Calc first.</div>';
  return `<h4>Overlay Rows</h4><div class="gslco-table-wrap"><table><thead><tr><th>Support</th><th>Type</th><th>Pipe</th><th>Vertical N</th><th>Guide N</th><th>LineStop N</th><th>Warnings</th></tr></thead><tbody>${supportRows.map(row => `<tr><td>${esc(row.supportTag || row.supportId)}</td><td>${esc(row.supportType)}</td><td>${esc(row.associatedPipeId)}</td><td>${esc(row.loads?.verticalN ?? '')}</td><td>${esc(row.loads?.guideN ?? '')}</td><td>${esc(row.loads?.lineStopN ?? '')}</td><td>${esc((row.warnings || []).join(', '))}</td></tr>`).join('')}</tbody></table></div>`;
}

function render() {
  const d = dialog();
  if (!d) return;
  d.querySelector('[data-gslco-body]').innerHTML = `<div class="gslco-toolbar"><button type="button" data-gslco-apply="true">Apply Overlay</button><button type="button" data-gslco-clear="true">Clear Overlay</button><button type="button" data-gslco-calc="true">Open Calc</button></div><p class="gslco-note">Canvas overlay is read-only. It consumes only <code>calculatedFields.supportLoadReference</code> and draws line-segment arrows. It does not hydrate, calculate, top-up, or mutate input/result fields.</p>${summary(lastPlan)}${rows(lastPlan)}`;
}

function ensure() {
  let d = dialog();
  if (d) return d;
  d = document.createElement('div');
  d.id = 'geometry-support-load-canvas-overlay-dialog';
  d.className = 'geometry-support-load-canvas-overlay-dialog';
  d.innerHTML = `<div class="gslco-card" role="dialog"><div class="gslco-head"><div><b>Support Load Canvas Overlay</b><small>${SUPPORT_LOAD_CANVAS_OVERLAY_VERSION} · ${SUPPORT_LOAD_CANVAS_OVERLAY_SCHEMA}</small></div><button type="button" data-gslco-close="true">x</button></div><div data-gslco-body></div></div>`;
  document.body.appendChild(d);
  d.addEventListener('click', e => {
    if (e.target?.closest?.('[data-gslco-close]')) { d.classList.remove('is-open'); return; }
    if (e.target?.closest?.('[data-gslco-apply]')) { applyOverlay(); return; }
    if (e.target?.closest?.('[data-gslco-clear]')) { clearOverlay('user-clear'); return; }
    if (e.target?.closest?.('[data-gslco-calc]')) { formulaApi()?.open?.(); return; }
  }, true);
  return d;
}

function open() {
  const d = ensure();
  d.classList.add('is-open');
  if (!lastPlan) lastPlan = buildSupportLoadCanvasOverlayPlan({ formulaResults: currentFormulaResults() });
  render();
}

function injectToolbar(root) {
  const section = root?.querySelector?.('.geometry-export-workspace-tool-group');
  if (!section || section.querySelector('[data-geometry-support-load-canvas-overlay-open]')) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'rvm-tool-btn';
  b.dataset.geometrySupportLoadCanvasOverlayOpen = 'true';
  b.title = 'Show calculated support-load arrows on canvas';
  b.innerHTML = '<span aria-hidden="true">LOAD</span><span>Overlay</span>';
  section.querySelector('.rvm-ribbon-button-row')?.appendChild(b);
}

function styles() {
  if (document.getElementById('geometry-support-load-canvas-overlay-style')) return;
  const s = document.createElement('style');
  s.id = 'geometry-support-load-canvas-overlay-style';
  s.textContent = '.geometry-support-load-canvas-overlay-dialog{position:fixed;inset:0;display:none;align-items:flex-start;justify-content:center;padding:74px 20px;background:rgba(2,6,23,.56);z-index:12440}.geometry-support-load-canvas-overlay-dialog.is-open{display:flex}.gslco-card{width:min(1240px,calc(100vw - 44px));max-height:calc(100vh - 92px);overflow:auto;background:#0b1424;border:1px solid rgba(250,204,21,.34);border-radius:14px;padding:12px;color:#dbeafe}.gslco-head,.gslco-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:space-between}.gslco-toolbar{justify-content:flex-start}.gslco-head b,.gslco-card h4{color:#fde68a}.gslco-head small,.gslco-note{color:#9fb3cc;font-size:11px}.gslco-head button,.gslco-toolbar button{border:1px solid rgba(250,204,21,.28);border-radius:8px;background:#2b2110;color:#fde68a;padding:7px 10px}.gslco-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:8px 0}.gslco-summary div{border:1px solid rgba(250,204,21,.18);border-radius:9px;padding:8px;background:rgba(255,255,255,.04)}.gslco-summary b{display:block;font-size:17px;color:#fff}.gslco-summary span{font-size:11px;color:#9fb3cc}.gslco-table-wrap{max-height:440px;overflow:auto}.gslco-table-wrap table{border-collapse:collapse;width:100%;font-size:12px}.gslco-table-wrap th,.gslco-table-wrap td{border:1px solid rgba(255,255,255,.08);padding:7px;text-align:left}.gslco-table-wrap th{background:rgba(255,255,255,.06);color:#fde68a}.gslco-empty{padding:16px;border:1px dashed rgba(148,163,184,.22);border-radius:10px;color:#9fb3cc}';
  document.head.appendChild(s);
}

export function installGeometrySupportLoadCanvasOverlayBridge() {
  if (globalThis[INSTALL_FLAG]) return globalThis.__PCF_GLB_GEOMETRY_SUPPORT_LOAD_CANVAS_OVERLAY__;
  globalThis[INSTALL_FLAG] = true;
  styles();
  globalThis.__PCF_GLB_GEOMETRY_SUPPORT_LOAD_CANVAS_OVERLAY__ = Object.freeze({
    version: SUPPORT_LOAD_CANVAS_OVERLAY_VERSION,
    schema: SUPPORT_LOAD_CANVAS_OVERLAY_SCHEMA,
    open,
    apply: applyOverlay,
    clear: clearOverlay,
    plan: () => buildSupportLoadCanvasOverlayPlan({ formulaResults: currentFormulaResults() }),
    current: () => lastPlan,
  });
  document.addEventListener('click', e => { if (e.target?.closest?.('[data-geometry-support-load-canvas-overlay-open]')) open(); }, true);
  const mo = new MutationObserver(records => { for (const record of records) for (const node of record.addedNodes || []) if (node?.querySelector) injectToolbar(node); });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  injectToolbar(document);
  return globalThis.__PCF_GLB_GEOMETRY_SUPPORT_LOAD_CANVAS_OVERLAY__;
}
