import { applyGeometryMappingDecisions, createGeometryMappingProfile, emptyGeometryMappingDecisions, listGeometryMappingProfiles, loadGeometryMappingProfile, normalizeGeometryMappingDecisions, normalizeSupportType, saveGeometryMappingProfile } from './GeometryMappingProfiles.js?v=20260622-geometry-profile-ui-1';

const INSTALL_FLAG = Symbol.for('pcf-glb-geometry-mapping-profile-bridge-v1');
const BRIDGE_VERSION = '20260622-geometry-profile-ui-1';
const MAX_ROWS = 160;

let decisions = emptyGeometryMappingDecisions();

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function workspaceApi() {
  return globalThis.__PCF_GLB_GEOMETRY_EXPORT_WORKSPACE__ || null;
}

function workspaceState() {
  return workspaceApi()?.state?.() || {};
}

function currentMapping() {
  return workspaceState().mapping || null;
}

function currentDialog() {
  return document.getElementById('geometry-mapping-profile-dialog');
}

function activeMappedObjects() {
  const state = workspaceState();
  const active = state.activeObjectIds instanceof Set ? state.activeObjectIds : new Set(state.activeObjectIds || []);
  const objects = Array.isArray(state.mapping?.mappedObjects) ? state.mapping.mappedObjects : [];
  return active.size ? objects.filter((object) => active.has(object.sourceId || object.id)) : objects;
}

function applyAndRefresh() {
  const api = workspaceApi();
  const state = workspaceState();
  const mapping = currentMapping();
  if (!api || !mapping) return null;
  decisions = normalizeGeometryMappingDecisions(decisions);
  const next = applyGeometryMappingDecisions(mapping, decisions);
  state.mapping = next;
  state.mappingProfileDecisions = decisions;
  api.open?.();
  renderProfileDialog();
  return next;
}

function markDecision(id, mode) {
  const objectId = String(id || '').trim();
  if (!objectId) return;
  decisions = normalizeGeometryMappingDecisions(decisions);
  const confirmed = new Set(decisions.confirmedObjectIds || []);
  const rejected = new Set(decisions.rejectedObjectIds || []);
  if (mode === 'confirm') { confirmed.add(objectId); rejected.delete(objectId); }
  if (mode === 'reject') { rejected.add(objectId); confirmed.delete(objectId); }
  if (mode === 'clear') { confirmed.delete(objectId); rejected.delete(objectId); delete decisions.overrides[objectId]; }
  decisions.confirmedObjectIds = [...confirmed];
  decisions.rejectedObjectIds = [...rejected];
  decisions.updatedAt = new Date().toISOString();
  applyAndRefresh();
}

function overrideSupportType(id, supportType) {
  const objectId = String(id || '').trim();
  const normalized = normalizeSupportType(supportType);
  if (!objectId) return;
  decisions = normalizeGeometryMappingDecisions(decisions);
  if (!normalized) delete decisions.overrides[objectId];
  else decisions.overrides[objectId] = { supportType: normalized };
  decisions.updatedAt = new Date().toISOString();
  applyAndRefresh();
}

function decisionFor(object) {
  const id = object.sourceId || object.id;
  const d = normalizeGeometryMappingDecisions(decisions);
  if ((d.rejectedObjectIds || []).includes(id)) return 'Rejected';
  if (d.overrides?.[id]?.supportType) return `Override: ${d.overrides[id].supportType}`;
  if ((d.confirmedObjectIds || []).includes(id)) return 'Confirmed';
  return object.mappingStatus || 'AUTO';
}

function renderProfileRows() {
  const rows = activeMappedObjects().slice(0, MAX_ROWS);
  if (!rows.length) return '<div class="gmp-empty">Import and map geometry before confirming mappings.</div>';
  return `<div class="gmp-table-wrap"><table><thead><tr><th>Object</th><th>Family</th><th>Support Type</th><th>Status</th><th>User decision</th><th>Actions</th></tr></thead><tbody>${rows.map((object) => {
    const id = object.sourceId || object.id;
    const supportType = normalizeGeometryMappingDecisions(decisions).overrides?.[id]?.supportType || object.support?.supportType || '';
    return `<tr data-gmp-id="${esc(id)}">
      <td title="${esc(object.sourcePath || object.displayName)}">${esc(object.displayName || id)}</td>
      <td>${esc(object.family)}</td>
      <td><select data-gmp-support-type="${esc(id)}"><option value="">${esc(supportType || 'not set')}</option><option value="REST">REST</option><option value="GUIDE">GUIDE</option><option value="LINE_STOP">LINE_STOP</option><option value="ANCHOR">ANCHOR</option><option value="GENERIC_SUPPORT">GENERIC_SUPPORT</option></select></td>
      <td>${esc(object.mappingStatus)} / ${esc(object.mappingConfidence)}</td>
      <td>${esc(decisionFor(object))}</td>
      <td><button type="button" data-gmp-confirm="${esc(id)}">Confirm</button><button type="button" data-gmp-reject="${esc(id)}">Reject</button><button type="button" data-gmp-clear="${esc(id)}">Clear</button></td>
    </tr>`;
  }).join('')}</tbody></table></div>`;
}

function renderSavedProfiles() {
  const profiles = listGeometryMappingProfiles();
  const options = profiles.map((profile) => `<option value="${esc(profile.profileId)}">${esc(profile.displayName || profile.profileId)}</option>`).join('');
  return `<div class="gmp-save-row"><input type="text" data-gmp-profile-name placeholder="Profile name, e.g. PDO_SUPPORT_MAPPING_V1"><button type="button" data-gmp-save="true">Save Profile</button><select data-gmp-profile-select><option value="">Saved profiles</option>${options}</select><button type="button" data-gmp-load="true">Load</button></div>`;
}

function renderProfileDialog() {
  const dialog = currentDialog();
  if (!dialog) return;
  const mapping = currentMapping();
  const d = normalizeGeometryMappingDecisions(decisions);
  const activeCount = activeMappedObjects().length;
  dialog.querySelector('[data-gmp-body]').innerHTML = `
    <div class="gmp-summary"><div><b>${mapping?.profileId || 'none'}</b><span>base mapping profile</span></div><div><b>${activeCount}</b><span>active mapped objects</span></div><div><b>${d.confirmedObjectIds.length}</b><span>confirmed</span></div><div><b>${d.rejectedObjectIds.length}</b><span>rejected</span></div><div><b>${Object.keys(d.overrides || {}).length}</b><span>overrides</span></div></div>
    ${renderSavedProfiles()}
    <p class="gmp-note">Confirm, reject, or override automatic mappings before calculation modules consume them. Decisions are stored as a project mapping profile and remain auditable.</p>
    ${renderProfileRows()}`;
}

function ensureProfileDialog() {
  let dialog = currentDialog();
  if (dialog) return dialog;
  dialog = document.createElement('div');
  dialog.id = 'geometry-mapping-profile-dialog';
  dialog.className = 'geometry-mapping-profile-dialog';
  dialog.innerHTML = `<div class="gmp-card" role="dialog" aria-label="Geometry Mapping Profile"><div class="gmp-head"><div><b>Mapping Profile</b><small>${BRIDGE_VERSION} · confirm / reject / override</small></div><button type="button" data-gmp-close="true">x</button></div><div data-gmp-body></div></div>`;
  document.body.appendChild(dialog);
  dialog.addEventListener('click', (event) => {
    if (event.target?.closest?.('[data-gmp-close]')) { dialog.classList.remove('is-open'); return; }
    const confirmId = event.target?.closest?.('[data-gmp-confirm]')?.dataset?.gmpConfirm;
    if (confirmId) { markDecision(confirmId, 'confirm'); return; }
    const rejectId = event.target?.closest?.('[data-gmp-reject]')?.dataset?.gmpReject;
    if (rejectId) { markDecision(rejectId, 'reject'); return; }
    const clearId = event.target?.closest?.('[data-gmp-clear]')?.dataset?.gmpClear;
    if (clearId) { markDecision(clearId, 'clear'); return; }
    if (event.target?.closest?.('[data-gmp-save]')) {
      const name = dialog.querySelector('[data-gmp-profile-name]')?.value || 'Geometry Mapping Profile';
      saveGeometryMappingProfile(createGeometryMappingProfile(name, decisions, currentMapping()?.profileId));
      renderProfileDialog();
      return;
    }
    if (event.target?.closest?.('[data-gmp-load]')) {
      const profileId = dialog.querySelector('[data-gmp-profile-select]')?.value || '';
      const profile = loadGeometryMappingProfile(profileId);
      if (profile) { decisions = normalizeGeometryMappingDecisions(profile.decisions); applyAndRefresh(); }
    }
  }, true);
  dialog.addEventListener('change', (event) => {
    const id = event.target?.dataset?.gmpSupportType;
    if (id) overrideSupportType(id, event.target.value);
  }, true);
  return dialog;
}

function openProfileDialog() {
  const dialog = ensureProfileDialog();
  dialog.classList.add('is-open');
  renderProfileDialog();
}

function injectToolbar(root) {
  const section = root?.querySelector?.('.geometry-export-workspace-tool-group');
  if (!section || section.querySelector('[data-geometry-mapping-profile-open]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'rvm-tool-btn';
  button.dataset.geometryMappingProfileOpen = 'true';
  button.title = 'Confirm, reject, override, save, and load geometry mapping profiles';
  button.innerHTML = '<span aria-hidden="true">MAP</span><span>Profiles</span>';
  section.querySelector('.rvm-ribbon-button-row')?.appendChild(button);
}

function injectStyles() {
  if (document.getElementById('geometry-mapping-profile-style')) return;
  const style = document.createElement('style');
  style.id = 'geometry-mapping-profile-style';
  style.textContent = `.geometry-mapping-profile-dialog{position:fixed;inset:0;display:none;align-items:flex-start;justify-content:center;padding:70px 20px;background:rgba(2,6,23,.48);z-index:12320}.geometry-mapping-profile-dialog.is-open{display:flex}.gmp-card{width:min(1120px,calc(100vw - 44px));max-height:calc(100vh - 90px);overflow:auto;background:#0b1424;border:1px solid rgba(126,190,255,.30);border-radius:14px;padding:12px;color:#dbeafe;box-shadow:0 24px 80px rgba(0,0,0,.55)}.gmp-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.gmp-head b{color:#bfdbfe}.gmp-head small{display:block;color:#8ea8c8;font-size:10px}.gmp-head button,.gmp-save-row button,.gmp-table-wrap button,.gmp-save-row input,.gmp-save-row select,.gmp-table-wrap select{border:1px solid rgba(126,190,255,.24);border-radius:8px;background:#132238;color:#dbeafe;padding:6px 9px}.gmp-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:8px}.gmp-summary div{border:1px solid rgba(126,190,255,.15);border-radius:9px;padding:8px;background:rgba(255,255,255,.035)}.gmp-summary b{display:block}.gmp-summary span,.gmp-note{color:#9fb3cc;font-size:11px}.gmp-save-row{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.gmp-save-row input{min-width:280px}.gmp-table-wrap{overflow:auto;max-height:560px}.gmp-table-wrap table{border-collapse:collapse;min-width:100%;font-size:11px}.gmp-table-wrap th,.gmp-table-wrap td{border:1px solid rgba(126,190,255,.13);padding:5px 7px;text-align:left;white-space:nowrap}.gmp-table-wrap th{position:sticky;top:0;background:#132238;color:#bfdbfe;z-index:1}.gmp-empty{padding:16px;border:1px dashed rgba(148,163,184,.22);border-radius:10px;color:#9fb3cc;text-align:center}`;
  document.head.appendChild(style);
}

function attach() {
  const root = document.querySelector('[data-rvm-viewer]');
  if (!root) return false;
  injectToolbar(root);
  return true;
}

function onDocumentClick(event) {
  if (!event.target?.closest?.('[data-geometry-mapping-profile-open]')) return;
  event.preventDefault();
  event.stopPropagation();
  openProfileDialog();
}

export function installGeometryMappingProfileBridge() {
  if (typeof document === 'undefined') return;
  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;
  injectStyles();
  document.addEventListener('click', onDocumentClick, true);
  let attempts = 0;
  const waitAttach = () => { attempts += 1; if (!attach() && attempts < 180) setTimeout(waitAttach, 300); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitAttach, { once: true });
  else waitAttach();
  globalThis.addEventListener?.('rvm-model-loaded', () => setTimeout(waitAttach, 320));
  globalThis.__PCF_GLB_GEOMETRY_MAPPING_PROFILE__ = { version: BRIDGE_VERSION, open: openProfileDialog, decisions: () => decisions, apply: applyAndRefresh, listProfiles: listGeometryMappingProfiles, schema: 'geometry-mapping-user-profile/v1' };
}