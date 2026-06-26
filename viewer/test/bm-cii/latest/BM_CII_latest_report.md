# BM_CII v69 — ISONOTE Expected Restraints with Corrected Axial Resolver

Generated from v67. This run corrects **ISONOTE axial restraints** using the same sequence requested for InputXML: engineering contact first, then final-symbol classification, then OD×2/3 resolver for axial/pipe-parallel symbols only.

## Locked rule applied

```
1. ISONOTE produces normalized synthetic support records.
2. Records use common InputXML support-mapper contract.
3. Apply engineering contact/gap first.
4. Axial restraints bypass OD/2 radial contact.
5. Axial no-gap: opposing tips/corners touch.
6. Axial positive gap: separation = 10 × gap.
7. Only after classifying as axial/pipe-parallel, apply visual resolver lane offset = OD × 2/3.
```

## Corrected ISONOTE axial records

| Node | Family | Axis | Load | Gap | Contact | Resolver offset |
|---:|---|---|---|---:|---|---:|
| 35 | LINE_STOP | ±Z | 15kN | N/A | AXIAL_CORNER_TOUCH | 0.0762 m |
| 205 | LINE_STOP | ±X | 6kN | N/A | AXIAL_CORNER_TOUCH | 0.059267 m |

## Visual cleanup retained

- Large line-stop circle markers are replaced by small touch/gap markers.
- Node 130 unresolved SINGLE AXIS Z warning remains light red/pink with `!`.
- Spring warning at node 205 remains below the pipe.

## Files

- GLB: `/mnt/data/BM_CII_v69_IsonoteAxialResolver/BM_CII_Enriched_v69_isonote_axial_resolver_engineering.glb`
- JSON: `/mnt/data/BM_CII_v69_IsonoteAxialResolver/BM_CII_Enriched_v69_isonote_axial_resolver.json`