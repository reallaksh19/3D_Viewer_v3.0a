const VERSION = '20260621-rvm-policy-info-1';
const INSTALL_FLAG = Symbol.for('pcf-glb-rvm-policy-info-bridge-v1');
const STYLE_ID = 'rvm-policy-info-bridge-style';
const SECTION_ATTR = 'data-rvm-policy-info-section';

const POLICY_SECTIONS = [
  {
    title: 'Render budget and large-file guard',
    rows: [
      ['Max rendered objects', '6000 by default in the direct browser RVM path. Extra render instructions are counted as render-budget skips.'],
      ['Progressive batches', '64 objects per batch with an 8 ms target time slice.'],
      ['Large-model throttle', 'Models above 3000 renderables are throttled to about 15 fps to keep the browser responsive.'],
    ],
  },
  {
    title: 'Primitive fallback rules',
    rows: [
      ['BBox fallback', 'Only used when native primitive geometry is not decoded or upgraded. It must be treated as review/diagnostic geometry, not trusted final geometry.'],
      ['Oversized primitive boxes', 'Plant primitives are kept visible by default; oversized primitive hiding is opt-in. Current guard is 50000 model units.'],
      ['Fallback review', 'Fallback rows can be selected and fitted from Primitive Fallback Review.'],
    ],
  },
  {
    title: 'Native tessellation rules',
    rows: [
      ['Native On/Off', 'Native upgrade is a runtime comparison switch. Native Off requires reload to compare fallback-only geometry.'],
      ['Rule-based upgrades', 'Cylinder, dish, torus, snout, and remaining primitive patches upgrade decoded RVM primitives when their native parameters are available.'],
      ['Not a global scale fix', 'Native tessellation uses decoded parameters and transforms; bbox fallback is not scaled to imitate real geometry.'],
    ],
  },
  {
    title: 'Hierarchy and labels',
    rows: [
      ['Tree row cap', 'The browser RVM tree is capped for responsiveness; current flat-tree preview renders a limited subset first.'],
      ['Labels default', 'Labels are Off by default. CSS2D label rendering is disabled unless labels are explicitly enabled.'],
      ['Safe label strategy', 'For large files, labels should be scoped to the selected hierarchy branch and confirmed when count is high.'],
    ],
  },
  {
    title: 'Support geometry',
    rows: [
      ['SupportGeom default', 'Support geometry mode defaults to Off; StagedJSON export no longer forces Replace mode silently.'],
      ['SupportATT prerequisite', 'SupportATT mapping requires generated support geometry and reports this prerequisite instead of silently producing zero rows.'],
    ],
  },
];

export function installRvmPolicyInfoBridge() {
  if (typeof document === 'undefined') return null;
  if (globalThis[INSTALL_FLAG]) return globalThis.__PCF_GLB_RVM_POLICY_INFO__ || null;
  globalThis[INSTALL_FLAG] = true;
  injectStyle();
  const api = { version: VERSION, scan, open };
  globalThis.__PCF_GLB_RVM_POLICY_INFO__ = api;
  scan();
  if (typeof MutationObserver === 'function') {
    const observer = new MutationObserver(scan);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  return api;
}

function scan() {
  document.querySelectorAll?.('[data-rvm-viewer]').forEach(attachToRoot);
}

function attachToRoot(root) {
  if (!root || root.dataset.rvmPolicyInfoBound === VERSION) return;
  const ribbon = root.querySelector('.geo-top-ribbon');
  if (!ribbon) return;
  root.dataset.rvmPolicyInfoBound = VERSION;

  let section = ribbon.querySelector(`[${SECTION_ATTR}]`);
  if (!section) {
    section = document.createElement('div');
    section.className = 'rvm-ribbon-section rvm-policy-info-section';
    section.setAttribute(SECTION_ATTR, 'true');
    section.innerHTML = `
      <button type="button" class="rvm-btn rvm-policy-info-button" data-rvm-policy-info-button="true" aria-expanded="false" title="Show rule-based and hardcoded RVM viewer policies">ⓘ Rules</button>
      <div class="rvm-policy-info-popover" data-rvm-policy-info-popover="true" hidden></div>
    `;
    const search = ribbon.querySelector('.rvm-ribbon-search');
    if (search) ribbon.insertBefore(section, search);
    else ribbon.appendChild(section);
  }

  const button = section.querySelector('[data-rvm-policy-info-button]');
  const popover = section.querySelector('[data-rvm-policy-info-popover]');
  if (!button || !popover || button.dataset.rvmPolicyInfoClick === VERSION) return;
  button.dataset.rvmPolicyInfoClick = VERSION;
  renderPopover(popover);
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggle(button, popover);
  });
  document.addEventListener('click', (event) => {
    if (!section.contains(event.target)) close(button, popover);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close(button, popover);
  });
}

function open() {
  const root = document.querySelector('[data-rvm-viewer]');
  const button = root?.querySelector?.('[data-rvm-policy-info-button]');
  const popover = root?.querySelector?.('[data-rvm-policy-info-popover]');
  if (button && popover) show(button, popover);
}

function toggle(button, popover) {
  if (popover.hidden) show(button, popover);
  else close(button, popover);
}
function show(button, popover) {
  popover.hidden = false;
  button.setAttribute('aria-expanded', 'true');
}
function close(button, popover) {
  if (!button || !popover) return;
  popover.hidden = true;
  button.setAttribute('aria-expanded', 'false');
}

function renderPopover(popover) {
  popover.innerHTML = `
    <div class="rvm-policy-info-card" role="dialog" aria-label="RVM viewer policy information">
      <div class="rvm-policy-info-title">Rule-based / hardcoded viewer policies</div>
      <div class="rvm-policy-info-note">These are runtime safeguards and fallbacks currently active in the browser RVM viewer.</div>
      ${POLICY_SECTIONS.map((section) => `
        <details class="rvm-policy-info-group" open>
          <summary>${escapeHtml(section.title)}</summary>
          <div class="rvm-policy-info-grid">
            ${section.rows.map(([key, value]) => `<div><b>${escapeHtml(key)}</b><span>${escapeHtml(value)}</span></div>`).join('')}
          </div>
        </details>
      `).join('')}
    </div>`;
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .rvm-policy-info-section { position: relative; }
    .rvm-policy-info-button { font-weight: 800; color: #bfdbfe; }
    .rvm-policy-info-popover { position: absolute; top: calc(100% + 8px); right: 0; z-index: 60; width: min(520px, 82vw); max-height: min(620px, 74vh); overflow: auto; padding: 0; border: 1px solid rgba(147,197,253,.36); border-radius: 12px; background: rgba(10, 18, 32, .98); box-shadow: 0 20px 48px rgba(0,0,0,.42); }
    .rvm-policy-info-card { display: grid; gap: 10px; padding: 12px; color: #dbeafe; }
    .rvm-policy-info-title { font-weight: 900; letter-spacing: .02em; color: #e0f2fe; }
    .rvm-policy-info-note { color: #9fb7d5; font-size: 12px; }
    .rvm-policy-info-group { border: 1px solid rgba(148,163,184,.20); border-radius: 10px; padding: 8px; background: rgba(15,23,42,.58); }
    .rvm-policy-info-group summary { cursor: pointer; color: #93c5fd; font-weight: 800; font-size: 12px; }
    .rvm-policy-info-grid { display: grid; gap: 6px; margin-top: 8px; }
    .rvm-policy-info-grid > div { display: grid; grid-template-columns: 148px minmax(0,1fr); gap: 8px; font-size: 12px; line-height: 1.32; }
    .rvm-policy-info-grid b { color: #dbeafe; }
    .rvm-policy-info-grid span { color: #b8c7dc; }
  `;
  document.head.appendChild(style);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
}
