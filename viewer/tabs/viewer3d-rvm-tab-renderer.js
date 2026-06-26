// Stable app-shell export adapter for the 3D RVM Viewer tab.
// Source-preview/non-primitive tools are owned by RvmDeferredBridgeLoader.js?v=20260625-rvm-deferred-source-preview-tools-1
// Previous hierarchy selection key: RvmHierarchySelectionBridge.js?v=20260620-rvm-large-box-support-sync-1
// Previous canvas interaction key: RvmViewerInteractionPatch.js?v=20260624-rvm-interaction-state-contract-1
// Previous tree sync key: RvmSelectionTreeSyncBridge.js?v=20260620-rvm-large-box-support-sync-1
import {
  RVM_VIEWER3D_MODULE_SPECIFIER,
  RVM_VIEWER_MODULE_CONTRACT_VERSION,
} from './rvm-viewer-module-contract.js?v=20260624-rvm-viewer-module-identity-1';
import { RvmViewer3D } from '../rvm-viewer/RvmViewer3D.js?v=20260620-rvm-direct-tab-1';
import { installRvmProgressiveModelRootPatch } from '../rvm-viewer/RvmProgressiveModelRootPatchV5.js?v=20260620-rvm-tree-select-nohide-1';
import { installRvmHierarchySelectionBridge } from './RvmHierarchySelectionBridge.js?v=20260626-rvm-hierarchy-text-hit-target-sync-1';
import { installRvmViewerInteractionPatch, installRvmCanvasSelectionBridge } from './RvmViewerInteractionPatch.js?v=20260626-rvm-canvas-hierarchy-selection-sync-1';
import { installRvmCanvasSelectionSinglePickGuardBridge } from './RvmCanvasSelectionSinglePickGuardBridge.js?v=20260622-rvm-canvas-single-pick-guard-1';
import { installRvmRetiredSupportToolsPurgeBridge } from './RvmRetiredSupportToolsPurgeBridge.js?v=20260622-rvm-retired-support-tools-purge-2';
import { installSelectedGeometryEnrichmentPanel } from '../enrichment/SelectedGeometryEnrichmentPanel.js?v=20260624-selected-geometry-floating-workflow-3';
import { installRvmUiEventSafetyBridge } from './RvmUiEventSafetyBridge.js?v=20260622-rvm-ui-event-safety-2';
import { installRvmNavigationModeArbiterBridge } from './RvmNavigationModeArbiterBridge.js?v=20260624-rvm-navigation-interaction-contract-1';
import { installRvmUiInteractionPanelPatch, installRvmUiPanelBridge } from './RvmUiInteractionPanelPatch.js?v=20260621-rvm-ui-interaction-panels-1';
import { installRvmPropertyPanelCollapseAuditBridge } from './RvmPropertyPanelCollapseAuditBridge.js?v=20260621-rvm-property-collapse-1';
import { installRvmLabelPerformanceBridge } from './RvmLabelPerformanceBridge.js?v=20260622-rvm-label-perf-no-support-runtime-1';
import { installRvmToolbarCompactBridge } from './RvmToolbarCompactBridge.js?v=20260626-rvm-toolbar-compact-policy-2';
import { installRvmZoneLodLabelBridge } from './RvmZoneLodLabelBridge.js?v=20260621-rvm-preload-hierarchy-selector-1';
import { installRvmDeepSourcePathRecoveryBridge } from './RvmDeepSourcePathRecoveryBridge.js?v=20260622-rvm-deep-source-path-recovery-1';
import { installRvmZoneDensitySelectorBridge } from './RvmZoneDensitySelectorBridgeV5.js?v=20260622-rvm-zone-density-selector-5';
import { installRvmNavisHierarchyBridge } from './RvmNavisHierarchyBridge.js?v=20260621-rvm-navis-hierarchy-1';
import { installRvmZoneLodContextBridge } from './RvmZoneLodContextBridge.js?v=20260621-rvm-zone-lod-context-1';
import { installRvmSelectionDetailsInspectorBridge } from './RvmSelectionDetailsInspectorBridge.js?v=20260621-rvm-selection-details-inspector-1';
import { installRvmJsonPcfTriggerBridge } from './RvmJsonPcfTriggerBridge.js?v=20260621-rvm-pcf-visible-scope-1';
import { installRvmPolicyInfoBridge } from './RvmPolicyInfoBridge.js?v=20260621-rvm-policy-info-1';
import { installRvmDiagnosticPanelCollapseBridge } from './RvmDiagnosticPanelCollapseBridge.js?v=20260621-rvm-diagnostic-collapse-1';
import { installRvmVisibilityToolbarBridge } from './RvmVisibilityToolbarBridge.js?v=20260621-rvm-isolate-visibility-toolbar-1';
import { installRvmMeasureBridge } from './RvmMeasureBridge.js?v=20260621-rvm-measure-tools-1';
import { installRvmSectionBoxBridge } from './RvmSectionBoxBridge.js?v=20260621-rvm-section-box-1';
import { installGeometryExportWorkspaceBridge } from '../geometry-workspace/GeometryExportWorkspaceBridge.js?v=20260622-geometry-mapping-1';
import { installGeometryMappingProfileBridge } from '../geometry-workspace/GeometryMappingProfileBridge.js?v=20260622-geometry-profile-ui-1';
import { installRvmSelectionTreeSyncBridge } from './RvmSelectionTreeSyncBridge.js?v=20260626-rvm-hierarchy-selection-sync-2';
import { installRvmMaterialModeBridge } from './RvmMaterialModeBridge.js?v=20260620-rvm-remaining-material-modes-1';
import { installRvmBottomDiagnosticsDrawerBridge } from './RvmBottomDiagnosticsDrawerBridge.js?v=20260624-rvm-diagnostics-docked-drawer-1';
import { installRvmDeferredBridgeLoader } from './RvmDeferredBridgeLoader.js?v=20260625-rvm-deferred-source-preview-tools-1';
import { installRvmLeftPanelResizeCollapseBridge } from './RvmLeftPanelResizeCollapseBridge.js?v=20260624-rvm-panel-resize-1';
import { installRvmLeafSelectionIdentityBridge } from './RvmLeafSelectionIdentityBridge.js?v=20260622-rvm-leaf-selection-identity-1';
import { installRvmLeafCanvasPickBridge } from './RvmLeafCanvasPickBridge.js?v=20260622-rvm-leaf-canvas-pick-orbit-guard-2';
import { installBrowserRvmCppMat3x4WorkerPatch } from '../rvm/BrowserRvmCppMat3x4WorkerPatch.js?v=20260620-rvm-facetgroup-1';
import { installBrowserRvmNativeTessellationRuntimePatch } from '../rvm/BrowserRvmNativeTessellationRuntimePatch.js?v=20260620-rvm-native-diagnostics-1';
import { installBrowserRvmNativeFacetGhostPanelPatch } from '../rvm/BrowserRvmNativeFacetGhostPanelPatch.js?v=20260622-rvm-facet-ghost-panels-1';
import { installBrowserRvmRenderPolicyBridge } from '../rvm/BrowserRvmRenderPolicyBridge.js?v=20260622-rvm-render-policy-1';
import { installBrowserRvmCivilFallbackPolicyBridge } from '../rvm/BrowserRvmCivilFallbackPolicyBridge.js?v=20260622-rvm-smart-civil-policy-tooltip-1';
import { installBrowserRvmGeometricFallbackPolicyBridge } from '../rvm/BrowserRvmGeometricFallbackPolicyBridge.js?v=20260622-rvm-geometric-fallback-policy-1';
import { installBrowserRvmPickDiagnosticsBridge } from '../rvm/BrowserRvmPickDiagnosticsBridge.js?v=20260622-rvm-debug-pick-1';
import { installBrowserRvmDishTessellationRuntimePatch } from '../rvm/BrowserRvmDishTessellationRuntimePatch.js?v=20260620-rvm-support-assembly-dish-1';
import { installBrowserRvmRemainingPrimitiveRuntimePatch } from '../rvm/BrowserRvmRemainingPrimitiveRuntimePatch.js?v=20260620-rvm-facetgroup-1';
import { installBrowserRvmTorusParityRuntimePatch } from '../rvm/BrowserRvmTorusParityRuntimePatch.js?v=20260622-rvm-native-torus-line-elbows-1';
import { installBrowserRvmSnoutParityRuntimePatch } from '../rvm/BrowserRvmSnoutParityRuntimePatch.js?v=20260620-rvm-snout-parity-1';

function installToolbarActionCompatibility(RvmViewerClass) {
  const proto = RvmViewerClass?.prototype;
  if (!proto || typeof proto.dispatchAction !== 'function' || typeof proto.handleToolbarAction === 'function') return;
  proto.handleToolbarAction = function handleRvmToolbarAction(action) {
    return this.dispatchAction(action);
  };
}

function publishRvmViewerModuleContract() {
  globalThis.__PCF_GLB_RVM_VIEWER_MODULE_CONTRACT__ = {
    version: RVM_VIEWER_MODULE_CONTRACT_VERSION,
    rvmViewer3dModuleSpecifier: RVM_VIEWER3D_MODULE_SPECIFIER,
  };
}

installBrowserRvmCppMat3x4WorkerPatch();
installBrowserRvmNativeTessellationRuntimePatch();
installBrowserRvmNativeFacetGhostPanelPatch();
installBrowserRvmRenderPolicyBridge();
installBrowserRvmCivilFallbackPolicyBridge();
installBrowserRvmGeometricFallbackPolicyBridge();
installBrowserRvmPickDiagnosticsBridge();
installBrowserRvmDishTessellationRuntimePatch();
installBrowserRvmRemainingPrimitiveRuntimePatch();
installBrowserRvmTorusParityRuntimePatch();
installBrowserRvmSnoutParityRuntimePatch();
installRvmProgressiveModelRootPatch(RvmViewer3D);
installRvmViewerInteractionPatch(RvmViewer3D);
installToolbarActionCompatibility(RvmViewer3D);
installRvmUiInteractionPanelPatch(RvmViewer3D);
installRvmLabelPerformanceBridge(RvmViewer3D);
installRvmToolbarCompactBridge();
installSelectedGeometryEnrichmentPanel();
installRvmZoneLodLabelBridge();
installRvmDeepSourcePathRecoveryBridge(RvmViewer3D);
installRvmZoneDensitySelectorBridge();
installRvmHierarchySelectionBridge(RvmViewer3D);
installRvmCanvasSelectionSinglePickGuardBridge(RvmViewer3D);
installRvmCanvasSelectionBridge(RvmViewer3D);
installRvmUiEventSafetyBridge();
installRvmNavigationModeArbiterBridge();
installRvmNavisHierarchyBridge(RvmViewer3D);
installRvmZoneLodContextBridge();
installRvmSelectionDetailsInspectorBridge();
installRvmJsonPcfTriggerBridge();
installRvmPolicyInfoBridge();
installRvmDiagnosticPanelCollapseBridge();
installRvmVisibilityToolbarBridge(RvmViewer3D);
installRvmMeasureBridge(RvmViewer3D);
installRvmSectionBoxBridge(RvmViewer3D);
installGeometryExportWorkspaceBridge();
installGeometryMappingProfileBridge();
installRvmSelectionTreeSyncBridge(RvmViewer3D);
installRvmMaterialModeBridge(RvmViewer3D);
installRvmBottomDiagnosticsDrawerBridge();
installRvmDeferredBridgeLoader();
installRvmLeftPanelResizeCollapseBridge();
installRvmLeafSelectionIdentityBridge(RvmViewer3D);
installRvmLeafCanvasPickBridge(RvmViewer3D);
publishRvmViewerModuleContract();

export { RvmViewer3D };
export async function renderViewer3DRvm(root, options = {}) {
  const { mountViewer3DRvmTab } = await import('./viewer3d-rvm-tab.js?v=20260624-selected-geometry-floating-workflow-3');
  return mountViewer3DRvmTab(root, options);
}
