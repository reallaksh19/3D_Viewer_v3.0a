# XMLtoInputXMLconversionplan

## Purpose

This document captures the deferred Path 2 concept: converting the present node-based XML import route into an element/topology-aware enriched InputXML route.

Current implementation priority remains:

1. **Path 1 — Low risk:** XML -> UXML topology only for `ElementLengthMm` -> current `_enriched.xml` route.
2. **Path 3 — Future driven:** API / 3D RVM Viewer / SML element package -> enriched InputXML -> UXML topology -> CII projection.

Path 2 is intentionally documented here, not implemented yet, so Path 1 and Path 3 can proceed without forcing a full XML import refactor.

---

## Three-path strategy

```text
PATH 1 — LOW RISK
Present node XML
  -> current XML-CII enrichment
  -> UXML topology used only as ElementLengthMm calculator
  -> current _enriched.xml
  -> current Python CII worker

PATH 2 — OPTIMIZE / DOCUMENTED HERE
Present node XML
  -> node role classifier
  -> inferred canonical element topology
  -> enriched_inputxml.xml
  -> UXML topology validation
  -> CII projection
  -> _enriched.xml

PATH 3 — FUTURE DRIVEN
3D RVM Viewer API / SML API / element package
  -> native canonical element topology
  -> enriched_inputxml.xml
  -> UXML topology validation
  -> CII projection
  -> _enriched.xml
```

The shared rule is:

```text
One topology kernel.
Multiple source adapters.
Path-specific output policies.
```

---

## Why Path 2 exists

The present XML import route is node-based. It has records such as:

```xml
<Node>
  <NodeNumber>470</NodeNumber>
  <Endpoint>0</Endpoint>
  <ComponentType>ELBO</ComponentType>
  <ComponentRefNo>=1006649732/114323</ComponentRefNo>
  <Position>188773.22 -1101825.00 102509.55</Position>
</Node>
```

But engineering topology is element-based:

```text
ELBO element
  EP1 tangent point
  CP / center point
  EP2 tangent point
```

Path 2 converts the node XML into this element/topology model before generating the final CII worker XML.

---

## Non-goals for Path 2 now

Path 2 must not block the immediate work.

Do not implement Path 2 until Path 1 and Path 3 contracts are stable.

Path 2 is **not**:

- a replacement for the current low-risk ElementLengthMm fix;
- a direct API contract for the 3D RVM Viewer;
- a second independent topology engine;
- a second independent CII writer;
- a late-stage cosmetic XML reformatting pass.

---

## Target output files for Path 2

Path 2 should eventually produce:

```text
<stem>_enriched_inputxml.xml
<stem>_enriched.xml
<stem>_enrichment_diagnostics.json
<stem>_topology_graph.json        optional/debug
```

Meaning:

```text
_enriched_inputxml.xml
  Element/topology authority and audit model.

_enriched.xml
  Node-based CII worker projection.

_enrichment_diagnostics.json
  Trace for every calculated, skipped, merged, suppressed, or fallback decision.

_topology_graph.json
  UXML graph evidence for debugging and future viewer integration.
```

---

## High-level architecture

```text
Present node XML
  -> XML node parser
  -> node role classifier
  -> component grouping / topology inference
  -> canonical element topology model
  -> enriched InputXML writer
  -> UXML topology service
  -> CII projection map
  -> current _enriched.xml structure
  -> current Python CII worker
```

The important architectural decision is:

```text
_enriched_inputxml.xml is the topology authority.
_enriched.xml is only the CII worker projection.
```

Do not calculate topology twice.

---

## Source model detection

Path 2 starts only when the source is present node-based XML.

```js
export function detectXmlCiiSourceKind(input) {
  const text = String(input || '');

  if (/<Branch\b[\s\S]*?<Node\b/i.test(text)) {
    return 'NODE_XML';
  }

  if (/<EnrichedInputXml\b|<Components\b[\s\S]*?<Component\b/i.test(text)) {
    return 'ELEMENT_INPUTXML';
  }

  return 'UNKNOWN';
}
```

Path routing:

```js
switch (detectXmlCiiSourceKind(xmlText)) {
  case 'NODE_XML':
    return buildPath2ModelFromNodeXml(xmlText, options);

  case 'ELEMENT_INPUTXML':
    return buildFromElementInputXml(xmlText, options);

  default:
    return buildLegacyXmlCiiModel(xmlText, options);
}
```

---

## Node role classification

Path 2 requires a node role classifier before any length cleanup.

Roles:

```text
support-restraint
support-reference
inline-component-endpoint
bend-helper-endpoint
olet-helper-endpoint
real-geometry-node
duplicate-same-position-helper
unknown-node
```

Example classifier sketch:

```js
export function classifyXmlCiiNode(node) {
  const type = upper(node.componentType);
  const name = upper(node.nodeName);
  const endpoint = String(node.endpoint || '').trim();
  const hasRestraint = Array.isArray(node.restraints) && node.restraints.length > 0;
  const number = String(node.nodeNumber || '').trim();

  if (type === 'ATTA' && hasRestraint) {
    return 'support-restraint';
  }

  if (type === 'ATTA' && name.includes('/SREF') && !hasRestraint) {
    return 'support-reference';
  }

  if ((type === 'ELBO' || type === 'BEND') && number === '-1') {
    return 'bend-helper-endpoint';
  }

  if (type === 'OLET' && number === '-1') {
    return 'olet-helper-endpoint';
  }

  if (['VALV', 'FLAN', 'GASK', 'RIGID', 'INST'].includes(type)) {
    return 'inline-component-endpoint';
  }

  if (node.position) {
    return 'real-geometry-node';
  }

  return 'unknown-node';
}
```

---

## Example: support cluster conversion

Source node cluster:

```text
440 = PS-11314/DATUM, ATTA, +Y restraint
450 = PS-11314/SREF, ATTA, no restraint
460 = PS-11314.1, ATTA, Z restraint
```

Path 2 target support model:

```xml
<Support id="PS-11314" sourceAuthority="node-xml-inferred">
  <SupportPoint nodeNumber="440"
                x="189526.22"
                y="-1101825.00"
                z="102509.55"/>
  <SourceNodes>
    <NodeRef nodeNumber="440" role="support-restraint" restraint="+Y"/>
    <NodeRef nodeNumber="450" role="support-reference" tag="SREF"/>
    <NodeRef nodeNumber="460" role="support-restraint" restraint="Z"/>
  </SourceNodes>
  <Restraints>
    <Restraint type="+Y" gapMm="0" stiffness="1751270031350" friction="0.3"/>
    <Restraint type="Z" gapMm="0" stiffness="0" friction="0.3"/>
  </Restraints>
</Support>
```

Projection policy:

```text
440 / 460: preserve or merge as CII restraint output, depending on CII writer capability.
450: suppress from final support output, retain as source trace only.
No ElementLengthMm is written to support-only nodes.
```

---

## Example: ELBO conversion

Source node group:

```text
ComponentRefNo = =1006649732/114323
Endpoint 1, NodeNumber -1 -> EP1
Endpoint 0, NodeNumber 470 -> CP / real geometry node
Endpoint 2, NodeNumber -1 -> EP2
```

Path 2 target component model:

```xml
<Component id="C-1006649732-114323"
           refNo="=1006649732/114323"
           type="ELBOW"
           sourceType="ELBO"
           sourceAuthority="node-xml-inferred">
  <Anchors>
    <Anchor role="EP1" nodeNumber="-1" endpoint="1"
            x="189078.22" y="-1101825.00" z="102509.55"/>
    <Anchor role="CP" nodeNumber="470" endpoint="0"
            x="188773.22" y="-1101825.00" z="102509.55"/>
    <Anchor role="EP2" nodeNumber="-1" endpoint="2"
            x="188773.22" y="-1101520.00" z="102509.55"/>
  </Anchors>
  <Attributes>
    <BendRadiusMm>305</BendRadiusMm>
    <OutsideDiameterMm>219.1</OutsideDiameterMm>
  </Attributes>
  <CiiProjection>
    <NodeProjection nodeNumber="470" role="real-geometry-node"/>
  </CiiProjection>
</Component>
```

---

## Canonical model shape

Path 2 should build a canonical JavaScript object before writing XML.

```js
export function createCanonicalTopologyModel({ sourceKind = 'node-xml' } = {}) {
  return {
    schema: 'xml-cii-canonical-topology-model/v1',
    sourceKind,
    units: { length: 'mm', weight: 'kg' },
    coordinateSystem: {
      source: 'input-xml',
      axisTransformRevision: '',
      origin: null,
    },
    branches: [],
    components: [],
    supports: [],
    sourceNodes: [],
    diagnostics: [],
  };
}
```

Component record:

```js
{
  componentId: 'C-1006649732-114323',
  refNo: '=1006649732/114323',
  type: 'ELBOW',
  sourceType: 'ELBO',
  branchName: '/ASIM-.../B1',
  sourceNodeNumbers: ['-1', '470', '-1'],
  anchors: [
    { role: 'EP1', point: { x, y, z }, sourceNodeNumber: '-1', endpoint: '1' },
    { role: 'CP', point: { x, y, z }, sourceNodeNumber: '470', endpoint: '0' },
    { role: 'EP2', point: { x, y, z }, sourceNodeNumber: '-1', endpoint: '2' },
  ],
  attributes: {
    outsideDiameterMm: 219.1,
    bendRadiusMm: 305,
  },
  sourceAuthority: 'node-xml-inferred',
}
```

---

## UXML conversion boundary

Path 2 must not duplicate the UXML topology engine.

It should convert the canonical model into UXML-compatible sections:

```text
canonical.components -> uxml.components
canonical.anchors    -> uxml.anchors
canonical.supports   -> uxml.supports / support components
canonical.segments   -> uxml.segments
```

Sketch:

```js
export function canonicalTopologyToUxml(model) {
  return {
    schemaVersion: 'uxml-topology-v1',
    header: {
      name: 'xml-cii-path2-enriched-inputxml',
      sourceKind: model.sourceKind,
    },
    units: model.units,
    components: model.components.map(toUxmlComponent),
    anchors: model.components.flatMap(toUxmlAnchors),
    ports: model.components.flatMap(toUxmlPorts),
    segments: model.components.flatMap(toUxmlSegments),
    supports: model.supports.map(toUxmlSupport),
    diagnostics: model.diagnostics,
  };
}
```

---

## CII projection map

Path 2 uses topology output to build a projection map.

```js
export function buildCiiProjectionMap({ canonical, topology }) {
  return {
    schema: 'xml-cii-projection-map/v1',
    assignments: [],
    skipped: [],
    diagnostics: [],
  };
}
```

Assignment example:

```js
{
  target: 'ElementLengthMm',
  xmlNodeNumber: '470',
  componentRefNo: '=1006649732/114323',
  componentType: 'ELBO',
  storedAt: 'downstream-node',
  fromNodeNumber: '460',
  toNodeNumber: '470',
  lengthMm: 753.0,
  method: 'uxml-topology-previous-valid-route-point',
  sourceAuthority: 'node-xml-inferred',
  confidence: 'EXACT_SOURCE',
}
```

Skip example:

```js
{
  target: 'ElementLengthMm',
  xmlNodeNumber: '450',
  componentType: 'ATTA',
  action: 'skip',
  reason: 'support-reference-sref',
}
```

---

## ElementLengthMm projection rule

Path 2 stores length in two places:

```text
1. enriched_inputxml.xml:
   topology span evidence

2. _enriched.xml:
   ElementLengthMm on downstream CII node
```

Example geometry:

```text
440/460 support point -> 470 = 753
470 -> 480 = 1200
480 -> 490 = 1500
490 -> 500 = 855
OLET CP -> BP = 147.65
```

Enriched InputXML:

```xml
<Span role="incoming" fromNode="460" toNode="470" lengthMm="753.000"/>
```

CII projection:

```xml
<Node>
  <NodeNumber>470</NodeNumber>
  <ElementLengthMm>753.000</ElementLengthMm>
</Node>
```

---

## Relationship with Path 1 and Path 3

Path 2 must reuse the same topology kernel as Path 1 and Path 3.

```text
Path 1:
  node XML -> temporary canonical model -> UXML length assignments only -> current _enriched.xml

Path 2:
  node XML -> persistent canonical model -> enriched_inputxml.xml -> UXML -> CII projection

Path 3:
  API element package -> canonical model -> enriched_inputxml.xml -> UXML -> CII projection
```

Shared modules should be:

```text
source kind detector
node parser
node role classifier
canonical topology model
canonical -> UXML mapper
UXML topology runner
projection map builder
diagnostics helpers
```

Path-specific modules should be:

```text
Path 1: legacy _enriched.xml length apply policy
Path 2: enriched InputXML writer and node XML inference policy
Path 3: API payload adapter and API audit policy
```

---

## Suggested future file layout

```text
viewer/converters/xml-cii2019-core/topology/
  xml-cii-source-kind-detector.js
  xml-cii-node-role-classifier.js
  xml-cii-node-xml-parser.js
  xml-cii-canonical-topology-model.js
  xml-cii-node-xml-to-canonical.js
  xml-cii-canonical-to-uxml.js
  xml-cii-uxml-topology-runner.js
  xml-cii-projection-map-builder.js
  xml-cii-enriched-inputxml-writer.js
  xml-cii-projection-apply.js
  xml-cii-topology-diagnostics.js
```

---

## Rollout plan for Path 2

Path 2 should be implemented only after the low-risk and API contracts are stable.

Recommended later PRs:

```text
PR-A: Add Path 2 schema and canonical model helpers.
PR-B: Add node XML -> canonical topology inference in shadow mode.
PR-C: Add enriched_inputxml.xml writer, no CII behavior change.
PR-D: Add canonical -> UXML topology validation, diagnostics only.
PR-E: Add CII projection map generation, diagnostics only.
PR-F: Enable projection-driven _enriched.xml behind flag.
PR-G: Retire legacy fallback only after generated _enriched.xml proves identical or better across fixtures.
```

---

## Required regression fixtures

Path 2 must prove the following before it can become active:

```text
1. 440/450/460 support/SREF cluster:
   440 +Y preserved
   450 SREF suppressed from final support output
   460 Z preserved or merged with 440

2. Geometry chain:
   440/460 -> 470 = 753
   470 -> 480 = 1200
   480 -> 490 = 1500
   490 -> 500 = 855
   OLET CP -> BP = 147.65

3. Valve/flange split case:
   1467 Endpoint 1 = 3.2 and dropped by short-node cleanup
   1468 Endpoint 2 = 610 and retained

4. Weight dependency:
   corrected ElementLengthMm must run before zero-rigid weight matching.

5. No topology double calculation:
   every ElementLengthMm in _enriched.xml must have a projection-map assignment.
```

---

## Activation guard

Path 2 must be disabled by default until proven.

Suggested flag:

```js
xmlCiiTopologyMode: {
  sourcePath: 'node-xml',
  enrichmentPath: 'optimized',
  emitEnrichedInputXml: true,
  useProjectionMap: true,
  applyProjectionToCiiXml: false,
}
```

Initial operation:

```text
emitEnrichedInputXml = true
useProjectionMap = true
applyProjectionToCiiXml = false
```

Final operation after validation:

```text
emitEnrichedInputXml = true
useProjectionMap = true
applyProjectionToCiiXml = true
```

---

## Summary

Path 2 is the optimized XML import route. It should convert node XML into a topology-aware enriched InputXML model, then project that model into the current CII-ready `_enriched.xml`.

It is valuable, but not the immediate priority.

Immediate implementation should focus on:

```text
Path 1: low-risk UXML topology length calculation on current _enriched.xml
Path 3: future API/RVM element topology -> enriched InputXML route
```

Path 2 should remain documented, testable, and ready to implement once Path 1 and Path 3 stabilize.
