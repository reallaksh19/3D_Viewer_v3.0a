const BRIDGE_VERSION = '20260621-rvm-property-collapse-1';
const PANEL_BIND_INTERVAL_MS = 250;
const PANEL_BIND_ATTEMPTS = 200;

const DEFAULT_COLLAPSED_SECTION_RE = /Browser RVM Performance|Native Tessellation|Primitive Fallback Review/i;

export function installRvmPropertyPanelCollapseAuditBridge() {
  injectStyles();
  let attempts = 0;
  const bind = () => {
    attempts += 1;
    const root = document.querySelector('[data-rvm-viewer]');
    if (root) {
      auditRvmPanelCollapse(root);
      bindPanelMutationObserver(root);
    }
    if (!root && attempts < PANEL_BIND_ATTEMPTS) setTimeout(bind, PANEL_BIND_INTERVAL_MS);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
}

function auditRvmPanelCollapse(root) {
  if (!root) return;
  syncWholePanelControls(root);
  const rightPanel = root.querySelector('.rvm-right-panel');
  if (rightPanel) {
    wrapDirectPropertyHeaders(rightPanel);
    normalizePropertySections(rightPanel);
  }
  compactHierarchyTree(root);
}

function wrapDirectPropertyHeaders(panel) {
  const headers = Array.from(panel.children)
    .filter((child) => child.classList?.contains('rvm-panel-header'));
  for (const header of headers) {
    const body = nextPropertyBody(header);
    if (!body) continue;
    const title = titleForHeader(header);
    const section = document.createElement('section');
    section.className = 'rvm-property-section';
    section.dataset.rvmSectionTitle = title;
    section.dataset.rvmCollapseAuditWrapped = BRIDGE_VERSION;
    panel.insertBefore(section, header);
    section.appendChild(header);
    section.appendChild(body);
    body.classList.add('rvm-property-section-body');
  }
}

function nextPropertyBody(header) {
  let next = header.nextElementSibling;
  while (next && isPanelChrome(next)) next = next.nextElementSibling;
  if (!next || next.classList?.contains('rvm-panel-header') || next.classList?.contains('rvm-property-section')) return null;
  return next;
}

function isPanelChrome(node) {
  return node.classList?.contains('rvm-left-panel-resize-handle')
    || node.classList?.contains('rvm-right-panel-resize-handle')
    || node.classList?.contains('rvm-property-section-resize');
}

function normalizePropertySections(panel) {
  const sections = Array.from(panel.querySelectorAll(':scope > .rvm-property-section'));
  for (const section of sections) {
    const header = section.querySelector(':scope > .rvm-panel-header');
    const body = section.querySelector(':scope > .rvm-property-section-body')
      || Array.from(section.children).find((child) => child !== header && !isPanelChrome(child));
    if (!header || !body) continue;
    body.classList.add('rvm-property-section-body');
    decorateSectionHeader(section, header, body);
    const shouldStartCollapsed = DEFAULT_COLLAPSED_SECTION_RE.test(sectionTitle(section, header));
    if (!section.dataset.rvmCollapseUserTouched && section.dataset.rvmCollapseAuditDefaulted !== BRIDGE_VERSION) {
      setSectionCollapsed(section, body, shouldStartCollapsed, { user: false });
      section.dataset.rvmCollapseAuditDefaulted = BRIDGE_VERSION;
    } else {
      setSectionCollapsed(section, body, section.classList.contains('is-collapsed') || body.hidden, { user: false });
    }
  }
}

function decorateSectionHeader(section, header, body) {
  header.classList.add('rvm-property-section-header');
  ensurePanelTitle(header, section.dataset.rvmSectionTitle || titleForHeader(header));
  const button = ensureSectionCollapseButton(section, header, body);
  if (header.dataset.rvmHeaderToggleBound !== BRIDGE_VERSION) {
    header.dataset.rvmHeaderToggleBound = BRIDGE_VERSION;
    header.addEventListener('click', (event) => {
      if (event.target?.closest?.('button, input, select, textarea, a, .rvm-property-section-resize')) return;
      setSectionCollapsed(section, body, !section.classList.contains('is-collapsed'), { user: true });
    });
    header.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target?.closest?.('button, input, select, textarea, a')) return;
      event.preventDefault();
      setSectionCollapsed(section, body, !section.classList.contains('is-collapsed'), { user: true });
    });
  }
  header.setAttribute('role', 'button');
  header.setAttribute('tabindex', '0');
  syncSectionButton(button, section, body);
}

function ensureSectionCollapseButton(section, header, body) {
  let button = header.querySelector('[data-rvm-section-collapse]')
    || header.querySelector('[data-rvm-property-section-collapse]')
    || header.querySelector('.rvm-panel-toggle');

  if (button && button.dataset.rvmCollapseAuditButton !== BRIDGE_VERSION) {
    const replacement = button.cloneNode(false);
    button.replaceWith(replacement);
    button = replacement;
  }
  if (!button) {
    button = document.createElement('button');
    header.appendChild(button);
  }

  button.type = 'button';
  button.className = 'rvm-panel-toggle rvm-property-collapse-icon';
  button.dataset.rvmSectionCollapse = 'true';
  button.dataset.rvmPropertySectionCollapse = 'true';
  button.dataset.rvmCollapseAuditButton = BRIDGE_VERSION;
  if (button.dataset.rvmCollapseAuditClick !== BRIDGE_VERSION) {
    button.dataset.rvmCollapseAuditClick = BRIDGE_VERSION;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setSectionCollapsed(section, body, !section.classList.contains('is-collapsed'), { user: true });
    });
  }
  syncSectionButton(button, section, body);
  return button;
}

function setSectionCollapsed(section, body, collapsed, options = {}) {
  const next = Boolean(collapsed);
  section.classList.toggle('is-collapsed', next);
  body.hidden = next;
  body.setAttribute('aria-hidden', next ? 'true' : 'false');
  if (options.user) section.dataset.rvmCollapseUserTouched = 'true';
  const button = section.querySelector('[data-rvm-property-section-collapse]');
  syncSectionButton(button, section, body);
}

function syncSectionButton(button, section, body) {
  if (!button || !section || !body) return;
  const collapsed = section.classList.contains('is-collapsed') || body.hidden;
  const title = sectionTitle(section, section.querySelector(':scope > .rvm-panel-header')) || 'section';
  button.textContent = collapsed ? '▸' : '▾';
  button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  button.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} ${title}`);
  button.title = `${collapsed ? 'Expand' : 'Collapse'} ${title}`;
}

function syncWholePanelControls(root) {
  syncSidePanelControl(root.querySelector('.rvm-left-panel'), 'left', 'Hierarchy');
  syncSidePanelControl(root.querySelector('.rvm-right-panel'), 'right', 'Properties');
}

function syncSidePanelControl(panel, side, title) {
  if (!panel) return;
  const header = panel.querySelector(':scope > .rvm-panel-header');
  if (!header) return;
  ensurePanelTitle(header, title);
  let button = header.querySelector('[data-rvm-side-collapse]');
  if (!button) return;
  if (button.dataset.rvmPanelCollapseAuditButton !== BRIDGE_VERSION) {
    const replacement = button.cloneNode(false);
    button.replaceWith(replacement);
    button = replacement;
  }
  button.type = 'button';
  button.className = 'rvm-panel-toggle rvm-side-collapse-icon';
  button.dataset.rvmSideCollapse = side;
  button.dataset.rvmPanelCollapseAuditButton = BRIDGE_VERSION;
  if (button.dataset.rvmPanelCollapseAuditClick !== BRIDGE_VERSION) {
    button.dataset.rvmPanelCollapseAuditClick = BRIDGE_VERSION;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      panel.classList.toggle('is-collapsed');
      syncSideButton(button, panel, side, title);
    });
  }
  syncSideButton(button, panel, side, title);
}

function syncSideButton(button, panel, side, title) {
  const collapsed = panel.classList.contains('is-collapsed');
  button.textContent = collapsed ? (side === 'left' ? '›' : '‹') : (side === 'left' ? '‹' : '›');
  button.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} ${title} panel`);
  button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  button.title = `${collapsed ? 'Expand' : 'Collapse'} ${title} panel`;
}

function compactHierarchyTree(root) {
  const tree = root.querySelector('.rvm-tree');
  if (tree) tree.dataset.rvmHierarchyFontReduced = BRIDGE_VERSION;
}

function bindPanelMutationObserver(root) {
  if (root._rvmPropertyCollapseAuditObserver) return;
  const rightPanel = root.querySelector('.rvm-right-panel');
  if (!rightPanel) return;
  let pending = false;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      auditRvmPanelCollapse(root);
    });
  });
  observer.observe(rightPanel, { childList: true, subtree: false });
  root._rvmPropertyCollapseAuditObserver = observer;
  root.addEventListener('rvm-tab-dispose', () => observer.disconnect(), { once: true });
}

function ensurePanelTitle(header, fallbackTitle) {
  let span = header.querySelector('.rvm-panel-title');
  if (span) return span;
  const text = titleForHeader(header) || fallbackTitle || '';
  header.textContent = '';
  span = document.createElement('span');
  span.className = 'rvm-panel-title';
  span.textContent = text;
  header.appendChild(span);
  return span;
}

function sectionTitle(section, header) {
  return String(section?.dataset?.rvmSectionTitle || titleForHeader(header) || '').trim();
}

function titleForHeader(header) {
  const title = header?.querySelector?.('.rvm-panel-title')?.textContent;
  if (title) return title.trim();
  return String(header?.textContent || '').replace(/[+−\-▸▾‹›]/g, '').trim();
}

function injectStyles() {
  let style = document.getElementById('rvm-property-panel-collapse-audit-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'rvm-property-panel-collapse-audit-style';
    document.head.appendChild(style);
  }
  style.textContent = `
    .rvm-tab-root .rvm-panel-header { cursor: default; }
    .rvm-tab-root .rvm-property-section > .rvm-panel-header {
      cursor: pointer;
      min-height: 28px;
      background: rgba(8, 16, 30, 0.34);
    }
    .rvm-tab-root .rvm-property-section > .rvm-panel-header:hover {
      background: rgba(74, 158, 255, 0.10);
      color: #d9eaff;
    }
    .rvm-tab-root .rvm-property-section.is-collapsed > .rvm-panel-header {
      border-bottom-color: transparent;
    }
    .rvm-tab-root .rvm-property-collapse-icon,
    .rvm-tab-root .rvm-side-collapse-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 22px;
      min-width: 22px;
      width: 22px;
      height: 20px;
      padding: 0;
      font-size: 13px;
      line-height: 1;
      font-weight: 900;
    }
    .rvm-tab-root .rvm-property-collapse-icon {
      color: #dbeafe;
      border-color: rgba(147, 197, 253, 0.48);
      background: rgba(30, 64, 175, 0.24);
    }
    .rvm-tab-root .rvm-side-collapse-icon {
      color: #bfe0ff;
      border-color: rgba(148, 163, 184, 0.40);
      background: rgba(15, 23, 42, 0.80);
    }
    .rvm-tab-root .rvm-property-section.is-collapsed .rvm-property-section-body,
    .rvm-tab-root .rvm-property-section.is-collapsed > .rvm-property-section-resize {
      display: none !important;
    }
    .rvm-tab-root .rvm-property-section-body[hidden] {
      display: none !important;
    }
    .rvm-tab-root .rvm-property-section:not(.is-collapsed) .rvm-property-section-body {
      display: block;
    }
    .rvm-tab-root .rvm-tree[data-rvm-hierarchy-font-reduced="${BRIDGE_VERSION}"],
    .rvm-tab-root .rvm-tree[data-rvm-hierarchy-font-reduced="${BRIDGE_VERSION}"] .rvm-tree-node,
    .rvm-tab-root .rvm-tree[data-rvm-hierarchy-font-reduced="${BRIDGE_VERSION}"] button,
    .rvm-tab-root .rvm-tree[data-rvm-hierarchy-font-reduced="${BRIDGE_VERSION}"] span {
      font-size: 9px !important;
    }
    .rvm-tab-root .rvm-tree[data-rvm-hierarchy-font-reduced="${BRIDGE_VERSION}"] li {
      padding: 2px 8px !important;
      line-height: 1.18;
    }
    .rvm-tab-root .rvm-tree[data-rvm-hierarchy-font-reduced="${BRIDGE_VERSION}"] .rvm-kind,
    .rvm-tab-root .rvm-tree[data-rvm-hierarchy-font-reduced="${BRIDGE_VERSION}"] .rvm-tree-count {
      font-size: 8px !important;
    }
  `;
}
