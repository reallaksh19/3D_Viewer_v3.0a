# BM_CII v63 Component Metadata Fixed

Root cause fix applied to generated GLB metadata.

- Source GLB: `/mnt/data/BM_CII_v62_LineNoSideload/BM_CII_Enriched_v62_line_no_sideload_engineering.glb`
- Source InputXML: `/mnt/data/BM_CII_GLB_Benchmark_v8_BubbleCalloutLite/BM_CII_Enriched_v8_lite.XML`
- Updated selectable GLB node extras: `60`
- Line No sideload: Node 10 = `LINE XYZ`
- Component/process properties resolved from InputXML PIPINGELEMENT attributes.
- Carry-forward is component/process only. Restraints/supports remain record-scoped and are not inherited.
- Provenance trace is preserved as `provenanceTrace`, not `lineNo`.

## Expected panel: PE_003_PIPE_30_TO_35

```text
ID: PE_003_PIPE_30_TO_35
Type: PIPE
Ref No: PE_003_PIPE_30_TO_35
Line No.: LINE XYZ
From Node: 30
To Node: 35
Bore: 114.299995
Wall Thickness: 6.000000
Material: A106 B
Pressure: 2.000000
Hydro Pressure: 5.000000
Material Thickness: 6.000000
Temp1: 350.000000
Temp2: N/A
Temp3: N/A
```

## Expected panel: PE_001_FLANGE_PAIR_10_TO_20

```text
ID: PE_001_FLANGE_PAIR_10_TO_20
Type: FLANGE_PAIR
Ref No: PE_001_FLANGE_PAIR_10_TO_20
Line No.: LINE XYZ
From Node: 10
To Node: 20
Bore: 114.299995
Wall Thickness: 6.000000
Material: A106 B
Pressure: 2.000000
Hydro Pressure: 5.000000
Material Thickness: 6.000000
Temp1: 350.000000
Temp2: N/A
Temp3: N/A
```
