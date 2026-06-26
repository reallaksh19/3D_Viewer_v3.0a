import * as THREE from 'three';

const BRIDGE_VERSION = '20260622-rvm-support-raw-default-1';
const SUPPORT_SYMBOL_ROOT = '__RVM_GEOMETRY_SUPPORT_SYMBOLS__';
const SUPPORT_MODE_STORAGE_KEY = 'rvm_support_render_mode_v2';
const SUPPORT_WORDS_RE = /\b(SUPPORT|SUPP|GUIDE|ANCHOR|LINE\s*STOP|LINESTOP|LIMIT\s*STOP|LIMIT|REST|SHOE|HANGER|SPRING|CLAMP|TRUNNION|SADDLE|DUMMY|U[-_ ]?BOLT|STANCHION|PEDESTAL|POST|BASE\s*PLATE)\b/i;
const SUPPORT_KIND_COLORS = Object.freeze({
  REST: 0x5ee56a,
  GUIDE: 0x42d7ff,
  LINESTOP: 0xffb347,
  LIMIT: 0xffb347,
  ANCHOR: 0xf266ff,
  SPRING: 0xff6fae,
  GEOMETRY: 0x74c0fc,
  UNKNOWN_SUPPORT: 0xb4d4ff,
});

export function installRvmSupportSummaryBridge() {
  injectStyles();
  let attempts = 0;
  const attach = () => {
    attempts += 1;
    const root = document.querySelector('[data-rvm-viewer]');
    const viewer = globalThis.__3D_RVM_VIEWER__;
    if (root && viewer) bind(root, viewer);
    if ((!root || !viewer) && attempts < 180) setTimeout(attach, 350);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true });
  else attach();
}

function bind(root, viewer) {
  if (!root || root.dataset.rvmSupportSummaryBridge === BRIDGE_VERSION) return;
  root.dataset.rvmSupportSummaryBridge = BRIDGE_VERSION;
  let last = '';
  const tick = () => {
    const mode = getSupportMode(root);
    const supports = collectSupportObjects(viewer);
    const diagnostics = rebuildSupportSymbols(viewer, supports, mode);
    viewer._rvmSupportSymbolDiagnostics = diagnostics;
    globalThis.__PCF_GLB_RVM_SUPPORT_DIAGNOSTICS__ = diagnostics;
    const key = `${mode}|${supports.map((item) => `${item.uuid}:${item.visible}:${item.userData?.rvmHiddenByUser ? 1 : 0}`).sort().join('|')}|${diagnostics.symbolCount}|${diagnostics.rawHiddenCount}`;
    if (key !== last) {
      last = key;
      renderSupportSummary(root, viewer, supports, diagnostics, mode);
    }
  };
  const timer = setInterval(tick, 1000);
  root._rvmSupportSummaryCleanup = () => clearInterval(timer);
  setTimeout(tick, 100);
  setTimeout(tick, 600);
  setTimeout(tick, 1500);
  setTimeout(tick, 3500);
}

function collectSupportObjects(viewer) {
  const out = [];
  viewer?.modelGroup?.updateMatrixWorld?.(true);
  viewer?.modelGroup?.traverse?.((obj) => {
    if (!obj?.isMesh || obj.userData?.supportSymbol || obj.userData?.rvmSupportSymbolGenerated || obj.userData?.rvmSupportGeometryGenerated) return;
    if (obj.userData?.rvmHiddenByUser) return;
    const candidate = classifySupportCandidate(obj);
    if (!candidate.support) return;
    obj.userData.rvmSupportCandidate = true;
    obj.userData.rvmSupportCandidateKind = candidate.kind;
    obj.userData.rvmSupportCandidateReason = candidate.reason;
    obj.userData.rvmSupportCandidateByGeometry = candidate.byGeometry;
    out.push(obj);
  });
  return out;
}

function classifySupportCandidate(obj) {
  const data = obj?.userData || {};
  const props = data.browserRvmProperties || {};
  const attrs = getAttrs(obj);
  const text = supportText(obj, attrs, props);
  const explicitKind = supportKindFromText(text);
  const explicit = data.type === 'SUPPORT' || attrs.RVM_BROWSER_SUPPORT_HINT === 'true' || SUPPORT_WORDS_RE.test(text);
  if (explicit) return { support: true, kind: explicitKind || attrs.RVM_BROWSER_SUPPORT_KIND || 'UNKNOWN_SUPPORT', reason: 'metadata', byGeometry: false };

  const geom = supportGeometryMetrics(obj, attrs);
  if (!geom.support) return { support: false, kind: '', reason: geom.reason || 'not-support', byGeometry: false };
  return { support: true, kind: geom.kind || 'GEOMETRY', reason: geom.reason, byGeometry: true };
}

function getAttrs(obj) {
  const data = obj?.userData || {};
  const props = data.browserRvmProperties || {};
  const out = {};
  for (const src of [data, data.browserRvmAttributes, props.attributes, data.attributes, data.rawAttributes, data.sourceAttributes, obj?.attributes]) {
    if (!src || typeof src !== 'object') continue;
    for (const [key, value] of Object.entries(src)) {
      if (value !== undefined && value !== null && out[key] === undefined) out[key] = value;
    }
  }
  return out;
}

function supportText(obj, attrs = {}, props = {}) {
  return [
    obj?.name,
    obj?.uuid,
    obj?.userData?.name,
    obj?.userData?.type,
    obj?.userData?.kind,
    obj?.userData?.renderPrimitive,
    obj?.userData?.effectiveRenderPrimitive,
    obj?.userData?.sourcePath,
    obj?.userData?.displayName,
    props.sourcePath,
    props.displayName,
    attrs.RVM_BROWSER_SUPPORT_HINT,
    attrs.RVM_BROWSER_SUPPORT_KIND,
    attrs.TYPE,
    attrs.NAME,
    attrs.TAG,
    attrs.RVM_OWNER_NAME,
    attrs.RVM_OWNER_PATH,
    attrs.RVM_PRIMITIVE_KIND,
  ].map((value) => String(value || '')).join(' ');
}

function supportKindFromText(text) {
  const s = String(text || '').toUpperCase();
  if (/\bGUIDE\b|\bGUID\b/.test(s)) return 'GUIDE';
  if (/\bLINE\s*STOP\b|\bLINESTOP\b|\bSTOPPER\b/.test(s)) return 'LINESTOP';
  if (/\bLIMIT\s*STOP\b|\bLIMIT\b/.test(s)) return 'LIMIT';
  if (/\bANCHOR\b|\bFIXED\b/.test(s)) return 'ANCHOR';
  if (/\bSPRING\b|\bHANGER\b/.test(s)) return 'SPRING';
  if (/\bREST\b|\bRESTING\b|\bSHOE\b|\bBASE\s*PLATE\b|\bSADDLE\b|\bPEDESTAL\b|\bSTANCHION\b|\bPOST\b/.test(s)) return 'REST';
  return '';
}

function supportGeometryMetrics(obj, attrs = {}) {
  const primitive = String(attrs.RVM_BROWSER_RENDER_PRIMITIVE || obj.userData?.renderPrimitive || obj.userData?.effectiveRenderPrimitive || '').toUpperCase();
  const type = String(attrs.TYPE || obj.userData?.type || '').toUpperCase();
  const kind = String(attrs.RVM_PRIMITIVE_KIND || obj.userData?.kind || '').toUpperCase();
  if (/PIPE|CYLINDER|ELBOW|FLANGE|VALVE|TEE/.test(`${primitive} ${type} ${kind}`)) return { support: false, reason: 'piping-primitive' };
  if (!/BOX|SUPPORT|STRUCTURE|RVM_PRIM_CODE_2|UNKNOWN|SOLID/.test(`${primitive} ${type} ${kind}`)) return { support: false, reason: 'not-boxlike' };
  const box = worldBoxFor(obj);
  if (!box) return { support: false, reason: 'no-bounds' };
  const size = box.getSize(new THREE.Vector3());
  const dims = [Math.abs(size.x), Math.abs(size.y), Math.abs(size.z)].sort((a, b) => a - b);
  const [a, b, c] = dims;
  if (!Number.isFinite(a + b + c) || c <= 0 || b <= 0) return { support: false, reason: 'bad-size' };

  const slender = c >= Math.max(b * 2.6, a * 4.0);
  const smallSection = a <= 0.65 && b <= 1.25;
  const plausibleLength = c >= 0.45 && c <= 12;
  const plateLike = c <= 2.5 && a <= 0.45 && b >= 0.25 && b <= 3.5;
  if (slender && smallSection && plausibleLength) return { support: true, kind: 'REST', reason: 'geometry-vertical-slender' };
  if (plateLike) return { support: true, kind: 'GUIDE', reason: 'geometry-plate-like' };
  return { support: false, reason: 'geometry-rejected' };
}

function worldBoxFor(obj) {
  try {
    obj.updateMatrixWorld?.(true);
    if (!obj.geometry?.boundingBox) obj.geometry?.computeBoundingBox?.();
    const localBox = obj.geometry?.boundingBox?.clone?.() || null;
    const worldBox = localBox ? localBox.applyMatrix4(obj.matrixWorld) : new THREE.Box3().setFromObject(obj);
    return worldBox && !worldBox.isEmpty() ? worldBox : null;
  } catch (_) {
    return null;
  }
}

function rebuildSupportSymbols(viewer, supports, mode) {
  const previous = viewer?.scene?.getObjectByName(SUPPORT_SYMBOL_ROOT);
  if (previous) {
    viewer.scene.remove(previous);
    disposeObject(previous);
  }

  const kindCounts = {};
  let geometryCount = 0;
  let metadataCount = 0;
  for (const obj of supports) {
    const candidate = classifySupportCandidate(obj);
    if (!candidate.support) continue;
    const kind = normalizeSupportKind(candidate.kind || obj.userData?.rvmSupportCandidateKind || 'UNKNOWN_SUPPORT');
    kindCounts[kind] = (kindCounts[kind] || 0) + 1;
    if (candidate.byGeometry) geometryCount += 1; else metadataCount += 1;
    if (obj.userData.rvmRawSupportSuppressedByMode) {
      obj.visible = true;
      delete obj.userData.rvmRawSupportSuppressedByMode;
    }
  }

  if (mode === 'raw') {
    return {
      schema: 'rvm-support-symbol-mode/v2-raw-default',
      mode,
      supportDetectedCount: supports.length,
      supportHintCount: metadataCount,
      supportByGeometryCount: geometryCount,
      supportSymbolRenderedCount: 0,
      supportRawBoxSuppressedCount: 0,
      symbolCount: 0,
      rawHiddenCount: 0,
      kindCounts,
      rawDefaultNoGeneratedRoot: true,
    };
  }

  const symbolRoot = new THREE.Group();
  symbolRoot.name = SUPPORT_SYMBOL_ROOT;
  symbolRoot.userData.rvmSupportSymbolRoot = true;
  symbolRoot.userData.supportSymbol = true;
  symbolRoot.visible = true;

  let symbolCount = 0;
  let rawHiddenCount = 0;
  for (const obj of supports) {
    const candidate = classifySupportCandidate(obj);
    if (!candidate.support) continue;
    const kind = normalizeSupportKind(candidate.kind || obj.userData?.rvmSupportCandidateKind || 'UNKNOWN_SUPPORT');
    const symbol = buildSupportSymbolForObject(obj, kind, candidate.reason);
    if (symbol) {
      symbolRoot.add(symbol);
      symbolCount += 1;
    }
    if (mode === 'symbol') {
      if (obj.visible !== false) rawHiddenCount += 1;
      obj.userData.rvmRawSupportSuppressedByMode = true;
      obj.visible = false;
    }
  }

  if (symbolCount > 0 && viewer?.scene) viewer.scene.add(symbolRoot);
  else disposeObject(symbolRoot);

  return {
    schema: 'rvm-support-symbol-mode/v2-raw-default',
    mode,
    supportDetectedCount: supports.length,
    supportHintCount: metadataCount,
    supportByGeometryCount: geometryCount,
    supportSymbolRenderedCount: symbolCount,
    supportRawBoxSuppressedCount: rawHiddenCount,
    symbolCount,
    rawHiddenCount,
    kindCounts,
  };
}

function buildSupportSymbolForObject(obj, kind, reason = '') {
  const box = worldBoxFor(obj);
  if (!box) return null;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const dims = { x: Math.abs(size.x), y: Math.abs(size.y), z: Math.abs(size.z) };
  const largest = Math.max(dims.x, dims.y, dims.z, 0.2);
  const second = [dims.x, dims.y, dims.z].sort((a, b) => b - a)[1] || 0.15;
  const s = clamp(Math.max(second * 1.6, largest * 0.14, 0.12), 0.10, 0.75);
  const color = SUPPORT_KIND_COLORS[kind] || SUPPORT_KIND_COLORS.UNKNOWN_SUPPORT;
  const group = new THREE.Group();
  group.name = `RVM_SUPPORT_SYMBOL_${kind}_${obj.uuid}`;
  group.userData = {
    supportSymbol: true,
    rvmSupportSymbolGenerated: true,
    rvmSupportSourceUuid: obj.uuid,
    supportKind: kind,
    supportReason: reason,
  };

  const vertical = dominantAxisVector(size);
  const base = new THREE.Vector3(center.x, center.y, center.z).add(vertical.clone().multiplyScalar(-largest * 0.5));
  const top = new THREE.Vector3(center.x, center.y, center.z).add(vertical.clone().multiplyScalar(largest * 0.5));
  const side = choosePerpendicular(vertical);
  const other = new THREE.Vector3().crossVectors(vertical, side).normalize();

  group.add(makePost(base, top, s * 0.08, color));
  group.add(makePlate(base, side, other, vertical, s, color, 'BASE_PLATE'));
  const head = base.clone().lerp(top, 0.88);
  if (kind === 'GUIDE') {
    group.add(makeBlock(head.clone().add(side.clone().multiplyScalar(-s * 0.45)), side, other, vertical, s * 0.30, s * 0.72, s * 0.85, color, 'GUIDE_SIDE_A'));
    group.add(makeBlock(head.clone().add(side.clone().multiplyScalar(s * 0.45)), side, other, vertical, s * 0.30, s * 0.72, s * 0.85, color, 'GUIDE_SIDE_B'));
  } else if (kind === 'LINESTOP' || kind === 'LIMIT') {
    group.add(makeBlock(head.clone().add(other.clone().multiplyScalar(-s * 0.42)), side, other, vertical, s * 0.75, s * 0.24, s * 0.85, color, 'STOP_BLOCK_A'));
    group.add(makeBlock(head.clone().add(other.clone().multiplyScalar(s * 0.42)), side, other, vertical, s * 0.75, s * 0.24, s * 0.85, color, 'STOP_BLOCK_B'));
  } else if (kind === 'ANCHOR') {
    group.add(makeBlock(head, side, other, vertical, s * 0.75, s * 0.75, s * 0.55, color, 'ANCHOR_BLOCK'));
  } else if (kind === 'SPRING') {
    group.add(makeSpring(center, vertical, s * 0.22, largest * 0.55, color));
  } else {
    group.add(makePlate(head, side, other, vertical, s * 0.78, color, 'REST_TOP_PLATE'));
  }

  const sourceData = obj.userData || {};
  group.userData.sourcePath = sourceData.sourcePath || sourceData.browserRvmProperties?.sourcePath || '';
  group.userData.displayName = sourceData.displayName || sourceData.browserRvmProperties?.displayName || sourceData.name || obj.name || '';
  return group;
}

function dominantAxisVector(size) {
  const ax = Math.abs(size.x), ay = Math.abs(size.y), az = Math.abs(size.z);
  if (ay >= ax && ay >= az) return new THREE.Vector3(0, Math.sign(size.y) || 1, 0);
  if (az >= ax && az >= ay) return new THREE.Vector3(0, 0, Math.sign(size.z) || 1);
  return new THREE.Vector3(Math.sign(size.x) || 1, 0, 0);
}

function choosePerpendicular(axis) {
  const a = axis.clone().normalize();
  const trial = Math.abs(a.y) < 0.8 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  return new THREE.Vector3().crossVectors(a, trial).normalize();
}

function createMaterial(color, opacity = 0.92) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.08, roughness: 0.65, metalness: 0.08, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
}

function orientAlong(mesh, localAxis, targetAxis) {
  mesh.quaternion.setFromUnitVectors(localAxis.clone().normalize(), targetAxis.clone().normalize());
}

function makePost(start, end, radius, color) {
  const dir = new THREE.Vector3().subVectors(end, start);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, Math.max(len, 0.01), 12), createMaterial(color, 0.95));
  mesh.name = 'SUPPORT_POST_SYMBOL';
  mesh.position.copy(start.clone().lerp(end, 0.5));
  orientAlong(mesh, new THREE.Vector3(0, 1, 0), dir.lengthSq() > 1e-9 ? dir : new THREE.Vector3(0, 1, 0));
  return mesh;
}

function makePlate(center, side, other, vertical, size, color, name) {
  return makeBlock(center, side, other, vertical, size * 1.2, size * 0.85, size * 0.12, color, name, 0.88);
}

function makeBlock(center, side, other, vertical, sx, sy, sz, color, name, opacity = 0.92) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(sx, 0.01), Math.max(sy, 0.01), Math.max(sz, 0.01)), createMaterial(color, opacity));
  mesh.name = name;
  mesh.position.copy(center);
  const basis = new THREE.Matrix4().makeBasis(side.clone().normalize(), other.clone().normalize(), vertical.clone().normalize());
  mesh.quaternion.setFromRotationMatrix(basis);
  return mesh;
}

function makeSpring(center, axis, radius, length, color) {
  const group = new THREE.Group();
  group.name = 'SPRING_SYMBOL';
  const turns = 5;
  const points = [];
  for (let i = 0; i <= turns * 20; i += 1) {
    const t = i / (turns * 20);
    const angle = t * Math.PI * 2 * turns;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, (t - 0.5) * length, Math.sin(angle) * radius));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 90, Math.max(radius * 0.12, 0.01), 8, false), createMaterial(color, 0.95));
  mesh.position.copy(center);
  orientAlong(mesh, new THREE.Vector3(0, 1, 0), axis);
  group.add(mesh);
  return group;
}

function setSupportMode(root, mode) {
  const normalized = ['raw', 'symbol', 'both'].includes(mode) ? mode : 'raw';
  root.dataset.rvmSupportMode = normalized;
  try { localStorage.setItem(SUPPORT_MODE_STORAGE_KEY, normalized); } catch (_) {}
  root.dataset.rvmSupportSummaryBridge = '';
}

function getSupportMode(root) {
  if (root?.dataset?.rvmSupportMode) return root.dataset.rvmSupportMode;
  let saved = 'raw';
  try { saved = localStorage.getItem(SUPPORT_MODE_STORAGE_KEY) || 'raw'; } catch (_) {}
  const normalized = ['raw', 'symbol', 'both'].includes(saved) ? saved : 'raw';
  if (root) root.dataset.rvmSupportMode = normalized;
  return normalized;
}

function renderSupportSummary(root, viewer, supports, diagnostics, mode) {
  const chip = root.querySelector('[data-rvm-status-chip="supports"]');
  if (chip) chip.textContent = `Supports: ${supports.length}`;
  const panel = root.querySelector('#rvm-support-summary');
  if (!panel) return;
  const controls = `
    <div class="rvm-support-mode-row" role="group" aria-label="Support render mode">
      <button type="button" class="rvm-btn ${mode === 'raw' ? 'is-active' : ''}" data-rvm-support-mode="raw">Raw</button>
      <button type="button" class="rvm-btn ${mode === 'symbol' ? 'is-active' : ''}" data-rvm-support-mode="symbol">Symbol</button>
      <button type="button" class="rvm-btn ${mode === 'both' ? 'is-active' : ''}" data-rvm-support-mode="both">Both</button>
    </div>
    <div class="rvm-support-diag-strip">Symbols ${diagnostics.supportSymbolRenderedCount || 0} · Geometry ${diagnostics.supportByGeometryCount || 0} · Raw hidden ${diagnostics.supportRawBoxSuppressedCount || 0}</div>`;
  if (!supports.length) {
    panel.innerHTML = `${controls}<div class="rvm-empty-state">No supports detected in rendered RVM objects.</div>`;
    bindSupportControls(panel, root, viewer);
    return;
  }
  const rows = supports.slice(0, 40).map((obj) => {
    const data = obj.userData || {};
    const attrs = getAttrs(obj);
    const label = data.displayName || data.browserRvmProperties?.displayName || attrs.NAME || obj.name || 'Support';
    const kind = normalizeSupportKind(data.rvmSupportCandidateKind || attrs.RVM_BROWSER_SUPPORT_KIND || data.kind || attrs.RVM_PRIMITIVE_KIND || 'SUPPORT');
    const reason = data.rvmSupportCandidateReason || (data.rvmSupportCandidateByGeometry ? 'geometry' : 'metadata');
    return `<button type="button" class="rvm-support-summary-row" data-rvm-support-object="${escapeHtml(obj.uuid)}"><span>${escapeHtml(kind)}</span><b>${escapeHtml(label)}</b><em>${escapeHtml(reason)}</em></button>`;
  }).join('');
  const suffix = supports.length > 40 ? `<div class="rvm-empty-state">Showing 40 of ${supports.length} support-like objects.</div>` : '';
  panel.innerHTML = `${controls}<div class="rvm-support-summary-list">${rows}</div>${suffix}`;
  bindSupportControls(panel, root, viewer, supports);
}

function bindSupportControls(panel, root, viewer, supports = collectSupportObjects(viewer)) {
  panel.querySelectorAll('[data-rvm-support-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      setSupportMode(root, button.dataset.rvmSupportMode);
      const mode = getSupportMode(root);
      const nextSupports = collectSupportObjects(viewer);
      const diagnostics = rebuildSupportSymbols(viewer, nextSupports, mode);
      renderSupportSummary(root, viewer, nextSupports, diagnostics, mode);
    });
  });
  panel.querySelectorAll('[data-rvm-support-object]').forEach((button) => {
    button.addEventListener('click', () => {
      const uuid = button.dataset.rvmSupportObject;
      const obj = supports.find((item) => item.uuid === uuid) || findObjectByUuid(viewer, uuid);
      const api = globalThis.__PCF_GLB_RVM_INTERACTION__;
      if (obj && api?.setSelectionFromObjects) {
        api.setSelectionFromObjects([obj], { sourceObject: obj });
        api.fitSelection?.();
        panel.querySelectorAll('.rvm-support-summary-row.is-selected').forEach((row) => row.classList.remove('is-selected'));
        button.classList.add('is-selected');
      }
    });
  });
}

function findObjectByUuid(viewer, uuid) {
  let found = null;
  viewer?.modelGroup?.traverse?.((obj) => { if (!found && obj.uuid === uuid) found = obj; });
  return found;
}

function normalizeSupportKind(kind) {
  const text = String(kind || '').toUpperCase();
  if (text.includes('GUIDE')) return 'GUIDE';
  if (text.includes('LINESTOP') || text.includes('LINE STOP')) return 'LINESTOP';
  if (text.includes('LIMIT')) return 'LIMIT';
  if (text.includes('ANCHOR')) return 'ANCHOR';
  if (text.includes('SPRING') || text.includes('HANGER')) return 'SPRING';
  if (text.includes('REST') || text.includes('SHOE') || text.includes('GEOMETRY')) return 'REST';
  return text || 'UNKNOWN_SUPPORT';
}

function disposeObject(root) {
  root?.traverse?.((obj) => {
    obj.geometry?.dispose?.();
    const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
    mats.forEach((mat) => mat?.dispose?.());
  });
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function escapeHtml(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }

function injectStyles() {
  if (document.getElementById('rvm-support-symbol-mode-style')) return;
  const style = document.createElement('style');
  style.id = 'rvm-support-symbol-mode-style';
  style.textContent = `
    .rvm-support-mode-row { display:flex; gap:6px; flex-wrap:wrap; margin:4px 0 8px; }
    .rvm-support-mode-row .rvm-btn { padding:4px 8px; font-size:11px; }
    .rvm-support-mode-row .rvm-btn.is-active { outline:1px solid rgba(96,165,250,.9); background:rgba(37,99,235,.34); }
    .rvm-support-diag-strip { color:#9fb6d9; font-size:10.5px; margin:0 0 8px; }
    .rvm-support-summary-list { display:grid; gap:4px; }
    .rvm-support-summary-row { display:grid; grid-template-columns:max-content minmax(0,1fr); gap:6px; align-items:center; width:100%; text-align:left; border:1px solid rgba(91,119,158,.35); background:rgba(15,23,42,.55); color:#dbeafe; border-radius:7px; padding:5px 7px; cursor:pointer; }
    .rvm-support-summary-row:hover, .rvm-support-summary-row.is-selected { border-color:rgba(96,165,250,.8); background:rgba(37,99,235,.24); }
    .rvm-support-summary-row span { border-radius:999px; padding:1px 5px; background:rgba(94,229,106,.18); color:#bbf7d0; font-size:10px; font-weight:700; }
    .rvm-support-summary-row b { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:11px; }
    .rvm-support-summary-row em { grid-column:2; color:#94a3b8; font-size:10px; font-style:normal; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  `;
  document.head.appendChild(style);
}
