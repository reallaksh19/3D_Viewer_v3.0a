const NON_PRIMITIVE_SOURCE_KINDS = new Set(['json', 'jscon', 'inputxml', 'txt']);
const PRIMITIVE_SOURCE_KINDS = new Set(['rvm', 'glb', 'gltf']);

export function normalizeSourceKind(value) {
  const text = String(value || '').trim().toLowerCase().replace(/^\./, '');
  if (text === 'xml') return 'inputxml';
  return text;
}

export function sourceKindFromContext(context = {}) {
  return normalizeSourceKind(
    context.sourceKind
      || context.loadedSourceKind
      || context.fileExtension
      || context.fileName?.split('.').pop()
  );
}

export function canUseAutoBend(context = {}) {
  const sourceKind = sourceKindFromContext(context);
  if (!NON_PRIMITIVE_SOURCE_KINDS.has(sourceKind)) return false;
  if (PRIMITIVE_SOURCE_KINDS.has(sourceKind)) return false;
  if (context.modelPrimitiveMode === 'rvm-native') return false;
  if (context.modelPrimitiveMode === 'glb-native') return false;
  if (context.viewerMode === 'rvm') return false;
  if (context.viewerMode === 'glb') return false;
  return true;
}

export const NON_PRIMITIVE_AUTO_BEND_SOURCE_KINDS = Object.freeze({
  nonPrimitive: [...NON_PRIMITIVE_SOURCE_KINDS],
  primitive: [...PRIMITIVE_SOURCE_KINDS],
});
