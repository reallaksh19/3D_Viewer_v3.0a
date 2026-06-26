const VERSION = '20260621-rvm-diagnostic-collapse-1';
const INSTALL_FLAG = Symbol.for('pcf-glb-rvm-diagnostic-panel-collapse-v1');
const STYLE_ID = 'rvm-diagnostic-panel-collapse-style';
const TARGET_TITLE_RE = /^(Native Tessellation|Primitive Fallback Review)$/i;

export function installRvmDiagnosticPanelCollapseBridge() {
  if (typeof document === 'undefined') return null;
  if (globalThis[INSTALL_FLAG]) return globalThis.__PCF_GLB_RVM_DIAGNOSTIC_PANEL_COLLAPSE__ || null;
  globalThis[INSTALL_FLAG] = true;
  injectStyle();
  const api = { version: VERSION, scan };
  globalThis.__PCF_GLB_RVM_DIAGNOSTIC_PANEL_COLLAPSE__ = api;
  scan();
  if (typeof MutationObserver === 'function') {
    const observer = new MutationObserver(() => requestAnimationFrame(scan));
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  for (const delay of [250, 800, 1600, 3200, 6400]) setTimeout(scan, delay);
  return api;
}

function scan() {
  const root = document.querySelector?.('[data-rvm-viewer]');
  if (!root) return;
  root.querySelectorAll('.rvm-panel-header').forEach((header) => {
    const title = cleanTitle(header);
    if (!TARGET_TITLE_RE.test(title)) return;
    const body = nextBody(header);
    if (!body) return;
    decorate(header, body, title);
  });
}

function nextBody(header) {
  let next = header.nextElementSibling;
  while (next && next.classList?.contains('rvm-property-section-resize')) next = next.nextElementSibling;
  if (!next || next.classList?.contains('rvm-panel-header')) return null;
  return next;
}

function decorate(header, body, title) {
  if (header.dataset.rvmDiagnosticCollapseDecorated !== VERSION) {
    header.dataset.rvmDiagnosticCollapseDecorated = VERSION;
    header.classList.add('rvm-diagnostic-collapse-header');
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');
    normalizeTitle(header, title);
  }
  let button = header.querySelector('[data-rvm-diagnostic-collapse]');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'rvm-panel-toggle rvm-diagnostic-collapse-icon';
    button.dataset.rvmDiagnosticCollapse = 'true';
    header.appendChild(button);
  }
  if (!body.dataset.rvmDiagnosticCollapseDefaulted) {
    body.hidden = true;
    body.dataset.rvmDiagnosticCollapseDefaulted = VERSION;
  }
  if (button.dataset.rvmDiagnosticCollapseClick !== VERSION) {
    button.dataset.rvmDiagnosticCollapseClick = VERSION;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setCollapsed(header, body, !body.hidden, title);
    });
    header.addEventListener('click', (event) => {
      if (event.target?.closest?.('button, input, select, textarea, a')) return;
      setCollapsed(header, body, !body.hidden, title);
    });
    header.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      setCollapsed(header, body, !body.hidden, title);
    });
  }
  setCollapsed(header, body, body.hidden, title);
}

function setCollapsed(header, body, collapsed, title) {
  body.hidden = !!collapsed;
  body.classList.toggle('is-collapsed-by-diagnostic-bridge', !!collapsed);
  const button = header.querySelector('[data-rvm-diagnostic-collapse]');
  if (!button) return;
  button.textContent = collapsed ? '▸' : '▾';
  button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  button.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} ${title}`);
  button.title = `${collapsed ? 'Expand' : 'Collapse'} ${title}`;
}

function normalizeTitle(header, title) {
  if (header.querySelector('.rvm-diagnostic-collapse-title')) return;
  header.textContent = '';
  const span = document.createElement('span');
  span.className = 'rvm-diagnostic-collapse-title';
  span.textContent = title;
  header.appendChild(span);
}

function cleanTitle(header) {
  const text = header?.querySelector?.('.rvm-panel-title, .rvm-diagnostic-collapse-title')?.textContent || header?.textContent || '';
  return String(text).replace(/[+−\-▸▾‹›]/g, '').trim();
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .rvm-tab-root .rvm-diagnostic-collapse-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; cursor: pointer; }
    .rvm-tab-root .rvm-diagnostic-collapse-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rvm-tab-root .rvm-diagnostic-collapse-icon { display: inline-flex; align-items: center; justify-content: center; width: 22px; min-width: 22px; height: 20px; padding: 0; color: #dbeafe; border-color: rgba(147,197,253,.48); background: rgba(30,64,175,.24); font-size: 13px; font-weight: 900; }
    .rvm-tab-root [hidden].is-collapsed-by-diagnostic-bridge { display: none !important; }
  `;
  document.head.appendChild(style);
}
