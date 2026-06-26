import * as THREE from 'three';

const CACHE_KEY = '20260622-rvm-raw-support-cylinder-guard-4-restore-inputxml-label-guard';
const GLOBAL_KEY = '__PCF_GLB_RVM_RAW_SUPPORT_CYLINDER_GUARD__';
const RAW_INPUTXML_SUPPORT_PRIMITIVES_KEY = 'rvm.rawInputXmlSupportPrimitives';
const SUPPORT_SYMBOL_ROOTS = new Set([
  '__RVM_SUPPORT_SYMBOLS__',
  '__RVM_GEOMETRY_SUPPORT_SYMBOLS__',
  '__RVM_SUPPORT_ASSEMBLY_MARKERS__'
]);
const PIPE_LIKE_RE = /\b(PE_\d+_(PIPE|BEND|ELBOW|VALVE|FLANGE|TEE|GASKET|REDUCER)|PIPE|BEND|ELBOW|VALVE|FLANGE|TEE)\b/i;
const SUPPORT_LIKE_RE = /\b(INPUTXML-\d+-(REST|GUIDE|LINESTOP|STOP|ANCHOR|SUPPORT)|SUPPORT|REST|GUIDE|LINE\s*STOP|LINESTOP|ANCHOR|SHOE)\b/i;
const INPUTXML_SUPPORT_PRIM_RE = /\bINPUTXML[-_ ]?\d+[-_ ]?(REST|GUIDE|LINESTOP|LINE\s*STOP|STOP|ANCHOR|LIMIT|LIM|SUPPORT|SHOE)\b/i;
const RVM_INPUTXML_SUPPORT_LABEL_RE = /\bRVM\s+(CYLINDER|PYRAMID|BOX|SPHERE|TORUS|SNOUT|FACET)\b[\s\S]*\bINPUTXML[-_ ]?\d+[-_ ]?(REST|GUIDE|LINESTOP|LINE\s*STOP|STOP|ANCHOR|LIMIT|LIM|SUPPORT|SHOE)\b/i;

export function installRvmRawSupportCylinderGuardBridge() {
  let attempts = 0;
  const attach = () => {
    attempts += 1;
    const root = document.querySelector('[data-rvm-viewer]');
    const viewer = globalThis.__3D_RVM_VIEWER__;
    if (root && viewer) bind(root, viewer);
    if ((!root || !viewer) && attempts < 180) setTimeout(attach, 300);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true });
  else attach();
}

function bind(root, viewer) {
  if (!root || root.dataset.rvmRawSupportCylinderGuard === CACHE_KEY) return;
  root.dataset.rvmRawSupportCylinderGuard = CACHE_KEY;
  const run = () => applyGuard(root, viewer);
  for (const delay of [120, 250, 900, 1800, 3600, 7000]) setTimeout(run, delay);
  const timer = setInterval(run, 1800);
  root._rvmRawSupportCylinderGuardCleanup = () => clearInterval(timer);
  globalThis[GLOBAL_KEY] = { cacheKey: CACHE_KEY, apply: run, last: null };
}

function applyGuard(root, viewer) {
  const diag = {
    schema: 'rvm-raw-support-cylinder-guard/v4-restore-inputxml-support-label-guard',
    cacheKey: CACHE_KEY,
    convertedSupportStandCount: 0,
    protectedRawCylinderCount: 0,
    hiddenInputXmlRawSupportPrimitiveCount: 0,
    restoredInputXmlRawSupportPrimitiveCount: 0,
    hiddenInputXmlRawSupportLabelCount: 0,
    restoredInputXmlRawSupportLabelCount: 0,
    clearedPipeLikeSupportCandidateCount: 0,
    removedRawModeSymbolRootCount: 0,
    hiddenPipeLikeGeneratedSymbolCount: 0,
    skippedMissingAxisCount: 0,
  };

  const supportMode = String(root?.dataset?.rvmSupportMode || '').toLowerCase() || currentSupportMode();
  const showRawInputXmlSupportPrimitives = rawInputXmlSupportPrimitivesEnabled();
  if (supportMode === 'raw') removeSupportSymbolRoots(viewer, diag);

  viewer?.modelGroup?.updateMatrixWorld?.(true);
  viewer?.modelGroup?.traverse?.((obj) => {
    if (!obj) return;
    const text = objectText(obj);
    if (isInputXmlSupportLabelObject(obj, text)) {
      if (showRawInputXmlSupportPrimitives) restoreInputXmlSupportLabelObject(obj, diag);
      else hideInputXmlSupportLabelObject(obj, diag);
      return;
    }
    if (isPipeLikeFalseSupport(obj, text)) {
      clearSupportCandidateFlags(obj);
      diag.clearedPipeLikeSupportCandidateCount += 1;
      return;
    }
    if (isInputXmlGeneratedRawSupportPrimitive(obj, text)) {
      if (showRawInputXmlSupportPrimitives) {
        if (restoreInputXmlRawSupportPrimitive(obj, diag)) diag.restoredInputXmlRawSupportPrimitiveCount += 1;
      } else {
        hideInputXmlRawSupportPrimitive(obj, diag);
        diag.hiddenInputXmlRawSupportPrimitiveCount += 1;
        return;
      }
    }
    if (!isRawSupportCylinderPreserved(obj)) return;
    diag.protectedRawCylinderCount += 1;
    const eff = String(obj.userData?.effectiveRenderPrimitive || '').toUpperCase();
    if (eff === 'SUPPORT_STAND' || obj.userData?.renderSource === 'support-preserved-rvm-cylinder-raw') {
      if (convertSupportStandToRawCylinder(obj)) diag.convertedSupportStandCount += 1;
      else diag.skippedMissingAxisCount += 1;
    }
  });

  viewer?.scene?.traverse?.((obj) => {
    if (!obj || obj.isScene) return;
    const text = objectText(obj);
    if (isInputXmlSupportLabelObject(obj, text)) {
      if (showRawInputXmlSupportPrimitives) restoreInputXmlSupportLabelObject(obj, diag);
      else hideInputXmlSupportLabelObject(obj, diag);
      return;
    }
    const data = obj.userData || {};
    if (!(data.supportSymbol || data.rvmSupportSymbolGenerated || data.rvmSupportAssembly)) return;
    if (PIPE_LIKE_RE.test(text) && !SUPPORT_LIKE_RE.test(text)) {
      obj.visible = false;
      data.rvmHiddenByRawSupportCylinderGuard = true;
      data.nonSelectableReason = 'pipe-like false support symbol hidden by raw support guard';
      diag.hiddenPipeLikeGeneratedSymbolCount += 1;
    }
  });

  sweepInputXmlSupportDomLabels(root, showRawInputXmlSupportPrimitives, diag);

  globalThis[GLOBAL_KEY] = { cacheKey: CACHE_KEY, apply: () => applyGuard(root, viewer), last: diag };
  return diag;
}

function removeSupportSymbolRoots(viewer, diag) {
  removeSupportSymbolRootsFrom(viewer?.scene, diag);
  removeSupportSymbolRootsFrom(viewer?.modelGroup, diag);
}

function removeSupportSymbolRootsFrom(parent, diag) {
  if (!parent?.getObjectByName) return;
  for (const name of SUPPORT_SYMBOL_ROOTS) {
    let root = parent.getObjectByName(name);
    while (root) {
      root.parent?.remove?.(root);
      disposeObject(root);
      diag.removedRawModeSymbolRootCount += 1;
      root = parent.getObjectByName(name);
    }
  }
}

function convertSupportStandToRawCylinder(obj) {
  if (obj.userData?.rvmRawSupportCylinderGuardConverted) return true;
  const attrs = attrsFor(obj);
  const start = parseVec3(attrs.RVM_BROWSER_AXIS_START || attrs.RVM_PRIMITIVE_AXIS_START || attrs.AXIS_START);
  const end = parseVec3(attrs.RVM_BROWSER_AXIS_END || attrs.RVM_PRIMITIVE_AXIS_END || attrs.AXIS_END);
  const radius = finiteNumber(attrs.RVM_BROWSER_RADIUS || attrs.RVM_PRIMITIVE_RADIUS || attrs.RADIUS) || fallbackRadiusFromObject(obj);
  if (!start || !end || !Number.isFinite(radius) || radius <= 0) return false;
  const axis = new THREE.Vector3().subVectors(end, start);
  const length = axis.length();
  if (!Number.isFinite(length) || length <= 1e-9) return false;

  while (obj.children?.length) {
    const child = obj.children.pop();
    if (child) disposeObject(child);
  }
  const material = rawSupportMaterial(obj);
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 12);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'RVM_RAW_SUPPORT_CYLINDER_PRESERVED';
  mesh.position.copy(new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize());
  mesh.userData = {
    ...(obj.userData || {}),
    rvmRawSupportCylinderGuardChild: true,
    effectiveRenderPrimitive: 'RVM_NATIVE_CYLINDER',
    renderQuality: 'direct-raw-support-cylinder',
    pickable: true,
  };
  obj.add(mesh);
  obj.userData.rvmRawSupportCylinderGuardConverted = true;
  obj.userData.effectiveRenderPrimitive = 'RVM_NATIVE_CYLINDER';
  obj.userData.renderQuality = 'direct-raw-support-cylinder';
  obj.userData.supportStandSuppressedReason = 'raw support code-8 cylinder preserved; generated support stand removed';
  return true;
}

function isRawSupportCylinderPreserved(obj) {
  const attrs = attrsFor(obj);
  return String(attrs.RVM_BROWSER_SUPPORT_RAW_CYLINDER_PRESERVED || obj.userData?.RVM_BROWSER_SUPPORT_RAW_CYLINDER_PRESERVED || '').toLowerCase() === 'true';
}

function isInputXmlGeneratedRawSupportPrimitive(obj, text = objectText(obj)) {
  const attrs = attrsFor(obj);
  const recordTag = String(attrs.RVM_RECORD_TAG || '').toUpperCase();
  const code = Number.parseInt(String(attrs.RVM_PRIMITIVE_CODE ?? attrs.RVM_BINARY_PRIMITIVE_CODE ?? '').trim(), 10);
  const primitive = String(attrs.RVM_BROWSER_RENDER_PRIMITIVE || obj?.userData?.renderPrimitive || obj?.userData?.effectiveRenderPrimitive || '').toUpperCase();
  const nativeLike = recordTag === 'PRIM'
    || Number.isFinite(code)
    || /RVM_(NATIVE_)?(CYLINDER|PYRAMID|BOX|SPHERE)|PIPE_CYLINDER|CYLINDER_BBOX/.test(primitive)
    || /^\s*RVM\s+(CYLINDER|PYRAMID|BOX|SPHERE|TORUS|SNOUT|FACET)/i.test(String(obj?.name || ''));
  return nativeLike && INPUTXML_SUPPORT_PRIM_RE.test(String(text || ''));
}

function hideInputXmlRawSupportPrimitive(obj, diag) {
  const data = obj.userData || {};
  obj.visible = false;
  data.rvmHiddenInputXmlRawSupportPrimitive = true;
  data.rvmDoNotLabel = true;
  data.rvmDoNotIndex = true;
  data.pickable = false;
  data.selectable = false;
  data.nonSelectableReason = 'InputXML-generated raw support primitive hidden by default; enable rvm.rawInputXmlSupportPrimitives to inspect file support markers';
  hideChildInputXmlSupportLabels(obj, diag);
}

function restoreInputXmlRawSupportPrimitive(obj, diag) {
  const data = obj.userData || {};
  if (!data.rvmHiddenInputXmlRawSupportPrimitive) return false;
  obj.visible = true;
  data.rvmHiddenInputXmlRawSupportPrimitive = false;
  data.rvmDoNotLabel = false;
  data.rvmDoNotIndex = false;
  data.pickable = true;
  data.selectable = true;
  delete data.nonSelectableReason;
  restoreChildInputXmlSupportLabels(obj, diag);
  return true;
}

function isInputXmlSupportLabelObject(obj, text = objectText(obj)) {
  if (!obj?.element && !obj?.isCSS2DObject && !obj?.userData?.rvmLabel && !obj?.userData?.supportSymbolLabel) return false;
  const labelText = labelObjectText(obj) || text;
  return isInputXmlSupportLabelText(labelText);
}

function isInputXmlSupportLabelText(value) {
  const text = String(value || '');
  return INPUTXML_SUPPORT_PRIM_RE.test(text) && (RVM_INPUTXML_SUPPORT_LABEL_RE.test(text) || /\bRVM\s+(CYLINDER|PYRAMID|BOX|SPHERE|TORUS|SNOUT|FACET)\b/i.test(text));
}

function labelObjectText(obj) {
  return [
    obj?.element?.textContent,
    obj?.name,
    obj?.userData?.displayName,
    obj?.userData?.name,
    obj?.userData?.sourcePath,
  ].map((value) => String(value || '')).join(' ');
}

function hideChildInputXmlSupportLabels(root, diag) {
  root?.traverse?.((child) => {
    if (child === root) return;
    if (isInputXmlSupportLabelObject(child)) hideInputXmlSupportLabelObject(child, diag);
  });
}

function restoreChildInputXmlSupportLabels(root, diag) {
  root?.traverse?.((child) => {
    if (child === root) return;
    if (child?.userData?.rvmHiddenInputXmlSupportLabel) restoreInputXmlSupportLabelObject(child, diag);
  });
}

function hideInputXmlSupportLabelObject(obj, diag) {
  const data = obj.userData || {};
  if (!data.rvmHiddenInputXmlSupportLabel) diag.hiddenInputXmlRawSupportLabelCount += 1;
  obj.visible = false;
  data.rvmHiddenInputXmlSupportLabel = true;
  data.rvmInteractionIgnore = true;
  data.pickable = false;
  data.selectable = false;
  if (obj.element?.style) {
    if (!Object.prototype.hasOwnProperty.call(data, 'rvmInputXmlSupportLabelPreviousDisplay')) {
      data.rvmInputXmlSupportLabelPreviousDisplay = obj.element.style.display || '';
    }
    obj.element.style.display = 'none';
    obj.element.setAttribute('aria-hidden', 'true');
    obj.element.dataset.rvmHiddenInputXmlSupportLabel = 'true';
  }
}

function restoreInputXmlSupportLabelObject(obj, diag) {
  const data = obj.userData || {};
  if (!data.rvmHiddenInputXmlSupportLabel) return;
  obj.visible = true;
  data.rvmHiddenInputXmlSupportLabel = false;
  data.rvmInteractionIgnore = false;
  if (obj.element?.style) {
    obj.element.style.display = data.rvmInputXmlSupportLabelPreviousDisplay || '';
    obj.element.removeAttribute('aria-hidden');
    delete obj.element.dataset.rvmHiddenInputXmlSupportLabel;
  }
  diag.restoredInputXmlRawSupportLabelCount += 1;
}

function sweepInputXmlSupportDomLabels(root, show, diag) {
  const seen = new WeakSet();
  const selectors = [
    '.rvm-support-symbol-label',
    '.rvm-object-label',
    '.rvm-label',
    '.css2d-label',
    '[data-rvm-label]',
    '[data-rvm-object-label]',
    '[data-rvm-support-label]',
    '.rvm-canvas-label',
    '.rvm-object-badge'
  ].join(',');
  const candidates = [
    ...Array.from(root?.querySelectorAll?.(selectors) || []),
    ...Array.from(root?.querySelectorAll?.('div,span') || []).filter((el) => isLikelyViewportBadge(el)),
  ];
  for (const el of candidates) {
    if (!el || seen.has(el)) continue;
    seen.add(el);
    const text = el.textContent || '';
    if (!isInputXmlSupportLabelText(text)) continue;
    if (show) restoreDomLabel(el, diag);
    else hideDomLabel(el, diag);
  }
}

function isLikelyViewportBadge(el) {
  const text = String(el?.textContent || '');
  if (!isInputXmlSupportLabelText(text)) return false;
  const cls = String(el.className || '');
  const style = el.getAttribute?.('style') || '';
  return /label|badge|tag|css2d|tooltip|annotation/i.test(cls) || /position\s*:\s*absolute|transform\s*:/i.test(style);
}

function hideDomLabel(el, diag) {
  if (!el.dataset.rvmHiddenInputXmlSupportLabel) {
    el.dataset.rvmPreviousDisplay = el.style.display || '';
    diag.hiddenInputXmlRawSupportLabelCount += 1;
  }
  el.dataset.rvmHiddenInputXmlSupportLabel = 'true';
  el.style.display = 'none';
  el.setAttribute('aria-hidden', 'true');
}

function restoreDomLabel(el, diag) {
  if (!el.dataset.rvmHiddenInputXmlSupportLabel) return;
  el.style.display = el.dataset.rvmPreviousDisplay || '';
  delete el.dataset.rvmHiddenInputXmlSupportLabel;
  delete el.dataset.rvmPreviousDisplay;
  el.removeAttribute('aria-hidden');
  diag.restoredInputXmlRawSupportLabelCount += 1;
}

function isPipeLikeFalseSupport(obj, text) {
  if (!PIPE_LIKE_RE.test(text)) return false;
  if (SUPPORT_LIKE_RE.test(text)) return false;
  const data = obj.userData || {};
  return Boolean(data.rvmSupportCandidate || data.RVM_BROWSER_SUPPORT_HINT === 'true' || data.rvmSupportCandidateKind || data.rvmSupportEngineMapped);
}

function clearSupportCandidateFlags(obj) {
  const data = obj.userData || {};
  for (const key of [
    'rvmSupportCandidate',
    'rvmSupportCandidateKind',
    'rvmSupportCandidateReason',
    'rvmSupportCandidateByGeometry',
    'rvmSupportEngineMapped',
    'rvmSupportEngineConfidence',
    'RVM_BROWSER_SUPPORT_HINT',
    'RVM_BROWSER_SUPPORT_KIND',
  ]) delete data[key];
  const attrs = data.browserRvmAttributes;
  if (attrs && typeof attrs === 'object') {
    for (const key of ['TYPE', 'SUPPORT_KIND', 'RVM_BROWSER_SUPPORT_HINT', 'RVM_BROWSER_SUPPORT_KIND', 'supportStagedJsonRole', 'supportEngineSchema']) delete attrs[key];
  }
}

function attrsFor(obj) {
  const data = obj?.userData || {};
  const props = data.browserRvmProperties || {};
  return { ...(data || {}), ...(data.browserRvmAttributes || {}), ...(props.attributes || {}), ...(data.attributes || {}) };
}

function objectText(obj) {
  const attrs = attrsFor(obj);
  return [
    obj?.name,
    obj?.userData?.displayName,
    obj?.userData?.sourcePath,
    obj?.userData?.type,
    obj?.userData?.kind,
    obj?.userData?.effectiveRenderPrimitive,
    obj?.element?.textContent,
    attrs.NAME,
    attrs.TYPE,
    attrs.RVM_RECORD_TAG,
    attrs.RVM_PRIMITIVE_CODE,
    attrs.RVM_OWNER_NAME,
    attrs.RVM_OWNER_PATH,
    attrs.RVM_BROWSER_SUPPORT_KIND,
  ].map((value) => String(value || '')).join(' ');
}

function parseVec3(value) {
  if (!value) return null;
  if (value.isVector3) return value.clone();
  if (typeof value === 'object') {
    const x = Number(value.x), y = Number(value.y), z = Number(value.z);
    if ([x, y, z].every(Number.isFinite)) return new THREE.Vector3(x, y, z);
  }
  const nums = String(value).match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi)?.map(Number) || [];
  if (nums.length >= 3 && nums.slice(0, 3).every(Number.isFinite)) return new THREE.Vector3(nums[0], nums[1], nums[2]);
  return null;
}

function fallbackRadiusFromObject(obj) {
  try {
    obj.updateMatrixWorld?.(true);
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const dims = [Math.abs(size.x), Math.abs(size.y), Math.abs(size.z)].sort((a, b) => a - b);
    return Math.max(dims[0] * 0.5, 0.001);
  } catch (_) {
    return 0.001;
  }
}

function rawSupportMaterial(obj) {
  const source = firstMaterial(obj);
  if (source?.clone) return source.clone();
  return new THREE.MeshStandardMaterial({ color: 0x9aa7b0, roughness: 0.68, metalness: 0.12 });
}

function firstMaterial(obj) {
  let found = null;
  obj?.traverse?.((child) => { if (!found && child?.material) found = Array.isArray(child.material) ? child.material[0] : child.material; });
  return found;
}

function currentSupportMode() {
  try {
    const saved = localStorage.getItem('rvm_support_render_mode_v2') || localStorage.getItem('rvm_support_render_mode_v1') || '';
    return ['raw', 'symbol', 'both'].includes(saved) ? saved : 'raw';
  } catch (_) {
    return 'raw';
  }
}

function rawInputXmlSupportPrimitivesEnabled() {
  try {
    return localStorage.getItem(RAW_INPUTXML_SUPPORT_PRIMITIVES_KEY) === 'on';
  } catch (_) {
    return false;
  }
}

function finiteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
}

function disposeObject(root) {
  root?.traverse?.((obj) => {
    if (isInputXmlSupportLabelObject(obj)) hideInputXmlSupportLabelObject(obj, {
      hiddenInputXmlRawSupportLabelCount: 0,
      restoredInputXmlRawSupportLabelCount: 0,
    });
    obj.geometry?.dispose?.();
    if (Array.isArray(obj.material)) obj.material.forEach((mat) => mat?.dispose?.());
    else obj.material?.dispose?.();
  });
}
