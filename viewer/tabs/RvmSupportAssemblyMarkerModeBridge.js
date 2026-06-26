const BRIDGE_VERSION = '20260622-rvm-support-assembly-markers-off-1';
const INSTALL_FLAG = Symbol.for('pcf-glb-rvm-support-assembly-marker-mode-1');
const SUPPORT_ASSEMBLY_ROOT = '__RVM_SUPPORT_ASSEMBLY_MARKERS__';
const STORAGE_KEY = 'rvm_support_assembly_markers_v1';

export function installRvmSupportAssemblyMarkerModeBridge() {
  if (typeof document === 'undefined') return null;
  if (globalThis[INSTALL_FLAG]) return globalThis[INSTALL_FLAG];
  injectStyle();
  const state = {
    version: BRIDGE_VERSION,
    getMode,
    setMode,
    apply: () => applyMarkerMode(),
  };
  globalThis[INSTALL_FLAG] = state;
  globalThis.__PCF_GLB_RVM_SUPPORT_ASSEMBLY_MARKERS__ = state;
  const tick = () => {
    applyMarkerMode();
    ensureControls();
  };
  for (const delay of [0, 250, 900, 1800, 3600, 6500]) setTimeout(tick, delay);
  setInterval(tick, 1800);
  return state;
}

function getMode() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'on' || saved === 'off') return saved;
  } catch (_) {}
  return 'off';
}

function setMode(mode = 'off') {
  const normalized = mode === 'on' ? 'on' : 'off';
  try { localStorage.setItem(STORAGE_KEY, normalized); } catch (_) {}
  applyMarkerMode();
  ensureControls();
  return normalized;
}

function applyMarkerMode(viewer = globalThis.__3D_RVM_VIEWER__) {
  const mode = getMode();
  const root = viewer?.scene?.getObjectByName?.(SUPPORT_ASSEMBLY_ROOT);
  if (root) {
    root.visible = mode === 'on';
    root.userData = {
      ...(root.userData || {}),
      supportAssemblyMarkerMode: mode,
      supportAssemblyMarkerModeVersion: BRIDGE_VERSION,
      pickable: false,
      selectable: false,
      nonSelectableReason: mode === 'on' ? 'support-assembly-marker-overlay' : 'support-assembly-markers-default-off',
    };
    root.traverse?.((obj) => {
      obj.userData = {
        ...(obj.userData || {}),
        supportSymbol: true,
        rvmSupportAssemblyMarkerOverlay: true,
        supportAssemblyMarkerMode: mode,
        pickable: false,
        selectable: false,
        nonSelectableReason: 'support-assembly-marker-overlay',
      };
    });
  }
  const diag = globalThis.__PCF_GLB_RVM_SUPPORT_ASSEMBLY_DIAGNOSTICS__;
  if (diag && typeof diag === 'object') diag.supportAssemblyMarkerMode = mode;
  return { mode, visible: Boolean(root?.visible), markerRootFound: Boolean(root) };
}

function ensureControls() {
  const panel = document.querySelector('#rvm-support-summary');
  if (!panel) return;
  let row = panel.querySelector('[data-rvm-support-assembly-marker-controls]');
  if (!row) {
    row = document.createElement('div');
    row.className = 'rvm-support-assembly-marker-controls';
    row.dataset.rvmSupportAssemblyMarkerControls = 'true';
    panel.insertAdjacentElement('afterbegin', row);
  }
  const mode = getMode();
  row.innerHTML = `
    <span class="rvm-support-marker-label">Assembly markers</span>
    <button type="button" class="rvm-btn ${mode === 'off' ? 'is-active' : ''}" data-rvm-support-assembly-marker-mode="off" title="Hide cyan/green support contact rings and dots. Default for review.">Off</button>
    <button type="button" class="rvm-btn ${mode === 'on' ? 'is-active' : ''}" data-rvm-support-assembly-marker-mode="on" title="Show support assembly contact rings/dots as diagnostic overlay only.">On</button>
    <span class="rvm-support-marker-note">diagnostic overlay, not model geometry</span>`;
  row.querySelectorAll('[data-rvm-support-assembly-marker-mode]').forEach((button) => {
    button.addEventListener('click', () => setMode(button.dataset.rvmSupportAssemblyMarkerMode), { once: true });
  });
}

function injectStyle() {
  if (document.getElementById('rvm-support-assembly-marker-mode-style')) return;
  const style = document.createElement('style');
  style.id = 'rvm-support-assembly-marker-mode-style';
  style.textContent = `
    .rvm-support-assembly-marker-controls{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:0 0 8px;padding:6px;border:1px solid rgba(96,165,250,.20);border-radius:8px;background:rgba(15,23,42,.42)}
    .rvm-support-assembly-marker-controls .rvm-btn{padding:3px 8px;font-size:11px}
    .rvm-support-assembly-marker-controls .rvm-btn.is-active{outline:1px solid rgba(96,165,250,.9);background:rgba(37,99,235,.34)}
    .rvm-support-marker-label{font-size:11px;font-weight:700;color:#bfdbfe;text-transform:uppercase;letter-spacing:.04em}
    .rvm-support-marker-note{font-size:10.5px;color:#94a3b8}
  `;
  document.head.appendChild(style);
}
