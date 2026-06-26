import * as THREE from 'three';

const BRIDGE_VERSION = '20260620-rvm-support-assembly-dish-1';
const SUPPORT_ASSEMBLY_ROOT = '__RVM_SUPPORT_ASSEMBLY_MARKERS__';
const SUPPORT_WORDS_RE = /\b(SUPPORT|SUPP|GUIDE|ANCHOR|LINE\s*STOP|LINESTOP|LIMIT\s*STOP|LIMIT|REST|SHOE|HANGER|SPRING|CLAMP|TRUNNION|SADDLE|DUMMY|U[-_ ]?BOLT|STANCHION|PEDESTAL|POST|BASE\s*PLATE)\b/i;
const PIPING_WORDS_RE = /\b(PIPE|CYLINDER|ELBOW|BEND|FLANGE|VALVE|TEE|GASKET|REDUCER)\b/i;

export function installRvmSupportAssemblyBridge() {
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
  if (!root || root.dataset.rvmSupportAssemblyBridge === BRIDGE_VERSION) return;
  root.dataset.rvmSupportAssemblyBridge = BRIDGE_VERSION;
  let lastKey = '';
  const tick = () => {
    const candidates = collectSupportCandidates(viewer);
    const assemblies = groupSupportCandidates(candidates);
    const diagnostics = renderAssemblyMarkers(viewer, assemblies);
    const payload = {
      schema: 'rvm-support-assembly/v1',
      version: BRIDGE_VERSION,
      supportCandidateCount: candidates.length,
      supportAssemblyCount: assemblies.length,
      supportGroupedPrimitiveCount: assemblies.reduce((sum, item) => sum + item.objects.length, 0),
      supportUngroupedPrimitiveCount: assemblies.filter((item) => item.objects.length === 1).length,
      supportContactPointResolvedCount: assemblies.filter((item) => item.contactPoint).length,
      supportSymbolPlacementSource: 'geometry-grouped-world-bounds',
      kindCounts: kindCounts(assemblies),
      ...diagnostics,
    };
    globalThis.__PCF_GLB_RVM_SUPPORT_ASSEMBLY_DIAGNOSTICS__ = payload;
    try { globalThis.dispatchEvent?.(new CustomEvent('rvm-support-assembly-diagnostics', { detail: payload })); } catch (_) {}
    const key = `${payload.supportCandidateCount}|${payload.supportAssemblyCount}|${payload.supportGroupedPrimitiveCount}|${payload.supportContactPointResolvedCount}`;
    if (key !== lastKey) {
      lastKey = key;
      appendDiagnostics(root, payload);
      augmentSupportSummaryRows(root, viewer, assemblies);
    }
  };
  const timer = setInterval(tick, 1500);
  root._rvmSupportAssemblyCleanup = () => clearInterval(timer);
  for (const delay of [250, 900, 2200, 4800]) setTimeout(tick, delay);
}

function collectSupportCandidates(viewer) {
  const out = [];
  viewer?.modelGroup?.updateMatrixWorld?.(true);
  viewer?.modelGroup?.traverse?.((obj) => {
    if (!obj?.isMesh || obj.userData?.supportSymbol || obj.userData?.rvmSupportSymbolGenerated || obj.userData?.rvmHiddenByUser) return;
    const data = obj.userData || {};
    if (data.rvmSupportCandidate || data.RVM_BROWSER_SUPPORT_HINT === 'true') {
      const box = worldBoxFor(obj);
      if (box) out.push(candidateFromObject(obj, box, data.rvmSupportCandidateKind || 'UNKNOWN_SUPPORT', 'existing-support-candidate'));
      return;
    }
    const attrs = getAttrs(obj);
    const text = supportText(obj, attrs);
    if (PIPING_WORDS_RE.test(`${attrs.TYPE || ''} ${attrs.RVM_PRIMITIVE_KIND || ''}`) && !SUPPORT_WORDS_RE.test(text)) return;
    const explicit = SUPPORT_WORDS_RE.test(text);
    const box = worldBoxFor(obj);
    if (!box) return;
    const geom = supportGeometry(box, attrs, obj);
    if (!explicit && !geom.support) return;
    out.push(candidateFromObject(obj, box, explicit ? supportKindFromText(text) || geom.kind || 'UNKNOWN_SUPPORT' : geom.kind, explicit ? 'metadata' : geom.reason));
  });
  return out;
}

function candidateFromObject(obj, box, kind, reason) {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const dims = [Math.abs(size.x), Math.abs(size.y), Math.abs(size.z)];
  const verticalAxis = largestAxis(dims);
  const bottom = center.clone();
  bottom.setComponent(verticalAxis, box.min.getComponent(verticalAxis));
  const top = center.clone();
  top.setComponent(verticalAxis, box.max.getComponent(verticalAxis));
  return { object: obj, uuid: obj.uuid, box, size, center, bottom, top, kind: normalizeKind(kind), reason, verticalAxis };
}

function groupSupportCandidates(candidates) {
  const groups = [];
  const used = new Set();
  for (const item of candidates) {
    if (used.has(item.uuid)) continue;
    const group = [item];
    used.add(item.uuid);
    for (const other of candidates) {
      if (used.has(other.uuid)) continue;
      if (sameSupportAssembly(item, other)) {
        group.push(other);
        used.add(other.uuid);
      }
    }
    groups.push(buildAssembly(group));
  }
  return groups.sort((a, b) => a.center.lengthSq() - b.center.lengthSq());
}

function sameSupportAssembly(a, b) {
  const horizontalDistance = Math.hypot(a.center.x - b.center.x, a.center.z - b.center.z);
  const verticalDistance = Math.abs(a.center.y - b.center.y);
  const size = Math.max(a.size.length(), b.size.length(), 0.5);
  if (horizontalDistance <= Math.max(0.75, size * 0.45) && verticalDistance <= Math.max(2.5, size * 1.2)) return true;
  const boxesNear = a.box.distanceToPoint(b.center) <= Math.max(0.5, b.size.length() * 0.25) || b.box.distanceToPoint(a.center) <= Math.max(0.5, a.size.length() * 0.25);
  return boxesNear;
}

function buildAssembly(items) {
  const box = new THREE.Box3();
  const kindRank = { ANCHOR: 6, LINESTOP: 5, LIMIT: 4, GUIDE: 3, SPRING: 2, REST: 1, GEOMETRY: 0, UNKNOWN_SUPPORT: 0 };
  let kind = 'UNKNOWN_SUPPORT';
  for (const item of items) {
    box.union(item.box);
    if ((kindRank[item.kind] || 0) >= (kindRank[kind] || 0)) kind = item.kind;
  }
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const verticalAxis = largestAxis([Math.abs(size.x), Math.abs(size.y), Math.abs(size.z)]);
  const contactPoint = center.clone();
  contactPoint.setComponent(verticalAxis, box.max.getComponent(verticalAxis));
  const id = items.map((item) => item.uuid).sort().join('|');
  return { id, kind, objects: items.map((item) => item.object), objectUuids: items.map((item) => item.uuid), box, center, size, contactPoint, verticalAxis };
}

function renderAssemblyMarkers(viewer, assemblies) {
  const previous = viewer?.scene?.getObjectByName(SUPPORT_ASSEMBLY_ROOT);
  if (previous) {
    viewer.scene.remove(previous);
    disposeObject(previous);
  }
  const root = new THREE.Group();
  root.name = SUPPORT_ASSEMBLY_ROOT;
  root.userData.supportSymbol = true;
  root.userData.rvmSupportAssemblyRoot = true;
  let markerCount = 0;
  for (const assembly of assemblies) {
    const marker = makeAssemblyMarker(assembly);
    if (marker) {
      root.add(marker);
      markerCount += 1;
    }
  }
  if (markerCount && viewer?.scene) viewer.scene.add(root);
  else disposeObject(root);
  return { supportAssemblyMarkerCount: markerCount };
}

function makeAssemblyMarker(assembly) {
  const s = clamp(Math.max(assembly.size.length() * 0.04, 0.08), 0.06, 0.45);
  const group = new THREE.Group();
  group.name = `RVM_SUPPORT_ASSEMBLY_${assembly.kind}`;
  group.userData = { supportSymbol: true, rvmSupportAssembly: true, supportKind: assembly.kind, supportAssemblyId: assembly.id, sourceUuids: assembly.objectUuids };
  const material = new THREE.MeshBasicMaterial({ color: colorForKind(assembly.kind), transparent: true, opacity: 0.9, depthTest: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(s, s * 0.06, 8, 32), material);
  ring.position.copy(assembly.contactPoint || assembly.center);
  ring.rotation.x = Math.PI / 2;
  ring.userData = { ...group.userData, supportMarkerPart: 'CONTACT_RING' };
  const dot = new THREE.Mesh(new THREE.SphereGeometry(s * 0.18, 12, 8), material.clone());
  dot.position.copy(assembly.contactPoint || assembly.center);
  dot.userData = { ...group.userData, supportMarkerPart: 'CONTACT_DOT' };
  group.add(ring, dot);
  return group;
}

function appendDiagnostics(root, diagnostics) {
  const panel = root?.querySelector?.('#rvm-support-summary');
  if (!panel) return;
  let box = panel.querySelector('[data-rvm-support-assembly-diagnostics]');
  if (!box) {
    box = document.createElement('div');
    box.dataset.rvmSupportAssemblyDiagnostics = 'true';
    box.className = 'rvm-support-assembly-diag';
    panel.appendChild(box);
  }
  box.innerHTML = `<div class="rvm-support-assembly-title">Assembly diagnostics</div><div class="rvm-browser-diag-grid">
    ${row('Assemblies', diagnostics.supportAssemblyCount)}
    ${row('Grouped primitives', diagnostics.supportGroupedPrimitiveCount)}
    ${row('Ungrouped', diagnostics.supportUngroupedPrimitiveCount)}
    ${row('Contact points', diagnostics.supportContactPointResolvedCount)}
    ${row('Markers', diagnostics.supportAssemblyMarkerCount)}
  </div>`;
}

function augmentSupportSummaryRows(root, viewer, assemblies) {
  const panel = root?.querySelector?.('#rvm-support-summary');
  if (!panel) return;
  panel.querySelectorAll('[data-rvm-support-assembly-row]').forEach((node) => node.remove());
  if (!assemblies.length) return;
  const frag = document.createDocumentFragment();
  for (const [index, assembly] of assemblies.slice(0, 60).entries()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rvm-support-assembly-row';
    button.dataset.rvmSupportAssemblyRow = 'true';
    button.textContent = `${index + 1}. ${assembly.kind} (${assembly.objects.length})`;
    button.addEventListener('click', () => selectAssembly(root, viewer, assembly));
    frag.appendChild(button);
  }
  panel.appendChild(frag);
}

function selectAssembly(root, viewer, assembly) {
  const api = globalThis.__PCF_GLB_RVM_INTERACTION__;
  api?.setSelectionFromObjects?.(assembly.objects, { sourceObject: assembly.objects[0] });
  try { viewer?._fitBox?.(assembly.box); } catch (_) {}
  const status = root?.querySelector?.('#rvm-sb-msg');
  if (status) status.textContent = `Selected support assembly ${assembly.kind} (${assembly.objects.length} primitives)`;
}

function supportGeometry(box, attrs = {}, obj = null) {
  const size = box.getSize(new THREE.Vector3());
  const dims = [Math.abs(size.x), Math.abs(size.y), Math.abs(size.z)].sort((a, b) => a - b);
  const [a, b, c] = dims;
  if (!Number.isFinite(a + b + c) || c <= 0 || b <= 0) return { support: false, reason: 'bad-size' };
  const primitive = String(attrs.RVM_BROWSER_RENDER_PRIMITIVE || obj?.userData?.renderPrimitive || obj?.userData?.effectiveRenderPrimitive || '').toUpperCase();
  if (/PIPE|CYLINDER|ELBOW|FLANGE|VALVE|TEE/.test(primitive)) return { support: false, reason: 'piping-primitive' };
  const slender = c >= Math.max(b * 2.2, a * 3.4);
  const smallSection = a <= 0.85 && b <= 1.65;
  const plausibleLength = c >= 0.35 && c <= 15;
  const plateLike = c <= 3.5 && a <= 0.55 && b >= 0.18 && b <= 4.0;
  if (slender && smallSection && plausibleLength) return { support: true, kind: 'REST', reason: 'geometry-slender-post' };
  if (plateLike) return { support: true, kind: 'GUIDE', reason: 'geometry-plate' };
  return { support: false, reason: 'geometry-rejected' };
}

function worldBoxFor(obj) {
  try {
    obj.updateMatrixWorld?.(true);
    if (!obj.geometry?.boundingBox) obj.geometry?.computeBoundingBox?.();
    const localBox = obj.geometry?.boundingBox?.clone?.() || null;
    const worldBox = localBox ? localBox.applyMatrix4(obj.matrixWorld) : new THREE.Box3().setFromObject(obj);
    return worldBox && !worldBox.isEmpty() ? worldBox : null;
  } catch (_) { return null; }
}
function getAttrs(obj) { const data = obj?.userData || {}; const props = data.browserRvmProperties || {}; return { ...(data || {}), ...(data.browserRvmAttributes || {}), ...(props.attributes || {}), ...(data.attributes || {}) }; }
function supportText(obj, attrs = {}) { return [obj?.name, obj?.uuid, obj?.userData?.name, obj?.userData?.type, obj?.userData?.kind, obj?.userData?.sourcePath, obj?.userData?.displayName, attrs.TYPE, attrs.NAME, attrs.RVM_OWNER_NAME, attrs.RVM_OWNER_PATH, attrs.RVM_BROWSER_SUPPORT_HINT, attrs.RVM_BROWSER_SUPPORT_KIND].map((value) => String(value || '')).join(' '); }
function supportKindFromText(text) { const s = String(text || '').toUpperCase(); if (/GUIDE|GUID/.test(s)) return 'GUIDE'; if (/LINE\s*STOP|LINESTOP|STOPPER/.test(s)) return 'LINESTOP'; if (/LIMIT/.test(s)) return 'LIMIT'; if (/ANCHOR|FIXED/.test(s)) return 'ANCHOR'; if (/SPRING|HANGER/.test(s)) return 'SPRING'; if (/REST|SHOE|BASE\s*PLATE|SADDLE|PEDESTAL|STANCHION|POST/.test(s)) return 'REST'; return ''; }
function normalizeKind(kind) { const s = String(kind || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_'); if (s.includes('GUIDE')) return 'GUIDE'; if (s.includes('LINESTOP') || s.includes('LINE_STOP')) return 'LINESTOP'; if (s.includes('LIMIT')) return 'LIMIT'; if (s.includes('ANCHOR')) return 'ANCHOR'; if (s.includes('SPRING') || s.includes('HANGER')) return 'SPRING'; if (s.includes('REST') || s.includes('GEOMETRY')) return s.includes('GEOMETRY') ? 'GEOMETRY' : 'REST'; return s || 'UNKNOWN_SUPPORT'; }
function kindCounts(assemblies) { const out = {}; for (const item of assemblies) out[item.kind] = (out[item.kind] || 0) + 1; return out; }
function largestAxis(dims) { let axis = 0; let max = dims[0] || 0; for (let i = 1; i < 3; i += 1) if ((dims[i] || 0) > max) { max = dims[i]; axis = i; } return axis; }
function colorForKind(kind) { return ({ REST: 0x5ee56a, GEOMETRY: 0x74c0fc, GUIDE: 0x42d7ff, LINESTOP: 0xffb347, LIMIT: 0xffb347, ANCHOR: 0xf266ff, SPRING: 0xff6fae }[kind] || 0xb4d4ff); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function row(key, value) { return `<div class="rvm-browser-diag-row"><span>${escapeHtml(key)}</span><b>${escapeHtml(value)}</b></div>`; }
function escapeHtml(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
function disposeObject(root) { root?.traverse?.((obj) => { obj.geometry?.dispose?.(); if (obj.material?.dispose) obj.material.dispose(); }); }
function injectStyles() { if (document.getElementById('rvm-support-assembly-style')) return; const style = document.createElement('style'); style.id = 'rvm-support-assembly-style'; style.textContent = `.rvm-support-assembly-diag{margin-top:8px;padding-top:8px;border-top:1px solid rgba(148,163,184,.18)}.rvm-support-assembly-title{color:#93c5fd;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}.rvm-support-assembly-row{display:block;width:100%;text-align:left;margin:3px 0;padding:5px 7px;border:1px solid rgba(96,165,250,.22);border-radius:6px;background:rgba(15,23,42,.45);color:#dbeafe;font-size:11px}.rvm-support-assembly-row:hover{background:rgba(37,99,235,.24);border-color:rgba(147,197,253,.55)}`; document.head.appendChild(style); }
