import { normalizeRvmReviewPath } from './RvmHierarchyModelBuilder.js?v=20260622-rvm-deep-path-recovery-1';

const INSTALL_FLAG = Symbol.for('pcf-glb-rvm-deep-source-path-recovery-v1');
const VERSION = '20260622-rvm-deep-source-path-recovery-1';
const GENERIC_BUCKETS = new Set(['EQUIPMENT', 'STRUCTURE', 'STRUCTURES', 'PIPING', 'PIPE', 'CIVIL', 'MODEL', 'RVM', 'REV']);
const PLANT_PART_RE = /^(BTRM|[A-Z]{2,}[-_]\d|[A-Z]+[-_]\d|CU[-_]|PS[-_]?|SL[-_]?|PIPE[-_]|STRU[-_]|EQUI[-_])/i;
const GENERIC_PRIM_RE = /^RVM\s+RVM_PRIM_CODE/i;

export function installRvmDeepSourcePathRecoveryBridge() {
  if (typeof globalThis === 'undefined') return null;
  if (globalThis[INSTALL_FLAG]) return globalThis[INSTALL_FLAG];
  const state = {
    version: VERSION,
    recoveredCount: 0,
    lastDiagnostics: null,
    recoverNow: () => recoverActiveViewerPaths(),
    recoverInstruction: recoverRvmDeepSourcePathFromInstruction,
    recoverObject: recoverRvmDeepSourcePathFromObject,
  };
  globalThis[INSTALL_FLAG] = state;
  globalThis.__PCF_GLB_RVM_DEEP_SOURCE_PATH_RECOVERY__ = state;
  const schedule = () => setTimeout(() => {
    const diagnostics = recoverActiveViewerPaths();
    state.lastDiagnostics = diagnostics;
    state.recoveredCount = diagnostics.recoveredCount;
  }, 20);
  try { globalThis.addEventListener?.('rvm-model-loaded', schedule); } catch (_) {}
  try { globalThis.addEventListener?.('rvm-render-policy-diagnostics', schedule); } catch (_) {}
  for (const delay of [200, 800, 1600]) setTimeout(schedule, delay);
  return state;
}

export function recoverRvmDeepSourcePathFromInstruction(instruction = {}, options = {}) {
  return recoverDeepRvmSourcePathFromCandidates(sourcePathCandidatesFromInstruction(instruction), options);
}

export function recoverRvmDeepSourcePathFromObject(object = {}, options = {}) {
  return recoverDeepRvmSourcePathFromCandidates(sourcePathCandidatesFromObject(object), options);
}

export function sourcePathCandidatesFromInstruction(instruction = {}) {
  const attrs = instruction.attributes || {};
  const props = instruction.browserRvmProperties || {};
  const att = instruction.att || {};
  const attAttrs = instruction.attAttributes || {};
  return uniqueStrings([
    instruction.sourcePath,
    props.sourcePath,
    props.SourcePath,
    props.fullPath,
    props.FullPath,
    props.reviewPath,
    props.ReviewPath,
    attrs.RVM_OWNER_PATH,
    attrs.RVM_OWNER_NAME,
    attrs.RVM_SOURCE_PATH,
    attrs.RVM_REVIEW_PATH,
    attrs.RVM_REVIEW_NAME,
    attrs.REVIEW_NAME,
    attrs.FULL_PATH,
    attrs.PATH,
    attrs.NAME,
    att.DTXR_POS,
    att.DTXR,
    att.DESCRIPTION,
    att.DESC,
    attAttrs.DTXR_POS,
    attAttrs.DTXR,
    instruction.reviewName,
    instruction.displayName,
    instruction.sourceName,
    instruction.name,
    instruction.id,
  ]);
}

export function sourcePathCandidatesFromObject(object = {}) {
  const data = object.userData || {};
  const props = data.browserRvmProperties || {};
  const attrs = data.browserRvmAttributes || data.attributes || props.attributes || {};
  return uniqueStrings([
    data.sourcePath,
    props.sourcePath,
    props.SourcePath,
    props.fullPath,
    props.FullPath,
    props.reviewPath,
    props.ReviewPath,
    attrs.RVM_OWNER_PATH,
    attrs.RVM_OWNER_NAME,
    attrs.RVM_SOURCE_PATH,
    attrs.RVM_REVIEW_PATH,
    attrs.RVM_REVIEW_NAME,
    attrs.REVIEW_NAME,
    attrs.FULL_PATH,
    attrs.PATH,
    attrs.NAME,
    data.reviewName,
    data.displayName,
    data.sourceName,
    object.name,
    data.name,
  ]);
}

export function recoverDeepRvmSourcePathFromCandidates(candidates = [], options = {}) {
  let best = null;
  for (const candidate of uniqueStrings(candidates)) {
    const prepared = prepareCandidatePath(candidate);
    if (!prepared) continue;
    const normalized = normalizeRvmReviewPath(prepared, options);
    const parts = stripGenericDisciplineContainers(normalized.parts || []);
    if (!parts.length) continue;
    const displayPath = `/${parts.join('/')}`.replace(/\/+/g, '/');
    const score = scoreCandidate(parts, candidate, displayPath);
    const item = { sourcePath: String(candidate), displayPath, normalizedPath: displayPath.toLowerCase(), parts, score };
    if (!best || item.score > best.score || (item.score === best.score && item.parts.length > best.parts.length)) best = item;
  }
  return best || { sourcePath: '', displayPath: '/Unzoned', normalizedPath: '/unzoned', parts: ['Unzoned'], score: 0 };
}

export function isWeakRvmSourcePath(path = '') {
  const parts = String(path || '').split('/').filter(Boolean);
  if (!parts.length) return true;
  if (parts.length === 1 && GENERIC_BUCKETS.has(parts[0].toUpperCase())) return true;
  if (parts.length <= 2 && GENERIC_BUCKETS.has(parts[0].toUpperCase()) && GENERIC_BUCKETS.has(parts[parts.length - 1].toUpperCase())) return true;
  return false;
}

function recoverActiveViewerPaths() {
  const viewer = globalThis.__3D_RVM_VIEWER__;
  const diagnostics = { version: VERSION, scannedCount: 0, recoveredCount: 0, shallowCount: 0, examples: [] };
  viewer?.modelGroup?.traverse?.((object) => {
    if (!(object?.isMesh || object?.isLine || object?.isLineSegments || object?.isPoints || object?.isGroup)) return;
    diagnostics.scannedCount += 1;
    const data = object.userData || {};
    const current = String(data.sourcePath || data.browserRvmProperties?.sourcePath || '').trim();
    if (isWeakRvmSourcePath(current)) diagnostics.shallowCount += 1;
    const recovered = recoverRvmDeepSourcePathFromObject(object, { fileName: viewer?.fileName || data.fileName || '' });
    if (!recovered?.displayPath || recovered.score < 4) return;
    if (current && current.toLowerCase() === recovered.displayPath.toLowerCase()) return;
    if (!isWeakRvmSourcePath(current) && recovered.parts.length <= String(current).split('/').filter(Boolean).length) return;
    object.userData = data;
    object.userData.sourcePath = recovered.displayPath;
    object.userData.normalizedSourcePath = recovered.normalizedPath;
    object.userData.browserRvmDeepSourcePathRecovered = true;
    if (object.userData.browserRvmProperties) object.userData.browserRvmProperties.sourcePath = recovered.displayPath;
    diagnostics.recoveredCount += 1;
    if (diagnostics.examples.length < 8) diagnostics.examples.push({ from: current || object.name || '', to: recovered.displayPath });
  });
  try { globalThis.dispatchEvent?.(new CustomEvent('rvm-deep-source-path-recovery', { detail: diagnostics })); } catch (_) {}
  return diagnostics;
}

function prepareCandidatePath(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  return text
    .replace(/\\/g, '/')
    .replace(/\b(STRUCTURE|STRUCTURES|EQUIPMENT|PIPING|PIPE|CIVIL|MODEL)\s+(?=\/?[A-Z0-9][A-Z0-9_-]*[-_][A-Z0-9])/gi, '$1/')
    .replace(/\s+\/+/g, '/')
    .replace(/\/+\s+/g, '/')
    .replace(/\/+/g, '/');
}

function stripGenericDisciplineContainers(parts = []) {
  let out = parts.map((part) => String(part || '').trim()).filter(Boolean).filter((part) => !GENERIC_PRIM_RE.test(part));
  while (out.length > 1 && GENERIC_BUCKETS.has(out[0].toUpperCase()) && (PLANT_PART_RE.test(out[1]) || hasPlantLikeDescendant(out))) out = out.slice(1);
  if (out.length > 2 && /^GAS_?\d/i.test(out[0]) && GENERIC_BUCKETS.has(out[1].toUpperCase()) && PLANT_PART_RE.test(out[2])) out = [out[0], ...out.slice(2)];
  return out;
}

function hasPlantLikeDescendant(parts = []) {
  return parts.slice(1, 4).some((part) => PLANT_PART_RE.test(part));
}

function scoreCandidate(parts = [], original = '', displayPath = '') {
  const text = `${original} ${displayPath}`.toUpperCase();
  let score = parts.length;
  if (parts.some((part) => PLANT_PART_RE.test(part))) score += 6;
  if (/\/BTRM-|CU-|FDNS|GRID|PIP|PIPE|VALVE|FLANGE|SUPPORT|FRAME|FRMWORK|PANEL/i.test(displayPath)) score += 3;
  if (parts.length === 1 && GENERIC_BUCKETS.has(parts[0].toUpperCase())) score -= 12;
  if (/RVM_PRIM_CODE/i.test(text)) score -= 1;
  if (/\/EQUIPMENT\/?$/i.test(displayPath) || /\/STRUCTURE\/?$/i.test(displayPath)) score -= 8;
  return score;
}

function uniqueStrings(values = []) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}
