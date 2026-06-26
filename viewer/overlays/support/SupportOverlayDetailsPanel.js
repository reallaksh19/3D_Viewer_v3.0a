export const SUPPORT_OVERLAY_DETAILS_PANEL_SCHEMA = 'support-overlay-details-panel/v3';

const MAX_WARNING_ROWS = 6;
const MAX_ATTRIBUTE_ROWS = 12;

export function emptySupportOverlayDetailsPanelState(reason = 'not-selected') {
  return {
    schema: SUPPORT_OVERLAY_DETAILS_PANEL_SCHEMA,
    status: 'empty',
    reason: text(reason),
    highlighted: false,
    primitiveExcluded: true,
    rvmSearchIndexed: false,
    pickable: false,
    selectable: false,
  };
}

export function buildSupportOverlayDetailsPanelState(details = null, context = {}) {
  if (!details || typeof details !== 'object' || details.overlayKind !== 'support') {
    return emptySupportOverlayDetailsPanelState(context.reason || 'not-selected');
  }

  const warnings = normalizeList(details.warnings);
  const coordinateWarnings = normalizeList(details.coordinateWarnings);
  const pipeAxisWarnings = normalizeList(details.pipeAxisWarnings);
  const allWarnings = [...warnings, ...coordinateWarnings, ...pipeAxisWarnings].slice(0, MAX_WARNING_ROWS);

  return {
    schema: SUPPORT_OVERLAY_DETAILS_PANEL_SCHEMA,
    status: 'selected',
    supportId: text(details.supportId || details.supportNo || 'support'),
    supportNo: text(details.supportNo || details.supportId || ''),
    family: text(details.family || 'UNKNOWN'),
    rawType: text(details.rawType || ''),
    nodeId: text(details.nodeId || ''),
    sourceKind: text(details.sourceKind || context.sourceKind || ''),
    sourceFile: text(details.sourceFile || context.sourceFile || ''),
    sourceCoordinate: copyVec3(details.sourceCoordinate),
    mappedCoordinate: copyVec3(details.mappedCoordinate),
    pipeAxis: copyVec3(details.pipeAxis),
    pipeAxisSource: text(details.pipeAxisSource || ''),
    matchedPipeSegmentId: text(details.matchedPipeSegmentId || ''),
    explicitSign: text(details.explicitSign || ''),
    gapMm: nullableNumber(details.gapMm),
    gapVisualSeparationMm: nullableNumber(details.gapVisualSeparationMm),
    pipeOdMm: nullableNumber(details.pipeOdMm),
    highlighted: Boolean(details.highlighted || context.highlighted),
    popupRequired: Boolean(details.popupRequired),
    warningCount: Number(details.warningCount || allWarnings.length) || 0,
    warnings: allWarnings,
    attributes: compactAttributeRows(details.attributes),
    primitiveExcluded: true,
    rvmSearchIndexed: false,
    pickable: false,
    selectable: false,
  };
}

export function renderSupportOverlayDetailsPanelHtml(state = emptySupportOverlayDetailsPanelState(), options = {}) {
  const escapeHtml = options.escapeHtml || defaultEscapeHtml;
  if (!state || state.status !== 'selected') {
    return `
      <div class="rvm-source-tools-detail" data-support-details-panel="empty" data-support-details-schema="${escapeHtml(SUPPORT_OVERLAY_DETAILS_PANEL_SCHEMA)}">
        <div class="rvm-source-tools-group-title"><span>Support Details</span><strong class="rvm-source-tools-badge">none</strong></div>
        <div class="rvm-source-tools-diag" data-support-details-field="empty">Click a non-primitive support overlay glyph to inspect its source-backed details.</div>
      </div>`;
  }

  const warnings = state.warnings.length
    ? `<ul>${state.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>`
    : '<span>No warnings.</span>';
  const attrs = state.attributes.length
    ? `<ul>${state.attributes.map((row) => `<li><strong>${escapeHtml(row.key)}</strong>: ${escapeHtml(row.value)}</li>`).join('')}</ul>`
    : '<span>No compact source attributes.</span>';
  const highlightBadge = state.highlighted
    ? '<strong class="rvm-source-tools-badge is-selected" data-support-details-highlight="true">Highlighted</strong>'
    : '<strong class="rvm-source-tools-badge" data-support-details-highlight="false">Selected</strong>';

  return `
    <div class="rvm-source-tools-detail" data-support-details-panel="selected" data-support-details-schema="${escapeHtml(SUPPORT_OVERLAY_DETAILS_PANEL_SCHEMA)}" data-support-details-id="${escapeHtml(state.supportId)}" data-support-details-highlighted="${state.highlighted ? 'true' : 'false'}">
      <div class="rvm-source-tools-group-title"><span>Support Details</span><span>${highlightBadge}<strong class="rvm-source-tools-badge ${state.warningCount ? 'is-warn' : ''}">${escapeHtml(state.family)}</strong></span></div>
      ${detailRow('Support', `${state.supportNo || state.supportId} ${state.family}`, escapeHtml, 'support')}
      ${detailRow('Highlight', state.highlighted ? 'Highlighted glyph' : 'Selected details only', escapeHtml, 'highlight')}
      ${detailRow('Raw type', state.rawType || 'n/a', escapeHtml, 'raw-type')}
      ${detailRow('Node', state.nodeId || 'n/a', escapeHtml, 'node')}
      ${detailRow('Source', `${state.sourceKind || 'source'} ${state.sourceFile || ''}`.trim(), escapeHtml, 'source')}
      ${detailRow('Source coord', vecText(state.sourceCoordinate), escapeHtml, 'source-coordinate')}
      ${detailRow('Mapped coord', vecText(state.mappedCoordinate), escapeHtml, 'mapped-coordinate')}
      ${detailRow('Pipe axis', `${vecText(state.pipeAxis)} ${state.pipeAxisSource ? `(${state.pipeAxisSource})` : ''}`.trim(), escapeHtml, 'pipe-axis')}
      ${detailRow('Matched pipe', state.matchedPipeSegmentId || 'n/a', escapeHtml, 'matched-pipe')}
      ${detailRow('Gap', gapText(state), escapeHtml, 'gap')}
      ${detailRow('Pipe OD', state.pipeOdMm == null ? 'n/a' : `${round(state.pipeOdMm)} mm`, escapeHtml, 'pipe-od')}
      <div class="rvm-source-tools-diag" data-support-details-field="warnings"><span>Warnings</span>${warnings}</div>
      <div class="rvm-source-tools-diag" data-support-details-field="attributes"><span>Attributes</span>${attrs}</div>
      <div class="rvm-source-tools-actions rvm-source-tools-actions--inline" data-support-details-actions="true">
        <button type="button" data-support-details-action="copy-json">Copy details JSON</button>
        <button type="button" data-support-details-action="download-json">Download JSON</button>
        <button type="button" data-support-details-action="clear">Clear support details</button>
      </div>
    </div>`;
}

function detailRow(label, value, escapeHtml, field) {
  return `<div class="rvm-source-tools-row" data-support-details-field="${escapeHtml(field)}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || 'n/a')}</strong></div>`;
}

function gapText(state) {
  if (state.gapMm == null) return 'n/a';
  const visual = state.gapVisualSeparationMm == null ? '' : ` · visual ${round(state.gapVisualSeparationMm)} mm`;
  return `${round(state.gapMm)} mm${visual}`;
}

function compactAttributeRows(attrs = {}) {
  if (!attrs || typeof attrs !== 'object') return [];
  return Object.entries(attrs).slice(0, MAX_ATTRIBUTE_ROWS).map(([key, value]) => ({
    key: text(key),
    value: text(formatAttributeValue(value)),
  })).filter((row) => row.key);
}

function formatAttributeValue(value) {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value ?? '';
  if (Array.isArray(value)) return value.slice(0, 4).map((item) => text(item)).join(', ');
  return '[object]';
}

function normalizeList(value) {
  const list = Array.isArray(value) ? value : [value].filter(Boolean);
  return list.map((item) => text(item)).filter(Boolean);
}

function copyVec3(value) {
  if (!value || typeof value !== 'object') return null;
  const x = nullableNumber(value.x);
  const y = nullableNumber(value.y);
  const z = nullableNumber(value.z);
  if (x === null || y === null || z === null) return null;
  return { x, y, z };
}

function vecText(value) {
  if (!value) return 'n/a';
  return `${round(value.x)}, ${round(value.y)}, ${round(value.z)}`;
}

function nullableNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value) {
  const n = Number(value) || 0;
  return Math.abs(n) < 1e-9 ? '0' : String(Math.round(n * 1000) / 1000);
}

function text(value) {
  return String(value ?? '').trim();
}

function defaultEscapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
