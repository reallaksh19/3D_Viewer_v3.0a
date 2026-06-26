import * as THREE from 'three';

const BRIDGE_VERSION = '20260620-rvm-remaining-material-modes-1';
const STORAGE_KEY = 'pcf-glb-rvm-material-mode';
const DEFAULT_MODE = 'type';

const TYPE_COLORS = Object.freeze({
  PIPE: 0x3b82f6,
  CYLINDER: 0x3b82f6,
  BRANCH: 0x3b82f6,
  FLANGE: 0x9ca3af,
  VALVE: 0x94a3b8,
  SUPPORT: 0xfacc15,
  REST: 0xfacc15,
  GUIDE: 0xfbbf24,
  LINESTOP: 0xf97316,
  ANCHOR: 0xef4444,
  SPRING: 0x22c55e,
  ELBOW: 0x60a5fa,
  TORUS: 0x60a5fa,
  BOX: 0x64748b,
  STRUCTURE: 0x475569,
  UNKNOWN: 0x6b7280,
});

export function installRvmMaterialModeBridge() {
  injectStyles();
  let attempts = 0;
  const attach = () => {
    attempts += 1;
    const root = document.querySelector('[data-rvm-viewer]');
    const viewer = globalThis.__3D_RVM_VIEWER__;
    if (root) bindRoot(root, viewer);
    if ((!root || !viewer) && attempts < 160) setTimeout(attach, 350);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true });
  else attach();
}

function bindRoot(root, viewer) {
  if (!root || root.dataset.rvmMaterialModeBridge === BRIDGE_VERSION) return;
  root.dataset.rvmMaterialModeBridge = BRIDGE_VERSION;
  injectControls(root);
  const mode = readMode();
  setMode(root, viewer || globalThis.__3D_RVM_VIEWER__, mode);
  const scheduleApply = () => setTimeout(() => setMode(root, globalThis.__3D_RVM_VIEWER__, readMode()), 80);
  try { globalThis.addEventListener?.('rvm-browser-parse-diagnostics', scheduleApply); } catch (_) {}
  try { globalThis.addEventListener?.('rvm-native-tessellation-diagnostics', scheduleApply); } catch (_) {}
  try { globalThis.addEventListener?.('rvm-support-symbol-diagnostics', scheduleApply); } catch (_) {}
  for (const delay of [900, 2200, 5000]) setTimeout(scheduleApply, delay);
}

function injectControls(root) {
  const ribbon = root.querySelector('.geo-top-ribbon');
  if (!ribbon || root.querySelector('[data-rvm-material-mode-controls]')) return;
  const section = document.createElement('div');
  section.className = 'rvm-ribbon-section rvm-material-mode-section';
  section.dataset.rvmMaterialModeControls = 'true';
  section.innerHTML = `
    <span class="rvm-ribbon-label">Color</span>
    <div class="rvm-material-mode-buttons" role="group" aria-label="RVM material mode">
      <button class="rvm-btn" type="button" data-rvm-material-mode="type">Type</button>
      <button class="rvm-btn" type="button" data-rvm-material-mode="source">Source</button>
      <button class="rvm-btn" type="button" data-rvm-material-mode="mono">Mono</button>
    </div>`;
  const search = ribbon.querySelector('.rvm-ribbon-search');
  ribbon.insertBefore(section, search || null);
  section.addEventListener('click', (event) => {
    const button = event.target?.closest?.('[data-rvm-material-mode]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    setMode(root, globalThis.__3D_RVM_VIEWER__, button.dataset.rvmMaterialMode);
  });
}

function setMode(root, viewer, modeInput) {
  const mode = normalizeMode(modeInput);
  writeMode(mode);
  updateButtons(root, mode);
  const diagnostics = applyMaterialMode(viewer, mode);
  publishDiagnostics({ ...diagnostics, mode });
  return diagnostics;
}

function applyMaterialMode(viewer, mode = DEFAULT_MODE) {
  const diagnostics = {
    schemaVersion: 'browser-rvm-material-mode/v1',
    capturedAt: new Date().toISOString(),
    mode,
    scannedCount: 0,
    recoloredCount: 0,
    restoredSourceCount: 0,
    skippedCount: 0,
    typeCounts: {},
  };
  if (!viewer?.modelGroup?.traverse) return diagnostics;
  viewer.modelGroup.traverse((obj) => {
    if (!obj?.isMesh || !obj.material || obj.userData?.supportSymbol === true) return;
    diagnostics.scannedCount += 1;
    const type = classifyObjectType(obj);
    bump(diagnostics.typeCounts, type);
    try {
      if (mode === 'source') {
        restoreOriginalMaterial(obj);
        diagnostics.restoredSourceCount += 1;
      } else {
        ensureOriginalMaterial(obj);
        const color = mode === 'mono' ? 0x94a3b8 : colorForType(type);
        applyColor(obj, color, mode);
        diagnostics.recoloredCount += 1;
      }
    } catch (_) {
      diagnostics.skippedCount += 1;
    }
  });
  const root = viewer.modelGroup.children?.[0] || viewer.modelGroup;
  if (root?.userData) root.userData.browserRvmMaterialMode = diagnostics;
  return diagnostics;
}

function classifyObjectType(obj) {
  const data = obj.userData || {};
  const props = data.browserRvmProperties || {};
  const attrs = data.browserRvmAttributes || data.attributes || props.attributes || {};
  const text = [
    data.type, data.kind, data.effectiveRenderPrimitive, data.renderPrimitive,
    props.type, props.kind, props.effectiveRenderPrimitive,
    attrs.TYPE, attrs.RVM_PRIMITIVE_KIND, attrs.RVM_PRIMITIVE_KIND_NAME, attrs.RVM_BROWSER_SUPPORT_KIND,
    attrs.RVM_OWNER_NAME, attrs.NAME,
  ].filter(Boolean).join(' ').toUpperCase();
  if (/LINE\s*STOP|LINESTOP|LIMIT/.test(text)) return 'LINESTOP';
  if (/ANCHOR|FIXED/.test(text)) return 'ANCHOR';
  if (/GUIDE/.test(text)) return 'GUIDE';
  if (/SPRING|HANGER/.test(text)) return 'SPRING';
  if (/SUPPORT|REST|SHOE|SADDLE|TRUNNION|STANCHION|PEDESTAL|BASE\s*PLATE|POST|DUMMY/.test(text)) return 'SUPPORT';
  if (/VALVE/.test(text)) return 'VALVE';
  if (/FLANGE|DISH|GASKET/.test(text)) return 'FLANGE';
  if (/ELBOW|TORUS|BEND/.test(text)) return 'ELBOW';
  if (/PIPE|CYLINDER|BRANCH/.test(text)) return 'PIPE';
  if (/STRUCTURE|FRAME|STEEL|PLATFORM/.test(text)) return 'STRUCTURE';
  if (/BOX/.test(text)) return 'BOX';
  return 'UNKNOWN';
}

function ensureOriginalMaterial(obj) {
  if (obj.userData.rvmMaterialModeOriginalMaterial) return;
  obj.userData.rvmMaterialModeOriginalMaterial = obj.material;
}

function restoreOriginalMaterial(obj) {
  const original = obj.userData?.rvmMaterialModeOriginalMaterial;
  if (!original) return;
  disposeIfClone(obj.material, original);
  obj.material = original;
  delete obj.userData.rvmMaterialModeApplied;
}

function applyColor(obj, color, mode) {
  const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
  const recolored = materials.map((mat) => {
    const clone = mat?.clone ? mat.clone() : new THREE.MeshStandardMaterial({ color });
    if (clone.color) clone.color.setHex(color);
    if (clone.emissive) clone.emissive.setHex(0x000000);
    if ('roughness' in clone) clone.roughness = Math.max(Number(clone.roughness) || 0.68, 0.62);
    if ('metalness' in clone) clone.metalness = Math.min(Number(clone.metalness) || 0.08, 0.18);
    clone.needsUpdate = true;
    return clone;
  });
  disposeIfClone(obj.material, obj.userData.rvmMaterialModeOriginalMaterial);
  obj.material = Array.isArray(obj.material) ? recolored : recolored[0];
  obj.userData.rvmMaterialModeApplied = mode;
}

function disposeIfClone(current, original) {
  const currentList = Array.isArray(current) ? current : [current];
  const originalList = Array.isArray(original) ? original : [original];
  for (const mat of currentList) {
    if (originalList.includes(mat)) continue;
    mat?.dispose?.();
  }
}

function updateButtons(root, mode) {
  root?.querySelectorAll?.('[data-rvm-material-mode]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.rvmMaterialMode === mode);
  });
}

function colorForType(type) { return TYPE_COLORS[type] ?? TYPE_COLORS.UNKNOWN; }
function normalizeMode(mode) { return ['type', 'source', 'mono'].includes(String(mode || '').toLowerCase()) ? String(mode).toLowerCase() : DEFAULT_MODE; }
function readMode() { try { return normalizeMode(globalThis.localStorage?.getItem?.(STORAGE_KEY) || DEFAULT_MODE); } catch (_) { return DEFAULT_MODE; } }
function writeMode(mode) { try { globalThis.localStorage?.setItem?.(STORAGE_KEY, normalizeMode(mode)); } catch (_) {} }
function bump(target, key) { const name = String(key || '').trim() || 'UNKNOWN'; target[name] = (target[name] || 0) + 1; }
function publishDiagnostics(diagnostics) {
  globalThis.__PCF_GLB_RVM_MATERIAL_MODE_DIAGNOSTICS__ = diagnostics;
  try { globalThis.dispatchEvent?.(new CustomEvent('rvm-material-mode-diagnostics', { detail: diagnostics })); } catch (_) {}
}

function injectStyles() {
  if (document.getElementById('rvm-material-mode-bridge-style')) return;
  const style = document.createElement('style');
  style.id = 'rvm-material-mode-bridge-style';
  style.textContent = `
    .rvm-material-mode-section .rvm-material-mode-buttons { display: flex; flex-wrap: wrap; gap: 4px; }
    .rvm-material-mode-section .rvm-btn { padding: 4px 7px; font-size: 11px; }
    .rvm-material-mode-section .rvm-btn.is-active { outline: 1px solid rgba(96,165,250,.9); background: rgba(37,99,235,.28); }
  `;
  document.head.appendChild(style);
}
