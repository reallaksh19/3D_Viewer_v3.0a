# BM_CII v68 — InputXML Actual Restraints with Axial Visual Resolver

Generated from v63 metadata-fixed GLB. This run applies the corrected rule to **InputXML actual restraints**.

## Locked rule applied

```
1. Apply engineering contact first.
2. Classify final symbol orientation.
3. Apply visual resolver offset only to final axial / pipe-parallel symbols.
4. Visual resolver offset = OD × 2/3.
5. Non-axial REST/GUIDE/HOLDDOWN/spring symbols are not shifted by this axial resolver.
```

## Modified InputXML actual restraint glyphs

| Node | InputXML family | Axis | Pipe orientation basis | Resolver action |
|---:|---|---|---|---|
| 35 | AXIS_RESTRAINT | Z | Pipe Z-dominant | Shifted to Y visual lane = OD×2/3 |
| 130 | LINESTOP | +Z | Pipe Z-dominant / single +Z actual | Shifted to Y visual lane = OD×2/3 |
| 205 | LIMIT | X | Pipe X-dominant | Shifted to Z visual lane = OD×2/3 |

## Not shifted

- REST: vertical/non-axial, contact rule only.
- GUIDE: lateral/non-axial, contact rule only.
- SPRING at node 205: axis_Y coil-only and not pipe-parallel to the X branch, so no axial resolver shift.
- ANCHOR plates: not axial arrows.

## Resolver values

- OD 114.299995 mm → OD×2/3 = 0.076200 m in GLB scale
- OD 88.900002 mm → OD×2/3 = 0.059267 m in GLB scale

## Audit

Modified geometry count: 10

- `BM_CII_BAKED_SUPPORT_inputxml_03_node_35_kind_AXIS_RESTRAINT_axis_Z-axis-pair-plus-od-gap-shaft` → `AXIAL_Z_PIPE_PARALLEL_VISUAL_RESOLVER_Y_NEG_OD_2_3`, delta `[0.0, -0.01905, 0.0]`
- `BM_CII_BAKED_SUPPORT_inputxml_03_node_35_kind_AXIS_RESTRAINT_axis_Z-axis-pair-plus-od-gap-head` → `AXIAL_Z_PIPE_PARALLEL_VISUAL_RESOLVER_Y_NEG_OD_2_3`, delta `[0.0, -0.01905, 0.0]`
- `BM_CII_BAKED_SUPPORT_inputxml_03_node_35_kind_AXIS_RESTRAINT_axis_Z-axis-pair-minus-od-gap-shaft` → `AXIAL_Z_PIPE_PARALLEL_VISUAL_RESOLVER_Y_NEG_OD_2_3`, delta `[0.0, -0.01905, 0.0]`
- `BM_CII_BAKED_SUPPORT_inputxml_03_node_35_kind_AXIS_RESTRAINT_axis_Z-axis-pair-minus-od-gap-head` → `AXIAL_Z_PIPE_PARALLEL_VISUAL_RESOLVER_Y_NEG_OD_2_3`, delta `[0.0, -0.01905, 0.0]`
- `BM_CII_BAKED_SUPPORT_inputxml_04_node_130_kind_LINESTOP_axis_+Z-single-axial-od-gap-shaft` → `AXIAL_LINESTOP_Z_VISUAL_RESOLVER_Y_NEG_OD_2_3`, delta `[0.0, -0.01905, 0.0]`
- `BM_CII_BAKED_SUPPORT_inputxml_04_node_130_kind_LINESTOP_axis_+Z-single-axial-od-gap-head` → `AXIAL_LINESTOP_Z_VISUAL_RESOLVER_Y_NEG_OD_2_3`, delta `[0.0, -0.01905, 0.0]`
- `BM_CII_BAKED_SUPPORT_inputxml_06_node_205_kind_LIMIT_axis_X-axial-pair-plus-od-gap-shaft` → `AXIAL_LIMIT_X_VISUAL_RESOLVER_Z_NEG_OD_2_3`, delta `[0.0, 0.0, -0.059267]`
- `BM_CII_BAKED_SUPPORT_inputxml_06_node_205_kind_LIMIT_axis_X-axial-pair-plus-od-gap-head` → `AXIAL_LIMIT_X_VISUAL_RESOLVER_Z_NEG_OD_2_3`, delta `[0.0, 0.0, -0.059267]`
- `BM_CII_BAKED_SUPPORT_inputxml_06_node_205_kind_LIMIT_axis_X-axial-pair-minus-od-gap-shaft` → `AXIAL_LIMIT_X_VISUAL_RESOLVER_Z_NEG_OD_2_3`, delta `[0.0, 0.0, -0.059267]`
- `BM_CII_BAKED_SUPPORT_inputxml_06_node_205_kind_LIMIT_axis_X-axial-pair-minus-od-gap-head` → `AXIAL_LIMIT_X_VISUAL_RESOLVER_Z_NEG_OD_2_3`, delta `[0.0, 0.0, -0.059267]`
