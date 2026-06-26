/**
 * XML->CII(2019) Workflow bridge boundary.
 */

import { getXmlCiiPhaseBridge } from './legacy-adapter.js?v=20260625-parsed-source-1';

const XML_CII_OBSOLETE_PIPING_CLASS_MASTER = 'Piping_class_master.json';
const XML_CII_WORKFLOW_SNAPSHOT_TTL_MS = 5000;
const XSD_KEY = 'condenseRigidXsd';
const XSD_SNAKE_KEY = 'condense_rigid_xsd';
const RESOLVED_KEY = 'splitCondensedValveFlange';
const RESOLVED_SNAKE_KEY = 'split_condensed_valve_flange';
const DROP_GASKET_KEY = 'dropGasketNodes';
const DROP_GASKET_ENRICHMENT_KEY = 'dropGasketsInEnrichment';
const DISABLE_GASKET_KEY = 'disableGasketNodes';
const DISABLE_GASKET_LEGACY_KEY = 'disableGasketInOutput';
// Generated 10000+ fallback node-number keeping is intentionally not user-configurable.
// Split fallback outputs are always suppressed back to -1 in staged-geometry-authority.

let cachedBridge = null;
let cachedSafeBridge = null;
let snapshotCache = { key: '', value: null, createdAt: 0 };
let snapshotGeneration = 0;

function nowMs() { return Date.now ? Date.now() : 0; }
function bool(value) { if (value === true) return true; if (value === false || value === null || value === undefined) return false; if (typeof value === 'number') return value !== 0; return /^(1|true|yes|on)$/i.test(String(value).trim()); }
function defaultTrue(value) { return value === undefined || value === null ? true : bool(value); }
function text(value) { return value === undefined || value === null ? '' : String(value).trim(); }
function parseConfigText(textValue) { try { const parsed = JSON.parse(String(textValue || '{}')); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }
function phaseKey(root) { return root?.dataset?.selectedPhase || 'regex'; }
function snapshotKey(root) { return `${snapshotGeneration}|${phaseKey(root)}`; }
function clearSnapshotCache() { snapshotGeneration += 1; snapshotCache = { key: '', value: null, createdAt: 0 }; }

function normaliseCondenseConfig(config) {
  const cfg = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  const xsd = bool(cfg[XSD_KEY]) || bool(cfg[XSD_SNAKE_KEY]);
  const resolved = bool(cfg[RESOLVED_KEY]) || bool(cfg[RESOLVED_SNAKE_KEY]);
  const dropGasket = bool(cfg[DISABLE_GASKET_KEY]) || bool(cfg[DISABLE_GASKET_LEGACY_KEY]) || (defaultTrue(cfg[DROP_GASKET_KEY]) && defaultTrue(cfg[DROP_GASKET_ENRICHMENT_KEY]));
  cfg[XSD_KEY] = xsd;
  cfg[XSD_SNAKE_KEY] = xsd;
  cfg[RESOLVED_KEY] = resolved;
  cfg[RESOLVED_SNAKE_KEY] = resolved;
  cfg[DROP_GASKET_KEY] = dropGasket;
  cfg[DROP_GASKET_ENRICHMENT_KEY] = dropGasket;
  cfg[DISABLE_GASKET_KEY] = false;
  cfg[DISABLE_GASKET_LEGACY_KEY] = false;
  delete cfg.allowFallbackHighNodeNumbers;
  delete cfg.allow10000FallbackNodeNumbers;
  return cfg;
}

function bridgeConfig(base) { return normaliseCondenseConfig(parseConfigText(base?.exportPopupConfigText?.() || '{}')); }
function writeBridgeConfig(base, config) { base?.importPopupConfigText?.(JSON.stringify(normaliseCondenseConfig(config || {}), null, 2)); clearSnapshotCache(); }

function mergeCondenseBoolKeys(editedText, bools = {}) {
  const cfg = normaliseCondenseConfig(parseConfigText(editedText));
  if (Object.prototype.hasOwnProperty.call(bools, XSD_KEY) || Object.prototype.hasOwnProperty.call(bools, XSD_SNAKE_KEY)) { const enabled = bool(bools[XSD_KEY]) || bool(bools[XSD_SNAKE_KEY]); cfg[XSD_KEY] = enabled; cfg[XSD_SNAKE_KEY] = enabled; }
  if (Object.prototype.hasOwnProperty.call(bools, RESOLVED_KEY) || Object.prototype.hasOwnProperty.call(bools, RESOLVED_SNAKE_KEY)) { const enabled = bool(bools[RESOLVED_KEY]) || bool(bools[RESOLVED_SNAKE_KEY]); cfg[RESOLVED_KEY] = enabled; cfg[RESOLVED_SNAKE_KEY] = enabled; }
  if (Object.prototype.hasOwnProperty.call(bools, DISABLE_GASKET_KEY) || Object.prototype.hasOwnProperty.call(bools, DISABLE_GASKET_LEGACY_KEY) || Object.prototype.hasOwnProperty.call(bools, DROP_GASKET_KEY) || Object.prototype.hasOwnProperty.call(bools, DROP_GASKET_ENRICHMENT_KEY)) { const enabled = bool(bools[DISABLE_GASKET_KEY]) || bool(bools[DISABLE_GASKET_LEGACY_KEY]) || bool(bools[DROP_GASKET_KEY]) || bool(bools[DROP_GASKET_ENRICHMENT_KEY]); cfg[DROP_GASKET_KEY] = enabled; cfg[DROP_GASKET_ENRICHMENT_KEY] = enabled; cfg[DISABLE_GASKET_KEY] = false; cfg[DISABLE_GASKET_LEGACY_KEY] = false; }
  return JSON.stringify(normaliseCondenseConfig(cfg), null, 2);
}

function hydrateCondenseSnapshot(snapshot, base) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  const cfg = bridgeConfig(base);
  snapshot.run = snapshot.run && typeof snapshot.run === 'object' ? snapshot.run : {};
  snapshot.run.options = snapshot.run.options && typeof snapshot.run.options === 'object' ? snapshot.run.options : {};
  snapshot.run.options[XSD_KEY] = bool(snapshot.run.options[XSD_KEY]) || cfg[XSD_KEY];
  snapshot.run.options[RESOLVED_KEY] = bool(snapshot.run.options[RESOLVED_KEY]) || bool(snapshot.run.options[RESOLVED_SNAKE_KEY]) || cfg[RESOLVED_KEY];
  snapshot.run.options[DROP_GASKET_KEY] = cfg[DROP_GASKET_KEY];
  delete snapshot.run.options.allowFallbackHighNodeNumbers;
  delete snapshot.run.options.allow10000FallbackNodeNumbers;
  snapshot.config = snapshot.config && typeof snapshot.config === 'object' ? snapshot.config : {};
  snapshot.config[XSD_KEY] = cfg[XSD_KEY];
  snapshot.config[RESOLVED_KEY] = cfg[RESOLVED_KEY];
  snapshot.config[DROP_GASKET_KEY] = cfg[DROP_GASKET_KEY];
  snapshot.config[DROP_GASKET_ENRICHMENT_KEY] = cfg[DROP_GASKET_KEY];
  snapshot.config[DISABLE_GASKET_KEY] = false;
  snapshot.config[DISABLE_GASKET_LEGACY_KEY] = false;
  delete snapshot.config.allowFallbackHighNodeNumbers;
  delete snapshot.config.allow10000FallbackNodeNumbers;
  return snapshot;
}

function writeCondenseRunOption(base, key, enabled) {
  const cfg = bridgeConfig(base);
  if (key === XSD_KEY || key === XSD_SNAKE_KEY) { cfg[XSD_KEY] = !!enabled; cfg[XSD_SNAKE_KEY] = !!enabled; }
  if (key === RESOLVED_KEY || key === RESOLVED_SNAKE_KEY) { cfg[RESOLVED_KEY] = !!enabled; cfg[RESOLVED_SNAKE_KEY] = !!enabled; }
  if (key === DISABLE_GASKET_KEY || key === DISABLE_GASKET_LEGACY_KEY || key === DROP_GASKET_KEY || key === DROP_GASKET_ENRICHMENT_KEY) { cfg[DROP_GASKET_KEY] = !!enabled; cfg[DROP_GASKET_ENRICHMENT_KEY] = !!enabled; cfg[DISABLE_GASKET_KEY] = false; cfg[DISABLE_GASKET_LEGACY_KEY] = false; }
  writeBridgeConfig(base, cfg);
}

function sanitizeSnapshot(value) { if (!value || typeof value !== 'object') return value; const masters = Array.isArray(value.masterDefs) ? value.masterDefs : []; for (const master of masters) { if (master?.key === 'pipingClass' && typeof master.defaultUrl === 'string' && master.defaultUrl.includes(XML_CII_OBSOLETE_PIPING_CLASS_MASTER)) master.defaultUrl = ''; } return value; }
function cachedSnapshot(base, root) { if (!base?.getPopupSnapshot) return null; const key = snapshotKey(root); const createdAt = nowMs(); if (snapshotCache.key === key && snapshotCache.value && createdAt - snapshotCache.createdAt < XML_CII_WORKFLOW_SNAPSHOT_TTL_MS) return snapshotCache.value; const value = hydrateCondenseSnapshot(sanitizeSnapshot(base.getPopupSnapshot(root)), base); if (value) snapshotCache = { key, value, createdAt }; return value; }
function normalizeComponentRefNo(value) { return text(value).replace(/^=/, ''); }
function componentRefEndpoint(componentRefNo, endpoint) { const ref = normalizeComponentRefNo(componentRefNo); const ep = text(endpoint); return ref && ep ? `${ref}_${ep}` : ref; }
function nodeText(node, name) { const child = [...(node?.childNodes || [])].find((item) => item.nodeType === 1 && String(item.localName || item.nodeName).replace(/^.*:/, '') === name); return text(child?.textContent); }
function parseXmlNodeMeta(xmlText) { const byKey = new Map(); const source = text(xmlText); if (!source) return byKey; if (typeof DOMParser !== 'undefined') { try { const document = new DOMParser().parseFromString(source, 'application/xml'); if (!document.getElementsByTagName('parsererror').length) { for (const branch of [...document.getElementsByTagName('Branch')]) { const branchName = nodeText(branch, 'Branchname'); for (const node of [...branch.getElementsByTagName('Node')]) { const nodeNumber = nodeText(node, 'NodeNumber'); if (!nodeNumber) continue; const meta = { branchName, nodeNumber, componentRefNo: nodeText(node, 'ComponentRefNo'), endpoint: nodeText(node, 'Endpoint'), componentType: nodeText(node, 'ComponentType') }; meta.componentRefEndpoint = componentRefEndpoint(meta.componentRefNo, meta.endpoint); byKey.set(`${branchName}::${nodeNumber}`, meta); if (!byKey.has(nodeNumber)) byKey.set(nodeNumber, meta); } } return byKey; } } catch {} } for (const branchMatch of source.matchAll(/<Branch\b[\s\S]*?<\/Branch>/gi)) { const branchBlock = branchMatch[0]; const branchName = text(branchBlock.match(/<Branchname[^>]*>([\s\S]*?)<\/Branchname>/i)?.[1]?.replace(/<[^>]+>/g, '')); for (const nodeMatch of branchBlock.matchAll(/<Node\b[\s\S]*?<\/Node>/gi)) { const nodeBlock = nodeMatch[0]; const read = (name) => text(nodeBlock.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1]?.replace(/<[^>]+>/g, '')); const nodeNumber = read('NodeNumber'); if (!nodeNumber) continue; const meta = { branchName, nodeNumber, componentRefNo: read('ComponentRefNo'), endpoint: read('Endpoint'), componentType: read('ComponentType') }; meta.componentRefEndpoint = componentRefEndpoint(meta.componentRefNo, meta.endpoint); byKey.set(`${branchName}::${nodeNumber}`, meta); if (!byKey.has(nodeNumber)) byKey.set(nodeNumber, meta); } } return byKey; }
async function readCurrentXmlText() { const input = typeof document !== 'undefined' ? document.querySelector?.('#model-converters-primary-input') : null; const file = input?.files?.[0]; if (!file || typeof file.text !== 'function') return ''; return file.text().catch(() => ''); }
async function augmentWeightRowsWithNodeMeta(rows) { const safeRows = Array.isArray(rows) ? rows : []; if (!safeRows.length) return safeRows; const meta = parseXmlNodeMeta(await readCurrentXmlText()); return safeRows.map((row) => { const key = `${text(row?.branchName)}::${text(row?.nodeNumber)}`; const nodeMeta = meta.get(key) || meta.get(text(row?.nodeNumber)) || {}; const componentRefNo = nodeMeta.componentRefNo || row?.componentRefNo || ''; const endpoint = nodeMeta.endpoint || row?.endpoint || ''; return { ...row, componentRefNo, endpoint, componentType: row?.componentType || nodeMeta.componentType || '', componentRefEndpoint: row?.componentRefEndpoint || nodeMeta.componentRefEndpoint || componentRefEndpoint(componentRefNo, endpoint) }; }); }
function wrapInvalidatingAsync(base, methodName) { const original = base?.[methodName]?.bind(base); if (!original) return undefined; return async (...args) => { const result = await original(...args); clearSnapshotCache(); return result; }; }
function wrapInvalidatingSync(base, methodName) { const original = base?.[methodName]?.bind(base); if (!original) return undefined; return (...args) => { const result = original(...args); clearSnapshotCache(); return result; }; }

function xmlCiiWorkflowWrapBridge(base) { if (!base) return null; if (base === cachedBridge && cachedSafeBridge) return cachedSafeBridge; const safe = Object.create(base); Object.assign(safe, base); safe.__xmlCiiWorkflowSafeBridge = true; safe.ensureDefaultMastersLoaded = async () => null; const originalLoadDefault = base.loadPopupDefaultMaster?.bind(base); safe.loadPopupDefaultMaster = async (masterKey) => { if (masterKey === 'pipingClass') return null; const result = await originalLoadDefault?.(masterKey); clearSnapshotCache(); return result ?? null; }; const originalSetRunOption = base.setPopupRunOption?.bind(base); safe.setPopupRunOption = (key, value, type) => { if ([XSD_KEY, XSD_SNAKE_KEY, RESOLVED_KEY, RESOLVED_SNAKE_KEY, DROP_GASKET_KEY, DROP_GASKET_ENRICHMENT_KEY, DISABLE_GASKET_KEY, DISABLE_GASKET_LEGACY_KEY].includes(key)) writeCondenseRunOption(base, key, !!value); const result = originalSetRunOption?.(key, value, type); clearSnapshotCache(); return result; }; const originalSaveConfigText = base.savePopupConfigText?.bind(base); safe.savePopupConfigText = (editedText, bools) => { const nextText = mergeCondenseBoolKeys(editedText, bools || {}); const result = originalSaveConfigText?.(nextText, bools); clearSnapshotCache(); return result; }; const originalComputePopupWeightRows = base.computePopupWeightRows?.bind(base); safe.computePopupWeightRows = originalComputePopupWeightRows ? async (...args) => augmentWeightRowsWithNodeMeta(await originalComputePopupWeightRows(...args)) : undefined; safe.getPopupSnapshot = (root) => cachedSnapshot(base, root); safe.importPopupMasterFile = wrapInvalidatingAsync(base, 'importPopupMasterFile'); safe.autoMapPopupMaster = wrapInvalidatingSync(base, 'autoMapPopupMaster'); safe.setPopupMasterField = wrapInvalidatingSync(base, 'setPopupMasterField'); safe.savePopupMaster = wrapInvalidatingSync(base, 'savePopupMaster'); safe.clearPopupMaster = wrapInvalidatingSync(base, 'clearPopupMaster'); safe.setPopupConfigValue = wrapInvalidatingSync(base, 'setPopupConfigValue'); safe.importPopupConfigText = wrapInvalidatingSync(base, 'importPopupConfigText'); safe.applyPopupPreferredWeights = wrapInvalidatingSync(base, 'applyPopupPreferredWeights'); const originalNotify = base.notify?.bind(base); safe.notify = (message, options = {}) => { const msg = `${message || ''} ${options?.message || ''} ${options?.url || ''}`; if (msg.includes(XML_CII_OBSOLETE_PIPING_CLASS_MASTER)) return null; return originalNotify?.(message, options) ?? null; }; cachedBridge = base; cachedSafeBridge = safe; clearSnapshotCache(); return safe; }

export function xmlCiiWorkflowGetBridge() { return xmlCiiWorkflowWrapBridge(getXmlCiiPhaseBridge?.() || null); }
export function xmlCiiWorkflowGetSnapshot(root) { return xmlCiiWorkflowGetBridge()?.getPopupSnapshot?.(root) || null; }
export function xmlCiiWorkflowSetConfigValue(path, value, valueType = 'text') { return xmlCiiWorkflowGetBridge()?.setPopupConfigValue?.(path, value, valueType); }
export function xmlCiiWorkflowSetMasterField(masterKey, fieldKey, value) { return xmlCiiWorkflowGetBridge()?.setPopupMasterField?.(masterKey, fieldKey, value); }
export function xmlCiiWorkflowInvalidateSnapshot() { clearSnapshotCache(); }
export function xmlCiiWorkflowClosePopup() { return xmlCiiWorkflowGetBridge()?.closePopup?.(); }
