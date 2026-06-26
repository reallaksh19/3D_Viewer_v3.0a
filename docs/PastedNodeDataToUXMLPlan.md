# Pasted Node Data to UXML Conversion Plan

## Purpose

This document defines the future import route for data pasted into the workflow third tab: node-wise coordinates, restraints, node names, support names, component types, and similar tabular or free-text engineering data.

This route must adopt the Path 2 concept and save the result as **UXML / enriched InputXML**, not as a direct `_enriched.xml` worker file.

The application must support:

```text
1. Conventional XML import
   -> existing XML import path
   -> current _enriched.xml route

2. UXML / enriched InputXML import
   -> import dialog
   -> direct topology-aware model

3. API import from 3D RVM Viewer
   -> element/component API payload
   -> enriched InputXML / UXML-compatible model

4. Pasted node data from workflow third tab
   -> parse pasted rows
   -> infer node roles and components
   -> save as UXML / enriched InputXML
```

---

## Architectural decision

Pasted data is usually node-based and incomplete. Therefore it must not go directly to CII.

Correct route:

```text
Pasted node data
  -> pasted-data parser
  -> node role classifier
  -> inferred canonical element topology
  -> UXML / enriched InputXML writer
  -> UXML topology validation
  -> optional CII projection
```

Incorrect route:

```text
Pasted node data
  -> direct _enriched.xml
  -> CII worker
```

The UXML output becomes the source of truth for review, correction, import, and later projection.

---

## Source kind

Use source kind:

```text
PASTED_NODE_DATA
```

Generated authority:

```text
pasted-node-topology-inferred
```

Expected output file:

```text
<stem>_pasted_uxml.xml
```

Equivalent accepted names:

```text
<stem>_enriched_inputxml.xml
<stem>_uxml.xml
```

---

## Pasted data input formats

The parser should accept these forms.

### CSV / TSV style

```text
NodeNumber,NodeName,ComponentType,ComponentRefNo,Endpoint,X,Y,Z,RestraintType,GapMm,Stiffness,Friction
440,PS-11314/DATUM,ATTA,=1006649732/114320,0,189526.22,-1101825.00,102509.55,+Y,0,1751270031350,0.3
450,PS-11314/SREF,ATTA,=1006649732/114321,0,189526.22,-1101825.00,102509.55,,,,
460,PS-11314.1,ATTA,=1006649732/114322,0,189526.22,-1101825.00,102509.55,Z,0,0,0.3
470,,ELBO,=1006649732/114323,0,188773.22,-1101825.00,102509.55,,,,
```

### Space-delimited engineering rows

```text
440 PS-11314/DATUM ATTA =1006649732/114320 EP0 X=189526.22 Y=-1101825.00 Z=102509.55 REST=+Y GAP=0 STIFF=1751270031350 FRIC=0.3
450 PS-11314/SREF ATTA =1006649732/114321 EP0 X=189526.22 Y=-1101825.00 Z=102509.55
460 PS-11314.1 ATTA =1006649732/114322 EP0 X=189526.22 Y=-1101825.00 Z=102509.55 REST=Z GAP=0 STIFF=0 FRIC=0.3
```

### Minimal coordinate table

```text
Node  X          Y            Z          Name              Type
440   189526.22 -1101825.00  102509.55  PS-11314/DATUM    ATTA
450   189526.22 -1101825.00  102509.55  PS-11314/SREF     ATTA
460   189526.22 -1101825.00  102509.55  PS-11314.1        ATTA
470   188773.22 -1101825.00  102509.55  -                 ELBO
```

---

## Normalized pasted row schema

Every accepted input must normalize to this internal row shape:

```js
{
  sourceRowId: 'ROW-0001',
  rowIndex: 1,
  rawText: '...',
  nodeNumber: '440',
  nodeName: 'PS-11314/DATUM',
  componentType: 'ATTA',
  componentRefNo: '=1006649732/114320',
  endpoint: '0',
  branchName: '/ASIM-1835-4"-P8810212-31441C4-PP/B1',
  lineKey: '/ASIM-1835-4"-P8810212-31441C4-PP',
  point: { x: 189526.22, y: -1101825.00, z: 102509.55 },
  restraints: [
    { type: '+Y', gapMm: 0, stiffness: 1751270031350, friction: 0.3 }
  ],
  attributes: {},
  diagnostics: []
}
```

Required after normalization:

```text
nodeNumber or generated sourceRowId
point.x
point.y
point.z
```

Optional but important:

```text
nodeName
componentType
componentRefNo
endpoint
branchName
restraints
```

---

## Node role classification

Use the same role vocabulary as XML Path 2.

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

Classifier sketch:

```js
export function classifyPastedNode(row) {
  const type = String(row.componentType || '').toUpperCase();
  const name = String(row.nodeName || '').toUpperCase();
  const endpoint = String(row.endpoint || '').trim();
  const hasRestraint = Array.isArray(row.restraints) && row.restraints.length > 0;
  const nodeNumber = String(row.nodeNumber || '').trim();

  if (type === 'ATTA' && hasRestraint) return 'support-restraint';
  if (type === 'ATTA' && name.includes('/SREF') && !hasRestraint) return 'support-reference';
  if ((type === 'ELBO' || type === 'BEND') && nodeNumber === '-1') return 'bend-helper-endpoint';
  if (type === 'OLET' && nodeNumber === '-1') return 'olet-helper-endpoint';
  if (['VALV', 'FLAN', 'GASK', 'RIGID', 'INST'].includes(type)) return 'inline-component-endpoint';
  if (row.point) return 'real-geometry-node';
  return 'unknown-node';
}
```

---

## Component inference from pasted rows

Because pasted data is node-based, the adapter must infer elements.

Grouping precedence:

```text
1. ComponentRefNo
2. BranchName + ComponentType + endpoint cluster
3. Coincident/adjacent route geometry
4. NodeName pattern
5. Manual review bucket
```

Examples:

```text
Rows with same ComponentRefNo and ELBO:
  Endpoint 1 -> EP1
  Endpoint 0 -> CP
  Endpoint 2 -> EP2

Rows with same ComponentRefNo and VALV:
  Endpoint 1 -> EP1
  Endpoint 2 -> EP2

Rows with ATTA and same support name root:
  support-restraint rows -> restraints
  /SREF rows -> referenceNodeNumbers
```

---

## Support cluster example

Pasted rows:

```text
440 = PS-11314/DATUM, ATTA, +Y
450 = PS-11314/SREF, ATTA, no restraint
460 = PS-11314.1, ATTA, Z
```

UXML/enriched InputXML support output:

```xml
<Support id="S-PS-11314" sourceAuthority="pasted-node-topology-inferred">
  <SupportPoint sourceNodeNumber="440" x="189526.220" y="-1101825.000" z="102509.550"/>
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
440 and 460 may become CII support/restraint output.
450 remains source trace only.
No ElementLengthMm is written to support-only nodes.
```

---

## UXML / enriched InputXML root schema

Pasted data must be saved as:

```xml
<EnrichedInputXml schema="xml-cii-enriched-inputxml/v1" sourceKind="PASTED_NODE_DATA">
  <SourceTrace/>
  <CoordinateSystem/>
  <Branches/>
  <Components/>
  <Supports/>
  <SourceRows/>
  <Topology/>
  <CiiProjection/>
  <Diagnostics/>
</EnrichedInputXml>
```

This format is accepted as UXML/enriched InputXML by the import dialog.

---

## SourceTrace block

```xml
<SourceTrace>
  <SourceKind>PASTED_NODE_DATA</SourceKind>
  <SourceAuthority>pasted-node-topology-inferred</SourceAuthority>
  <CreatedBy>workflow-third-tab</CreatedBy>
  <OriginalFormat>csv-or-free-text</OriginalFormat>
  <Units length="mm"/>
</SourceTrace>
```

---

## SourceRows block

Every pasted row must be retained for traceability.

```xml
<SourceRows>
  <SourceRow id="ROW-0001" rowIndex="1" nodeNumber="440" role="support-restraint">
    <RawText>440,PS-11314/DATUM,ATTA,...</RawText>
    <Point x="189526.220" y="-1101825.000" z="102509.550"/>
  </SourceRow>
</SourceRows>
```

Rules:

```text
- Never discard raw pasted row text.
- Every generated component/support must link back to source rows.
- Rows that cannot be classified must still appear in SourceRows and Diagnostics.
```

---

## Component output example

```xml
<Component id="C-1006649732-114323" refNo="=1006649732/114323" type="ELBOW" sourceType="ELBO" sourceAuthority="pasted-node-topology-inferred">
  <SourceRows>
    <RowRef id="ROW-0004"/>
    <RowRef id="ROW-0005"/>
    <RowRef id="ROW-0006"/>
  </SourceRows>
  <Anchors>
    <Anchor role="EP1" sourceNodeNumber="-1" endpoint="1" x="189078.220" y="-1101825.000" z="102509.550"/>
    <Anchor role="CP" sourceNodeNumber="470" endpoint="0" x="188773.220" y="-1101825.000" z="102509.550"/>
    <Anchor role="EP2" sourceNodeNumber="-1" endpoint="2" x="188773.220" y="-1101520.000" z="102509.550"/>
  </Anchors>
</Component>
```

---

## Topology block

The UXML topology run should populate topology evidence.

```xml
<Topology>
  <Span id="SPAN-0001" fromNode="460" toNode="470" lengthMm="753.000" method="uxml-topology-previous-valid-route-point"/>
  <Span id="SPAN-0002" fromNode="470" toNode="480" lengthMm="1200.000" method="uxml-topology-previous-valid-route-point"/>
  <Span id="SPAN-0003" fromNode="480" toNode="490" lengthMm="1500.000" method="uxml-topology-previous-valid-route-point"/>
  <Span id="SPAN-0004" fromNode="490" toNode="500" lengthMm="855.000" method="uxml-topology-previous-valid-route-point"/>
</Topology>
```

---

## CII projection block

```xml
<CiiProjection>
  <NodeProjection nodeNumber="470" componentRefNo="=1006649732/114323" target="ElementLengthMm" value="753.000" sourceSpan="SPAN-0001"/>
  <NodeProjection nodeNumber="480" componentRefNo="=1006649732/114324" target="ElementLengthMm" value="1200.000" sourceSpan="SPAN-0002"/>
</CiiProjection>
```

Rules:

```text
- Projection is optional until the user requests CII output.
- The UXML file remains valid even without CII projection.
- Projection must not recalculate topology separately.
```

---

## Import dialog behavior

The import dialog must support:

```text
Open XML
Open UXML / enriched InputXML
Open API handoff JSON
Paste node data
```

Detection rules:

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

Routing:

```text
CONVENTIONAL_XML
  -> existing XML import route

UXML_ENRICHED_INPUTXML
  -> load topology authority directly

API_ELEMENT_TOPOLOGY_JSON
  -> API adapter -> enriched InputXML

PASTED_NODE_DATA
  -> pasted parser -> inferred UXML/enriched InputXML
```

---

## Validation rules for pasted data

Hard errors:

```text
No parseable coordinate columns.
No node number or row identifier.
Coordinate values are not numeric.
Mixed unit systems without explicit unit declaration.
Critical duplicate node numbers at different positions.
```

Warnings:

```text
Missing component type.
Missing component ref no.
Missing branch name.
Restraint row has no support name.
Support reference has no matching support restraint.
Endpoint value missing.
OLET branch point cannot be identified.
Route connectivity is ambiguous.
```

---

## Diagnostics examples

```js
{
  type: 'pasted-node-role-classified',
  rowId: 'ROW-0001',
  nodeNumber: '440',
  role: 'support-restraint',
  reason: 'ATTA with restraint'
}
```

```js
{
  type: 'pasted-node-topology-ambiguous',
  rowId: 'ROW-0012',
  nodeNumber: '500',
  reason: 'OLET branch point missing or duplicate same-position point unresolved'
}
```

```js
{
  type: 'uxml-import-ready',
  sourceKind: 'PASTED_NODE_DATA',
  componentCount: 10,
  supportCount: 2,
  warningCount: 3
}
```

---

## UI requirements for workflow third tab

The third tab should expose:

```text
Paste area
Input format selector: Auto / CSV / TSV / Free text
Unit selector: mm default
Branch name optional field
Parse preview table
Role classification column
Diagnostics panel
Save as UXML button
Send to XML-CII projection button
```

Preview columns:

```text
rowIndex
nodeNumber
nodeName
componentType
componentRefNo
endpoint
x
y
z
role
restraintType
gapMm
stiffness
friction
diagnostics
```

---

## Source authority order

```text
1. api-element-native
2. uxml-enriched-inputxml
3. pasted-node-topology-inferred
4. conventional-xml-topology-inferred
5. staged-json-authority
6. legacy-fallback
```

Pasted data is weaker than native API/UXML but stronger than blind legacy fallback because it has explicit user-provided coordinates.

---

## Implementation targets

```text
viewer/converters/xml-cii2019-core/topology/pasted-node-data-parser.js
viewer/converters/xml-cii2019-core/topology/pasted-node-role-classifier.js
viewer/converters/xml-cii2019-core/topology/pasted-node-to-canonical.js
viewer/converters/xml-cii2019-core/topology/canonical-to-enriched-inputxml.js
viewer/converters/xml-cii2019-core/topology/uxml-import-detector.js
viewer/tabs/model-converters/converters/xmltocii2019_helper/pasted-data-workflow.js
```

---

## Non-negotiable rules

```text
Pasted node data must be saved as UXML / enriched InputXML first.
Do not send pasted node rows directly to the CII worker.
Raw pasted row text must be retained.
Every inferred component/support must link back to source rows.
Support reference rows are trace only unless they carry restraints.
Supports must not participate in route continuity.
UXML/enriched InputXML is the authority for any later CII projection.
```
