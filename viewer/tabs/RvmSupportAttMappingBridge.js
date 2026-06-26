const CACHE_KEY = '20260621-rvm-button-hardening-1';
const SCHEMA = 'rvm-support-att-stagedjson-mapping/v2-prerequisite-diagnostics';
const GLOBAL_KEY = '__PCF_GLB_RVM_SUPPORT_ATT_MAPPING_DIAGNOSTICS__';

export function installRvmSupportAttMappingBridge() {
  let attempts = 0;
  const attach = () => {
    attempts += 1;
    const root = document.querySelector('[data-rvm-viewer]');
    const viewer = globalThis.__3D_RVM_VIEWER__;
    if (root && viewer) bind(root, viewer);
    if ((!root || !viewer) && attempts < 180) setTimeout(attach, 350);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true });
  else attach();
}

function bind(root, viewer) {
  if (!root || root.dataset.rvmSupportAttMappingBridge === CACHE_KEY) return;
  root.dataset.rvmSupportAttMappingBridge = CACHE_KEY;
  injectStyles();
  injectControls(root, viewer);
  const run = () => render(root, mapSupportMetadata(viewer));
  for (const delay of [250, 1200, 2600, 5200]) setTimeout(run, delay);
  root._rvmSupportAttMappingRun = run;
}

function injectControls(root, viewer) {
  const ribbon = root.querySelector('.geo-top-ribbon');
  if (!ribbon || root.querySelector('[data-rvm-support-att-mapping]')) return;
  const section = document.createElement('div');
  section.className = 'rvm-ribbon-section rvm-support-att-section';
  section.dataset.rvmSupportAttMapping = CACHE_KEY;
  section.innerHTML = '<span class="rvm-ribbon-label">SupportATT</span><div class="rvm-support-att-buttons" role="group" aria-label="Support ATT mapping"><button class="rvm-btn" type="button" data-rvm-support-att-scan="1">Scan</button><button class="rvm-btn" type="button" data-rvm-support-att-json="1">JSON</button></div>';
  const search = ribbon.querySelector('.rvm-ribbon-search');
  ribbon.insertBefore(section, search || null);
  section.addEventListener('click', (event) => {
    const scan = event.target?.closest?.('[data-rvm-support-att-scan]');
    const json = event.target?.closest?.('[data-rvm-support-att-json]');
    if (!scan && !json) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      const diag = mapSupportMetadata(viewer);
      render(root, diag);
      if (json) downloadJson(diag, `rvm-support-att-mapping-${Date.now()}.json`);
    } catch (error) {
      reportActionError(error, { action: 'support-att', mode: scan ? 'scan' : 'json' });
    }
  });
}

function mapSupportMetadata(viewer) {
  const diag = {
    schema: SCHEMA,
    cacheKey: CACHE_KEY,
    supportGeometryScannedCount: 0,
    supportMetadataMappedCount: 0,
    supportAttFieldCounts: {},
    supportStagedJsonRecords: [],
    supportKindCounts: {},
    missingSourceUuidCount: 0,
    missingSourcePathCount: 0,
    prerequisite: { requiresGeneratedSupportGeometry: true, generatedSupportGeometryFound: false },
  };
  const sourceIndex = buildSourceIndex(viewer);
  viewer?.modelGroup?.updateMatrixWorld?.(true);
  viewer?.modelGroup?.traverse?.((obj) => {
    if (!obj?.isMesh || !obj.userData?.rvmSupportGeometryGenerated) return;
    diag.prerequisite.generatedSupportGeometryFound = true;
    diag.supportGeometryScannedCount += 1;
    const mapped = toSupportAttRecord(obj, sourceIndex);
    applyMappedMetadata(obj, mapped);
    diag.supportMetadataMappedCount += 1;
    diag.supportStagedJsonRecords.push(mapped);
    bump(diag.supportKindCounts, mapped.SUPPORT_KIND || 'UNKNOWN_SUPPORT');
    for (const key of Object.keys(mapped)) if (mapped[key] !== undefined && mapped[key] !== '') bump(diag.supportAttFieldCounts, key);
    if (!mapped.SOURCE_UUIDS?.length) diag.missingSourceUuidCount += 1;
    if (!mapped.SOURCE_PATH) diag.missingSourcePathCount += 1;
  });
  if (!diag.prerequisite.generatedSupportGeometryFound) {
    diag.prerequisite.message = 'SupportATT requires generated support geometry. Run SupportGeom → Overlay or Replace first.';
    const root = document.querySelector('[data-rvm-viewer]');
    const status = root?.querySelector?.('#rvm-sb-msg');
    if (status) status.textContent = diag.prerequisite.message;
  }
  globalThis[GLOBAL_KEY] = diag;
  return diag;
}

function buildSourceIndex(viewer) {
  const byUuid = new Map();
  viewer?.modelGroup?.traverse?.((obj) => { if (obj?.uuid) byUuid.set(obj.uuid, obj); });
  return byUuid;
}

function toSupportAttRecord(obj, sourceIndex) {
  const u = obj.userData || {};
  const sourceUuids = Array.isArray(u.sourceUuids) ? u.sourceUuids : [];
  const sourceObjects = sourceUuids.map((id) => sourceIndex.get(id)).filter(Boolean);
  const source = sourceObjects[0]?.userData || {};
  const attrs = source.browserRvmAttributes || source.attributes || {};
  const supportKind = normalizeSupportKind(u.supportKind || attrs.SUPPORT_KIND || attrs.RVM_BROWSER_SUPPORT_KIND || attrs.TYPE || 'UNKNOWN_SUPPORT');
  const name = u.displayName || attrs.NAME || source.displayName || obj.name || `SUPPORT-${supportKind}`;
  const pos = positionText(obj);
  return {
    NAME: name,
    TYPE: 'SUPPORT',
    SUPPORT_KIND: supportKind,
    SUPPORT_PART: u.supportGeometryPart || obj.name || '',
    COMPONENT_ID: attrs.COMPONENT_ID || attrs.PS_NO || attrs.NAME || name,
    PS_NO: attrs.PS_NO || attrs.SUPPORT_NO || '',
    SOURCE_FORMAT: 'RVM_SUPPORT_GEOMETRY_ATT_MAPPING',
    SOURCE_PATH: u.sourcePath || attrs.SOURCE_PATH || source.sourcePath || '',
    SOURCE_UUIDS: sourceUuids,
    APOS: attrs.APOS || attrs.POS || pos,
    POS: attrs.POS || attrs.APOS || pos,
    LPOS: attrs.LPOS || '',
    BPOS: attrs.BPOS || '',
    HBOR: attrs.HBOR || '',
    MATERIAL: attrs.MATERIAL || attrs.MATL || 'SUPPORT_STEEL',
    RVM_OWNER_NAME: attrs.RVM_OWNER_NAME || source.RVM_OWNER_NAME || '',
    RVM_PRIMITIVE_KIND: 'SUPPORT',
    RVM_BROWSER_SUPPORT_KIND: supportKind,
    supportStagedJsonRole: 'support',
    supportAttMappingSchema: SCHEMA,
  };
}

function applyMappedMetadata(obj, mapped) {
  obj.userData = obj.userData || {};
  obj.userData.TYPE = 'SUPPORT';
  obj.userData.supportKind = mapped.SUPPORT_KIND;
  obj.userData.supportAttMapped = true;
  obj.userData.supportAttMappingSchema = SCHEMA;
  obj.userData.supportStagedJsonRole = 'support';
  obj.userData.browserRvmAttributes = { ...(obj.userData.browserRvmAttributes || {}), ...mapped };
  for (const [key, value] of Object.entries(mapped)) obj.userData[key] = value;
}

function render(root, diag) {
  const panel = findPanel(root);
  if (!panel) return;
  let section = panel.querySelector('[data-rvm-support-att-panel]');
  if (!section) {
    section = document.createElement('section');
    section.className = 'rvm-support-att-panel';
    section.dataset.rvmSupportAttPanel = CACHE_KEY;
    panel.appendChild(section);
  }
  const kinds = Object.entries(diag.supportKindCounts).map(([k, v]) => `${escapeHtml(k)}:${v}`).join(' · ') || 'none';
  const hint = diag.prerequisite?.message || 'Mapped support geometry now carries ATT/stagedJSON-style support fields in node extras for GLB export.';
  section.innerHTML = `<h3>Support ATT Mapping</h3><div class="rvm-support-att-grid"><span>Scanned</span><b>${diag.supportGeometryScannedCount}</b><span>Mapped</span><b>${diag.supportMetadataMappedCount}</b><span>Kinds</span><b>${kinds}</b></div><div class="rvm-support-att-hint">${escapeHtml(hint)}</div>`;
}

function findPanel(root) {
  return root.querySelector('.rvm-side-panel') || root.querySelector('.rvm-inspector') || root.querySelector('.rvm-details-panel') || root;
}

function positionText(obj) {
  const e = obj?.matrixWorld?.elements;
  const p = e ? { x: e[12], y: e[13], z: e[14] } : (obj?.position || { x: 0, y: 0, z: 0 });
  const x = Number(p.x || 0).toFixed(4), y = Number(p.y || 0).toFixed(4), z = Number(p.z || 0).toFixed(4);
  return `${x},${y},${z}`;
}

function normalizeSupportKind(value) {
  const s = String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ');
  if (s.includes('GUIDE')) return 'GUIDE';
  if (s.includes('LINE') && s.includes('STOP')) return 'LINESTOP';
  if (s.includes('LIMIT')) return 'LIMIT';
  if (s.includes('ANCHOR')) return 'ANCHOR';
  if (s.includes('SPRING') || s.includes('HANGER')) return 'SPRING';
  if (s.includes('REST') || s.includes('SHOE') || s.includes('SUPPORT')) return 'REST';
  return 'UNKNOWN_SUPPORT';
}

function bump(obj, key) { obj[key] = (obj[key] || 0) + 1; }
function reportActionError(error, context) { try { globalThis.__PCF_GLB_RVM_REPORT_ACTION_ERROR__?.(error, context); } catch (_) {} console.warn('[RVM SupportATT] action failed', context, error); }
function escapeHtml(value) { return String(value).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }
function downloadJson(payload, filename) { const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
function injectStyles() { if (document.getElementById('rvm-support-att-mapping-style')) return; const style = document.createElement('style'); style.id = 'rvm-support-att-mapping-style'; style.textContent = '.rvm-support-att-panel{margin-top:10px;padding:10px;border:1px solid rgba(148,163,184,.25);border-radius:10px;background:rgba(15,23,42,.65)}.rvm-support-att-panel h3{margin:0 0 8px;font-size:12px;color:#e2e8f0}.rvm-support-att-grid{display:grid;grid-template-columns:auto 1fr;gap:4px 8px;font-size:11px}.rvm-support-att-grid span{color:#94a3b8}.rvm-support-att-grid b{color:#f8fafc;font-weight:700}.rvm-support-att-hint{margin-top:8px;font-size:10px;color:#93c5fd;line-height:1.35}'; document.head.appendChild(style); }
