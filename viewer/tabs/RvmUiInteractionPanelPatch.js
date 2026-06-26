import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const PATCH_FLAG = Symbol.for('pcf-glb-rvm-ui-interaction-panels-v1');
const BRIDGE_VERSION = '20260621-rvm-ui-interaction-panels-1';
const MIN_MARQUEE_NDC = 0.01;
const PANEL_BIND_INTERVAL_MS = 250;
const PANEL_BIND_ATTEMPTS = 200;

export function installRvmUiInteractionPanelPatch(RvmViewer3D) {
  const proto = RvmViewer3D?.prototype;
  if (!proto || proto[PATCH_FLAG]) return;

  const previousSetNavMode = proto.setNavMode;
  proto.setNavMode = function patchedUniversalRvmNavMode(mode) {
    const normalized = normalizeMode(mode || 'select');
    const result = typeof previousSetNavMode === 'function' ? previousSetNavMode.call(this, normalized) : undefined;
    applyUniversalMouseContract(this, normalized);
    return result;
  };

  const previousSetSectionMode = proto.setSectionMode;
  proto.setSectionMode = function patchedSelectionAnchoredSectionMode(mode) {
    const normalized = String(mode || '').trim().toUpperCase();
    if (normalized === 'BOX' && buildSelectionAnchoredSectionBox(this)) return true;
    return typeof previousSetSectionMode === 'function' ? previousSetSectionMode.call(this, mode) : undefined;
  };

  proto.setRvmSectionScale = function setRvmSectionScale(value) {
    const next = clamp(Number(value), 1, 8, 1.5);
    this._rvmSectionScale = next;
    if (this.sectioning?._sectionMode === 'BOX') buildSelectionAnchoredSectionBox(this, { allowModelFallback: true });
    return next;
  };

  proto.clearTransientToolState = function clearTransientToolState() {
    this.measureModeEnabled = false;
    this.marqueeModeEnabled = false;
    this.marqueeMode = '';
    this._marqueeStart = null;
    if (this.marqueeElement) this.marqueeElement.style.display = 'none';
    applyUniversalMouseContract(this, 'select');
  };

  proto._onPointerDown = patchedPointerDown;
  proto._onPointerMove = patchedPointerMove;
  proto._onPointerUp = patchedPointerUp;

  proto[PATCH_FLAG] = true;
}

export function installRvmUiPanelBridge() {
  injectStyles();
  let attempts = 0;
  const bind = () => {
    attempts += 1;
    const root = document.querySelector('[data-rvm-viewer]');
    const viewer = globalThis.__3D_RVM_VIEWER__;
    if (root) upgradeRvmShell(root, viewer);
    if (viewer) applyUniversalMouseContract(viewer, normalizeMode(viewer._rvmInteractionMode || viewer._navMode || 'select'));
    if ((!root || !viewer) && attempts < PANEL_BIND_ATTEMPTS) setTimeout(bind, PANEL_BIND_INTERVAL_MS);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
}

function patchedPointerDown(event) {
  if (event.button !== 0) return;
  updatePointerNdc(this, event);

  if (this.marqueeModeEnabled) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    beginMarquee(this, event);
    return;
  }

  if (this.measureModeEnabled) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    handleMeasureClick(this, event);
  }
}

function patchedPointerMove(event) {
  if (!this.marqueeModeEnabled || !this._marqueeStart || !this.marqueeElement) return;
  const rect = this.renderer.domElement.getBoundingClientRect();
  const currentX = event.clientX - rect.left;
  const currentY = event.clientY - rect.top;
  const startX = this._marqueeStart.x - rect.left;
  const startY = this._marqueeStart.y - rect.top;
  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  this.marqueeElement.style.left = `${left}px`;
  this.marqueeElement.style.top = `${top}px`;
  this.marqueeElement.style.width = `${width}px`;
  this.marqueeElement.style.height = `${height}px`;
}

function patchedPointerUp(event) {
  if (!this.marqueeModeEnabled || !this._marqueeStart) return;
  updatePointerNdc(this, event);
  if (this.marqueeElement) this.marqueeElement.style.display = 'none';

  const minX = Math.min(this._marqueeStart.ndcx, this.mouse.x);
  const maxX = Math.max(this._marqueeStart.ndcx, this.mouse.x);
  const minY = Math.min(this._marqueeStart.ndcy, this.mouse.y);
  const maxY = Math.max(this._marqueeStart.ndcy, this.mouse.y);
  const mode = this.marqueeMode;
  const additive = this._lastPointerDownCtrl || event.ctrlKey || event.shiftKey || event.metaKey;
  this._marqueeStart = null;

  if (Math.abs(maxX - minX) < MIN_MARQUEE_NDC || Math.abs(maxY - minY) < MIN_MARQUEE_NDC) {
    this.setNavMode?.(mode === 'select' ? 'select' : 'select');
    return;
  }

  const matches = meshesInNdcBox(this, minX, maxX, minY, maxY);
  if (mode === 'select') {
    if (matches.length) {
      globalThis.__PCF_GLB_RVM_INTERACTION__?.setSelectionFromObjects?.(matches, { additive });
      setStatus('rvm-sb-msg', `Box Select: selected ${matches.length} visible mesh${matches.length === 1 ? '' : 'es'}`);
    } else {
      setStatus('rvm-sb-msg', 'Box Select: no visible geometry inside window');
    }
    this.setNavMode?.('select');
    return;
  }

  const box = boxForMeshes(matches);
  if (box && !box.isEmpty()) {
    this._fitBox?.(box);
    setStatus('rvm-sb-msg', `Zoom window: fitted ${matches.length} mesh${matches.length === 1 ? '' : 'es'}`);
  } else {
    zoomForward(this);
    setStatus('rvm-sb-msg', 'Zoom window: no geometry inside window, zoomed camera forward');
  }
  this.setNavMode?.('select');
}

function applyUniversalMouseContract(viewer, mode) {
  if (!viewer) return;
  const normalized = normalizeMode(mode);
  viewer._rvmInteractionMode = normalized;
  viewer._navMode = normalized;
  viewer.measureModeEnabled = normalized === 'measure' || normalized === 'measure_tool';
  viewer.marqueeModeEnabled = normalized === 'marquee_select' || normalized === 'view_marquee_zoom' || normalized === 'zoom';
  viewer.marqueeMode = normalized === 'marquee_select' ? 'select' : (viewer.marqueeModeEnabled ? 'zoom' : '');

  const leftAction = normalized === 'orbit'
    ? THREE.MOUSE.ROTATE
    : normalized === 'pan'
      ? THREE.MOUSE.PAN
      : undefined;

  if (viewer.controls) {
    viewer.controls.enabled = true;
    viewer.controls.enableRotate = true;
    viewer.controls.enablePan = true;
    viewer.controls.enableZoom = true;
    viewer.controls.mouseButtons = {
      LEFT: leftAction,
      MIDDLE: THREE.MOUSE.ROTATE,
      RIGHT: THREE.MOUSE.PAN,
    };
  }

  const cursor = cursorForMode(normalized);
  if (viewer.container?.style) viewer.container.style.cursor = cursor;
  if (viewer.renderer?.domElement?.style) viewer.renderer.domElement.style.cursor = cursor;
  syncModeUi(document.querySelector('[data-rvm-viewer]'), normalized);
}

function beginMarquee(viewer, event) {
  const rect = viewer.renderer.domElement.getBoundingClientRect();
  viewer._marqueeStart = { x: event.clientX, y: event.clientY, ndcx: viewer.mouse.x, ndcy: viewer.mouse.y };
  viewer._lastPointerDownCtrl = event.ctrlKey || event.metaKey || event.shiftKey;
  if (!viewer.marqueeElement) {
    viewer.marqueeElement = document.createElement('div');
    viewer.marqueeElement.className = 'rvm-marquee-rect';
    viewer.container.appendChild(viewer.marqueeElement);
  }
  viewer.marqueeElement.dataset.mode = viewer.marqueeMode === 'select' ? 'select' : 'zoom';
  viewer.marqueeElement.style.left = `${event.clientX - rect.left}px`;
  viewer.marqueeElement.style.top = `${event.clientY - rect.top}px`;
  viewer.marqueeElement.style.width = '0px';
  viewer.marqueeElement.style.height = '0px';
  viewer.marqueeElement.style.display = 'block';
}

function handleMeasureClick(viewer, event) {
  const hit = raycastModel(viewer, event.clientX, event.clientY);
  if (!hit) {
    setStatus('rvm-sb-msg', 'Measure: click geometry to place a measurement point');
    return;
  }
  const point = hit.point.clone();
  if (!viewer._measureStart) {
    viewer._measureStart = point;
    viewer._measurePointMesh = makeMeasureMarker(viewer, point);
    viewer.scene.add(viewer._measurePointMesh);
    setStatus('rvm-sb-msg', `Measure: first point ${formatPoint(point)}. Click second geometry point.`);
    return;
  }

  const start = viewer._measureStart.clone();
  const startMarker = viewer._measurePointMesh;
  const endMarker = makeMeasureMarker(viewer, point);
  const line = makeMeasureLine(start, point);
  const label = makeMeasureLabel(start, point);
  viewer.scene.add(endMarker);
  viewer.scene.add(line);
  viewer.scene.add(label);
  viewer._measureObjects = [
    ...(Array.isArray(viewer._measureObjects) ? viewer._measureObjects : []),
    startMarker,
    endMarker,
    line,
    label,
  ].filter(Boolean);
  viewer._measureStart = null;
  viewer._measurePointMesh = null;
  const distance = start.distanceTo(point);
  setStatus('rvm-sb-msg', `Measure: ${distance.toFixed(2)} mm`);
}

function raycastModel(viewer, clientX, clientY) {
  if (!viewer?.modelGroup || !viewer?.camera || !viewer?.renderer?.domElement) return null;
  const rect = viewer.renderer.domElement.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const mouse = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  const raycaster = viewer._rvmUiRaycaster || (viewer._rvmUiRaycaster = new THREE.Raycaster());
  raycaster.params.Line = { threshold: 2 };
  raycaster.params.Points = { threshold: 2 };
  raycaster.setFromCamera(mouse, viewer.camera);
  return raycaster.intersectObject(viewer.modelGroup, true).find((hit) => isInteractiveMesh(hit.object));
}

function makeMeasureMarker(viewer, point) {
  const radius = measureMarkerRadius(viewer, point);
  const geo = new THREE.SphereGeometry(radius, 12, 8);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff4d4d, depthTest: false, transparent: true, opacity: 0.92 });
  const marker = new THREE.Mesh(geo, mat);
  marker.position.copy(point);
  marker.renderOrder = 10000;
  marker.userData.rvmInteractionIgnore = true;
  marker.userData.rvmMeasurement = true;
  return marker;
}

function makeMeasureLine(start, end) {
  const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
  const mat = new THREE.LineBasicMaterial({ color: 0xff4d4d, depthTest: false, transparent: true, opacity: 0.95 });
  const line = new THREE.Line(geo, mat);
  line.renderOrder = 10000;
  line.userData.rvmInteractionIgnore = true;
  line.userData.rvmMeasurement = true;
  return line;
}

function makeMeasureLabel(start, end) {
  const distance = start.distanceTo(end);
  const mid = start.clone().lerp(end, 0.5);
  const div = document.createElement('div');
  div.className = 'rvm-measure-label';
  div.textContent = `${distance.toFixed(2)} mm`;
  const label = new CSS2DObject(div);
  label.position.copy(mid);
  label.userData.rvmInteractionIgnore = true;
  label.userData.rvmMeasurement = true;
  return label;
}

function measureMarkerRadius(viewer, point) {
  const diag = Math.max(Number(viewer?._modelDiag) || modelDiagonal(viewer) || 1000, 1);
  const cameraDistance = point && viewer?.camera ? point.distanceTo(viewer.camera.position) : diag;
  const preferred = cameraDistance * 0.00035;
  return clamp(preferred, diag * 0.00004, diag * 0.0004, diag * 0.00012);
}

function buildSelectionAnchoredSectionBox(viewer, options = {}) {
  if (!viewer?.sectioning || !viewer?.modelGroup) return false;
  const meshes = selectedMeshes(viewer);
  let box = boxForMeshes(meshes);
  if ((!box || box.isEmpty()) && options.allowModelFallback) box = new THREE.Box3().setFromObject(viewer.modelGroup);
  if (!box || box.isEmpty()) return false;

  const modelDiag = modelDiagonal(viewer) || Math.max(box.getSize(new THREE.Vector3()).length(), 1);
  const scale = clamp(Number(viewer._rvmSectionScale), 1, 8, 1.5);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const minExtent = Math.max(modelDiag * 0.004, 1);
  size.set(Math.max(size.x * scale, minExtent), Math.max(size.y * scale, minExtent), Math.max(size.z * scale, minExtent));

  const scaled = new THREE.Box3(
    center.clone().sub(size.clone().multiplyScalar(0.5)),
    center.clone().add(size.clone().multiplyScalar(0.5)),
  );
  viewer.sectioning.buildBoxSection(viewer.modelGroup, scaled);
  viewer.sectioning._sectionMode = 'BOX';
  viewer._rvmLastSectionAnchor = center.clone();
  setStatus('rvm-sb-msg', `Section Box: anchored at ${formatPoint(center)}, size ${scale.toFixed(2)}×`);
  return true;
}

function selectedMeshes(viewer) {
  const direct = Array.isArray(viewer?._rvmCanvasSelectedMeshes) ? viewer._rvmCanvasSelectedMeshes.filter(isInteractiveMesh) : [];
  if (direct.length) return unique(direct);
  const ids = new Set([...(viewer?.selection?.getSelectionRenderIds?.() || []), ...(viewer?.selection?.getSelectedCanonicalIds?.() || [])].map(normalizeAlias).filter(Boolean));
  if (!ids.size) return [];
  const meshes = [];
  viewer?.modelGroup?.traverse?.((obj) => {
    if (!isInteractiveMesh(obj)) return;
    const aliases = aliasesForObject(obj).map(normalizeAlias).filter(Boolean);
    if (aliases.some((alias) => ids.has(alias) || Array.from(ids).some((id) => alias.includes(id) || id.includes(alias)))) meshes.push(obj);
  });
  return unique(meshes);
}

function meshesInNdcBox(viewer, minX, maxX, minY, maxY) {
  const meshes = [];
  viewer?.modelGroup?.traverse?.((obj) => {
    if (!isInteractiveMesh(obj)) return;
    const center = objectCenter(obj);
    if (!center) return;
    center.project(viewer.camera);
    if (center.x >= minX && center.x <= maxX && center.y >= minY && center.y <= maxY) meshes.push(obj);
  });
  return unique(meshes);
}

function objectCenter(obj) {
  try {
    if (obj.geometry) {
      if (!obj.geometry.boundingSphere) obj.geometry.computeBoundingSphere();
      if (obj.geometry.boundingSphere) return obj.geometry.boundingSphere.center.clone().applyMatrix4(obj.matrixWorld);
    }
    const box = new THREE.Box3().setFromObject(obj);
    return box.isEmpty() ? null : box.getCenter(new THREE.Vector3());
  } catch (_) {
    return null;
  }
}

function boxForMeshes(meshes = []) {
  const box = new THREE.Box3();
  let any = false;
  for (const mesh of meshes) {
    if (!isInteractiveMesh(mesh)) continue;
    try {
      const next = new THREE.Box3().setFromObject(mesh);
      if (!next.isEmpty()) { box.union(next); any = true; }
    } catch (_) {}
  }
  return any ? box : null;
}

function modelDiagonal(viewer) {
  try {
    const box = new THREE.Box3().setFromObject(viewer.modelGroup);
    return box.isEmpty() ? 0 : Math.max(box.getSize(new THREE.Vector3()).length(), 1);
  } catch (_) {
    return 0;
  }
}

function isInteractiveMesh(obj) {
  return Boolean(obj?.isMesh && obj.visible !== false && obj.userData?.supportSymbol !== true && obj.userData?.rvmHiddenByUser !== true && obj.userData?.rvmInteractionIgnore !== true);
}

function updatePointerNdc(viewer, event) {
  const rect = viewer.renderer.domElement.getBoundingClientRect();
  viewer.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  viewer.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function zoomForward(viewer) {
  const dir = new THREE.Vector3(0, 0, -1).transformDirection(viewer.camera.matrixWorld);
  const dist = viewer.controls?.target?.distanceTo?.(viewer.camera.position) || modelDiagonal(viewer) || 1000;
  viewer.camera.position.add(dir.multiplyScalar(dist * 0.5));
  viewer.controls?.update?.();
}

function upgradeRvmShell(root, viewer) {
  moveLoadFirst(root);
  ensureSectionScaleControl(root, viewer);
  bindSidePanel(root, viewer, 'left');
  bindSidePanel(root, viewer, 'right');
  upgradeRightPanelSections(root);
  bindContextMenu(viewer);
  if (viewer && !viewer._rvmDefaultSelectApplied) {
    viewer._rvmDefaultSelectApplied = true;
    viewer.setNavMode?.('select');
  }
  ensurePanelMutationObserver(root);
}

function moveLoadFirst(root) {
  const ribbon = root.querySelector('.geo-top-ribbon');
  const load = ribbon?.querySelector?.('.rvm-ribbon-load');
  if (!ribbon || !load || ribbon.firstElementChild === load) return;
  ribbon.insertBefore(load, ribbon.firstElementChild);
  load.dataset.rvmLoadFirst = BRIDGE_VERSION;
}

function ensureSectionScaleControl(root, viewer) {
  const sectionButton = root.querySelector('[data-action="SECTION_BOX"]');
  const group = sectionButton?.closest?.('.rvm-ribbon-section');
  if (!group || group.querySelector('[data-rvm-section-scale]')) return;
  const shell = document.createElement('span');
  shell.className = 'rvm-section-scale-shell';
  shell.innerHTML = '<span>Sec Size</span><input data-rvm-section-scale type="range" min="1" max="8" step="0.25" value="1.5" title="Scale selected-geometry section box"><b data-rvm-section-scale-value>1.50×</b>';
  group.appendChild(shell);
  const input = shell.querySelector('[data-rvm-section-scale]');
  const value = shell.querySelector('[data-rvm-section-scale-value]');
  const sync = () => {
    const next = viewer?.setRvmSectionScale?.(input.value) ?? Number(input.value);
    if (value) value.textContent = `${Number(next || input.value).toFixed(2)}×`;
  };
  input.addEventListener('input', sync);
}

function bindSidePanel(root, viewer, side) {
  const panel = root.querySelector(side === 'left' ? '.rvm-left-panel' : '.rvm-right-panel');
  if (!panel || panel.dataset.rvmSidePanelBound === BRIDGE_VERSION) return;
  panel.dataset.rvmSidePanelBound = BRIDGE_VERSION;
  panel.classList.add('rvm-side-panel', `rvm-side-panel--${side}`);
  const header = panel.querySelector('.rvm-panel-header');
  decorateHeader(header, side === 'left' ? 'Hierarchy' : 'Properties');
  addSideCollapseButton(panel, header, side);
  addSideResizeHandle(panel, side, viewer);
}

function addSideCollapseButton(panel, header, side) {
  if (!header || header.querySelector('[data-rvm-side-collapse]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'rvm-panel-toggle';
  button.dataset.rvmSideCollapse = side;
  button.textContent = '−';
  button.title = `Collapse ${side === 'left' ? 'Hierarchy' : 'Properties'} panel`;
  header.appendChild(button);
  button.addEventListener('click', () => {
    const collapsed = !panel.classList.contains('is-collapsed');
    panel.classList.toggle('is-collapsed', collapsed);
    button.textContent = collapsed ? '+' : '−';
  });
}

function addSideResizeHandle(panel, side, viewer) {
  const className = side === 'left' ? 'rvm-left-panel-resize-handle' : 'rvm-right-panel-resize-handle';
  if (panel.querySelector(`.${className}`)) return;
  const handle = document.createElement('div');
  handle.className = className;
  panel.appendChild(handle);
  let drag = null;
  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    handle.setPointerCapture?.(event.pointerId);
    panel.classList.remove('is-collapsed');
    drag = { x: event.clientX, width: panel.getBoundingClientRect().width };
    handle.classList.add('is-dragging');
  });
  handle.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const delta = event.clientX - drag.x;
    const width = side === 'left' ? drag.width + delta : drag.width - delta;
    panel.style.width = `${clamp(width, 120, 620, drag.width)}px`;
    viewer?.onResize?.();
  });
  const finish = (event) => {
    if (!drag) return;
    drag = null;
    handle.releasePointerCapture?.(event.pointerId);
    handle.classList.remove('is-dragging');
    viewer?.onResize?.();
  };
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
}

function upgradeRightPanelSections(root) {
  const panel = root.querySelector('.rvm-right-panel');
  if (!panel) return;
  const directHeaders = Array.from(panel.children).filter((child) => child.classList?.contains('rvm-panel-header'));
  for (const header of directHeaders) {
    const content = nextContentForHeader(header);
    if (!content) continue;
    const title = headerText(header);
    const section = document.createElement('section');
    section.className = 'rvm-property-section';
    section.dataset.rvmSectionTitle = title;
    panel.insertBefore(section, header);
    section.appendChild(header);
    section.appendChild(content);
    content.classList.add('rvm-property-section-body');
    decorateHeader(header, title);
    addSectionControls(section, header, content, title);
  }
  const wrappedHeaders = panel.querySelectorAll('.rvm-property-section > .rvm-panel-header');
  wrappedHeaders.forEach((header) => {
    const section = header.closest('.rvm-property-section');
    const content = section?.querySelector('.rvm-property-section-body');
    if (section && content) addSectionControls(section, header, content, headerText(header));
  });
}

function nextContentForHeader(header) {
  let next = header.nextElementSibling;
  while (next && (next.classList?.contains('rvm-left-panel-resize-handle') || next.classList?.contains('rvm-right-panel-resize-handle'))) next = next.nextElementSibling;
  if (!next || next.classList?.contains('rvm-panel-header') || next.classList?.contains('rvm-property-section')) return null;
  return next;
}

function addSectionControls(section, header, content, title) {
  if (!header || !content) return;
  decorateHeader(header, title);
  if (!header.querySelector('[data-rvm-section-collapse]')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rvm-panel-toggle';
    button.dataset.rvmSectionCollapse = 'true';
    button.textContent = section.classList.contains('is-collapsed') ? '+' : '−';
    header.appendChild(button);
    button.addEventListener('click', () => {
      const collapsed = !section.classList.contains('is-collapsed');
      section.classList.toggle('is-collapsed', collapsed);
      content.hidden = collapsed;
      button.textContent = collapsed ? '+' : '−';
      section.dataset.rvmUserCollapsed = 'true';
    });
  }
  if (!section.querySelector(':scope > .rvm-property-section-resize')) {
    const handle = document.createElement('div');
    handle.className = 'rvm-property-section-resize';
    section.appendChild(handle);
    let drag = null;
    handle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      handle.setPointerCapture?.(event.pointerId);
      section.classList.remove('is-collapsed');
      content.hidden = false;
      drag = { y: event.clientY, height: content.getBoundingClientRect().height || 120 };
      handle.classList.add('is-dragging');
    });
    handle.addEventListener('pointermove', (event) => {
      if (!drag) return;
      const next = clamp(drag.height + (event.clientY - drag.y), 64, 520, drag.height);
      content.style.flex = '0 0 auto';
      content.style.height = `${next}px`;
    });
    const finish = (event) => {
      if (!drag) return;
      drag = null;
      handle.releasePointerCapture?.(event.pointerId);
      handle.classList.remove('is-dragging');
    };
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  }
  if (!section.dataset.rvmUserCollapsed && shouldDefaultCollapse(title)) {
    section.classList.add('is-collapsed');
    content.hidden = true;
    const button = header.querySelector('[data-rvm-section-collapse]');
    if (button) button.textContent = '+';
  }
}

function decorateHeader(header, fallbackTitle) {
  if (!header || header.querySelector('.rvm-panel-title')) return;
  const title = headerText(header) || fallbackTitle || '';
  header.textContent = '';
  const span = document.createElement('span');
  span.className = 'rvm-panel-title';
  span.textContent = title;
  header.appendChild(span);
}

function headerText(header) {
  const title = header?.querySelector?.('.rvm-panel-title')?.textContent;
  if (title) return title.trim();
  return String(header?.textContent || '').replace(/[+−-]/g, '').trim();
}

function shouldDefaultCollapse(title) {
  return /Browser RVM Performance|Native Tessellation|Primitive Fallback Review/i.test(String(title || ''));
}

function bindContextMenu(viewer) {
  const canvas = viewer?.renderer?.domElement;
  if (!canvas || canvas.dataset.rvmContextMenuPan === BRIDGE_VERSION) return;
  canvas.dataset.rvmContextMenuPan = BRIDGE_VERSION;
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
}

function ensurePanelMutationObserver(root) {
  if (!root || root._rvmUiPanelObserver) return;
  let pending = false;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      upgradeRightPanelSections(root);
    });
  });
  const right = root.querySelector('.rvm-right-panel');
  if (right) observer.observe(right, { childList: true, subtree: false });
  root._rvmUiPanelObserver = observer;
  root.addEventListener('rvm-tab-dispose', () => observer.disconnect(), { once: true });
}

function syncModeUi(root, mode) {
  if (!root) return;
  const action = actionForMode(mode);
  root.querySelectorAll('[data-action]').forEach((button) => button.classList.toggle('is-active', button.dataset.action === action));
  const chip = root.querySelector('#rvm-mode-chip');
  if (chip) chip.textContent = labelForMode(mode);
}

function actionForMode(mode) {
  if (mode === 'orbit') return 'NAV_ORBIT';
  if (mode === 'pan') return 'NAV_PAN';
  if (mode === 'marquee_select') return 'MARQUEE_SELECT';
  if (mode === 'measure' || mode === 'measure_tool') return 'MEASURE_TOOL';
  if (mode === 'view_marquee_zoom' || mode === 'zoom') return 'VIEW_MARQUEE_ZOOM';
  return 'NAV_SELECT';
}

function labelForMode(mode) {
  if (mode === 'orbit') return 'Orbit';
  if (mode === 'pan') return 'Pan';
  if (mode === 'marquee_select') return 'Box Select';
  if (mode === 'measure' || mode === 'measure_tool') return 'Measure';
  if (mode === 'view_marquee_zoom' || mode === 'zoom') return 'Zoom';
  return 'Select';
}

function cursorForMode(mode) {
  if (mode === 'pan') return 'grab';
  if (mode === 'orbit') return 'move';
  if (mode === 'measure' || mode === 'measure_tool') return 'crosshair';
  if (mode === 'marquee_select') return 'cell';
  if (mode === 'view_marquee_zoom' || mode === 'zoom') return 'zoom-in';
  return 'default';
}

function aliasesForObject(obj) {
  const data = obj?.userData || {};
  const props = data.browserRvmProperties || {};
  const attrs = data.browserRvmAttributes || data.attributes || props.attributes || {};
  return [obj?.name, obj?.uuid, data.name, data.sourcePath, data.sourceName, data.displayName, props.sourcePath, props.displayName, attrs.NAME, attrs.RVM_OWNER_NAME, attrs.RVM_OWNER_PATH, attrs.TYPE, attrs.RVM_PRIMITIVE_KIND].filter(Boolean);
}

function normalizeMode(mode) {
  const text = String(mode || 'select').trim().toLowerCase();
  if (text === 'nav_select') return 'select';
  if (text === 'nav_orbit') return 'orbit';
  if (text === 'nav_pan') return 'pan';
  if (text === 'measure') return 'measure_tool';
  if (text === 'zoom') return 'view_marquee_zoom';
  return text || 'select';
}

function normalizeAlias(value) { return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
function unique(values) { return Array.from(new Set((values || []).filter(Boolean))); }
function clamp(value, min, max, fallback) { const n = Number(value); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback; }
function formatPoint(v) { return `${fmt(v.x)}, ${fmt(v.y)}, ${fmt(v.z)}`; }
function fmt(value) { const n = Number(value); return Number.isFinite(n) ? n.toFixed(2) : '-'; }
function setStatus(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }

function injectStyles() {
  let style = document.getElementById('rvm-ui-interaction-panel-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'rvm-ui-interaction-panel-style';
    document.head.appendChild(style);
  }
  style.textContent = `
    .geo-top-ribbon { width: 100%; align-items: stretch; }
    .rvm-ribbon-load { order: -100; }
    .rvm-ribbon-load .rvm-btn-file { min-height: 30px; font-weight: 800; border-color: rgba(74,158,255,.7); background: rgba(37,99,235,.22); }
    .rvm-ribbon-load .rvm-btn-file::before { content: '⏏'; margin-right: 4px; }
    .rvm-section-scale-shell { display: inline-flex; align-items: center; gap: 5px; margin-left: 5px; padding: 3px 6px; border: 1px solid rgba(126,182,246,.35); border-radius: 6px; color: #bdd7ff; background: rgba(15,23,42,.5); font-size: 10.5px; white-space: nowrap; }
    .rvm-section-scale-shell input { width: 74px; accent-color: #4a9eff; }
    .rvm-section-scale-shell b { min-width: 38px; color: #e5f0ff; }
    .rvm-side-panel { position: relative; transition: width .12s ease, min-width .12s ease; }
    .rvm-left-panel-resize-handle, .rvm-right-panel-resize-handle { position: absolute; top: 0; bottom: 0; width: 7px; z-index: 20; background: transparent; cursor: col-resize; }
    .rvm-left-panel-resize-handle { right: -3px; }
    .rvm-right-panel-resize-handle { left: -3px; }
    .rvm-left-panel-resize-handle:hover, .rvm-right-panel-resize-handle:hover, .rvm-left-panel-resize-handle.is-dragging, .rvm-right-panel-resize-handle.is-dragging { background: rgba(74,158,255,.38); }
    .rvm-side-panel.is-collapsed { width: 38px !important; min-width: 38px !important; max-width: 38px !important; overflow: hidden; }
    .rvm-side-panel.is-collapsed > :not(.rvm-panel-header):not(.rvm-left-panel-resize-handle):not(.rvm-right-panel-resize-handle) { display: none !important; }
    .rvm-side-panel.is-collapsed .rvm-panel-header { writing-mode: vertical-rl; min-height: 150px; align-items: center; justify-content: flex-start; padding: 8px 5px; }
    .rvm-panel-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; user-select: none; }
    .rvm-panel-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rvm-panel-toggle { appearance: none; border: 1px solid rgba(126,182,246,.35); border-radius: 5px; background: rgba(30,41,59,.8); color: #cfe3ff; min-width: 22px; height: 20px; line-height: 16px; cursor: pointer; font-weight: 800; }
    .rvm-panel-toggle:hover { border-color: rgba(126,182,246,.8); background: rgba(74,158,255,.2); }
    .rvm-property-section { display: flex; flex-direction: column; min-height: 34px; flex: 0 0 auto; border-bottom: 1px solid rgba(148,163,184,.15); }
    .rvm-property-section .rvm-property-section-body { min-height: 64px; resize: none; }
    .rvm-property-section:not(.is-collapsed) .rvm-property-section-body { flex: 1 1 120px; }
    .rvm-property-section.is-collapsed .rvm-property-section-resize { display: none; }
    .rvm-property-section-resize { height: 6px; cursor: row-resize; background: linear-gradient(180deg, transparent, rgba(74,158,255,.16), transparent); flex: 0 0 6px; }
    .rvm-property-section-resize:hover, .rvm-property-section-resize.is-dragging { background: rgba(74,158,255,.34); }
    .rvm-marquee-rect { position: absolute; pointer-events: none; z-index: 1000; display: none; border-radius: 2px; }
    .rvm-marquee-rect[data-mode="select"] { border: 2px dashed #60a5fa; background: rgba(59,130,246,.12); }
    .rvm-marquee-rect[data-mode="zoom"] { border: 2px dashed #f8fafc; background: rgba(255,255,255,.16); }
    .rvm-measure-label { background: rgba(127,29,29,.92); color: #fff; border: 1px solid rgba(254,202,202,.75); border-radius: 999px; padding: 2px 7px; font-size: 11px; font-weight: 800; pointer-events: none; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,.35); }
  `;
}
