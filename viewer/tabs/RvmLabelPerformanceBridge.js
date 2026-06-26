// Runtime bridge for keeping large browser-RVM loads responsive when labels are off.
// The RVM geometry remains WebGL/Three.js. HTML/CSS labels are optional generic UI overlays.

const PATCH_FLAG = Symbol.for('pcf-glb-rvm-label-performance-bridge-v2-no-support-runtime');
const LARGE_MODEL_RENDERABLE_THRESHOLD = 3000;
const SMALL_MODEL_FRAME_MS = 33;
const LARGE_MODEL_FRAME_MS = 66;
const IDLE_HEARTBEAT_MS = 500;

export function installRvmLabelPerformanceBridge(RvmViewer3D) {
  const proto = RvmViewer3D?.prototype;
  if (!proto || proto[PATCH_FLAG]) return;

  const originalSetModel = proto.setModel;
  if (typeof originalSetModel === 'function') {
    proto.setModel = function patchedSetModelForLabelDefaultOff(model, upAxis = 'Y') {
      const result = originalSetModel.call(this, model, upAxis);
      this.__rvmRenderDirty = true;
      this.__rvmRenderableEstimate = estimateRenderableCount(this);
      setViewerLabelLayerVisible(this, false);
      return result;
    };
  }

  proto.setRvmLabelLayerVisible = function setRvmLabelLayerVisible(visible) {
    setViewerLabelLayerVisible(this, visible);
    this.__rvmRenderDirty = true;
  };

  proto.getRvmLabelLayerVisible = function getRvmLabelLayerVisible() {
    return this.__rvmLabelLayerVisible === true;
  };

  proto.requestRvmRender = function requestRvmRender() {
    this.__rvmRenderDirty = true;
  };

  proto._animate = function patchedLargeRvmAnimate() {
    if (this._disposed) return;
    this._animationFrameId = requestAnimationFrame(this._animate);

    const controlsChanged = !!this.controls?.update?.();
    const now = nowMs();
    const estimate = resolveRenderableEstimate(this);
    const large = estimate >= LARGE_MODEL_RENDERABLE_THRESHOLD;
    const minFrameMs = large ? LARGE_MODEL_FRAME_MS : SMALL_MODEL_FRAME_MS;
    const last = Number(this.__rvmLastRenderAt || 0);
    const labelLayerVisible = this.__rvmLabelLayerVisible === true;
    const shouldRender =
      this.__rvmRenderDirty !== false ||
      controlsChanged ||
      labelLayerVisible ||
      now - last >= (large ? IDLE_HEARTBEAT_MS : minFrameMs);

    if (!shouldRender || now - last < minFrameMs) return;

    this.renderer?.render?.(this.scene, this.camera);
    if (labelLayerVisible) this.labelRenderer?.render?.(this.scene, this.camera);
    this.__rvmLastRenderAt = now;
    this.__rvmRenderDirty = false;
  };

  proto[PATCH_FLAG] = true;
}

function setViewerLabelLayerVisible(viewer, visible) {
  if (!viewer) return;
  viewer.__rvmLabelLayerVisible = visible === true;
  const el = viewer.labelRenderer?.domElement;
  if (el?.style) {
    el.style.display = visible ? '' : 'none';
    el.style.pointerEvents = 'none';
  }
}

function resolveRenderableEstimate(viewer) {
  const explicit = Number(viewer?.__rvmRenderableEstimate);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const progressive = viewer?.modelGroup?.children?.[0]?.userData?.browserRvmRender || viewer?._progressiveModelRoot?.userData?.browserRvmRender;
  const fromProgressive = Number(progressive?.renderableCount ?? progressive?.browserRvmRenderableCount);
  if (Number.isFinite(fromProgressive) && fromProgressive > 0) {
    viewer.__rvmRenderableEstimate = fromProgressive;
    return fromProgressive;
  }

  const estimated = estimateRenderableCount(viewer);
  if (estimated > 0) viewer.__rvmRenderableEstimate = estimated;
  return estimated;
}

function estimateRenderableCount(viewer) {
  let count = 0;
  viewer?.modelGroup?.traverse?.((obj) => {
    if (count > 10000) return;
    if (obj?.isMesh || obj?.isLine || obj?.isPoints) count += 1;
  });
  return count;
}

function nowMs() {
  return (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
}
