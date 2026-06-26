/**
 * Functionality: renders the non-modal selected-geometry enrichment workflow
 * popup using the XML->CII rich workflow phase pattern. Parameters: phase id,
 * preview snapshot, and lightweight popup UI state. Outputs: HTML strings for
 * controller binding. Fallback: missing scope or masters render actionable
 * empty states instead of blocking the rest of the viewer.
 */

import { tokenAtPosition, tokenizeBranchName } from '../converters/xml-cii2019-core/regex-line-key.js';

export const SELECTED_GEOMETRY_WORKFLOW_PHASES = Object.freeze([
  { id: 'regex', label: '1 Regex', summary: 'Derive branch line key, piping class, size, and rating from selected-geometry branch names.', state: 'Current' },
  { id: 'import-masters', label: '2 Import Masters', summary: 'Load process line list, piping class, material map, and weight masters.', state: 'Current' },
  { id: 'preview', label: '4 Preview', summary: 'Preview branch-level mapped fields before writing an enrichment package.', state: 'Current' },
  { id: 'diagnostics', label: '5 Diagnostics', summary: 'Review unresolved branch, line-list, class, material, and weight mappings.', state: 'Current' },
  { id: 'weight-match', label: '5A Weight Match', summary: 'Inspect weight candidates produced from selected geometry size, length, and rating.', state: 'Current' },
  { id: 'run', label: '6 Run', summary: 'Apply immutable selected-geometry enrichment, export JSON, or send to Simplified Analysis.', state: 'Current' },
  { id: 'config', label: '8 Config', summary: 'Edit XML->CII-compatible enrichment config used by this selected-geometry workflow.', state: 'Current' },
]);

const MASTER_LABELS = Object.freeze({
  lineList: 'Line List',
  pipingClass: 'Piping Class',
  materialMap: 'Material Map',
  weightMaster: 'Weight Master',
});

function text(value) {
  return value === null || value === undefined ? '' : String(value);
}

function esc(value) {
  return text(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function attr(value) {
  return esc(value).replaceAll("'", '&#39;');
}

function rowCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 'not loaded';
  return `${numeric.toLocaleString()} row(s)`;
}

function phaseFor(id) {
  return SELECTED_GEOMETRY_WORKFLOW_PHASES.find((phase) => phase.id === id) || SELECTED_GEOMETRY_WORKFLOW_PHASES[0];
}

function phaseHeader(phaseId) {
  const phase = phaseFor(phaseId);
  return `
    <div class="sgw-phase-head">
      <div>
        <div class="sgw-detail-title">${esc(phase.label)}</div>
        <div class="sgw-detail-text">${esc(phase.summary)}</div>
      </div>
    </div>`;
}

function statusRows(rows) {
  return `
    <div class="sgw-status-list">
      ${rows.map((row) => {
        const ok = row.ok === true;
        return `
          <div class="sgw-status-row ${ok ? 'is-ok' : 'is-warn'}">
            <span class="sgw-status-icon">${ok ? 'OK' : 'WARN'}</span>
            <span>${esc(row.label)}</span>
            <strong>${esc(row.value)}</strong>
          </div>`;
      }).join('')}
    </div>`;
}

function compactTable(columns, rows, emptyText) {
  if (!rows.length) return `<div class="sgw-detail-note">${esc(emptyText)}</div>`;
  return `
    <div class="sgw-table-wrap">
      <table class="sgw-table">
        <thead><tr>${columns.map((column) => `<th>${esc(column.label)}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map((row) => `<tr>${columns.map((column) => `<td>${cellValue(row, column)}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function cellValue(row, column) {
  if (typeof column.render === 'function') return column.render(row);
  return esc(readRowCell(row, column));
}

function readRowCell(row, column) {
  if (!row || typeof row !== 'object') return '';
  const keys = [column.key, ...(Array.isArray(column.keys) ? column.keys : [])].filter(Boolean);
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key) && text(row[key])) return text(row[key]);
  }
  const normalizedEntries = Object.entries(row).map(([key, value]) => [normalizeHeaderKey(key), value]);
  for (const key of keys) {
    const normalized = normalizeHeaderKey(key);
    const match = normalizedEntries.find(([candidate]) => candidate === normalized);
    if (match && text(match[1])) return text(match[1]);
  }
  return '';
}

function normalizeHeaderKey(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function regexSnapshot(snapshot) {
  const config = snapshot.config || {};
  const sample = snapshot.sampleBranch || config.linelist?.sampleBranchName || '';
  const delimiter = config.linelist?.tokenDelimiter || '-';
  const tokens = sample ? tokenizeBranchName(sample, delimiter) : [];
  const lineKeyPositions = config.linelist?.lineKeyTokenPositions || '4';
  const classPosition = config.rating?.pipingClassTokenIndex || 5;
  const borePosition = config.weight?.boreTokenIndex || 3;
  return {
    sample,
    delimiter,
    tokens,
    lineKeyPositions,
    classPosition,
    borePosition,
    lineKeyJoiner: config.linelist?.lineKeyJoiner || '',
    lineKey: snapshot.preview?.branchRows?.[0]?.lineKey || '',
    pipingClass: tokenAtPosition(sample, config.rating?.tokenDelimiter || delimiter, classPosition),
    sizeToken: tokenAtPosition(sample, config.weight?.tokenDelimiter || delimiter, borePosition),
    pipingClassRegex: config.rating?.pipingClassRegex || '',
    pipingClassGroup: config.rating?.pipingClassGroup || 1,
    sizeRegex: config.weight?.boreRegex || '',
    sizeGroup: config.weight?.boreGroup || 1,
    branchNameRegex: config.linelist?.branchNameRegex || '',
    lineNoGroup: config.linelist?.lineNoGroup || 1,
    linelistColumnRegex: config.linelist?.linelistColumnRegex || '',
    linelistColumnGroup: config.linelist?.linelistColumnGroup || 1,
  };
}

function regexPanel(snapshot) {
  const regex = regexSnapshot(snapshot);
  return `
    ${phaseHeader('regex')}
    <section class="sgw-card">
      <div class="sgw-grid sgw-grid-wide">
        <label class="sgw-field">
          <span>Sample Branchname</span>
          <input type="text" value="${attr(regex.sample)}" data-sgw-config-path="linelist.sampleBranchName">
        </label>
        <label class="sgw-field">
          <span>Common Delimiter</span>
          <input type="text" value="${attr(regex.delimiter)}" data-sgw-config-path="linelist.tokenDelimiter">
        </label>
        <label class="sgw-field">
          <span>Line Key Joiner</span>
          <input type="text" value="${attr(regex.lineKeyJoiner)}" data-sgw-config-path="linelist.lineKeyJoiner">
        </label>
      </div>
      <div class="sgw-hint">The sample branch comes from selected geometry; line key and piping class use the same token/regex path as XML-&gt;CII.</div>
    </section>
    <section class="sgw-card">
      <div class="sgw-section-title">Extraction</div>
      <div class="sgw-grid">
        <label class="sgw-field">
          <span>Line Key Position(s)</span>
          <input type="text" value="${attr(regex.lineKeyPositions)}" data-sgw-config-path="linelist.lineKeyTokenPositions">
          <strong>${esc(regex.lineKey || '-')}</strong>
        </label>
        <label class="sgw-field">
          <span>Piping Class Position</span>
          <input type="number" value="${attr(regex.classPosition)}" data-sgw-config-path="rating.pipingClassTokenIndex">
          <strong>${esc(regex.pipingClass || '-')}</strong>
        </label>
        <label class="sgw-field">
          <span>Size Position</span>
          <input type="number" value="${attr(regex.borePosition)}" data-sgw-config-path="weight.boreTokenIndex">
          <strong>${esc(regex.sizeToken || '-')}</strong>
        </label>
      </div>
    </section>
    <section class="sgw-card">
      <details class="sgw-details" open>
        <summary>Selected Branch Token Positions</summary>
        ${compactTable(
          [{ key: 'position', label: 'Position' }, { key: 'token', label: 'Token' }],
          regex.tokens.map((token, index) => ({ position: index + 1, token })),
          'Select geometry with branch data to see tokens.',
        )}
      </details>
      <details class="sgw-details">
        <summary>Advanced Regex Overrides</summary>
        <div class="sgw-grid">
          ${[
            ['Piping Class Regex', 'rating.pipingClassRegex', regex.pipingClassRegex, 'text'],
            ['Piping Class Group', 'rating.pipingClassGroup', regex.pipingClassGroup, 'number'],
            ['Size Regex', 'weight.boreRegex', regex.sizeRegex, 'text'],
            ['Size Group', 'weight.boreGroup', regex.sizeGroup, 'number'],
            ['Branch Line Key Regex', 'linelist.branchNameRegex', regex.branchNameRegex, 'text'],
            ['Branch Regex Group', 'linelist.lineNoGroup', regex.lineNoGroup, 'number'],
            ['Line List Column Regex', 'linelist.linelistColumnRegex', regex.linelistColumnRegex, 'text'],
            ['Line List Column Group', 'linelist.linelistColumnGroup', regex.linelistColumnGroup, 'number'],
          ].map(([label, path, value, type]) => `
            <label class="sgw-field">
              <span>${esc(label)}</span>
              <input type="${attr(type)}" value="${attr(value)}" data-sgw-config-path="${attr(path)}">
            </label>`).join('')}
        </div>
      </details>
    </section>`;
}

function masterTabs(snapshot, uiState) {
  const active = uiState.activeMaster || 'lineList';
  return `
    <div class="sgw-master-tabs">
      ${Object.keys(MASTER_LABELS).map((key) => `
        <button type="button" class="sgw-master-tab ${key === active ? 'is-active' : ''}" data-sgw-master-tab="${attr(key)}">
          <span>${esc(MASTER_LABELS[key])}</span>
          <small>${esc(rowCount(snapshot.masterCounts?.[key] || 0))}</small>
        </button>`).join('')}
    </div>`;
}

function importMastersPanel(snapshot, uiState) {
  const active = uiState.activeMaster || 'lineList';
  const info = snapshot.masterFiles?.[active] || {};
  return `
    ${phaseHeader('import-masters')}
    ${masterTabs(snapshot, uiState)}
    <section class="sgw-card">
      <div class="sgw-card-head">
        <div>
          <div class="sgw-detail-title">${esc(MASTER_LABELS[active] || active)}</div>
          <div class="sgw-detail-text">${esc(masterDescription(active))}</div>
        </div>
        <div class="sgw-count">${esc(rowCount(snapshot.masterCounts?.[active] || 0))}</div>
      </div>
      <div class="sgw-toolbar">
        <label class="sgw-btn sgw-file-btn">
          Import file
          <input type="file" data-sgw-master="${attr(active)}" accept=".json,.csv,.tsv,.txt,.xlsx,.xlsm,.xlsb,.xls,.ods" hidden>
        </label>
        <button type="button" class="sgw-btn" data-sgw-clear-master="${attr(active)}">Clear</button>
      </div>
      <div class="sgw-hint">Source: ${esc(info.fileName || 'manual import required')}</div>
    </section>
    <section class="sgw-card">
      <div class="sgw-section-title">Preview Rows</div>
      ${compactTable(masterPreviewColumns(active), snapshot.masterPreviewRows?.[active] || [], 'No imported rows to preview.')}
    </section>`;
}

function masterDescription(key) {
  if (key === 'lineList') return 'Process line list matched by branch-derived line key.';
  if (key === 'pipingClass') return 'Piping class master used for wall, corrosion, material, and approximate class review.';
  if (key === 'materialMap') return 'PCF material map used to convert material text to CII material code.';
  return 'Valve/rigid weight master used by bore, rating, and selected geometry length.';
}

function masterPreviewColumns(key) {
  if (key === 'materialMap') return [
    { key: 'code', keys: ['Code', 'CA3', 'materialCode', 'MaterialCode'], label: 'Code' },
    { key: 'material', keys: ['Material', 'materialName', 'Material_Name', 'Description', 'Name'], label: 'Material' },
    { key: 'materialCode', keys: ['Material Code', 'MAT_CODE', 'CII Code'], label: 'Material Code' },
    { key: 'materialName', keys: ['Material Name', 'Material_Name', 'Description'], label: 'Material Name' },
  ];
  if (key === 'pipingClass') return [
    { key: 'pipingClass', keys: ['Piping Class', 'PIPING_CLASS', 'Class', 'SPEC', 'Spec'], label: 'Piping Class' },
    { key: 'Material', keys: ['material', 'Material_Name', 'materialName', 'MATERIAL'], label: 'Material' },
    { key: 'materialName', keys: ['Material Name', 'Material_Name', 'Material'], label: 'Material Name' },
    { key: 'wallThickness', keys: ['Wall Thickness', 'Wall thickness', 'WALL_THICKNESS', 'WT'], label: 'Wall' },
    { key: 'corrosion', keys: ['Corrosion', 'corrosionAllowance', 'Corrosion Allowance', 'CA'], label: 'Corrosion' },
  ];
  if (key === 'weightMaster') return [
    { key: 'boreMm', keys: ['Bore', 'BORE', 'DN', 'NB', 'NPS'], label: 'Bore' },
    { key: 'rating', keys: ['Rating', 'Pressure Class', 'Class'], label: 'Rating' },
    { key: 'lengthMm', keys: ['Length', 'Length mm', 'LENGTH_MM'], label: 'Length' },
    { key: 'weight', keys: ['Weight', 'Weight kg', 'WEIGHT_KG'], label: 'Weight' },
    { key: 'typeDesc', keys: ['Type', 'Type Desc', 'Description', 'Component Type'], label: 'Type' },
  ];
  return [
    { key: 'lineNoKey', keys: ['lineNo', 'Line No', 'Line Number', 'PipelineReference'], label: 'Line Key' },
    { key: 'lineKey', keys: ['Line Key', 'Key', 'LINEKEY'], label: 'Line Key 2' },
    { key: 'pipingClass', keys: ['Piping Class', 'PIPING_CLASS', 'Class', 'SPEC'], label: 'Piping Class' },
    { key: 'p1', keys: ['P1', 'Pressure', 'Design Pressure'], label: 'P1' },
    { key: 't1', keys: ['T1', 'Temperature', 'Design Temperature'], label: 'T1' },
    { key: 'density', keys: ['Density', 'DENSITY', 'Fluid Density'], label: 'Density' },
  ];
}

function previewPanel(snapshot) {
  const rows = snapshot.preview?.branchRows || [];
  return `
    ${phaseHeader('preview')}
    <section class="sgw-card">
      ${statusRows([
        { label: 'Selected geometry', value: `${Number(snapshot.preview?.counts?.objects || 0).toLocaleString()} object(s)`, ok: snapshot.preview?.counts?.objects > 0 },
        { label: 'Branch names', value: `${Number(snapshot.preview?.counts?.branches || 0).toLocaleString()} branch(es)`, ok: snapshot.preview?.counts?.branches > 0 },
        { label: 'Line List', value: rowCount(snapshot.masterCounts?.lineList || 0), ok: snapshot.masterCounts?.lineList > 0 },
        { label: 'Piping Class Master', value: rowCount(snapshot.masterCounts?.pipingClass || 0), ok: snapshot.masterCounts?.pipingClass > 0 },
      ])}
      <div class="sgw-toolbar">
        <label class="sgw-field sgw-scope-field"><span>Scope</span><select data-sgw-control="scope">
          ${scopeOption('selected', snapshot)}
          ${scopeOption('visible', snapshot)}
          ${scopeOption('hierarchy', snapshot)}
          ${scopeOption('full', snapshot)}
        </select></label>
        <span class="sgw-status-text">${esc(snapshot.message || '')}</span>
      </div>
    </section>
    <section class="sgw-card">
      <div class="sgw-section-title">Common Overrides</div>
      <div class="sgw-detail-text">Apply one value to every current branch row. Blank fields are ignored.</div>
      <div class="sgw-common-overrides">
        ${commonOverrideFields().map((field) => `
          <label class="sgw-field">
            <span>${esc(field.label)}</span>
            <input type="text" data-sgw-common-override-field="${attr(field.key)}" placeholder="${attr(field.label)}">
          </label>`).join('')}
      </div>
      <div class="sgw-toolbar">
        <button type="button" class="sgw-run-btn" data-sgw-action="apply-common-overrides">Apply to Preview Rows</button>
        <span class="sgw-status-text">Cell edits save on change. Fill copies a row value downward.</span>
      </div>
    </section>
    <section class="sgw-card">
      <div class="sgw-section-title">Branch Preview</div>
      ${editablePreviewTable(rows, 'Select geometry to build the branch preview.')}
    </section>`;
}

function scopeOption(value, snapshot) {
  const selected = (snapshot.scopeMode || 'selected') === value ? ' selected' : '';
  return `<option value="${attr(value)}"${selected}>${esc(value)}</option>`;
}

function previewColumns() {
  return [
    { key: 'branchName', label: 'Branch Name', render: (row) => `<span title="${attr(row.branchName)}">${esc(shortBranch(row.branchName))}</span>` },
    { key: 'objectCount', label: 'Objects' },
    { key: 'lineKey', label: 'Line Key' },
    { key: 'pipingClass', label: 'Piping Class', render: statusCell },
    { key: 'rating', label: 'Rating' },
    { key: 'material', label: 'Material' },
    { key: 'materialCode', label: 'Mat Code', render: materialCell },
    { key: 'p1', label: 'P1' },
    { key: 't1', label: 'T1' },
    { key: 't2', label: 'T2' },
    { key: 't3', label: 'T3' },
    { key: 'density', label: 'Density' },
    { key: 'wallThickness', label: 'Wall' },
    { key: 'corrosion', label: 'Corr' },
    { key: 'status', label: 'Status', render: (row) => `<span class="sgw-badge ${row.needsReview ? 'is-warn' : 'is-ok'}">${esc(row.status)}</span>` },
  ];
}

function commonOverrideFields() {
  return [
    { key: 'pipingClass', label: 'Piping Class' },
    { key: 'rating', label: 'Rating' },
    { key: 'materialCode', label: 'Mat Code' },
    { key: 'p1', label: 'P1' },
    { key: 't1', label: 'T1' },
    { key: 't2', label: 'T2' },
    { key: 't3', label: 'T3' },
    { key: 'density', label: 'Density' },
    { key: 'wallThickness', label: 'Wall' },
    { key: 'corrosion', label: 'Corr' },
  ];
}

function editablePreviewTable(rows, emptyText) {
  if (!rows.length) return `<div class="sgw-detail-note">${esc(emptyText)}</div>`;
  const columns = [
    { key: 'branchName', label: 'Branch Name', render: (row) => `<span title="${attr(row.branchName)}">${esc(shortBranch(row.branchName))}</span>` },
    { key: 'objectCount', label: 'Objects' },
    { key: 'lineKey', label: 'Line Key' },
    { key: 'pipingClass', label: 'Piping Class', editable: true },
    { key: 'rating', label: 'Rating', editable: true },
    { key: 'materialCode', label: 'Mat Code', editable: true },
    { key: 'p1', label: 'P1', editable: true },
    { key: 't1', label: 'T1', editable: true },
    { key: 't2', label: 'T2', editable: true },
    { key: 't3', label: 'T3', editable: true },
    { key: 'density', label: 'Density', editable: true },
    { key: 'wallThickness', label: 'Wall', editable: true },
    { key: 'corrosion', label: 'Corr', editable: true },
    { key: 'status', label: 'Status', render: (row) => `<span class="sgw-badge ${row.needsReview ? 'is-warn' : 'is-ok'}">${esc(row.status)}</span>` },
  ];
  return `
    <div class="sgw-table-wrap sgw-preview-table-wrap">
      <table class="sgw-table sgw-editable-preview-table">
        <thead><tr>${columns.map((column) => `<th>${esc(column.label)}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map((row, rowIndex) => `<tr>${columns.map((column) => `<td>${previewCell(row, column, rowIndex)}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function previewCell(row, column, rowIndex) {
  if (typeof column.render === 'function') return column.render(row);
  if (!column.editable) return esc(row[column.key] ?? '');
  const source = text(row[`${column.key}Source`] || '');
  const sourceClass = source === 'override' ? 'is-override' : (source === 'line-list-missing' ? 'is-missing' : '');
  return `
    <div class="sgw-edit-cell ${sourceClass}">
      <input type="text" value="${attr(row[column.key] ?? '')}" data-sgw-row-field="${attr(column.key)}" data-sgw-row-index="${attr(rowIndex)}" data-sgw-row-key="${attr(row.lineKey || row.branchName || '')}">
      <button type="button" class="sgw-fill-btn" data-sgw-filldown-field="${attr(column.key)}" data-sgw-filldown-from="${attr(rowIndex)}" title="Fill this value down">Fill</button>
    </div>`;
}

function previewSidePanel(snapshot) {
  const rows = snapshot.preview?.branchRows || [];
  const sideRows = rows.slice(0, 80);
  return `
    <aside class="sgw-preview-side">
      <div class="sgw-section-title">Branch Preview</div>
      ${compactTable(
        [
          { key: 'branchName', label: 'Branch', render: (row) => `<span title="${attr(row.branchName)}">${esc(shortBranch(row.branchName))}</span>` },
          { key: 'lineKey', label: 'Line Key' },
          { key: 'pipingClass', label: 'Class', render: statusCell },
          { key: 'rating', label: 'Rating' },
          { key: 'status', label: 'Status', render: (row) => `<span class="sgw-badge ${row.needsReview ? 'is-warn' : 'is-ok'}">${esc(row.status)}</span>` },
        ],
        sideRows,
        'No branch preview yet.',
      )}
      ${rows.length > sideRows.length ? `<div class="sgw-hint">Showing first ${sideRows.length.toLocaleString()} of ${rows.length.toLocaleString()} branch rows.</div>` : ''}
    </aside>`;
}

function statusCell(row) {
  const value = esc(row.pipingClass || '');
  if (!row.pipingClassNeedsReview) return value;
  return `${value || '-'} <span class="sgw-badge is-warn">review</span>`;
}

function materialCell(row) {
  const value = esc(row.materialCode || '');
  if (!row.materialCodeNeedsReview) return value;
  return `${value || '-'} <span class="sgw-badge is-warn">review</span>`;
}

function shortBranch(value) {
  const source = text(value);
  if (source.length <= 48) return source;
  return `...${source.slice(-45)}`;
}

function diagnosticsPanel(snapshot) {
  const rows = snapshot.preview?.diagnostics || [];
  return `
    ${phaseHeader('diagnostics')}
    <section class="sgw-card">
      ${statusRows([
        { label: 'Diagnostics', value: `${rows.length.toLocaleString()} item(s)`, ok: rows.length === 0 },
        { label: 'Resolved branches', value: `${Number(snapshot.preview?.counts?.resolved || 0).toLocaleString()} branch(es)`, ok: snapshot.preview?.counts?.resolved > 0 },
      ])}
      <div class="sgw-toolbar"><button type="button" class="sgw-run-btn" data-sgw-action="preview">Refresh Diagnostics</button></div>
    </section>
    <section class="sgw-card">
      ${compactTable(
        [{ key: 'type', label: 'Category' }, { key: 'branchName', label: 'Branch' }, { key: 'lineKey', label: 'Line Key' }, { key: 'field', label: 'Field' }, { key: 'message', label: 'Message' }],
        rows,
        'No diagnostics in the latest preview.',
      )}
    </section>`;
}

function weightMatchPanel(snapshot) {
  const rows = snapshot.preview?.nodeRows || [];
  return `
    ${phaseHeader('weight-match')}
    <section class="sgw-card">
      ${statusRows([
        { label: 'Weight Master', value: rowCount(snapshot.masterCounts?.weightMaster || 0), ok: snapshot.masterCounts?.weightMaster > 0 },
        { label: 'Candidate rows', value: `${rows.length.toLocaleString()} row(s)`, ok: rows.length > 0 },
      ])}
      <div class="sgw-toolbar"><button type="button" class="sgw-run-btn" data-sgw-action="preview">Compute Matches</button></div>
    </section>
    <section class="sgw-card">
      ${compactTable(
        [
          { key: 'branchName', label: 'Branch' },
          { key: 'nodeNumber', label: 'Node' },
          { key: 'componentType', label: 'Type' },
          { key: 'boreMm', label: 'Bore' },
          { key: 'rating', label: 'Rating' },
          { key: 'lengthMm', label: 'Length' },
          { key: 'weight', label: 'Weight Kg' },
          { key: 'weightMethod', label: 'Method' },
          { key: 'typeDesc', label: 'Type Desc' },
        ],
        rows.slice(0, 500),
        'No weight candidates yet. Load weight master rows and rebuild preview.',
      )}
    </section>`;
}

function runPanel(snapshot) {
  const counts = snapshot.preview?.counts || {};
  return `
    ${phaseHeader('run')}
    <section class="sgw-card">
      ${statusRows([
        { label: 'Objects', value: `${Number(counts.objects || 0).toLocaleString()} object(s)`, ok: counts.objects > 0 },
        { label: 'Branches', value: `${Number(counts.branches || 0).toLocaleString()} branch(es)`, ok: counts.branches > 0 },
        { label: 'Resolved', value: `${Number(counts.resolved || 0).toLocaleString()} branch(es)`, ok: counts.resolved > 0 },
        { label: 'Diagnostics', value: `${Number(counts.diagnostics || 0).toLocaleString()} item(s)`, ok: counts.diagnostics === 0 },
      ])}
    </section>
    <section class="sgw-card">
      <div class="sgw-section-title">Run Options</div>
      <div class="sgw-grid">
        <label class="sgw-field">
          <span>Target</span>
          <input type="url" value="${attr(snapshot.targetUrl || '')}" data-sgw-control="target-url">
        </label>
        <label class="sgw-field">
          <span>Scope</span>
          <select data-sgw-control="scope">
            ${scopeOption('selected', snapshot)}
            ${scopeOption('visible', snapshot)}
            ${scopeOption('hierarchy', snapshot)}
            ${scopeOption('full', snapshot)}
          </select>
        </label>
      </div>
      <div class="sgw-toolbar">
        <button type="button" class="sgw-run-btn" data-sgw-action="run">Run Enrichment</button>
        <button type="button" class="sgw-btn" data-sgw-action="export">Export JSON</button>
        <button type="button" class="sgw-btn" data-sgw-action="send">Send to Simplified</button>
      </div>
      <div class="sgw-hint">Run writes enrichment to immutable workspace snapshots only; live source geometry remains unchanged.</div>
    </section>`;
}

function configPanel(snapshot, uiState) {
  const textValue = uiState.configText !== null && uiState.configText !== undefined
    ? uiState.configText
    : JSON.stringify(snapshot.rawConfig || {}, null, 2);
  return `
    ${phaseHeader('config')}
    <section class="sgw-card">
      <div class="sgw-toolbar">
        <button type="button" class="sgw-run-btn" data-sgw-action="save-config">Save Config</button>
        <button type="button" class="sgw-btn" data-sgw-action="export-config">Export JSON</button>
        <label class="sgw-btn sgw-file-btn">Import JSON<input type="file" data-sgw-import-config accept=".json" hidden></label>
        <span class="sgw-status-text">${esc(uiState.configStatus || 'Ready')}</span>
      </div>
    </section>
    <textarea class="sgw-config-editor" data-sgw-config-text spellcheck="false">${esc(textValue)}</textarea>`;
}

export function renderSelectedGeometryWorkflowPhase(phaseId, snapshot, uiState) {
  if (phaseId === 'regex') return withPreviewSidePanel(regexPanel(snapshot), snapshot);
  if (phaseId === 'import-masters') return withPreviewSidePanel(importMastersPanel(snapshot, uiState), snapshot);
  if (phaseId === 'preview') return previewPanel(snapshot);
  if (phaseId === 'diagnostics') return withPreviewSidePanel(diagnosticsPanel(snapshot), snapshot);
  if (phaseId === 'weight-match') return withPreviewSidePanel(weightMatchPanel(snapshot), snapshot);
  if (phaseId === 'run') return withPreviewSidePanel(runPanel(snapshot), snapshot);
  if (phaseId === 'config') return configPanel(snapshot, uiState);
  return `${phaseHeader(phaseId)}<div class="sgw-detail-note">Unknown phase.</div>`;
}

function withPreviewSidePanel(contentHtml, snapshot) {
  return `
    <div class="sgw-workflow-layout">
      <main class="sgw-workflow-main">${contentHtml}</main>
      ${previewSidePanel(snapshot)}
    </div>`;
}
