# Retired 3D RVM Viewer support tooling backup

This folder records the pre-removal logic for the 3D RVM Viewer support-related tools removed from the active `3D_review` / 3D RVM Viewer runtime.

The active viewer no longer loads Support ATT Mapping, Intelligent Support Engine, generated support geometry, support summaries, or assembly-marker controls. The original logic is recoverable from the blob SHAs below or from the commit immediately before this branch.

## Retired runtime tools

| Active path before retirement | Blob SHA | Purpose before removal |
| --- | --- | --- |
| `viewer/tabs/RvmSupportSummaryBridge.js` | `8ee2db09f22cd879b7a8ef1278076524d5e43732` | Support Summary panel, Raw/Symbol/Both UI, generated support symbols root `__RVM_GEOMETRY_SUPPORT_SYMBOLS__`. |
| `viewer/tabs/RvmSupportAssemblyBridge.js` | `fbebd42956b12a3b7767d98930b6621105906e7c` | Support assembly clustering and assembly marker root `__RVM_SUPPORT_ASSEMBLY_MARKERS__`. |
| `viewer/tabs/RvmSupportAssemblyMarkerModeBridge.js` | `dced1023d24c69c316be5143a793812324151a47` | Assembly marker Off/On toggle injected into Support Summary. |
| `viewer/tabs/RvmIntelligentSupportEngineBridge.js` | `0e1bc64c09cc7720061ba9af5403bb5b0c98b4f3` | Intelligent support candidate classifier, AutoMap, JSON diagnostics. |
| `viewer/tabs/RvmSupportGeometryBridge.js` | `84008fc07fbf968a9b07a8eb081adaaf973a0753` | Generated exportable support geometry root `__RVM_EXPORTABLE_SUPPORT_GEOMETRY__`. |
| `viewer/tabs/RvmSupportAttMappingBridge.js` | `0e4e06b8f8e4f12c5114cbc8507337065cd215ce` | Support ATT Mapping panel and support metadata enrichment of generated support geometry. |
| `viewer/tabs/RvmRawSupportCylinderGuardBridge.js` | `9851ef73c7ef8d674c9820e84b3cf0f34400c523` | Temporary guard for raw support cylinders and generated support overlay cleanup. |
| `viewer/rvm-viewer/RvmSupportSymbols.js` | `c0e07f57bb6ebe5266d460938c855a9ab2297cae` | Legacy JSON/UXML support symbol creation and support label settings. |
| `viewer/rvm-viewer/RvmSupportIndexAttributeBridge.js` | `3c5f0379b06b9ec67c721dff46660674495095bc` | Legacy support attribute merge hook for index-backed JSON/UXML scenes. |
| `viewer/rvm-viewer/RvmInputXmlSupportGraphics.js` | `741c0ef5de1e8b5a2e27327533fed335d47f4e35` | InputXML support graphics root `__RVM_SUPPORT_SYMBOLS__`. |

## Retired integration/core files touched

| Active path before retirement | Blob SHA | Role |
| --- | --- | --- |
| `viewer/tabs/RvmDeferredBridgeLoader.js` | `e678ed7e1691d8836e16d11a4c97cd65443547e8` | Deferred post-model bridge loader that loaded support modules. |
| `viewer/tabs/RvmBottomDiagnosticsDrawerBridge.js` | `0d854e63ba27d99ee2d56f26e0f2bac3f6740790` | Bottom diagnostics drawer that surfaced support panels. |
| `viewer/tabs/viewer3d-rvm-tab-renderer.js` | `5c9c49b2a58294d9dbc0841737bb398c3d0a864e` | 3D RVM tab renderer that installed support marker and raw-support guard bridges. |
| `viewer/tabs/viewer3d-rvm-tab.js` | `e255b83419094a6a9f687eb0f5b102e671b7818e` | Static RVM tab shell containing legacy support UI placeholders. |

## Restore note

To restore a retired tool, copy the corresponding blob from the pre-removal commit into a new active file, re-add it to `RvmDeferredBridgeLoader.js` or `viewer3d-rvm-tab-renderer.js`, and remove or narrow `RvmRetiredSupportToolsPurgeBridge.js`.
