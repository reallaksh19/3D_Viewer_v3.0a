export const GEOMETRY_MAPPING_PROFILE_SCHEMA = 'geometry-mapping-user-profile/v1';
export const GEOMETRY_MAPPING_PROFILE_VERSION = '20260622-geometry-profile-ui-1';

const STORAGE_KEY = 'pcf-glb.geometry-workspace.mapping-profiles.v1';
const MAX_PROFILES = 12;
const MAX_DECISIONS = 5000;

function safeClone(value) {
  try { return JSON.parse(JSON.stringify(value)); }
  catch { return value; }
}

function hasStorage() {
  try { return typeof localStorage !== 'undefined' && localStorage; }
  catch { return false; }
}

function cleanId(value) {
  return String(value ?? '').trim();
}

export function normalizeSupportType(value) {
  const text = String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (text === 'LINESTOP' || text === 'LINE_STOP' || text === 'LIMIT' || text === 'LIM') return 'LINE_STOP';
  if (['GUIDE', 'REST', 'ANCHOR', 'GENERIC_SUPPORT'].includes(text)) return text;
  return '';
}

export function emptyGeometryMappingDecisions() {
  return { schemaVersion: GEOMETRY_MAPPING_PROFILE_SCHEMA, confirmedObjectIds: [], rejectedObjectIds: [], overrides: {}, updatedAt: new Date().toISOString() };
}

export function normalizeGeometryMappingDecisions(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const confirmedObjectIds = [...new Set((Array.isArray(raw.confirmedObjectIds) ? raw.confirmedObjectIds : []).map(cleanId).filter(Boolean))].slice(0, MAX_DECISIONS);
  const rejectedObjectIds = [...new Set((Array.isArray(raw.rejectedObjectIds) ? raw.rejectedObjectIds : []).map(cleanId).filter(Boolean))].slice(0, MAX_DECISIONS);
  const overrides = {};
  for (const [key, value] of Object.entries(raw.overrides || {})) {
    const id = cleanId(key);
    if (!id || Object.keys(overrides).length >= MAX_DECISIONS) continue;
    const supportType = normalizeSupportType(value?.supportType);
    if (supportType) overrides[id] = { supportType };
  }
  return { schemaVersion: GEOMETRY_MAPPING_PROFILE_SCHEMA, confirmedObjectIds, rejectedObjectIds, overrides, updatedAt: raw.updatedAt || new Date().toISOString() };
}

function baseMappedObject(object) {
  const clone = safeClone(object) || {};
  clone.mappingAudit = Array.isArray(clone.mappingAudit) ? clone.mappingAudit.filter((item) => item?.source !== 'USER_MAPPING_PROFILE') : [];
  if (['CONFIRMED', 'REJECTED', 'USER_OVERRIDDEN'].includes(clone.mappingStatus)) clone.mappingStatus = clone.mappingAudit.length ? 'AUTO_MAPPED' : 'UNMAPPED';
  return clone;
}

export function applyGeometryMappingDecisions(mapping, inputDecisions = {}) {
  if (!mapping || !Array.isArray(mapping.mappedObjects)) return mapping;
  const decisions = normalizeGeometryMappingDecisions(inputDecisions);
  const confirmed = new Set(decisions.confirmedObjectIds);
  const rejected = new Set(decisions.rejectedObjectIds);
  const overrides = decisions.overrides || {};
  let confirmedCount = 0;
  let rejectedCount = 0;
  let overrideCount = 0;
  const mappedObjects = mapping.mappedObjects.map((object) => {
    const id = object.sourceId || object.id;
    const next = baseMappedObject(object);
    const override = overrides[id];
    if (override?.supportType) {
      next.family = 'SUPPORT';
      next.support = { ...(next.support || {}), supportType: override.supportType };
      next.mappingStatus = 'USER_OVERRIDDEN';
      next.mappingConfidence = 1;
      next.mappingAudit.push({ ruleId: 'user-profile-override', targetField: 'support.supportType', value: override.supportType, sourceField: 'Geometry Mapping Profile UI', sourceValue: id, matchedValue: 'user override', confidence: 1, source: 'USER_MAPPING_PROFILE' });
      overrideCount += 1;
    }
    if (rejected.has(id)) {
      next.mappingStatus = 'REJECTED';
      next.mappingAudit.push({ ruleId: 'user-profile-reject', targetField: 'mappingStatus', value: 'REJECTED', sourceField: 'Geometry Mapping Profile UI', sourceValue: id, matchedValue: 'user rejected', confidence: 1, source: 'USER_MAPPING_PROFILE' });
      rejectedCount += 1;
    } else if (confirmed.has(id)) {
      next.mappingStatus = next.mappingStatus === 'USER_OVERRIDDEN' ? 'USER_OVERRIDDEN' : 'CONFIRMED';
      next.mappingAudit.push({ ruleId: 'user-profile-confirm', targetField: 'mappingStatus', value: next.mappingStatus, sourceField: 'Geometry Mapping Profile UI', sourceValue: id, matchedValue: 'user confirmed', confidence: 1, source: 'USER_MAPPING_PROFILE' });
      confirmedCount += 1;
    }
    return Object.freeze(next);
  });
  const mappedCount = mappedObjects.filter((item) => item.mappingStatus !== 'UNMAPPED' && item.mappingStatus !== 'REJECTED').length;
  const summary = { ...(mapping.summary || {}), mappedCount, unmappedCount: Math.max(0, mappedObjects.length - mappedCount), confirmedCount, rejectedCount, overrideCount };
  return Object.freeze({ ...mapping, profileDecisionSchema: GEOMETRY_MAPPING_PROFILE_SCHEMA, mappedObjects: Object.freeze(mappedObjects), mappedCount, unmappedCount: summary.unmappedCount, decisionSummary: Object.freeze({ confirmedCount, rejectedCount, overrideCount }), summary: Object.freeze(summary) });
}

export function createGeometryMappingProfile(name, decisions, baseProfileId = 'AUTO_RVM_GEOMETRY_MAPPING_V1') {
  const displayName = String(name || '').trim() || 'Geometry Mapping Profile';
  const profileId = displayName.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'GEOMETRY_MAPPING_PROFILE';
  return Object.freeze({ schemaVersion: GEOMETRY_MAPPING_PROFILE_SCHEMA, version: GEOMETRY_MAPPING_PROFILE_VERSION, profileId, displayName, baseProfileId, decisions: normalizeGeometryMappingDecisions(decisions), savedAt: new Date().toISOString() });
}

export function listGeometryMappingProfiles() {
  if (!hasStorage()) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item?.schemaVersion === GEOMETRY_MAPPING_PROFILE_SCHEMA).slice(0, MAX_PROFILES) : [];
  } catch { return []; }
}

export function saveGeometryMappingProfile(profile) {
  if (!hasStorage()) return [];
  const next = createGeometryMappingProfile(profile?.displayName || profile?.profileId, profile?.decisions || {}, profile?.baseProfileId);
  const profiles = listGeometryMappingProfiles().filter((item) => item.profileId !== next.profileId);
  profiles.unshift(next);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles.slice(0, MAX_PROFILES)));
  return listGeometryMappingProfiles();
}

export function loadGeometryMappingProfile(profileId) {
  return listGeometryMappingProfiles().find((profile) => profile.profileId === profileId) || null;
}