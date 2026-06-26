// Shared selected-geometry helpers: normalizes object identity, source fields,
// numeric values, deep cloning, and immutable outputs for enrichment modules.

const POINT_KEYS = Object.freeze([
  ['x', 'X', 0],
  ['y', 'Y', 1],
  ['z', 'Z', 2],
]);

export function text(value) {
  return String(value ?? '').trim();
}

export function numberOrNull(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = text(value).replace(/,/g, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function numberOrZero(value) {
  const parsed = numberOrNull(value);
  return parsed === null ? 0 : parsed;
}

export function normalizeKey(value) {
  return text(value).toUpperCase().replace(/[^A-Z0-9.]+/g, '');
}

export function cloneSafe(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch (_) {
      // Fall through to JSON clone for plain data carried by viewer attributes.
    }
  }
  if (value === null || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}

export function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) freezeDeep(value[key]);
  return Object.freeze(value);
}

export function attributesForNode(node) {
  const data = node?.userData || {};
  const props = data.browserRvmProperties || {};
  return {
    ...(props.attributes || {}),
    ...(data.rawAttributes || {}),
    ...(data.browserRvmAttributes || {}),
    ...(data.attributes || {}),
    ...(node?.attributes || {}),
    ...(node?.sourceAttributes || {}),
  };
}

export function sourcePathForNode(node) {
  const data = node?.userData || {};
  const props = data.browserRvmProperties || {};
  const attrs = attributesForNode(node);
  return text(
    node?.sourcePath
      || data.sourcePath
      || props.sourcePath
      || props.SourcePath
      || attrs.OWNER
      || attrs.RVM_OWNER_PATH
      || attrs.RVM_OWNER_NAME
      || attrs.SOURCE_PATH
      || ''
  );
}

export function typeForNode(node) {
  const data = node?.userData || {};
  const attrs = attributesForNode(node);
  return text(
    attrs.TYPE
      || attrs.RAW_TYPE
      || attrs.DTXR
      || attrs.RVM_TYPE
      || attrs.COMPONENT_TYPE
      || data.sourceType
      || data.componentType
      || data.kind
      || node?.kind
      || data.type
      || node?.type
      || 'OBJECT'
  ).toUpperCase();
}

export function nameForNode(node) {
  const data = node?.userData || {};
  const props = data.browserRvmProperties || {};
  const attrs = attributesForNode(node);
  return text(
    node?.name
      || data.displayName
      || data.sourceName
      || props.displayName
      || attrs.NAME
      || attrs.RVM_REVIEW_NAME
      || stableObjectId(node)
  );
}

export function stableHash(value) {
  const source = text(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function stableObjectId(node) {
  const data = node?.userData || {};
  const props = data.browserRvmProperties || {};
  const attrs = attributesForNode(node);
  const direct = text(
    data.sourceObjectId
      || props.sourceObjectId
      || attrs.SOURCE_ELEMENT_ID
      || attrs.SOURCE_RESTRAINT_ID
      || attrs.REF
      || attrs.NAME
      || attrs.ID
      || attrs.REF_NO
      || attrs.GUID
      || data.canonicalObjectId
      || node?.canonicalId
      || node?.id
      || data.name
      || node?.uuid
      || ''
  );
  if (direct) return direct;
  return `rvm-object:${stableHash([sourcePathForNode(node), nameForNode(node), typeForNode(node)].join('|'))}`;
}

export function objectAliases(node) {
  const data = node?.userData || {};
  const props = data.browserRvmProperties || {};
  const attrs = attributesForNode(node);
  return [
    stableObjectId(node),
    node?.id,
    node?.uuid,
    node?.name,
    data.name,
    data.canonicalObjectId,
    data.sourceObjectId,
    data.sourcePath,
    data.sourceName,
    data.displayName,
    props.sourcePath,
    props.sourceName,
    props.displayName,
    attrs.ID,
    attrs.REF,
    attrs.NAME,
    attrs.SOURCE_ELEMENT_ID,
    attrs.SOURCE_RESTRAINT_ID,
    attrs.REF_NO,
    attrs.FROM_NODE,
    attrs.TO_NODE,
    attrs.OWNER,
    attrs.RVM_OWNER_PATH,
    attrs.RVM_OWNER_NAME,
    attrs.RVM_REVIEW_NAME,
  ].map(text).filter(Boolean);
}

export function clonePoint(value) {
  if (Array.isArray(value)) {
    return freezeDeep({
      x: numberOrZero(value[0]),
      y: numberOrZero(value[1]),
      z: numberOrZero(value[2]),
    });
  }
  const out = {};
  for (const [target, alt, index] of POINT_KEYS) {
    out[target] = numberOrZero(value?.[target] ?? value?.[alt] ?? value?.[index]);
  }
  return freezeDeep(out);
}

export function readPointFromAttributes(attrs, baseKey) {
  const direct = attrs?.[baseKey];
  if (direct && typeof direct === 'object') return clonePoint(direct);
  return clonePoint({
    x: attrs?.[`${baseKey}_X`] ?? attrs?.[`${baseKey}.X`],
    y: attrs?.[`${baseKey}_Y`] ?? attrs?.[`${baseKey}.Y`],
    z: attrs?.[`${baseKey}_Z`] ?? attrs?.[`${baseKey}.Z`],
  });
}

export function rowValue(row, keys) {
  const entries = Object.entries(row || {});
  for (const key of keys) {
    if (text(row?.[key])) return row[key];
    const normalized = normalizeKey(key);
    const match = entries.find(([name, value]) => normalizeKey(name) === normalized && text(value));
    if (match) return match[1];
    const rawEntries = Object.entries(row?._raw || {});
    const rawMatch = rawEntries.find(([name, value]) => normalizeKey(name) === normalized && text(value));
    if (rawMatch) return rawMatch[1];
  }
  return '';
}

export function rowNumber(row, keys) {
  const parsed = numberOrNull(rowValue(row, keys));
  return parsed === null ? null : parsed;
}
