# API to InputXML Full Schema Ground Truth

## Purpose

This document defines the future Path 3 contract for data coming from the 3D RVM Viewer, SML imports, or any external element API.

The application must support three import families:

```text
Conventional XML
  -> current XML import route
  -> Path 1 topology ElementLengthMm logic
  -> current _enriched.xml

UXML / enriched InputXML
  -> import dialog
  -> topology-aware model
  -> optional CII projection

API from 3D RVM Viewer or SML
  -> element/component package
  -> enriched InputXML / UXML-compatible model
  -> optional CII projection
```

The API boundary must be element/component based. Node numbers are trace fields only.

---

## Pipeline

```text
3D RVM Viewer / SML / API
  -> API payload validation
  -> API source adapter
  -> canonical element topology model
  -> enriched InputXML / UXML-compatible output
  -> UXML topology graph
  -> CII projection map when CII output is requested
  -> current _enriched.xml worker input
```

---

## Top-level payload schema

Schema name:

```text
rvm-viewer-topology-handoff/v1
```

Top-level object:

```js
{
  schema: 'rvm-viewer-topology-handoff/v1',
  sourceKind: 'rvm-viewer-api',
  sourceSystem: '3D_RVM_VIEWER',
  sourceFile: 'model.rvm',
  generatedAt: '2026-06-26T00:00:00.000Z',
  units: { length: 'mm', weight: 'kg', pressure: 'Pa', temperature: 'degC' },
  coordinateSystem: {},
  branches: [],
  components: [],
  supports: [],
  sourceNodes: [],
  processData: [],
  materials: [],
  topologyHints: [],
  diagnostics: []
}
```

Required fields:

```text
schema
sourceKind
units.length = mm
coordinateSystem
branches
components
```

---

## Coordinate system

```js
{
  name: 'INPUTXML_WORLD',
  handedness: 'right-handed',
  upAxis: 'Z',
  origin: { x: 0, y: 0, z: 0 },
  axisTransformRevision: 'rvm-to-inputxml-v1',
  appliedTransform: {
    matrix4x4: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    translation: { x: 0, y: 0, z: 0 },
    scale: 1
  },
  toleranceMm: {
    coincidentPoint: 1,
    routeConnection: 6,
    supportAssociation: 25
  }
}
```

Rules:

```text
- The producer must state whether coordinates are already transformed to InputXML/CII space.
- The adapter must not apply a second transform silently.
- axisTransformRevision is mandatory when a transform is applied.
```

---

## Branch schema

```js
{
  branchId: 'BR-001',
  branchName: '/ASIM-1835-4"-P8810212-31441C4-PP/B1',
  lineKey: '/ASIM-1835-4"-P8810212-31441C4-PP',
  pipelineReference: 'ASIM-1835',
  lineNo: 'P8810212',
  service: 'PP',
  sourcePath: '/MODEL/.../B1',
  processDataRef: 'PD-001',
  materialRef: 'MAT-001',
  componentIds: ['C-ELBO-114323'],
  supportIds: ['S-PS-11314']
}
```

---

## Component schema

```js
{
  componentId: 'C-ELBO-114323',
  refNo: '=1006649732/114323',
  type: 'ELBOW',
  sourceType: 'ELBO',
  branchId: 'BR-001',
  branchName: '/ASIM-1835-4"-P8810212-31441C4-PP/B1',
  lineKey: '/ASIM-1835-4"-P8810212-31441C4-PP',
  sourcePath: '/RVM/.../C-ELBO-114323',
  anchors: [],
  ports: [],
  attributes: {},
  ciiProjectionHints: {},
  sourceNodeRefs: [],
  diagnostics: []
}
```

Canonical component types:

```text
PIPE
ELBOW
BEND
TEE
OLET
WELDOLET
SOCKOLET
VALVE
FLANGE
GASKET
REDUCER
CAP
INSTRUMENT
RIGID
SUPPORT
UNKNOWN
```

Source type examples:

```text
ELBO
FLAN
VALV
GASK
ATTA
RIGID
INST
OLET
```

---

## Anchor schema

Anchors are topology points.

```js
{
  anchorId: 'A-ELBO-114323-CP',
  role: 'CP',
  point: { x: 188773.22, y: -1101825.00, z: 102509.55 },
  sourceNodeNumber: '470',
  sourceEndpoint: '0',
  basis: 'source-exact',
  toleranceMm: 1,
  diagnostics: []
}
```

Anchor role enum:

```text
EP1
EP2
EP3
CP
BP
POS
START
END
SUPPORT_POINT
OLET_HEADER_TAP
OLET_BRANCH_POINT
TEE_HEADER_A
TEE_HEADER_B
TEE_BRANCH
CENTER
UNKNOWN
```

Rules:

```text
- Inline components normally require EP1 and EP2.
- OLET requires OLET_HEADER_TAP and OLET_BRANCH_POINT.
- Elbow/Bend should provide EP1, CP and EP2 when available.
- Support uses SUPPORT_POINT and must not participate in pipe route continuity.
```

---

## Port schema

```js
{
  portId: 'P-ELBO-114323-EP1',
  anchorId: 'A-ELBO-114323-EP1',
  role: 'EP1',
  faceKind: 'ENDPOINT',
  normal: { x: -1, y: 0, z: 0 },
  nominalDiameterMm: 200,
  boreMm: 200,
  rating: '900#',
  connectionType: 'BW',
  confidence: 'source'
}
```

Face kind enum:

```text
ENDPOINT
OLET_HEADER_TAP
OLET_BRANCH
TEE_HEADER
TEE_BRANCH
SUPPORT_ASSOCIATION
REFERENCE_ONLY
UNKNOWN
```

---

## Attributes schema

```js
{
  outsideDiameterMm: 219.1,
  wallThicknessMm: 8.18,
  corrosionAllowanceMm: 1.5,
  insulationThicknessMm: 100,
  boreMm: 200,
  nominalDiameterMm: 200,
  rating: '900#',
  pipingClass: '31441C4',
  materialCode: 'A106-B',
  materialName: 'Carbon Steel',
  bendRadiusMm: 305,
  lengthMm: 610,
  weightKg: 114.2,
  dtxr: 'WELDING NECK FLANGE 900#'
}
```

Rules:

```text
- lengthMm is physical component length if known.
- CII ElementLengthMm is derived later by projection.
- Weight may be source, master-match, or unresolved.
```

---

## Support schema

```js
{
  supportId: 'S-PS-11314',
  supportName: 'PS-11314',
  branchId: 'BR-001',
  branchName: '/ASIM-1835-4"-P8810212-31441C4-PP/B1',
  point: { x: 189526.22, y: -1101825.00, z: 102509.55 },
  association: {
    kind: 'nearest-segment',
    componentId: 'C-...',
    segmentId: 'SEG-...',
    distanceMm: 0,
    toleranceMm: 25
  },
  sourceNodeNumbers: ['440', '460'],
  referenceNodeNumbers: ['450'],
  restraints: [
    { type: '+Y', gapMm: 0, stiffness: 1751270031350, friction: 0.3, sourceNodeNumber: '440' },
    { type: 'Z', gapMm: 0, stiffness: 0, friction: 0.3, sourceNodeNumber: '460' }
  ],
  attributes: {},
  diagnostics: []
}
```

Rules:

```text
- Supports are associated to pipe segments.
- Supports are not route-continuity components.
- SREF/reference support nodes are trace only.
```

---

## Source node trace schema

```js
{
  sourceNodeId: 'N-470',
  nodeNumber: '470',
  nodeName: '',
  endpoint: '0',
  componentId: 'C-ELBO-114323',
  componentRefNo: '=1006649732/114323',
  componentType: 'ELBO',
  point: { x: 188773.22, y: -1101825.00, z: 102509.55 },
  role: 'real-geometry-node',
  originalRecord: {}
}
```

Rule: source nodes are trace only and must not override component topology.

---

## Enriched InputXML output schema

The API adapter must write an XML authority model:

```xml
<EnrichedInputXml schema="xml-cii-enriched-inputxml/v1">
  <SourceTrace/>
  <CoordinateSystem/>
  <Branches/>
  <Components/>
  <Supports/>
  <Topology/>
  <CiiProjection/>
  <Diagnostics/>
</EnrichedInputXml>
```

Example component:

```xml
<Component id="C-ELBO-114323" refNo="=1006649732/114323" type="ELBOW" sourceType="ELBO" branchId="BR-001" sourceAuthority="api-element-native">
  <Anchors>
    <Anchor id="A-ELBO-114323-EP1" role="EP1" sourceNodeNumber="-1" endpoint="1" x="189078.220" y="-1101825.000" z="102509.550"/>
    <Anchor id="A-ELBO-114323-CP" role="CP" sourceNodeNumber="470" endpoint="0" x="188773.220" y="-1101825.000" z="102509.550"/>
    <Anchor id="A-ELBO-114323-EP2" role="EP2" sourceNodeNumber="-1" endpoint="2" x="188773.220" y="-1101520.000" z="102509.550"/>
  </Anchors>
  <Attributes>
    <OutsideDiameterMm>219.100</OutsideDiameterMm>
    <BendRadiusMm>305.000</BendRadiusMm>
    <BoreMm>200.000</BoreMm>
  </Attributes>
</Component>
```

---

## CII projection map schema

```js
{
  schema: 'xml-cii-projection-map/v1',
  sourceAuthority: 'api-element-native',
  assignments: [
    {
      target: 'ElementLengthMm',
      xmlNodeNumber: '470',
      componentId: 'C-ELBO-114323',
      componentRefNo: '=1006649732/114323',
      componentType: 'ELBO',
      storedAt: 'downstream-node',
      fromNodeNumber: '460',
      toNodeNumber: '470',
      lengthMm: 753,
      method: 'uxml-topology-previous-valid-route-point',
      confidence: 'EXACT_SOURCE'
    }
  ],
  skipped: [],
  diagnostics: []
}
```

Rules:

```text
- The projection map bridges element topology to node-based CII XML.
- CII projection must not recalculate topology independently.
- Every ElementLengthMm in _enriched.xml must have a projection assignment or a fallback diagnostic.
```

---

## Import dialog detection

```js
export function detectImportKind({ text = '', payload = null }) {
  const raw = String(text || '').trim();
  if (payload && typeof payload === 'object' && /topology-handoff\/v1$/i.test(String(payload.schema || ''))) return 'API_ELEMENT_TOPOLOGY_JSON';
  if (/^\s*<EnrichedInputXml\b/i.test(raw) || /^\s*<UXML\b/i.test(raw)) return 'UXML_ENRICHED_INPUTXML';
  if (/^\s*<Root\b/i.test(raw) || /<Branch\b[\s\S]*?<Node\b/i.test(raw)) return 'CONVENTIONAL_XML';
  if (/NodeNumber|NodeName|Restraint|Position|ComponentType|\bX\b.*\bY\b.*\bZ\b/i.test(raw)) return 'PASTED_NODE_DATA';
  return 'UNKNOWN';
}
```

---

## Validation rules

Hard errors:

```text
missing units.length
units.length is not mm
component missing componentId
component missing type
component missing anchors
anchor missing role
anchor has invalid point
support missing point
OLET missing header tap or branch point
inline component missing usable endpoints and length evidence
```

Warnings:

```text
missing refNo
missing branchName
missing source node trace
port normal unavailable
support association unresolved
component weight unresolved
```

---

## Source authority order

```text
1. api-element-native
2. rvm-viewer-confirmed
3. uxml-enriched-inputxml
4. conventional-xml-topology-inferred
5. staged-json-authority
6. legacy-fallback
```

Conflict policy:

```text
Do not silently override higher-authority geometry.
If API and XML disagree beyond tolerance, emit topology-authority-conflict.
Critical disconnected routes require manual review or conversion block.
```

---

## Implementation targets

```text
viewer/converters/xml-cii2019-core/topology/api-source-adapter.js
viewer/converters/xml-cii2019-core/topology/api-payload-validator.js
viewer/converters/xml-cii2019-core/topology/canonical-topology-model.js
viewer/converters/xml-cii2019-core/topology/canonical-to-enriched-inputxml.js
viewer/converters/xml-cii2019-core/topology/canonical-to-uxml.js
viewer/converters/xml-cii2019-core/topology/uxml-topology-runner.js
viewer/converters/xml-cii2019-core/topology/cii-projection-map-builder.js
viewer/converters/xml-cii2019-core/topology/cii-projection-apply.js
```

---

## Non-negotiable rules

```text
API payload is element/component based.
Node numbers are trace only.
Supports do not participate in route continuity.
UXML/enriched InputXML is the topology authority.
_enriched.xml is a CII worker projection only.
No topology double calculation.
Every projected CII field must have traceable source authority.
```
