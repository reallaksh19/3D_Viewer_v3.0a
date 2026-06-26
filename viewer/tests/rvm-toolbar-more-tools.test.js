import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const viewerRoot = path.resolve(__dirname, '..');
const controllerPath = path.join(viewerRoot, 'tabs/RvmToolbarOverflowController.js');
const compactPath = path.join(viewerRoot, 'tabs/RvmToolbarCompactBridge.js');
const rendererPath = path.join(viewerRoot, 'tabs/viewer3d-rvm-tab-renderer.js');

function read(file) {
  assert.ok(fs.existsSync(file), `missing file: ${path.relative(viewerRoot, file)}`);
  return fs.readFileSync(file, 'utf8');
}

class ListenerTarget {
  constructor() {
    this.listeners = new Map();
  }
  addEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    list.push(handler);
    this.listeners.set(type, list);
  }
  removeEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    this.listeners.set(type, list.filter((item) => item !== handler));
  }
  dispatch(type, event) {
    for (const handler of [...(this.listeners.get(type) || [])]) handler(event);
  }
  listenerCount(type) {
    return (this.listeners.get(type) || []).length;
  }
}

class FakeClassList {
  constructor(owner) {
    this.owner = owner;
    this.values = new Set();
  }
  add(value) {
    this.values.add(value);
    this.owner.className = [...this.values].join(' ');
  }
  remove(value) {
    this.values.delete(value);
    this.owner.className = [...this.values].join(' ');
  }
  contains(value) {
    return this.values.has(value);
  }
  toggle(value, force) {
    const enabled = force === undefined ? !this.values.has(value) : Boolean(force);
    if (enabled) this.add(value);
    else this.remove(value);
    return enabled;
  }
}

class FakeElement extends ListenerTarget {
  constructor(tagName = 'div') {
    super();
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.parentElement = null;
    this.dataset = {};
    this.attributes = new Map();
    this.className = '';
    this.classList = new FakeClassList(this);
    this.hidden = false;
    this.id = '';
    this.focused = false;
  }
  appendChild(child) {
    child.parentNode = this;
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  setAttribute(name, value) {
    if (name === 'id') this.id = String(value);
    this.attributes.set(name, String(value));
  }
  getAttribute(name) {
    if (name === 'id') return this.id || null;
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  querySelectorAll(selector) {
    const selectors = String(selector).split(',').map((item) => item.trim()).filter(Boolean);
    const found = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (selectors.some((item) => matches(child, item))) found.push(child);
        walk(child);
      }
    };
    walk(this);
    return found;
  }
  closest(selector) {
    let cursor = this;
    while (cursor) {
      if (matches(cursor, selector)) return cursor;
      cursor = cursor.parentElement;
    }
    return null;
  }
  contains(node) {
    let cursor = node;
    while (cursor) {
      if (cursor === this) return true;
      cursor = cursor.parentElement || cursor.parentNode;
    }
    return false;
  }
  focus() {
    this.focused = true;
  }
}

function matches(node, selector) {
  if (!node) return false;
  if (selector.startsWith('[data-') && selector.endsWith(']')) {
    const key = selector.slice(6, -1).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return Object.prototype.hasOwnProperty.call(node.dataset, key);
  }
  if (selector.startsWith('.')) return node.classList.contains(selector.slice(1));
  return false;
}

function makeEvent(target, extras = {}) {
  return {
    target,
    prevented: false,
    stopped: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
    ...extras,
  };
}

function buildToolbarDom() {
  const root = new FakeElement('section');
  root.dataset.rvmViewer = 'true';
  const overflow = root.appendChild(new FakeElement('div'));
  overflow.dataset.rvmToolbarMoreRoot = 'test';
  overflow.classList.add('rvm-toolbar-more');
  const button = overflow.appendChild(new FakeElement('button'));
  button.dataset.rvmToolbarMore = '';
  const menu = overflow.appendChild(new FakeElement('div'));
  menu.dataset.rvmToolsMenu = '';
  menu.dataset.rvmToolbarMorePanel = '';
  menu.hidden = true;
  return { root, overflow, button, menu };
}

function verifyStaticContracts() {
  const controller = read(controllerPath);
  const compact = read(compactPath);
  const renderer = read(rendererPath);
  assert.ok(controller.includes('installRvmToolbarOverflow'), 'overflow controller must expose install lifecycle');
  assert.ok(controller.includes('disposeRvmToolbarOverflow'), 'overflow controller must expose dispose lifecycle');
  assert.ok(controller.includes('syncRvmToolbarOverflow'), 'overflow controller must expose sync lifecycle');
  assert.ok(controller.includes('[data-rvm-toolbar-more]'), 'overflow controller must bind the More button by scoped data attribute');
  assert.ok(controller.includes('[data-rvm-tools-menu]'), 'overflow controller must bind the target menu by scoped data attribute');
  assert.ok(controller.includes("event?.key !== 'Escape'"), 'overflow controller must handle Escape close');
  assert.ok(controller.includes('outside-pointerdown'), 'overflow controller must close on outside pointerdown');
  assert.ok(!controller.includes('MutationObserver'), 'overflow open/close behavior must not rely on MutationObserver');
  assert.ok(compact.includes('RvmToolbarOverflowController.js?v=20260626-rvm-toolbar-overflow-controller-1'), 'compact toolbar must import the overflow owner');
  assert.ok(compact.includes('installRvmToolbarOverflow(root'), 'compact toolbar must install the overflow owner against the RVM root');
  assert.ok(compact.includes('data-rvm-toolbar-more'), 'compact toolbar must render a stable More button selector');
  assert.ok(compact.includes('data-rvm-tools-menu'), 'compact toolbar must render a stable More menu selector');
  assert.ok(!compact.includes('<details'), 'compact toolbar must not rely on native details toggle for More Tools');
  assert.ok(renderer.includes('RvmToolbarCompactBridge.js?v=20260626-rvm-toolbar-compact-policy-2'), 'renderer must load compact toolbar policy v2');
}

async function verifyRuntimeBehavior() {
  const documentTarget = new ListenerTarget();
  documentTarget.querySelector = () => null;
  globalThis.document = documentTarget;
  const module = await import('../tabs/RvmToolbarOverflowController.js');
  const { root, button, menu } = buildToolbarDom();

  let diagnostics = module.installRvmToolbarOverflow(root, { reason: 'test' });
  assert.equal(root.listenerCount('click'), 1, 'install must add exactly one root click listener');
  assert.equal(document.listenerCount('keydown'), 1, 'install must add exactly one document keydown listener');
  assert.equal(document.listenerCount('pointerdown'), 1, 'install must add exactly one document pointerdown listener');
  assert.equal(diagnostics.open, false, 'menu starts closed');
  assert.equal(button.getAttribute('aria-expanded'), 'false', 'closed button aria-expanded must be false');
  assert.equal(menu.hidden, true, 'closed menu must be hidden');

  root.dispatch('click', makeEvent(button));
  assert.equal(button.getAttribute('aria-expanded'), 'true', 'click opens the More Tools menu');
  assert.equal(menu.hidden, false, 'open menu must be visible');

  root.dispatch('click', makeEvent(button));
  assert.equal(button.getAttribute('aria-expanded'), 'false', 'second click closes the More Tools menu');
  assert.equal(menu.hidden, true, 'closed menu must be hidden after second click');

  root.dispatch('click', makeEvent(button));
  document.dispatch('keydown', makeEvent(button, { key: 'Escape' }));
  assert.equal(button.getAttribute('aria-expanded'), 'false', 'Escape closes the More Tools menu');
  assert.equal(button.focused, true, 'Escape returns focus to the More Tools button');

  root.dispatch('click', makeEvent(button));
  document.dispatch('pointerdown', makeEvent(new FakeElement('main')));
  assert.equal(button.getAttribute('aria-expanded'), 'false', 'outside pointerdown closes the More Tools menu');

  diagnostics = module.installRvmToolbarOverflow(root, { reason: 'repeat' });
  assert.equal(root.listenerCount('click'), 1, 'repeat install must not duplicate root click listener');
  assert.equal(document.listenerCount('keydown'), 1, 'repeat install must not duplicate keydown listener');
  assert.equal(document.listenerCount('pointerdown'), 1, 'repeat install must not duplicate pointerdown listener');
  assert.equal(diagnostics.installCount, 2, 'repeat install must be recorded without duplicate listeners');

  assert.equal(module.disposeRvmToolbarOverflow(root), true, 'dispose must remove installed lifecycle');
  assert.equal(root.listenerCount('click'), 0, 'dispose must remove root click listener');
  assert.equal(document.listenerCount('keydown'), 0, 'dispose must remove keydown listener');
  assert.equal(document.listenerCount('pointerdown'), 0, 'dispose must remove pointerdown listener');
}

verifyStaticContracts();
await verifyRuntimeBehavior();
console.log('Verified RVM More Tools overflow controller selectors, open/close behavior, Escape/outside close, aria-expanded state, idempotent install, and dispose lifecycle.');
