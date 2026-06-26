export const SUPPORT_LOAD_BULK_PACKAGE_SCHEMA = 'support-load-bulk-package/v1';
export const SUPPORT_LOAD_BULK_PACKAGE_VERSION = '20260623-support-load-bulk-package-1';

function text(value) {
  return String(value ?? '').trim();
}

function count(value) {
  return Array.isArray(value) ? value.length : 0;
}

function stringifyJson(value) {
  return JSON.stringify(value ?? null, null, 2);
}

function byteSize(content) {
  const s = String(content ?? '');
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
  return s.length;
}

function fileRecord(path, mediaType, content, kind) {
  return Object.freeze({
    path,
    kind,
    mediaType,
    sizeBytes: byteSize(content),
    content: String(content ?? ''),
  });
}

function jsonRecord(path, payload, kind) {
  return fileRecord(path, 'application/json;charset=utf-8', stringifyJson(payload), kind);
}

function summaryFrom(report, stagedJson, formulaResults, qaDashboard, conflictModel) {
  return Object.freeze({
    pipeReportRows: count(report?.pipeRows),
    supportReportRows: count(report?.supportRows),
    stagedJsonElements: count(stagedJson?.elements),
    calculatedPipeCount: Number(report?.summary?.calculatedPipeRowCount ?? formulaResults?.calculatedPipeCount ?? 0),
    blockedPipeCount: Number(report?.summary?.blockedPipeRowCount ?? formulaResults?.blockedPipeCount ?? 0),
    conflictCount: Number(conflictModel?.conflictCount ?? qaDashboard?.conflicts?.conflictCount ?? 0),
    qaStatus: text(qaDashboard?.status),
    reportStatus: text(report?.status),
  });
}

function auditBlock(inputs) {
  const results = inputs.formulaResults || {};
  const writeback = inputs.writebackAudit || results.writebackAudit || null;
  return Object.freeze({
    inputSource: 'pipe.attributes.supportLoadInput',
    resultSource: 'calculatedFields.supportLoads + calculatedFields.supportLoadReference',
    reportSource: 'support-load-report/v1',
    stagedJsonSource: 'geometry-enriched-stagedjson/v2',
    packageDoesNotHydrateInputs: true,
    packageDoesNotCalculateLoads: true,
    packageDoesNotTopUpMissingFields: true,
    inputMutationCount: Number(writeback?.inputPackageMutatedCount || 0),
    writebackStatus: text(writeback?.status),
  });
}

export function buildSupportLoadBulkPackage(inputs = {}, options = {}) {
  const report = inputs.report || null;
  const stagedJson = inputs.stagedJson || null;
  const pipeCsv = inputs.pipeCsv || '';
  const supportCsv = inputs.supportCsv || '';
  const qaDashboard = inputs.qaDashboard || null;
  const conflictModel = inputs.conflictModel || null;
  const formulaResults = inputs.formulaResults || null;
  const inputModel = inputs.inputModel || null;
  const masterData = inputs.masterData || null;
  const audit = auditBlock(inputs);
  const summary = summaryFrom(report, stagedJson, formulaResults, qaDashboard, conflictModel);
  const files = [
    stagedJson ? jsonRecord('geometry-enriched-stagedjson-support-loads.json', stagedJson, 'STAGEDJSON') : null,
    report ? jsonRecord('support-load-report.json', report, 'REPORT_JSON') : null,
    pipeCsv ? fileRecord('support-load-pipe-report.csv', 'text/csv;charset=utf-8', pipeCsv, 'PIPE_CSV') : null,
    supportCsv ? fileRecord('support-load-support-report.csv', 'text/csv;charset=utf-8', supportCsv, 'SUPPORT_CSV') : null,
    qaDashboard ? jsonRecord('support-load-qa-dashboard.json', qaDashboard, 'QA_JSON') : null,
    conflictModel ? jsonRecord('support-load-enrichment-conflicts.json', conflictModel, 'CONFLICT_JSON') : null,
    inputModel ? jsonRecord('support-load-input-model.json', inputModel, 'INPUT_MODEL_JSON') : null,
    masterData ? jsonRecord('support-load-master-data.json', masterData, 'MASTER_DATA_JSON') : null,
    jsonRecord('support-load-package-audit.json', { schema: SUPPORT_LOAD_BULK_PACKAGE_SCHEMA, version: SUPPORT_LOAD_BULK_PACKAGE_VERSION, audit, summary }, 'AUDIT_JSON'),
  ].filter(Boolean);
  const status = report?.status === 'READY_FOR_EXPORT' && stagedJson ? 'READY_FOR_EXPORT' : 'REVIEW_REQUIRED';
  return Object.freeze({
    schema: SUPPORT_LOAD_BULK_PACKAGE_SCHEMA,
    version: SUPPORT_LOAD_BULK_PACKAGE_VERSION,
    generatedAt: options.generatedAt || new Date().toISOString(),
    status,
    profileId: text(report?.profileId || formulaResults?.profileId || 'ACCESS_TEMP_WALL_WEIGHTED_V1'),
    summary,
    audit,
    packageIndex: Object.freeze(files.map(({ path, kind, mediaType, sizeBytes }) => Object.freeze({ path, kind, mediaType, sizeBytes }))),
    files: Object.freeze(files),
    assumptions: Object.freeze([
      'Bulk package is an export-only bundle over already hydrated, locked, calculated, reported, and staged support-load data.',
      'The package builder does not hydrate missing fields, run formulas, or mutate calculated support-load fields.',
      'Inputs and calculated results remain separated in the included stagedJSON and report files.',
    ]),
  });
}

export function supportLoadBulkPackageToJson(pkg) {
  return stringifyJson(pkg);
}

export function downloadSupportLoadBulkPackage(pkg, filename = 'geometry-support-load-calculation-package.json') {
  const blob = new Blob([supportLoadBulkPackageToJson(pkg)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
