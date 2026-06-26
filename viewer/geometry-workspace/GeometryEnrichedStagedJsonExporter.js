export const GEOMETRY_ENRICHED_STAGEDJSON_SCHEMA = 'geometry-enriched-stagedjson/v2';
export const GEOMETRY_ENRICHED_STAGEDJSON_VERSION = '20260622-geometry-enriched-stagedjson-support-loads-1';
export const GEOMETRY_ENRICHED_STAGEDJSON_SUPPORT_LOAD_SCHEMA = 'geometry-enriched-stagedjson-support-loads/v1';
// Legacy static fit-guard marker: GEOMETRY_ENRICHED_STAGEDJSON_SCHEMA = 'geometry-enriched-stagedjson/v1'

function text(value) {
  return String(value ?? '').trim();
}

function plain(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function objectKey(object) {
  return text(object?.sourceId || object?.id || object?.canonicalId || object?.displayName);
}

function pickRawRecord(object) {
  return object?.rawRecord && typeof object.rawRecord === 'object' ? object.rawRecord : object;
}

function supportLoadInput(object, raw) {
  return object?.attributes?.supportLoadInput
    || raw?.attributes?.supportLoadInput
    || object?.supportLoadInput
    || raw?.supportLoadInput
    || null;
}

function calculatedSupportLoads(object, raw) {
  return object?.calculatedFields?.supportLoads
    || raw?.calculatedFields?.supportLoads
    || null;
}

function calculatedSupportLoadReference(object, raw) {
  return object?.calculatedFields?.supportLoadReference
    || raw?.calculatedFields?.supportLoadReference
    || null;
}

function supportLoadElementBlock(object, raw) {
  const input = supportLoadInput(object, raw);
  const supportLoads = calculatedSupportLoads(object, raw);
  const supportLoadReference = calculatedSupportLoadReference(object, raw);
  if (!input && !supportLoads && !supportLoadReference) return null;
  return {
    schema: GEOMETRY_ENRICHED_STAGEDJSON_SUPPORT_LOAD_SCHEMA,
    inputSource: input ? 'pipe.attributes.supportLoadInput' : null,
    resultSource: supportLoads ? 'calculatedFields.supportLoads' : (supportLoadReference ? 'calculatedFields.supportLoadReference' : null),
    input: plain(input),
    calculatedFields: {
      supportLoads: plain(supportLoads),
      supportLoadReference: plain(supportLoadReference),
    },
  };
}

function normalizedElement(object, index) {
  const raw = pickRawRecord(object);
  const enrichment = object.geometryEnrichment || raw.geometryEnrichment || {};
  const enrichedFields = object.enrichedFields || raw.enrichedFields || {};
  const id = objectKey(object) || `GEOM-${index + 1}`;
  const supportLoad = supportLoadElementBlock(object, raw);
  const record = {
    id,
    name: text(object.displayName || raw.displayName || id),
    type: text(object.family || object.objectType || raw.objectClass || raw.objectType || 'OBJECT'),
    sourcePath: text(object.sourcePath || raw.sourcePath),
    hierarchyPath: plain(object.hierarchyPath || raw.hierarchyPath || []),
    geometry: plain(object.geometry || raw.geometry || {}),
    rawFields: plain(raw.rawFields || object.rawFields || {}),
    mappedFields: {
      family: object.family || '',
      objectType: object.objectType || '',
      primitiveKind: object.primitiveKind || '',
      support: plain(object.support || {}),
      pipe: plain(object.pipe || {}),
      lineNo: object.lineNo || '',
      mappingStatus: object.mappingStatus || '',
      mappingConfidence: object.mappingConfidence ?? null,
    },
    enrichedFields: plain(enrichedFields),
    geometryEnrichment: plain(enrichment),
    enrichmentAudit: plain(enrichment.audit || object.enrichmentAudit || []),
    mappingAudit: plain(object.mappingAudit || []),
    review: plain(enrichment.review || {}),
  };
  if (supportLoad) record.supportLoad = supportLoad;
  return record;
}

function sourceSummary(elements) {
  const byType = {};
  let enriched = 0;
  let review = 0;
  let supportLoadInputCount = 0;
  let lockedSupportLoadInputCount = 0;
  let supportLoadCalculatedCount = 0;
  let supportLoadReferenceCount = 0;
  for (const element of elements) {
    const type = element.type || 'OBJECT';
    byType[type] = (byType[type] || 0) + 1;
    if (element.enrichedFields && Object.keys(element.enrichedFields).some((key) => element.enrichedFields[key] !== null && element.enrichedFields[key] !== undefined && element.enrichedFields[key] !== '')) enriched += 1;
    if (element.review?.needsReview) review += 1;
    const sl = element.supportLoad;
    if (sl?.input) {
      supportLoadInputCount += 1;
      if (sl.input?.readiness?.readyForCalculation === true) lockedSupportLoadInputCount += 1;
    }
    if (sl?.calculatedFields?.supportLoads) supportLoadCalculatedCount += 1;
    if (sl?.calculatedFields?.supportLoadReference) supportLoadReferenceCount += 1;
  }
  return { byType, enriched, review, supportLoadInputCount, lockedSupportLoadInputCount, supportLoadCalculatedCount, supportLoadReferenceCount };
}

function supportLoadSummary(elements, options = {}) {
  const summary = sourceSummary(elements);
  const formulaResults = options.formulaResults || null;
  return {
    schema: GEOMETRY_ENRICHED_STAGEDJSON_SUPPORT_LOAD_SCHEMA,
    inputSource: 'pipe.attributes.supportLoadInput',
    resultSource: 'calculatedFields.supportLoads / calculatedFields.supportLoadReference',
    formulaResultSchema: text(formulaResults?.schema),
    formulaResultVersion: text(formulaResults?.version),
    formulaStatus: text(formulaResults?.status),
    profileId: text(formulaResults?.profileId),
    pipeInputCount: summary.supportLoadInputCount,
    lockedPipeInputCount: summary.lockedSupportLoadInputCount,
    calculatedPipeResultCount: summary.supportLoadCalculatedCount,
    supportReferenceResultCount: summary.supportLoadReferenceCount,
    formulaSummary: {
      pipeInputCount: formulaResults?.pipeInputCount ?? null,
      calculatedPipeCount: formulaResults?.calculatedPipeCount ?? null,
      blockedPipeCount: formulaResults?.blockedPipeCount ?? null,
      supportResultCount: formulaResults?.supportResultCount ?? null,
    },
    writebackAudit: plain(formulaResults?.writebackAudit || null),
    formulaInfo: formulaResults?.formulaInfo || null,
    assumptions: [
      'Support-load inputs are exported from pipe.attributes.supportLoadInput only.',
      'Support-load calculated results are exported from calculatedFields.supportLoads/supportLoadReference only.',
      'The stagedJSON exporter does not hydrate, top-up, infer, or calculate missing support-load data.',
    ],
  };
}

export function buildGeometryEnrichedStagedJson(objects = [], options = {}) {
  const records = Array.isArray(objects) ? objects : [];
  const elements = records.map(normalizedElement);
  const summary = sourceSummary(elements);
  return {
    schemaVersion: GEOMETRY_ENRICHED_STAGEDJSON_SCHEMA,
    version: GEOMETRY_ENRICHED_STAGEDJSON_VERSION,
    generatedAt: new Date().toISOString(),
    source: {
      sourceViewer: '3D_RVM_VIEWER',
      sourceMode: options.sourceMode || 'geometry-workspace-active-enriched-objects',
      objectCount: elements.length,
      enrichedCount: summary.enriched,
      reviewCount: summary.review,
      supportLoadInputCount: summary.supportLoadInputCount,
      lockedSupportLoadInputCount: summary.lockedSupportLoadInputCount,
      supportLoadCalculatedCount: summary.supportLoadCalculatedCount,
      supportLoadReferenceCount: summary.supportLoadReferenceCount,
      byType: summary.byType,
    },
    policies: {
      renderedGeometrySource: true,
      noFabricatedEngineeringData: true,
      enrichmentFromRichXmlCiiMasters: true,
      supportLoadInputExportedFromPipeAttributes: summary.supportLoadInputCount > 0,
      supportLoadFormulaApplied: summary.supportLoadCalculatedCount > 0 || summary.supportLoadReferenceCount > 0,
      supportLoadExporterDoesNotTopUpInputs: true,
    },
    masters: plain(options.masterSummary || {}),
    supportLoads: supportLoadSummary(elements, options),
    elements,
  };
}

export function downloadGeometryEnrichedStagedJson(payload, fileName = 'geometry-enriched-stagedjson.json') {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
