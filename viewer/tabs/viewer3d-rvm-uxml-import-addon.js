import { emit } from '../core/event-bus.js';
import { RuntimeEvents } from '../contracts/runtime-events.js';
import { notify } from '../diagnostics/notification-center.js';
import { AvevaJsonLoader } from '../rvm/AvevaJsonLoader.js';
import {
  convertUxmlDocumentToAvevaHierarchy,
  isUxmlDocument,
} from '../rvm/UxmlToAvevaJsonAdapter.js?v=20260618-uxml-support-parity-1';

const FLAG = '__RVM_UXML_IMPORT_ADDON_OLET_BORE_ALIAS_V2__';

function lowerName(fileOrName = '') {
  return String(fileOrName?.name || fileOrName || '').toLowerCase();
}

function isUxmlName(name = '') {
  const lower = lowerName(name);
  return lower.endsWith('.uxml') || lower.endsWith('.uxml.json') || lower.includes('.uxml.');
}

function isJsonLikeName(name = '') {
  const lower = lowerName(name);
  return lower.endsWith('.json') || lower.endsWith('.uxml') || lower.includes('.uxml.');
}

function clean(value) {
  return String(value ?? '').trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function boreNumber(value) {
  const n = Number.parseFloat(String(value ?? '').replace(/mm\b/gi, '').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formattedBore(value) {
  const n = boreNumber(value);
  if (n == null) return '';
  return `${Number.isInteger(n) ? n : Number(n.toFixed(3))}mm`;
}

function firstBoreField(attrs, fields) {
  for (const field of fields) {
    const raw = attrs?.[field];
    const n = boreNumber(raw);
    if (n != null) return { field, value: n, raw: clean(raw) || formattedBore(n) };
  }
  return null;
}

function chooseRunBoreForRender(attrs = {}) {
  const normType = upper(attrs.UXML_NORMALIZED_TYPE || attrs.TYPE);

  // TEE/OLET visual run/header diameter must come from the run side only.
  // Branch/outlet bores belong in BBORE/BRBORE/OUTLET_BORE and must never drive
  // the header pipe radius.
  if (normType === 'OLET' || normType === 'TEE') {
    return firstBoreField(attrs, ['ABORE', 'BORE', 'LBORE']);
  }

  // Reducers render from the inlet/run side; the outlet/end bore is used by the
  // reducer taper logic, not by the upstream pipe/header radius.
  if (normType === 'REDUCER' || normType === 'REDU') {
    return firstBoreField(attrs, ['ABORE', 'BORE', 'LBORE', 'TBOR']);
  }

  // Generic UXML components: prefer start/run bore, then scalar bore, then end.
  // BBORE is intentionally excluded because it is outlet-only.
  return firstBoreField(attrs, ['ABORE', 'BORE', 'LBORE', 'TBOR']);
}

function applyUxmlRenderBoreGuardToNode(node, branchAttrs = {}) {
  if (!node || typeof node !== 'object') return;
  const attrs = node.attributes && typeof node.attributes === 'object' ? node.attributes : null;
  if (attrs && upper(attrs.SOURCE_FORMAT) === 'UXML') {
    let bore = chooseRunBoreForRender(attrs);

    // If a UXML PIPE came through with only an end bore, use the owning branch
    // bore as the run/header fallback before allowing the end bore to drive the
    // whole pipe. This prevents child-branch LBORE leaking into parent/header runs.
    if (upper(attrs.TYPE) === 'PIPE' && bore?.field === 'LBORE') {
      const branchBore = firstBoreField(branchAttrs, ['ABORE', 'HBOR', 'BORE', 'TBOR', 'LBORE']);
      if (branchBore) bore = branchBore;
    }

    if (bore) {
      attrs.RVM_RENDER_BORE = formattedBore(bore.value);
      attrs.RVM_RENDER_BORE_SOURCE = bore.field;
      // AvevaJsonLoader picks the first available run-bore field. Use ABORE as a
      // UXML-only render alias because OLET/TEE branch-radius logic deliberately
      // reads HBOR/TBOR/BBORE. Using HBOR here makes OLET outlet nozzles inherit
      // the parent/header size. ABORE drives main run radius without polluting
      // outlet/branch bore resolution.
      attrs.ABORE = attrs.RVM_RENDER_BORE;
      attrs.UXML_RENDER_BORE_GUARD = 'true';
    }
  }
  if (Array.isArray(node.children)) {
    const nextBranchAttrs = upper(node.type || attrs?.TYPE) === 'BRANCH'
      ? (attrs || branchAttrs)
      : branchAttrs;
    for (const child of node.children) applyUxmlRenderBoreGuardToNode(child, nextBranchAttrs);
  }
}

function applyUxmlRenderBoreGuard(hierarchy = []) {
  for (const root of Array.isArray(hierarchy) ? hierarchy : []) {
    applyUxmlRenderBoreGuardToNode(root, root?.attributes || {});
  }
  return hierarchy;
}

function patchFileInput() {
  const input = document.querySelector('#rvm-universal-file-input');
  if (!input) return;
  const accept = String(input.getAttribute('accept') || '');
  if (!accept.includes('.uxml')) input.setAttribute('accept', `${accept},.uxml,.uxml.json`);
  const label = input.closest('label');
  if (label) label.title = 'Load dataset (RVM, REV, JSON Bundle, ATT TXT, GLB, UXML)';
}

function makeSession() {
  return {
    update() {},
    complete() {},
    fail() {},
    isStale() { return false; },
    isCancelled() { return false; },
  };
}

function setStatusText(message) {
  const bottom = document.querySelector('#rvm-sb-msg');
  if (bottom) bottom.textContent = message;
}

function unwrapUxmlDocument(value) {
  if (isUxmlDocument(value)) return value;
  const candidates = [
    value?.uxml,
    value?.uxmlDocument,
    value?.document,
    value?.data,
    value?.payload,
  ];
  return candidates.find((candidate) => isUxmlDocument(candidate)) || null;
}

async function loadUxmlDocument(doc, fileName) {
  const hierarchy = applyUxmlRenderBoreGuard(convertUxmlDocumentToAvevaHierarchy(doc, { fileName }));

  emit(RuntimeEvents.FILE_LOADED, {
    name: `${fileName}.aveva-json`,
    source: 'rvm-uxml-import-addon',
    payload: hierarchy,
    kind: 'aveva-json',
    sourceKind: 'uxml',
    uxml: doc,
  });

  // Use the same loader/event contract as managed_stage.json. AvevaJsonLoader.load()
  // emits RVM_MODEL_LOADED, and the active 3D RVM tab owns setModel/tree/search/status.
  const loader = new AvevaJsonLoader();
  await loader.load(hierarchy, { sourceKind: 'uxml', fileName }, makeSession());

  const componentCount = Array.isArray(doc.components) ? doc.components.length : 0;
  setStatusText(`UXML loaded | Branches ${hierarchy.length.toLocaleString()} | Components ${componentCount.toLocaleString()}`);
  notify({
    type: 'info',
    message: `Loaded UXML: ${hierarchy.length} branch(es), ${componentCount} component(s).`,
  });
}

async function importJsonLikeFiles(files = []) {
  let uxmlCount = 0;
  let passthroughCount = 0;

  for (const file of files) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const doc = unwrapUxmlDocument(parsed);
    if (doc) {
      uxmlCount += 1;
      await loadUxmlDocument(doc, file.name);
    } else {
      passthroughCount += 1;
      const isBundleManifest = Boolean(parsed) && typeof parsed === 'object' && parsed.schemaVersion === 'rvm-bundle/v1';
      emit(RuntimeEvents.FILE_LOADED, {
        name: file.name,
        source: 'rvm-tab',
        payload: parsed,
        kind: isBundleManifest ? 'bundle' : 'aveva-json',
      });
    }
  }

  if (uxmlCount && passthroughCount) {
    notify({ type: 'warning', message: 'Imported UXML and passed through non-UXML JSON file(s).' });
  }
}

function installInputHook() {
  window.addEventListener('change', async (event) => {
    const input = event.target?.closest?.('#rvm-universal-file-input');
    if (!input) return;
    const files = Array.from(input.files || []);
    const jsonLikeFiles = files.filter((file) => isJsonLikeName(file.name) || isUxmlName(file.name));
    if (!jsonLikeFiles.length) return;

    // Capture at window phase before older document-level JSON/UXML hooks can run.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    try {
      await importJsonLikeFiles(jsonLikeFiles);
      const skipped = files.length - jsonLikeFiles.length;
      if (skipped > 0) notify({ type: 'warning', message: 'Import UXML/JSON separately from RVM/GLB/STP files.' });
    } catch (err) {
      notify({ type: 'error', message: `UXML/JSON import failed: ${err.message || err}` });
    } finally {
      input.value = '';
    }
  }, true);
}

export function installRvmUxmlImportAddon() {
  if (window[FLAG]) return;
  window[FLAG] = true;
  patchFileInput();
  window.addEventListener('rvm-tab-ready', patchFileInput);
  new MutationObserver(patchFileInput).observe(document.body, { childList: true, subtree: true });
  installInputHook();
}

installRvmUxmlImportAddon();
