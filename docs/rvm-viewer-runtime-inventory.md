# 3D RVM Viewer runtime inventory

Date: 2026-06-26
Scope: PR 1 runtime inventory and More Tools root-cause fix.

## Scope boundaries

This inventory covers the 3D RVM Viewer tab runtime/UI path only. It intentionally does not change XML->CII conversion logic, InputXML->StagedJSON rich propagation, or the future RVM API-to-XML-CII authority track.

Active adjacent work observed before this branch:

- Open PR #450 is the InputXML -> StagedJSON rich propagation track.
- That track has no visual renderer scope and no XML->CII worker scope.
- This RVM UI/runtime branch does not depend on PR #450 and does not modify that route.

## Immediate root-cause finding: More Tools

The previous More Tools implementation lived inside `viewer/tabs/RvmToolbarCompactBridge.js` and created a dynamic `<details>` node with a `<summary>` and a moved section panel. The open/close behavior depended on browser-native `<details>` toggle state while the same bridge also moved toolbar sections after deferred bridge loading and model lifecycle events.

Failure mode:

- No single toolbar-overflow owner existed.
- No lifecycle API existed for install/sync/dispose.
- `aria-expanded` was not owned by source logic.
- Escape and outside-click close were not implemented.
- Idempotence was only at compact-bridge level, not at overflow behavior level.
- Deferred DOM reconciliation could recreate or move panel content without an explicit overflow sync.

Fix in this branch:

- Added `viewer/tabs/RvmToolbarOverflowController.js`.
- Updated `RvmToolbarCompactBridge.js` to render a stable button/menu pair:
  - `data-rvm-toolbar-more`
  - `data-rvm-tools-menu`
  - compatibility marker `data-rvm-toolbar-more-panel`
- The controller owns click toggle, Escape close, outside pointerdown close, `aria-expanded`, menu hidden state, idempotent install, diagnostics, bounded trace history, DOM-contract validation, and dispose.
- Runtime diagnostics are available through `globalThis.__PCF_GLB_RVM_TOOLBAR_OVERFLOW__.getDiagnostics(root)` and include `domAudit`, `syncCount`, and a bounded `trace` array.
- `viewer3d-rvm-tab-renderer.js` now imports compact toolbar policy v2.
- `viewer/tests/rvm-toolbar-more-tools.test.js` verifies the behavior without relying on browser `<details>` behavior.
- `viewer/tests/rvm-toolbar-overflow-audit.test.js` verifies the selector contract, DOM validation, bounded trace, diagnostics, and inventory evidence.

## Eager runtime modules

These modules are imported and installed by `viewer/tabs/viewer3d-rvm-tab-renderer.js` during RVM tab renderer load.

| Module | Eager/Deferred | Scope | Global Key / Prototype Patch | DOM Writes | Event Listeners | Viewer State | Risk |
|---|---:|---|---|---|---|---|---|
| `rvm-viewer-module-contract.js` | Eager | Module identity | Publishes contract through renderer | No | No | No | Low |
| `RvmViewer3D.js` | Eager | Core viewer class | Core class | Yes, through viewer runtime | Yes, through viewer runtime | Yes | Medium |
| `RvmProgressiveModelRootPatchV5.js` | Eager | Model root/progressive loading | Patches `RvmViewer3D` | Possible | Possible | Yes | High |
| `RvmHierarchySelectionBridge.js` | Eager | Hierarchy selection | Patches/bridges viewer class | Yes | Yes | Yes | High |
| `RvmViewerInteractionPatch.js` | Eager | Canvas interaction | Patches viewer interaction methods | Possible | Yes | Yes | High |
| `RvmCanvasSelectionSinglePickGuardBridge.js` | Eager | Pick guard | Patches/guards viewer selection | No/possible | Yes | Yes | High |
| `RvmRetiredSupportToolsPurgeBridge.js` | Eager | Retired support cleanup | Global bridge behavior | Yes | Possible | Possible | Medium |
| `SelectedGeometryEnrichmentPanel.js` | Eager | Floating enrichment panel | Global install | Yes | Yes | Possible | Medium |
| `RvmUiEventSafetyBridge.js` | Eager | Toolbar/tree event safety | `__PCF_GLB_RVM_UI_EVENT_SAFETY__` | Yes | Click/change/contextmenu/pointerdown | Yes | High |
| `RvmNavigationModeArbiterBridge.js` | Eager | Navigation mode | Global arbitration | Possible | Yes | Yes | High |
| `RvmUiInteractionPanelPatch.js` | Eager | UI panels | Patches viewer class | Yes | Possible | Yes | High |
| `RvmPropertyPanelCollapseAuditBridge.js` | Eager | Property panel collapse audit | Global bridge state | Yes | Yes | Possible | Medium |
| `RvmLabelPerformanceBridge.js` | Eager | Label performance | Patches viewer class | Possible | Possible | Yes | Medium |
| `RvmToolbarCompactBridge.js` | Eager | Toolbar compaction | `__PCF_GLB_RVM_TOOLBAR_POLICY__` | Yes | MutationObserver + model/action events | Root dataset | High |
| `RvmToolbarOverflowController.js` | Eager through compact bridge | More Tools open/close | `__PCF_GLB_RVM_TOOLBAR_OVERFLOW__` | Yes | Root click, document keydown/pointerdown | Root dataset, diagnostics trace | Medium |
| `RvmZoneLodLabelBridge.js` | Eager | Zone label LOD | Global bridge behavior | Yes | Possible | Yes | Medium |
| `RvmDeepSourcePathRecoveryBridge.js` | Eager | Source path recovery | Patches viewer class | Possible | Possible | Yes | Medium |
| `RvmZoneDensitySelectorBridgeV5.js` | Eager | Zone density UI | Global bridge behavior | Yes | Yes | Yes | Medium |
| `RvmNavisHierarchyBridge.js` | Eager | Navis-style hierarchy | Patches viewer class | Yes | Yes | Yes | High |
| `RvmZoneLodContextBridge.js` | Eager | Zone LOD context | Global bridge behavior | Yes | Yes | Yes | Medium |
| `RvmSelectionDetailsInspectorBridge.js` | Eager | Inspector/details | Global bridge behavior | Yes | Yes | Yes | Medium |
| `RvmJsonPcfTriggerBridge.js` | Eager | JSON/PCF trigger | Global bridge behavior | Yes | Yes | Yes | Medium |
| `RvmPolicyInfoBridge.js` | Eager | Policy info UI | Global bridge behavior | Yes | Yes | Possible | Medium |
| `RvmDiagnosticPanelCollapseBridge.js` | Eager | Diagnostics panel | Global bridge behavior | Yes | Yes | Possible | Medium |
| `RvmVisibilityToolbarBridge.js` | Eager | Visibility/isolate toolbar | Patches/uses viewer class | Yes | Yes | Yes | Medium |
| `RvmMeasureBridge.js` | Eager | Measure tools | Patches/uses viewer class | Yes | Yes | Yes | Medium |
| `RvmSectionBoxBridge.js` | Eager | Section tools | Patches/uses viewer class | Yes | Yes | Yes | Medium |
| `GeometryExportWorkspaceBridge.js` | Eager | Geometry export workspace | Global bridge behavior | Yes | Yes | Yes | Medium |
| `GeometryMappingProfileBridge.js` | Eager | Mapping profile UI | Global bridge behavior | Yes | Yes | Yes | Medium |
| `RvmSelectionTreeSyncBridge.js` | Eager | Tree selection sync | Patches/uses viewer class | Yes | Yes | Yes | High |
| `RvmMaterialModeBridge.js` | Eager | Material modes | Patches/uses viewer class | Yes | Yes | Yes | Medium |
| `RvmBottomDiagnosticsDrawerBridge.js` | Eager | Docked diagnostics drawer | Global bridge behavior | Yes | Yes | Root dataset | Medium |
| `RvmDeferredBridgeLoader.js` | Eager loader, deferred payloads | Deferred bridge owner | `__PCF_GLB_RVM_BRIDGE_LOADER__`, `__PCF_GLB_RVM_ACTION_DIAGNOSTICS__` | Yes, diagnostics | Window error/unhandledrejection/model events | Runtime diagnostics | High |
| `RvmLeftPanelResizeCollapseBridge.js` | Eager | Resizable/collapsible panels | Global bridge behavior | Yes | Yes | Root CSS vars | Medium |
| `RvmLeafSelectionIdentityBridge.js` | Eager | Leaf selection identity | Patches/uses viewer class | Possible | Possible | Yes | Medium |
| `RvmLeafCanvasPickBridge.js` | Eager | Leaf canvas picking | Patches/uses viewer class | Possible | Yes | Yes | High |
| `BrowserRvmCppMat3x4WorkerPatch.js` | Eager | Worker/native transform patch | Runtime patch | No | No | Worker/runtime | Medium |
| `BrowserRvmNativeTessellationRuntimePatch.js` | Eager | Native tessellation | Runtime patch | No | No | Runtime | Medium |
| `BrowserRvmNativeFacetGhostPanelPatch.js` | Eager | Facet ghost diagnostics | Runtime patch | Possible | Possible | Runtime | Medium |
| `BrowserRvmRenderPolicyBridge.js` | Eager | Render policy | Global bridge behavior | Possible | Possible | Runtime | Medium |
| `BrowserRvmCivilFallbackPolicyBridge.js` | Eager | Civil fallback policy | Global bridge behavior | Possible | Possible | Runtime | Medium |
| `BrowserRvmGeometricFallbackPolicyBridge.js` | Eager | Geometric fallback policy | Global bridge behavior | Possible | Possible | Runtime | Medium |
| `BrowserRvmPickDiagnosticsBridge.js` | Eager | Pick diagnostics | Global bridge behavior | Possible | Possible | Runtime | Medium |
| `BrowserRvmDishTessellationRuntimePatch.js` | Eager | Dish tessellation | Runtime patch | No | No | Runtime | Medium |
| `BrowserRvmRemainingPrimitiveRuntimePatch.js` | Eager | Remaining primitive layout | Runtime patch | No | No | Runtime | Medium |
| `BrowserRvmTorusParityRuntimePatch.js` | Eager | Torus parity | Runtime patch | No | No | Runtime | Medium |
| `BrowserRvmSnoutParityRuntimePatch.js` | Eager | Snout parity | Runtime patch | No | No | Runtime | Medium |

## Deferred bridge groups

`viewer/tabs/RvmDeferredBridgeLoader.js` owns two bridge groups.

### `postModel`

Loaded after model detection / `rvm-model-loaded` / post-first-paint conditions.

| Module id | Module | Scope | Risk |
|---|---|---|---|
| `stagedjson-export` | `RvmStagedJsonExportBridge.js` | Staged/source export controls | Medium |
| `stagedjson-validation` | `RvmStagedJsonValidationBridge.js` | Staged/source validation controls | Medium |
| `primitive-fallback` | `RvmPrimitiveFallbackBridge.js` | Primitive fallback click/runtime | Medium |
| `native-glb-export` | `RvmNativeSceneGlbExportBridge.js` | Native scene GLB export | Medium |
| `glb-export-profile` | `RvmGlbExportProfileBridge.js` | GLB profile UI | Medium |
| `glb-export-validation` | `RvmGlbExportValidationBridge.js` | GLB validation UI | Medium |
| `glb-roundtrip-validation` | `RvmGlbRoundTripValidationBridge.js` | GLB roundtrip validation | Medium |
| `glb-selection-parity` | `RvmGlbSelectionParityBridge.js` | Selection parity | Medium |
| `glb-acceptance-pack` | `RvmGlbAcceptancePackBridge.js` | Acceptance pack | Medium |
| `native-tessellation-diagnostics` | `RvmNativeTessellationDiagnosticsBridge.js` | Native tessellation diagnostics | Medium |
| `object-search` | `RvmObjectSearchBridge.js` | Search UI | Medium |
| `visibility-snapshots` | `RvmVisibilitySnapshotsBridge.js` | Snapshot UI | Medium |
| `selection-sets` | `RvmSelectionSetsBridge.js` | Selection-set UI | Medium |
| `report-export` | `RvmReportExportBridge.js` | Report export UI | Medium |
| `model-health` | `RvmModelHealthBridge.js` | Model health UI | Medium |
| `model-health-issues` | `RvmModelHealthIssuesBridge.js` | Model health issue UI | Medium |

### `sourcePreview`

Loaded only when `mode === 'source-preview'`, the source kind is one of JSON/JSCON/InputXML/UXML/TXT/source-preview/stagedJSON, and source hierarchy exists.

| Module id | Module | Scope | Risk |
|---|---|---|---|
| `nonprimitive-support-overlay` | `RvmNonPrimitiveSupportOverlayBridge.js` | Support overlay renderer | High |
| `nonprimitive-support-hard-disable` | `RvmNonPrimitiveSupportOverlayHardDisableBridge.js` | Support hard-disable policy | Medium |
| `nonprimitive-support-details-panel` | `RvmNonPrimitiveSupportOverlayDetailsPanelBridge.js` | Support details panel | High |
| `nonprimitive-support-hover` | `RvmNonPrimitiveSupportOverlayHoverBridge.js` | Support hover picking | High |
| `nonprimitive-auto-bend` | `RvmNonPrimitiveAutoBendBridge.js` | Auto Bend preview | High |
| `nonprimitive-node-markers` | `RvmNonPrimitiveNodeMarkerBridge.js` | Node marker overlay | High |
| `nonprimitive-source-tools-ui` | `RvmNonPrimitiveSourceToolsUiBridge.js` | Source Tools grouped UI | Medium |

## Runtime risks found for later phases

High-risk areas that should be handled after PR 1:

1. Multiple eager modules patch viewer prototypes or interaction behavior.
2. `RvmUiEventSafetyBridge`, `RvmViewerInteractionPatch`, `RvmNavigationModeArbiterBridge`, leaf picking, node marker hover, and support hover can all influence click/hover behavior.
3. Toolbar compaction still uses DOM reconciliation and `MutationObserver` for moving sections; after this PR, More Tools open/close is controlled, but full UI shell ownership is still a later phase.
4. Deferred source-preview modules correctly avoid eager loading, but they still register independent panels/overlays after loading.
5. Overlay modules need a later shared interaction router and shared disposal/rendering contract.

## PR 1 acceptance coverage

Covered in this branch:

- More Tools is controlled by one owner module.
- Button/menu selectors are stable and scoped.
- `aria-expanded` is synced by source logic.
- Button click toggles menu.
- Escape closes menu.
- Outside pointerdown closes menu.
- Repeat install does not duplicate listeners.
- Dispose removes listeners.
- DOM ownership is auditable through `validateRvmToolbarOverflowDom()`.
- Runtime state is traceable through bounded controller `trace` diagnostics.
- RVM PCF CI includes the behavior and audit contract tests.

Not covered in this branch:

- Full right-panel UI shell.
- Source Tools panel regrouping beyond existing grouped bridge.
- Central interaction router.
- Module loading/performance redesign.
- Overlay batching/disposal improvements.
- XML->CII projection/API authority work.
