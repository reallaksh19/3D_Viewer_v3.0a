/**
 * Functionality: renders selected-geometry enrichment audit details in the RVM
 * properties panel and marks hierarchy rows with enrichment status. Parameters:
 * the RVM root, selected render objects, and enriched snapshot scope. Outputs:
 * DOM-only indicators. Fallback: if no enriched snapshot exists, the panel shows
 * an explicit "not enriched" state and source geometry remains unchanged.
 */

import { isPipeLikeType, isSupportLikeType, summarizeEnrichmentObjects } from './selected-geometry-diagnostics.js';
import { normalizeKey, objectAliases, text } from './selected-geometry-shared.js';

const DETAIL_ATTR = 'data-selected-geometry-enrichment-details';
const TREE_BADGE_ATTR = 'data-selected-geometry-enrichment-tree-badge';
const FIELD_KEYS = Object.freeze(['LINE_NO', 'TAG', 'TYPE', 'NPS', 'NS', 'DIAMETER', 'WALL_THICK', 'MATERIAL', 'OWNER']);

export function renderSelectedGeometryEnrichmentDetails(root, selectedObjects, enrichedScope) {
  const panel = root?.querySelector?.('#rvm-attributes-panel');
  if (!panel) return null;
  removeExistingDetails(panel);
  const scopeObjects = Array.isArray(enrichedScope?.objects) ? enrichedScope.objects : [];
  const selected = Array.isArray(selectedObjects) ? selectedObjects : [];
  if (!scopeObjects.length) return null;
  const enrichedObject = findFirstEnrichedObject(selected, scopeObjects);
  const card = document.createElement('div');
  card.className = 'rvm-selected-geometry-details-card';
  card.setAttribute(DETAIL_ATTR, 'true');
  card.innerHTML = renderDetailsHtml(enrichedObject, selected.length, summarizeEnrichmentObjects(scopeObjects));
  panel.appendChild(card);
  return card;
}

export function applySelectedGeometryEnrichmentIndicators(root, enrichedScope) {
  if (!root) return null;
  const rows = root.querySelectorAll?.('#rvm-tree li[data-node-id]') || [];
  for (const row of rows) clearTreeRow(row);
  const objects = Array.isArray(enrichedScope?.objects) ? enrichedScope.objects : [];
  if (!objects.length) return freezeIndicatorResult(0, 0);
  const map = aliasStatusMap(objects);
  let marked = 0;
  for (const row of rows) {
    const key = normalizeKey(row.dataset?.nodeId);
    const status = map.get(key);
    if (!status) continue;
    row.dataset.selectedGeometryEnrichmentStatus = status.status;
    row.classList.add('has-selected-geometry-enrichment', `is-${status.status}`);
    ensureTreeBadge(row, status);
    marked += 1;
  }
  return freezeIndicatorResult(marked, objects.length);
}

function removeExistingDetails(panel) {
  panel.querySelectorAll?.(`[${DETAIL_ATTR}]`).forEach((node) => node.remove());
}

function findFirstEnrichedObject(selectedObjects, scopeObjects) {
  const map = aliasObjectMap(scopeObjects);
  for (const selectedObject of selectedObjects) {
    for (const alias of objectAliases(selectedObject)) {
      const match = map.get(normalizeKey(alias));
      if (match) return match;
    }
  }
  return scopeObjects[0] || null;
}

function aliasObjectMap(scopeObjects) {
  const map = new Map();
  for (const object of scopeObjects) {
    for (const alias of enrichedAliases(object)) {
      const key = normalizeKey(alias);
      if (key && !map.has(key)) map.set(key, object);
    }
  }
  return map;
}

function aliasStatusMap(scopeObjects) {
  const map = new Map();
  for (const object of scopeObjects) {
    const status = enrichmentStatus(object);
    for (const alias of enrichedAliases(object)) {
      const key = normalizeKey(alias);
      if (key && !map.has(key)) map.set(key, status);
    }
  }
  return map;
}

function enrichedAliases(object) {
  const identity = object?.sourceIdentity || {};
  const attrs = object?.sourceAttributes || {};
  return [
    object?.id,
    object?.name,
    object?.sourcePath,
    identity.renderId,
    identity.canonicalObjectId,
    identity.sourceObjectId,
    attrs.ID,
    attrs.NAME,
    attrs.REF_NO,
    attrs.TAG,
    attrs.OWNER,
    attrs.RVM_OWNER_PATH,
    attrs.RVM_OWNER_NAME,
    attrs.RVM_REVIEW_NAME,
  ].map(text).filter(Boolean);
}

function enrichmentStatus(object) {
  const audit = object?.attributes?.enrichment?.audit || {};
  const conflicts = Array.isArray(audit.conflicts) ? audit.conflicts.length : 0;
  const missing = Array.isArray(audit.missing) ? audit.missing.length : 0;
  const confidence = Number(audit.confidence);
  if (conflicts) return { status: 'conflict', label: 'Conflict' };
  if (missing || audit.needsReview) return { status: 'review', label: 'Review' };
  if (Number.isFinite(confidence) && confidence > 0) return { status: 'resolved', label: 'Resolved' };
  return { status: 'missing', label: 'Missing' };
}

function renderDetailsHtml(object, selectedCount, summary) {
  if (!object) {
    return `<div class="rvm-selected-geometry-details-title"><span>Selected Geometry Enrichment</span><small>${escapeHtml(selectedCount)} selected</small></div><div class="rvm-selected-geometry-empty">No enriched snapshot for the current selection.</div>`;
  }
  const enrichment = object.attributes?.enrichment || {};
  const audit = enrichment.audit || {};
  const status = enrichmentStatus(object);
  return `
    <div class="rvm-selected-geometry-details-title"><span>Selected Geometry Enrichment</span><small>${escapeHtml(status.label)}</small></div>
    <div class="rvm-selected-geometry-status-row is-${escapeHtml(status.status)}">
      <strong>${escapeHtml(object.name || object.id || 'Object')}</strong>
      <span>${escapeHtml(object.type || 'OBJECT')} / confidence ${escapeHtml(formatConfidence(audit.confidence))}</span>
    </div>
    <div class="rvm-selected-geometry-detail-grid">${sourceRows(object).map(renderRow).join('')}</div>
    ${renderSection('Line List', enrichment.lineList)}
    ${renderSection('Piping Class', enrichment.pipingClass)}
    ${renderSection('Material', enrichment.material)}
    ${renderSection('Weight', enrichment.weight)}
    ${renderReadiness(object)}
    ${renderSection('Bindings / Source', enrichment.masterBindings || sourceBindingRows(object))}
    ${renderAudit(audit)}
    <div class="rvm-selected-geometry-footer">Workspace scope: ${escapeHtml(summary.objects)} objects, ${escapeHtml(summary.resolved)} resolved, ${escapeHtml(summary.conflicts)} conflicts, ${escapeHtml(summary.missing)} missing.</div>`;
}

function sourceRows(object) {
  const attrs = object?.sourceAttributes || {};
  const rows = FIELD_KEYS
    .filter((key) => text(attrs[key]))
    .map((key) => [key, attrs[key]]);
  if (rows.length) return rows;
  return [['Source path', object?.sourcePath || '-'], ['Object id', object?.id || '-']];
}

function sourceBindingRows(object) {
  const enrichment = object?.attributes?.enrichment || {};
  const bindingRows = [];
  for (const [sectionName, sectionValue] of Object.entries(enrichment)) {
    if (!sectionValue || typeof sectionValue !== 'object' || Array.isArray(sectionValue)) continue;
    const raw = sectionValue._raw;
    const bindings = sectionValue._bindings;
    if (bindings && typeof bindings === 'object' && !Array.isArray(bindings)) {
      bindingRows.push([`${sectionName} bindings`, bindings]);
    }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      bindingRows.push([`${sectionName} raw`, raw]);
    }
  }
  if (bindingRows.length) return Object.fromEntries(bindingRows);
  return {
    sourcePath: object?.sourcePath || '',
    objectId: object?.id || '',
    objectType: object?.type || '',
  };
}

function renderReadiness(object) {
  const enrichment = object?.attributes?.enrichment || {};
  const rows = [
    ['Pipe-like', isPipeLikeType(object?.type) ? 'yes' : 'no'],
    ['Support-like', isSupportLikeType(object?.type) ? 'yes' : 'no'],
    ['Line list', enrichment.lineList?.lineNo ? 'ready' : 'missing'],
    ['Piping class', enrichment.pipingClass?.className ? 'ready' : 'missing'],
    ['Material density', enrichment.material?.materialDensityKgM3 === null ? 'missing' : 'ready'],
    ['Weight', enrichment.weight?.unitPipeWeightKgPerM || enrichment.weight?.componentWeightKg ? 'ready' : 'missing'],
  ];
  return `<div class="rvm-selected-geometry-details-title"><span>Calculation Readiness</span><small>selected object</small></div><div class="rvm-selected-geometry-detail-grid">${rows.map(renderRow).join('')}</div>`;
}

function renderSection(title, value) {
  const entries = Object.entries(value || {})
    .filter((entry) => entry[1] !== undefined && entry[1] !== null && entry[1] !== '')
    .filter((entry) => entry[0] !== '_raw' && entry[0] !== '_bindings');
  const rows = entries.length ? entries : [['Status', 'No matched data']];
  return `<div class="rvm-selected-geometry-details-title"><span>${escapeHtml(title)}</span><small>${escapeHtml(entries.length)} fields</small></div><div class="rvm-selected-geometry-detail-grid">${rows.map(renderRow).join('')}</div>`;
}

function renderAudit(audit) {
  const conflicts = Array.isArray(audit?.conflicts) ? audit.conflicts : [];
  const missing = Array.isArray(audit?.missing) ? audit.missing : [];
  const sources = Array.isArray(audit?.sources) ? audit.sources : [];
  const items = [
    ['Method', audit?.method || '-'],
    ['Confidence', formatConfidence(audit?.confidence)],
    ['Needs review', audit?.needsReview ? 'yes' : 'no'],
    ['Missing', missing.join(', ') || '-'],
    ['Conflicts', conflictText(conflicts) || '-'],
    ['Sources', sources.map((source) => `${source.source}:${source.method}:${formatConfidence(source.confidence)}`).join(', ') || '-'],
  ];
  return `<div class="rvm-selected-geometry-details-title"><span>Audit</span><small>${escapeHtml(conflicts.length + missing.length)} issues</small></div><div class="rvm-selected-geometry-detail-grid">${items.map(renderRow).join('')}</div>`;
}

function conflictText(conflicts) {
  return conflicts
    .map((conflict) => `${conflict.field}: ${conflict.sourceValue} vs ${conflict.enrichedValue}`)
    .join('; ');
}

function renderRow(entry) {
  return `<div class="rvm-selected-geometry-detail-row"><span>${escapeHtml(entry[0])}</span><b title="${escapeHtml(formatValue(entry[1]))}">${escapeHtml(displayValue(entry[1]))}</b></div>`;
}

function displayValue(value) {
  const formatted = formatValue(value);
  if (formatted.length > 160) return `${formatted.slice(0, 157)}...`;
  return formatted;
}

function formatValue(value) {
  if (value === undefined || value === null || value === '') return '-';
  if (typeof value === 'number') return Number.isFinite(value) ? value.toFixed(3).replace(/\.?0+$/, '') : '-';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (_error) {
      return String(value);
    }
  }
  return String(value);
}

function formatConfidence(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? `${Math.round(numberValue * 100)}%` : '-';
}

function clearTreeRow(row) {
  delete row.dataset.selectedGeometryEnrichmentStatus;
  row.classList.remove('has-selected-geometry-enrichment', 'is-resolved', 'is-review', 'is-conflict', 'is-missing');
  row.querySelectorAll?.(`[${TREE_BADGE_ATTR}]`).forEach((node) => node.remove());
}

function ensureTreeBadge(row, status) {
  const button = row.querySelector?.('.rvm-tree-node') || row;
  const badge = document.createElement('span');
  badge.className = 'rvm-selected-geometry-tree-badge';
  badge.setAttribute(TREE_BADGE_ATTR, 'true');
  badge.textContent = status.label;
  button.appendChild(badge);
}

function freezeIndicatorResult(marked, objects) {
  return Object.freeze({ marked, objects });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
