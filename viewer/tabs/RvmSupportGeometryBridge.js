import * as THREE from 'three';

const CACHE_KEY = '20260622-rvm-support-geometry-raw-default-1';
const VERSION = 'rvm-support-geometry/v3-raw-default-opt-in';
const ROOT_NAME = '__RVM_EXPORTABLE_SUPPORT_GEOMETRY__';
const STORAGE_KEY = 'rvm_support_geometry_mode_v2';
const GLOBAL_KEY = '__PCF_GLB_RVM_SUPPORT_GEOMETRY_DIAGNOSTICS__';
const WORDS = /\b(SUPPORT|SUPP|GUIDE|ANCHOR|LINE\s*STOP|LINESTOP|LIMIT\s*STOP|LIMIT|REST|SHOE|HANGER|SPRING|CLAMP|TRUNNION|SADDLE|DUMMY|U[-_ ]?BOLT|STANCHION|PEDESTAL|POST|BASE\s*PLATE)\b/i;
const PIPE = /\b(PIPE|CYLINDER|ELBOW|BEND|TEE|VALVE|FLANGE|GASKET|REDUCER|TORUS|SPHERE)\b/i;
const COLORS = { REST: 0x5ee56a, GUIDE: 0x42d7ff, LINESTOP: 0xffb347, LIMIT: 0xffb347, ANCHOR: 0xf266ff, SPRING: 0xff6fae, UNKNOWN_SUPPORT: 0xb4d4ff };

export function installRvmSupportGeometryBridge() {
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
  if (!root) return;
  if (root.dataset.rvmSupportGeometryBridge === CACHE_KEY) return;
  root._rvmSupportGeometryCleanup?.();
  root.dataset.rvmSupportGeometryBridge = CACHE_KEY;
  injectControls(root);
  let last = '';
  const tick = () => {
    const mode = getMode(root);
    const candidates = mode === 'off' ? [] : collectCandidates(viewer);
    const assemblies = mode === 'off' ? [] : groupCandidates(candidates);
    const diag = rebuildGeometry(viewer, assemblies, mode);
    diag.candidateCount = candidates.length;
    diag.assemblyCount = assemblies.length;
    diag.mode = mode;
    publish(diag);
    const key = `${mode}|${candidates.map((c) => `${c.uuid}:${c.object.visible}`).sort().join('|')}|${diag.generatedMeshCount}`;
    if (key !== last) { last = key; updatePanel(root, diag); }
    return diag;
  };
  const timer = setInterval(tick, 1400);
  const cleanup = () => {
    clearInterval(timer);
    if (root._rvmSupportGeometryRebuildNow === tick) delete root._rvmSupportGeometryRebuildNow;
    if (root._rvmSupportGeometryCleanup === cleanup) delete root._rvmSupportGeometryCleanup;
  };
  root._rvmSupportGeometryRebuildNow = tick;
  root._rvmSupportGeometryCleanup = cleanup;
  root.addEventListener?.('rvm-tab-dispose', cleanup, { once: true });
  for (const delay of [180, 900, 2200, 4500]) setTimeout(tick, delay);
}

function injectControls(root) {
  const ribbon = root?.querySelector?.('.geo-top-ribbon');
  if (!ribbon || root.querySelector('[data-rvm-support-geometry]')) return;
  const section = document.createElement('div');
  section.className = 'rvm-ribbon-section rvm-support-geometry-section';
  section.dataset.rvmSupportGeometry = CACHE_KEY;
  section.innerHTML = `<span class="rvm-ribbon-label">SupportGeom</span><div class="rvm-support-geometry-buttons" role="group" aria-label="Support geometry mode"><button class="rvm-btn" type="button" data-rvm-support-geometry-mode="off">Off</button><button class="rvm-btn" type="button" data-rvm-support-geometry-mode="overlay">Overlay</button><button class="rvm-btn" type="button" data-rvm-support-geometry-mode="replace">Replace</button><button class="rvm-btn" type="button" data-rvm-support-geometry-report="1">JSON</button></div>`;
  const search = ribbon.querySelector('.rvm-ribbon-search');
  ribbon.insertBefore(section, search || null);
  section.addEventListener('click', (event) => {
    const modeBtn = event.target?.closest?.('[data-rvm-support-geometry-mode]');
    const reportBtn = event.target?.closest?.('[data-rvm-support-geometry-report]');
    if (!modeBtn && !reportBtn) return;
    event.preventDefault(); event.stopPropagation();
    try {
      if (modeBtn) {
        setMode(root, modeBtn.dataset.rvmSupportGeometryMode);
        root._rvmSupportGeometryRebuildNow?.();
      } else {
        downloadJson(globalThis[GLOBAL_KEY] || { schema: VERSION, empty: true }, `rvm-support-geometry-${Date.now()}.json`);
      }
    } catch (error) {
      reportActionError(error, { action: 'support-geometry', mode: modeBtn?.dataset?.rvmSupportGeometryMode || 'json' });
    }
  });
}

function collectCandidates(viewer) {
  const out = [];
  viewer?.modelGroup?.updateMatrixWorld?.(true);
  viewer?.modelGroup?.traverse?.((obj) => {
    if (!obj?.isMesh || obj.userData?.rvmSupportGeometryGenerated || obj.userData?.supportSymbol || obj.userData?.rvmSupportSymbolGenerated) return;
    if (obj.userData?.rvmHiddenByUser) return;
    const attrs = attrsFor(obj);
    const text = supportText(obj, attrs);
    const explicit = obj.userData?.rvmSupportCandidate || attrs.RVM_BROWSER_SUPPORT_HINT === 'true' || WORDS.test(text);
    const typeText = `${attrs.TYPE || ''} ${obj.userData?.type || ''} ${obj.userData?.kind || ''} ${attrs.RVM_PRIMITIVE_KIND || ''}`;
    if (!explicit && PIPE.test(typeText)) return;
    const box = worldBox(obj);
    if (!box) return;
    const geom = geometrySupport(box, obj, attrs);
    if (!explicit && !geom.support) return;
    const kind = normalizeKind(explicit ? supportKind(text) || obj.userData?.rvmSupportCandidateKind || attrs.RVM_BROWSER_SUPPORT_KIND || geom.kind : geom.kind);
    out.push(candidate(obj, box, kind, explicit ? 'metadata' : geom.reason));
  });
  return out;
}

function candidate(object, box, kind, reason) {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  return { object, uuid: object.uuid, box, size, center, kind, reason };
}

function groupCandidates(items) {
  const groups = [], used = new Set();
  for (const item of items) {
    if (used.has(item.uuid)) continue;
    const group = [item]; used.add(item.uuid);
    for (const other of items) {
      if (used.has(other.uuid)) continue;
      if (near(item, other)) { group.push(other); used.add(other.uuid); }
    }
    groups.push(toAssembly(group));
  }
  return groups;
}

function near(a, b) {
  const d = a.center.distanceTo(b.center);
  const span = Math.max(a.size.length(), b.size.length(), 0.35);
  if (d <= Math.max(0.45, span * 0.75)) return true;
  return a.box.distanceToPoint(b.center) <= 0.35 || b.box.distanceToPoint(a.center) <= 0.35;
}

function toAssembly(items) {
  const box = new THREE.Box3();
  const rank = { ANCHOR: 6, LINESTOP: 5, LIMIT: 4, GUIDE: 3, SPRING: 2, REST: 1, UNKNOWN_SUPPORT: 0 };
  let kind = 'UNKNOWN_SUPPORT';
  for (const item of items) { box.union(item.box); if ((rank[item.kind] || 0) >= (rank[kind] || 0)) kind = item.kind; }
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  return { id: items.map((i) => i.uuid).sort().join('|'), items, kind, box, size, center };
}

function rebuildGeometry(viewer, assemblies, mode) {
  restoreRaw(viewer);
  removeRoot(viewer);
  const diag = { schema: VERSION, cacheKey: CACHE_KEY, generatedMeshCount: 0, rawHiddenCount: 0, kindCounts: {}, sourceObjectCount: 0, generatedRoot: ROOT_NAME, rawDefaultStorageKey: STORAGE_KEY };
  if (mode === 'off' || !viewer?.modelGroup) return diag;
  const root = new THREE.Group();
  root.name = ROOT_NAME;
  root.userData = { rvmSupportGeometryRoot: true, rvmSupportGeometryGenerated: true, schema: VERSION, displayName: 'Generated Support Geometry', optInOnly: true };
  for (const assembly of assemblies) {
    bump(diag.kindCounts, assembly.kind);
    diag.sourceObjectCount += assembly.items.length;
    const group = buildSupportGeometry(assembly);
    if (!group) continue;
    root.add(group);
    diag.generatedMeshCount += countMeshes(group);
    if (mode === 'replace') for (const item of assembly.items) { if (item.object.visible !== false) diag.rawHiddenCount += 1; item.object.userData.rvmSupportGeometryRawHidden = true; item.object.visible = false; }
  }
  if (root.children.length) viewer.modelGroup.add(root);
  else dispose(root);
  return diag;
}

function buildSupportGeometry(assembly) {
  const axis = dominantAxis(assembly.size);
  const side = perpendicular(axis), other = new THREE.Vector3().crossVectors(axis, side).normalize();
  const largest = Math.max(Math.abs(assembly.size.x), Math.abs(assembly.size.y), Math.abs(assembly.size.z), 0.25);
  const mid = assembly.center.clone();
  const start = mid.clone().add(axis.clone().multiplyScalar(-largest * 0.5));
  const end = mid.clone().add(axis.clone().multiplyScalar(largest * 0.5));
  const s = clamp(Math.max(secondDim(assembly.size) * 1.1, 0.12), 0.10, 0.65);
  const color = COLORS[assembly.kind] || COLORS.UNKNOWN_SUPPORT;
  const group = new THREE.Group();
  group.name = `RVM_SUPPORT_GEOMETRY_${assembly.kind}`;
  group.userData = meta(assembly, 'GROUP');
  group.add(post(start, end, s * 0.055, color, meta(assembly, 'POST')));
  group.add(block(start, side, other, axis, s * 1.15, s * 0.85, s * 0.10, color, meta(assembly, 'BASE_PLATE')));
  const head = start.clone().lerp(end, 0.90);
  if (assembly.kind === 'GUIDE') {
    group.add(block(head.clone().add(side.clone().multiplyScalar(-s * 0.48)), side, other, axis, s * 0.22, s * 0.85, s * 0.72, color, meta(assembly, 'GUIDE_A')));
    group.add(block(head.clone().add(side.clone().multiplyScalar(s * 0.48)), side, other, axis, s * 0.22, s * 0.85, s * 0.72, color, meta(assembly, 'GUIDE_B')));
  } else if (assembly.kind === 'LINESTOP' || assembly.kind === 'LIMIT') {
    group.add(block(head.clone().add(other.clone().multiplyScalar(-s * 0.42)), side, other, axis, s * 0.82, s * 0.22, s * 0.72, color, meta(assembly, 'STOP_A')));
    group.add(block(head.clone().add(other.clone().multiplyScalar(s * 0.42)), side, other, axis, s * 0.82, s * 0.22, s * 0.72, color, meta(assembly, 'STOP_B')));
  } else if (assembly.kind === 'ANCHOR') {
    group.add(block(head, side, other, axis, s * 0.9, s * 0.9, s * 0.45, color, meta(assembly, 'ANCHOR')));
  } else if (assembly.kind === 'SPRING') {
    group.add(spring(mid, axis, s * 0.18, largest * 0.55, color, meta(assembly, 'SPRING')));
  } else {
    group.add(block(head, side, other, axis, s * 0.9, s * 0.62, s * 0.14, color, meta(assembly, 'REST_TOP')));
  }
  return group;
}

function meta(assembly, part) {
  const first = assembly.items[0]?.object;
  return { rvmSupportGeometryGenerated: true, TYPE: 'SUPPORT', RVM_PRIMITIVE_KIND: 'SUPPORT', supportKind: assembly.kind, supportGeometryPart: part, sourceUuids: assembly.items.map((i) => i.uuid), sourcePath: first?.userData?.sourcePath || first?.userData?.browserRvmProperties?.sourcePath || '', displayName: `Support ${assembly.kind}` };
}

function post(a, b, r, color, userData) { const dir = b.clone().sub(a); const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.max(dir.length(), 0.01), 12), mat(color)); mesh.position.copy(a.clone().lerp(b, 0.5)); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.lengthSq() ? dir.clone().normalize() : new THREE.Vector3(0, 1, 0)); mesh.userData = userData; mesh.name = `SUPPORT_${userData.supportGeometryPart}`; return mesh; }
function block(c, side, other, axis, sx, sy, sz, color, userData) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(sx, 0.01), Math.max(sy, 0.01), Math.max(sz, 0.01)), mat(color)); mesh.position.copy(c); mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side.clone().normalize(), other.clone().normalize(), axis.clone().normalize())); mesh.userData = userData; mesh.name = `SUPPORT_${userData.supportGeometryPart}`; return mesh; }
function spring(c, axis, r, len, color, userData) { const pts = []; for (let i = 0; i <= 96; i++) { const t = i / 96, a = t * Math.PI * 10; pts.push(new THREE.Vector3(Math.cos(a) * r, (t - 0.5) * len, Math.sin(a) * r)); } const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, Math.max(r * 0.12, 0.008), 8), mat(color)); mesh.position.copy(c); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize()); mesh.userData = userData; mesh.name = 'SUPPORT_SPRING'; return mesh; }
function mat(color) { return new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.08 }); }

function geometrySupport(box, obj, attrs) {
  const size = box.getSize(new THREE.Vector3());
  const dims = [Math.abs(size.x), Math.abs(size.y), Math.abs(size.z)].sort((a, b) => a - b);
  const [a, b, c] = dims;
  if (!Number.isFinite(a + b + c) || c <= 0 || b <= 0) return { support: false, reason: 'bad-size' };
  const primitive = `${attrs.RVM_BROWSER_RENDER_PRIMITIVE || ''} ${obj.userData?.renderPrimitive || ''} ${obj.userData?.effectiveRenderPrimitive || ''}`.toUpperCase();
  if (/CYLINDER|PIPE|TORUS|SPHERE|DISH/.test(primitive)) return { support: false, reason: 'piping-primitive' };
  if (c >= Math.max(b * 2.2, a * 3.2) && a <= 0.9 && b <= 1.7 && c >= 0.35 && c <= 15) return { support: true, kind: 'REST', reason: 'geometry-slender' };
  if (c <= 3.5 && a <= 0.55 && b >= 0.18 && b <= 4.0) return { support: true, kind: 'GUIDE', reason: 'geometry-plate' };
  return { support: false, reason: 'geometry-rejected' };
}

function removeRoot(viewer) { const old = viewer?.modelGroup?.getObjectByName?.(ROOT_NAME); if (old) { viewer.modelGroup.remove(old); dispose(old); } }
function restoreRaw(viewer) { viewer?.modelGroup?.traverse?.((obj) => { if (obj?.userData?.rvmSupportGeometryRawHidden) { obj.visible = true; delete obj.userData.rvmSupportGeometryRawHidden; } }); }
function worldBox(obj) { try { obj.updateMatrixWorld?.(true); if (!obj.geometry?.boundingBox) obj.geometry?.computeBoundingBox?.(); const box = (obj.geometry?.boundingBox?.clone?.() || new THREE.Box3().setFromObject(obj)).applyMatrix4(obj.matrixWorld); return box && !box.isEmpty() ? box : null; } catch { return null; } }
function attrsFor(obj) { const d = obj?.userData || {}, p = d.browserRvmProperties || {}; return { ...(d || {}), ...(d.attributes || {}), ...(p.attributes || {}), ...(d.browserRvmAttributes || {}) }; }
function supportText(obj, attrs) { return [obj?.name, obj?.userData?.name, obj?.userData?.type, obj?.userData?.kind, obj?.userData?.sourcePath, obj?.userData?.displayName, attrs.TYPE, attrs.NAME, attrs.RVM_OWNER_NAME, attrs.RVM_OWNER_PATH, attrs.RVM_BROWSER_SUPPORT_KIND].map((v) => String(v || '')).join(' '); }
function supportKind(text) { const s = String(text || '').toUpperCase(); if (/GUIDE|GUID\b/.test(s)) return 'GUIDE'; if (/LINE\s*STOP|LINESTOP|STOPPER/.test(s)) return 'LINESTOP'; if (/LIMIT/.test(s)) return 'LIMIT'; if (/ANCHOR|FIXED/.test(s)) return 'ANCHOR'; if (/SPRING|HANGER/.test(s)) return 'SPRING'; if (/REST|SHOE|SADDLE|PEDESTAL|POST|BASE\s*PLATE/.test(s)) return 'REST'; return ''; }
function normalizeKind(kind) { const s = String(kind || '').toUpperCase(); if (s.includes('GUID')) return 'GUIDE'; if (s.includes('LINE')) return 'LINESTOP'; if (s.includes('LIMIT')) return 'LIMIT'; if (s.includes('ANCHOR')) return 'ANCHOR'; if (s.includes('SPRING') || s.includes('HANGER')) return 'SPRING'; if (s.includes('REST') || s.includes('SHOE') || s.includes('GEOMETRY')) return 'REST'; return s || 'UNKNOWN_SUPPORT'; }
function dominantAxis(size) { const x = Math.abs(size.x), y = Math.abs(size.y), z = Math.abs(size.z); if (y >= x && y >= z) return new THREE.Vector3(0, 1, 0); if (z >= x && z >= y) return new THREE.Vector3(0, 0, 1); return new THREE.Vector3(1, 0, 0); }
function perpendicular(axis) { const t = Math.abs(axis.y) < 0.8 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0); return new THREE.Vector3().crossVectors(axis, t).normalize(); }
function secondDim(size) { return [Math.abs(size.x), Math.abs(size.y), Math.abs(size.z)].sort((a, b) => b - a)[1] || 0.12; }
function countMeshes(root) { let n = 0; root.traverse?.((o) => { if (o.isMesh) n += 1; }); return n; }
function dispose(root) { root?.traverse?.((o) => { o.geometry?.dispose?.(); const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []); mats.forEach((m) => m?.dispose?.()); }); }
function setMode(root, mode) { const v = ['off', 'overlay', 'replace'].includes(mode) ? mode : 'off'; root.dataset.rvmSupportGeometryMode = v; root.dataset.rvmSupportGeometryUserSet = 'true'; try { localStorage.setItem(STORAGE_KEY, v); } catch {} }
function getMode(root) { if (root?.dataset?.rvmSupportGeometryMode) return root.dataset.rvmSupportGeometryMode; let v = 'off'; try { v = localStorage.getItem(STORAGE_KEY) || 'off'; } catch {} return ['off', 'overlay', 'replace'].includes(v) ? v : 'off'; }
function updatePanel(root, d) { root.querySelectorAll('[data-rvm-support-geometry-mode]').forEach((b) => b.classList.toggle('is-active', b.dataset.rvmSupportGeometryMode === d.mode)); const s = root.querySelector('#rvm-sb-msg'); if (s) s.textContent = d.mode === 'off' ? 'Support geometry off' : `Support geometry ${d.mode}: ${d.generatedMeshCount} generated mesh(es)`; }
function publish(d) { globalThis[GLOBAL_KEY] = d; try { globalThis.dispatchEvent?.(new CustomEvent('rvm-support-geometry-diagnostics', { detail: d })); } catch {} }
function reportActionError(error, context) { try { globalThis.__PCF_GLB_RVM_REPORT_ACTION_ERROR__?.(error, context); } catch (_) {} console.warn('[RVM SupportGeom] action failed', context, error); }
function downloadJson(value, name) { const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500); }
function bump(map, key) { const k = String(key || 'UNKNOWN_SUPPORT'); map[k] = (map[k] || 0) + 1; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function injectStyles() { if (document.getElementById('rvm-support-geometry-style')) return; const style = document.createElement('style'); style.id = 'rvm-support-geometry-style'; style.textContent = `.rvm-support-geometry-section .rvm-support-geometry-buttons{display:flex;gap:4px;flex-wrap:wrap}.rvm-support-geometry-section .rvm-btn{padding:4px 7px;font-size:11px}.rvm-support-geometry-section .rvm-btn.is-active{outline:1px solid rgba(96,165,250,.9);background:rgba(37,99,235,.34)}`; document.head.appendChild(style); }
