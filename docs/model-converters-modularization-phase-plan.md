# Model Converters Modularization Phase Plan

Date: 2026-06-18
Scope: `viewer/tabs/model-converters-tab.js` compatibility wrapper + modular XML -> CII(2019) workflow extraction

## Current Baseline Snapshot

- `viewer/tabs/model-converters-tab.js` is already a thin wrapper (77 lines).
- `viewer/tabs/model-converters/legacy-adapter.js` remains very large (7555 lines) and is the primary risk area.
- Existing modular areas are present (`converter-registry.js`, `converters/`, `workflow/`, `shared/`), but XML -> CII logic is still split across patch-like modules and large files.
- Multiple modules exceed the acceptance target size (`> 500` lines), including:
  - `legacy-adapter.js`
  - `converter-registry.js`
  - `xml-cii-conversion-workflow-direct-panels.js`
  - `converters/xmltocii2019_helper/enrichment-core.js`
  - `converters/rvmattr-to-xml.js`
  - `bm-cii-support-annotation-popup.js`

## Target Architecture (Required)

Create/align to:

- `viewer/tabs/model-converters/index.js`
- `viewer/tabs/model-converters/ModelConvertersTab.js`
- `viewer/tabs/model-converters/ConverterSelector.js`
- `viewer/tabs/model-converters/ConverterRunner.js`
- `viewer/tabs/model-converters/WorkflowShell.js`

Create XML -> CII reusable modules:

- `regex-line-key`
- `linelist-mapping`
- `masters`
- `preview-model`
- `preview-renderer`
- `dtxr-resolver`
- `weight-match-model`
- `weight-match-renderer`
- `support-types`
- `element-length`
- `output-normalizer`

## Delivery Phases

### Phase 0 - Safety Net and Inventory

Goal:
- Freeze behavior with tests and golden outputs before extraction.

Tasks:
- Capture current converter registry IDs and route map.
- Add baseline golden output snapshots for XML -> CII and BM_CII cases used in production.
- Add smoke checks for workflow labels/order and dropdown presence.

Exit criteria:
- Existing behavior encoded in repeatable tests.
- Baseline golden reports stored and reproducible.

### Phase 1 - Shell Architecture Scaffolding (No Functional Changes)

Goal:
- Introduce required shell files while preserving current runtime behavior.

Tasks:
- Add `index.js`, `ModelConvertersTab.js`, `ConverterSelector.js`, `ConverterRunner.js`, `WorkflowShell.js`.
- Keep `model-converters-tab.js` as compatibility wrapper only (imports and delegates).
- Keep legacy adapter paths wired through the new shell.

Exit criteria:
- No UI behavior change.
- Wrapper remains <= 300 lines.
- All imports resolve from new shell path.

### Phase 2 - Registry Normalization and Converter Isolation

Goal:
- Ensure every converter option is independently registered once.

Tasks:
- Split large `converter-registry.js` into:
  - pure converter metadata
  - option defaults
  - optional workflow hooks
- Enforce single source of truth for converter IDs.
- Add duplicate-ID guard and startup validation.

Exit criteria:
- All converter IDs registered exactly once.
- No inline fallback registration in UI rendering code.

### Phase 3 - XML -> CII Core Domain Split (Model Layer)

Goal:
- Extract reusable XML -> CII data/model logic independent from tab UI.

Tasks:
- Create modules for:
  - `regex-line-key`
  - `linelist-mapping`
  - `masters`
  - `dtxr-resolver`
  - `element-length`
  - `output-normalizer`
- Move pure logic out of `legacy-adapter.js` and helper files into these modules.
- Keep behavior parity by routing legacy calls into extracted modules.

Exit criteria:
- New modules have unit tests.
- Legacy path composes extracted functions with no behavior drift.

### Phase 4 - XML -> CII Preview and Weight-Match Split (View Layer)

Goal:
- Make preview and weight-match deterministic and reusable.

Tasks:
- Extract:
  - `preview-model`
  - `preview-renderer`
  - `weight-match-model`
  - `weight-match-renderer`
  - `support-types`
- Remove post-render column index mutation.
- Introduce fixed preview column schema consumed by renderer.
- Enforce node anchoring to XML nodes only (no synthetic Node -1 rows from candidates).

Exit criteria:
- Preview table generated from fixed column model.
- Candidate matching never creates fake Node -1 rows.
- `4A Weight Match` renders before `5 Run` in all UI code paths.

### Phase 5 - Workflow Unification and Duplicate Flow Removal

Goal:
- Eliminate duplicate support mapping and patch-style workflow overlays.

Tasks:
- Keep support mapping only in Support Types workflow.
- Remove/disable duplicate XML -> CII support mapping phase (`9 CII Support Mapping`).
- Consolidate workflow order and labels in one source.
- Ensure Hydro UI is only rendered inside mapping area and nowhere else.

Exit criteria:
- No `9 CII Support Mapping` in workflow UI.
- Hydro dropdown appears 0 times outside field mapping area.
- No repeated preview refresh loop.

### Phase 6 - Remove MutationObserver Core Dependencies

Goal:
- Replace observer-driven core behavior with explicit lifecycle wiring.

Tasks:
- Keep MutationObserver only for optional non-critical decoration if absolutely required.
- Move core phase rendering, table refresh, and workflow transitions to explicit event/lifecycle calls.
- Delete obsolete patch modules that only compensate for lifecycle gaps.

Exit criteria:
- Core workflow works with MutationObserver disabled.
- No global DOM patch modules required for normal operation.

### Phase 7 - Legacy Adapter Shrinkdown

Goal:
- Reduce legacy adapter to orchestration bridge only.

Tasks:
- Move remaining domain/view logic from `legacy-adapter.js` into new modules.
- Keep adapter as compatibility facade and migration shim.
- Split files > 500 lines unless justified.

Exit criteria:
- `legacy-adapter.js` reduced to thin bridge.
- No module > 500 lines unless documented in justification section.

### Phase 8 - Verification and Regression Pack

Goal:
- Prove parity and validate required bug constraints.

Tasks:
- Unit tests:
  - line-key
  - mapping
  - DTXR resolver
  - preview model
  - element length (`ElementLengthMm` SRSS correctness using CII element fields 3/4/5 values)
- UI smoke tests:
  - workflow order (`4A` before `5 Run`)
  - no duplicate support mapping phase
  - hydro dropdown containment
  - fixed-column preview stability
- Golden-output comparisons for XML -> CII and BM_CII variants.

Exit criteria:
- Tests green.
- Golden diffs reviewed and accepted.

### Phase 9 - Documentation and Migration Notes

Goal:
- Hand off maintainable architecture and extension instructions.

Tasks:
- Create `viewer/tabs/model-converters/README.md` with:
  - registry design
  - adding converters
  - adding options
  - adding workflow phases
  - reusing XML -> CII workflow
  - test run commands
  - browser UI vs Python worker boundaries
- Add migration note:
  - removed patch files
  - retained files
  - deprecated compatibility files

Exit criteria:
- README complete and validated against code layout.
- Migration map present and accurate.

## Work Order (Recommended)

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4
6. Phase 5
7. Phase 6
8. Phase 7
9. Phase 8
10. Phase 9

## Acceptance Gate Checklist

- `model-converters-tab.js` <= 300 lines.
- No module > 500 lines unless justified.
- Converter IDs registered once.
- No duplicate workflow phases.
- Preview uses fixed column model only.
- No global Hydro UI injection.
- XML -> CII workflow reusable outside Model Converters tab.
- Tests green and golden comparisons reviewed.

## Execution Notes

- First pass is extraction/parity only; bug fixes are isolated to module-level follow-ups.
- Any behavior-affecting change must include a targeted regression test in the same PR.
- Keep each phase mergeable and reversible with clear commit boundaries.
