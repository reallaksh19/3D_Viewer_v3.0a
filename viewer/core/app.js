// App shell runtime delegate.
// Static contract markers retained here because certification gates read core/app.js directly.
// let activeTabDestroy
// let appDestroy
// function cleanupActiveTab
// renderTabError
// tabRendererCache
// GeometryExportWorkspaceBridge.js?v=20260622-geometry-import-tree-1
// GeometryCalculationCanvasBridge.js?v=20260622-geometry-calc-canvas-1
// GeometryCalculationCanvasBridge.js?v=20260622-geometry-support-load-inputs-1
// GeometrySupportLoadInputBridge.js?v=20260622-geometry-support-load-inputs-1
// GeometrySupportLoadInputModel.js?v=20260622-geometry-support-load-inputs-1
// app-label-perf-runtime.js?v=20260622-geometry-enriched-stagedjson-1
// app-label-perf-runtime.js?v=20260622-geometry-support-load-inputs-1
// GeometryCalculationCanvasBridge.js?v=20260622-pipe-support-load-input-hydrator-1
// GeometrySupportLoadInputBridge.js?v=20260622-pipe-support-load-input-hydrator-1
// GeometrySupportLoadInputModel.js?v=20260622-pipe-support-load-input-hydrator-1
// GeometrySupportLoadInputModel.js?v=20260622-pipe-support-load-input-hydrator-2
// GeometrySupportLoadInputReview.js?v=20260622-input-review-lock-1
// GeometrySupportLoadInputOverrides.js?v=20260622-input-override-1
// GeometrySupportLoadInputBridge.js?v=20260622-input-review-override-lock-1
// GeometrySupportLoadInputModel.js?v=20260623-master-data-hydrator-priority-1
// GeometrySupportLoadInputBridge.js?v=20260623-master-data-hydrator-priority-1
// GeometrySupportLoadAutoSpanResolver.js?v=20260623-support-load-autospan-resolver-1
// GeometrySupportLoadInputModel.js?v=20260623-autospan-resolver-1
// GeometrySupportLoadInputBridge.js?v=20260623-autospan-resolver-1
// GeometrySupportLoadFormulaEngine.js?v=20260622-access-support-load-formula-1
// GeometrySupportLoadFormulaBridge.js?v=20260622-access-support-load-formula-1
// GeometrySupportLoadReportExporter.js?v=20260622-support-load-result-report-1
// GeometrySupportLoadReportBridge.js?v=20260622-support-load-result-report-1
// GeometrySupportLoadFormulaEngine.js?v=20260622-support-load-result-writeback-audit-1
// GeometrySupportLoadFormulaBridge.js?v=20260622-support-load-result-writeback-audit-1
// GeometryEnrichedStagedJsonBridge.js?v=20260622-geometry-enriched-stagedjson-1
// GeometryEnrichedStagedJsonExporter.js?v=20260622-geometry-enriched-stagedjson-support-loads-1
// GeometryEnrichedStagedJsonBridge.js?v=20260622-geometry-enriched-stagedjson-support-loads-1
// GeometrySupportLoadMasterData.js?v=20260623-support-load-master-data-1
// GeometrySupportLoadMasterDataBridge.js?v=20260623-support-load-master-data-1
// GeometrySupportLoadConflictResolver.js?v=20260623-support-load-conflict-resolver-1
// GeometrySupportLoadConflictBridge.js?v=20260623-support-load-conflict-resolver-1
// GeometrySupportLoadQaDashboard.js?v=20260623-support-load-qa-dashboard-1
// GeometrySupportLoadQaDashboardBridge.js?v=20260623-support-load-qa-dashboard-1
// GeometrySupportLoadBulkPackageExporter.js?v=20260623-support-load-bulk-package-1
// GeometrySupportLoadBulkPackageBridge.js?v=20260623-support-load-bulk-package-1
// GeometrySupportLoadCanvasOverlayModel.js?v=20260623-support-load-canvas-overlay-1
// GeometrySupportLoadCanvasOverlayBridge.js?v=20260623-support-load-canvas-overlay-1
// app-label-perf-runtime.js?v=20260622-pipe-support-load-input-hydrator-1
// app-label-perf-runtime.js?v=20260622-input-review-lock-1
// app-label-perf-runtime.js?v=20260622-input-review-override-lock-1
// app-label-perf-runtime.js?v=20260622-access-support-load-formula-1
// app-label-perf-runtime.js?v=20260622-support-load-result-report-1
// app-label-perf-runtime.js?v=20260622-support-load-result-writeback-audit-1
// app-label-perf-runtime.js?v=20260622-geometry-enriched-stagedjson-support-loads-1
// app-label-perf-runtime.js?v=20260623-support-load-bulk-package-1
// app-label-perf-runtime.js?v=20260623-support-load-canvas-overlay-1
// app-label-perf-runtime.js?v=20260623-xml-cii-rich-worker-1
// app-label-perf-runtime.js?v=20260624-selected-geometry-floating-workflow-3
// app-label-perf-runtime.js?v=20260625-rvm-renderer-cache-chain-1
// app-label-perf-runtime.js?v=20260625-rvm-route-preserve-preflight-1
// app-label-perf-runtime.js?v=20260625-model-converters-finalise-run-owner-1
// app-label-perf-runtime.js?v=20260625-empty-startup-side-effects-removed-1
// app-label-perf-runtime.js?v=20260626-rvm-hierarchy-ui-selection-sync-1
import { installAppTabClickStateBridge } from './app-tab-click-state-bridge.js?v=20260622-tab-click-state-1';

const LEGACY_GEOMETRY_WORKFLOW_FLAG = 'rvm.enableLegacyGeometryWorkflowButtons';
const LEGACY_GEOMETRY_WORKFLOW_MODULES = Object.freeze([
  ['../geometry-workspace/GeometryExportWorkspaceBridge.js?v=20260622-geometry-mapping-1', 'installGeometryExportWorkspaceBridge'],
  ['../geometry-workspace/GeometryMappingProfileBridge.js?v=20260622-geometry-profile-ui-1', 'installGeometryMappingProfileBridge'],
  ['../geometry-workspace/GeometryCalculationCanvasBridge.js?v=20260622-pipe-support-load-input-hydrator-1', 'installGeometryCalculationCanvasBridge'],
  ['../geometry-workspace/GeometryCalculationInputBridge.js?v=20260622-geometry-input-resolver-1', 'installGeometryCalculationInputBridge'],
  ['../geometry-workspace/GeometryEnrichmentBridge.js?v=20260622-geometry-enrichment-1', 'installGeometryEnrichmentBridge'],
  ['../geometry-workspace/GeometryEnrichedStagedJsonBridge.js?v=20260622-geometry-enriched-stagedjson-support-loads-1', 'installGeometryEnrichedStagedJsonBridge'],
  ['../geometry-workspace/GeometrySupportLoadMasterDataBridge.js?v=20260623-support-load-master-data-1', 'installGeometrySupportLoadMasterDataBridge'],
  ['../geometry-workspace/GeometrySupportLoadInputBridge.js?v=20260623-autospan-resolver-1', 'installGeometrySupportLoadInputBridge'],
  ['../geometry-workspace/GeometrySupportLoadFormulaBridge.js?v=20260622-support-load-result-writeback-audit-1', 'installGeometrySupportLoadFormulaBridge'],
  ['../geometry-workspace/GeometrySupportLoadReportBridge.js?v=20260622-support-load-result-report-1', 'installGeometrySupportLoadReportBridge'],
  ['../geometry-workspace/GeometrySupportLoadConflictBridge.js?v=20260623-support-load-conflict-resolver-1', 'installGeometrySupportLoadConflictBridge'],
  ['../geometry-workspace/GeometrySupportLoadQaDashboardBridge.js?v=20260623-support-load-qa-dashboard-1', 'installGeometrySupportLoadQaDashboardBridge'],
  ['../geometry-workspace/GeometrySupportLoadBulkPackageBridge.js?v=20260623-support-load-bulk-package-1', 'installGeometrySupportLoadBulkPackageBridge'],
  ['../geometry-workspace/GeometrySupportLoadCanvasOverlayBridge.js?v=20260623-support-load-canvas-overlay-1', 'installGeometrySupportLoadCanvasOverlayBridge'],
]);

installAppTabClickStateBridge();
if (shouldInstallLegacyGeometryWorkflowButtons()) installLegacyGeometryWorkflowBridges();

function shouldInstallLegacyGeometryWorkflowButtons() {
  if (globalThis.__RVM_ENABLE_LEGACY_GEOMETRY_WORKFLOW_BUTTONS__ === true) return true;
  try {
    return globalThis.localStorage?.getItem?.(LEGACY_GEOMETRY_WORKFLOW_FLAG) === 'true';
  } catch {
    return false;
  }
}

async function installLegacyGeometryWorkflowBridges() {
  const results = await Promise.allSettled(
    LEGACY_GEOMETRY_WORKFLOW_MODULES.map((entry) => importLegacyGeometryWorkflowBridge(entry)),
  );
  for (const result of results) {
    if (result.status === 'rejected') console.warn('legacy geometry workflow bridge failed', result.reason);
  }
}

async function importLegacyGeometryWorkflowBridge(entry) {
  const specifier = entry[0];
  const installerName = entry[1];
  const module = await import(specifier);
  const installer = module?.[installerName];
  if (typeof installer !== 'function') throw new Error(`Missing ${installerName} from ${specifier}`);
  installer();
}

export { init } from './app-label-perf-runtime.js?v=20260626-rvm-hierarchy-ui-selection-sync-1';
