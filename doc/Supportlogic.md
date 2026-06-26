# BM_CII Support / Annotation Mapping Logic

This file is a restorable documentation overlay generated from the ChatGPT sandbox. It captures the locked rules used in the BM_CII v68/v69 GLB artifacts.

## Source Modes

- **InputXML actual restraints**: actual support/restraint records parsed from InputXML.
- **ISONOTE expected restraints**: expected restraint intent parsed from node-wise ISONOTE sideload records.
- **Compare mode**: show/validate InputXML actual vs ISONOTE expected.

InputXML actual and ISONOTE expected must route through one common support mapper. ISONOTE must not use a separate drawing engine.

## Sideload Records

ISONOTE node-wise examples:

| Node | ISONOTE |
|---:|---|
| 35 | `:/PS-123 :ISONOTE 'REST(28kN), GUIDE(6kN),LINE STOP(15kN)'` |
| 130 | `:ISONOTE 'REST NOT DEFINED, SINGLE AXIS Z'` |
| 255 | `:ISONOTE 'REST(3kN), GUIDE(1kN)'` |
| 205 | `:/PS-456 :ISONOTE 'REST(10kN), HOLDDOWN,LINE STOP(6kN), Holddown without Guide Can Spring'` |

Line No sideload:

| Node | Line No. |
|---:|---|
| 10 | `LINE XYZ` |

Line No. applies to component/process metadata only, not to supports/restraints.

## Component Metadata Rules

- InputXML sentinel/carry-forward applies only to component/process fields.
- It does not apply to restraints/supports.
- Component/process fields include bore/diameter, wall thickness, material, pressure, hydro pressure, material thickness, Temp1/2/3.
- Provenance/debug traces must never be displayed as `Line No.`.

## Restraint Mapping Table

| Source keyword/type | Normalized family | Axis rule | Direction/sign | Symbol rule |
|---|---|---|---|---|
| `REST(...)` | `REST` | global `Y` | always `+Y` | single vertical arrow upward |
| `HOLDDOWN` / `HOLD DOWN` | `HOLDDOWN` | global `Y` | `±Y` | double vertical arrows |
| `GUIDE(...)` on horizontal pipe along X | `GUIDE` | lateral `Z` | `±Z` | lateral guide pair |
| `GUIDE(...)` on horizontal pipe along Z | `GUIDE` | lateral `X` | `±X` | lateral guide pair |
| `GUIDE(...)` on vertical pipe | `GUIDE` | `X` and `Z` | `±X`, `±Z` | four arrows around pipe |
| `LINE STOP(...)` | `LINE_STOP` | pipe axial | `± axial` unless explicit sign exists | axial stop pair |
| `LIMIT` / `LIM` / `LIMIT STOP` | `LIMIT` | pipe axial | always `± axial` | axial limit pair |
| `SINGLE AXIS X/Y/Z` without sign | `AXIS_RESTRAINT_UNRESOLVED` | declared axis | unknown | warning marker / popup required |
| `+X/-X/+Y/-Y/+Z/-Z` | `AXIS_RESTRAINT` | explicit axis | explicit sign | single directional arrow |
| `CAN SPRING` / `SPRING CAN` | `SPRING_WARNING` | below pipe | warning only | coil warning below pipe |
| `REST NOT DEFINED` | `NEGATION_REST` | N/A | N/A | suppress REST generation |
| `WITHOUT GUIDE` / `NO GUIDE` | `NEGATION_GUIDE` | N/A | N/A | suppress GUIDE generation |

## Gap Parsing Rules

### InputXML

- GAP is restraint-record scoped.
- Missing/blank/negative sentinel (for example `-1.010100`) means no gap.
- `0` means zero gap.
- Positive value is gap in mm.
- No carry-forward and no same-node inheritance.

### ISONOTE

Parse explicit gap tokens only, case-insensitive:

`GAP=25`, `GAP = 25`, `GAP=25mm`, `GAP: 25 mm`, `GAP 25`.

If unit is missing, assume mm. A bare `GAP` after a comma applies only to the immediately previous restraint token.

## Contact / Resolver Sequence

1. Apply engineering contact/restraint geometry first.
2. Classify final symbol orientation.
3. Apply visual resolver offset only if final symbol is axial / parallel to pipe.

### Non-axial/radial restraints

Includes REST, GUIDE, HOLDDOWN, vertical/radial spring/hanger:

- Engineering contact: pipe outside surface = `OD / 2`.
- If positive gap: offset = `OD / 2 + 10 × gap`.
- No `OD × 2/3` visual resolver unless the final rendered symbol is pipe-parallel.

### Axial/pipe-parallel restraints

Includes LINE STOP, LIMIT/LIM, axial restraint, and any final spring/coil symbol that is parallel to pipe:

- OD/2 radial contact is not applicable.
- If no positive gap: opposing axial arrow corners/tips touch.
- If positive gap: axial separation = `10 × gap`.
- After engineering contact/gap is resolved, apply visual resolver offset = `OD × 2/3` only because the symbol is axial/pipe-parallel.

## Single-Axis Popup Rule

If ISONOTE contains `SINGLE AXIS X/Y/Z` without `+` or `-`, do not assume a sign. Show a warning marker and prompt the user to select `+` or `-`. If no user selection is available, keep neutral/unresolved warning only.

## Component Panel Defaults

Only these sections should be expanded by default:

- Line / Node
- Component Data
- Process / Analysis

All other sections, including Rules / Notes and Raw / Debug Metadata, should be collapsed by default. Panel width and height should be resizable.
