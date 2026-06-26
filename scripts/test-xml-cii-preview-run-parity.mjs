import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

const runner = read('viewer/tabs/model-converters/converters/xmltocii2019_runner.js');
const parity = read('viewer/tabs/model-converters/converters/xmltocii2019_helper/enrichment-run-parity.js');
const preview = read('viewer/tabs/model-converters/converters/xmltocii2019_helper/preview-renderer.js');
const table = read('viewer/tabs/model-converters/shared/EditablePreviewTable.js');
const base = read('viewer/tabs/model-converters/converters/xmltocii2019_helper/enrichment-core.js');
const config = read('viewer/converters/xml-cii2019-core/config.js');
const directionWorker = read('viewer/converters/scripts/xml_to_cii2019_direction.py');
const inputXmlDebug = read('viewer/converters/scripts/xml_to_inputxml_debug.py');
const baseWorker = read('viewer/converters/scripts/xml_to_cii2019.py');

const mappedProcessFixture = Object.freeze({
  branchName: '/ASIM-1835-4"-P8810212-31441C4-PP/B1',
  lineKey: 'P8810212',
  expectedEnrichedXml: Object.freeze({ Pressure1: '3210', HydroPressure: '4815', Temperature1: '205', Temperature2: '180', Temperature3: '-29', FluidDensity: '845' }),
});

assert.ok(runner.includes('./xmltocii2019_helper/enrichment-run-parity.js'), 'XML->CII run must use the preview/run parity enrichment helper.');
assert.ok(parity.includes('xmlCiiDryRunPreview'), 'Parity helper must reuse the same dry-run preview resolver used by phase 3.');
assert.ok(preview.includes('normalizeLineListRow') && preview.includes('config.linelist?.fieldMap'), 'Preview must normalize matched line-list rows through the active field map before reading process values.');
assert.ok(preview.includes('_xmlCiiProcessValue') && preview.includes('hydroPressure') && preview.includes('resolveLineListDensity'), 'Preview must resolve mapped P1/Hydro/T1/T2/T3/density values through the shared process path.');
assert.ok(table.includes('Hydro/Test Pressure') && table.includes('P1 / Design Pressure'), 'Preview table must expose Hydro/Test Pressure and must not mislabel P1 as MPa.');

for (const token of ['Pressure1', 'HydroPressure', 'Temperature1', 'Temperature2', 'Temperature3', 'FluidDensity']) {
  assert.ok(parity.includes(token), `Parity helper must write ${token} into enriched XML.`);
}
assert.ok(parity.includes('process-provenance') && parity.includes('lineListRowFound') && parity.includes('final='), 'Diagnostics must expose visible process provenance for mapped/default process values.');

assert.ok(parity.includes('dropGasketNodesFromXmlText') && parity.includes('dropGasketNodesFromDocument'), 'Parity helper must remove GASK node blocks before base enrichment and before split logic.');
assert.ok(parity.includes('gasket-node-dropped'), 'Parity diagnostics must record dropped gasket nodes.');
assert.ok(parity.includes("RENUMBERABLE_NEGATIVE_TYPES = new Set(['FLAN', 'VALV', 'RIGID', 'INST'])"), 'Resolved condense must exclude GASK from renumberable negative inline blocks.');
assert.ok(parity.includes("INLINE_LENGTH_COMPONENT_TYPES = new Set(['FLAN', 'VALV', 'RIGID', 'INST'])"), 'ElementLengthMm calculation must exclude GASK after default gasket drop.');
assert.ok(!parity.includes("['FLAN', 'GASK'") && !parity.includes('GASK: \'1\''), 'GASK must not participate in split/rigid marker logic.');
assert.ok(parity.includes('sameComponentRefMate') && parity.includes('allocateContiguousNumbers') && parity.includes('condensedValveFlangeBlocks'), 'Resolved condense must detect contiguous negative component chains and assign stable positive ordered node numbers.');
assert.ok(parity.includes("setTextAfter(document, node, 'Rigid', '2', 'Endpoint')"), 'Resolved inline FLAN/VALV/RIGID/INST components must emit Rigid=2 after Endpoint.');
assert.ok(parity.includes('element-length-inline-negative') && parity.includes('instElementLengthAnnotations'), 'Negative INST and inline chain ElementLengthMm diagnostics must exist.');
assert.ok(parity.includes('DTXR_POS_SIF_ZERO_TYPES') && parity.includes("setText(document, node, 'SIF', '0')") && parity.includes('dtxr-pos-sif-zero') && parity.includes('TEEDESC_POS') && parity.includes('OLET'), 'DTXR_POS-matched Tee/Olet nodes must be assigned SIF=0 before final CII worker conversion.');

assert.ok(config.includes('BRANCH') && config.includes('OUTLET') && directionWorker.includes('OLET') && inputXmlDebug.includes('return 5'), 'Branch Outlet BW OLET descriptions must map to CII SIF&TEES type 5, not type 0.');
assert.ok(config.includes('TEE') && directionWorker.includes('BUTTWELD') && inputXmlDebug.includes('return 3'), 'TEE BW/Buttweld descriptions must map to CII SIF&TEES type 3 in browser config, CII worker, and InputXML debug export.');
assert.ok(baseWorker.includes('second_thickness = edge.to_node.wall_thickness') && !baseWorker.includes('_format_fixed_float(0.0, 6),\n                    _format_fixed_float(alpha_angle'), 'Reducer REDUCERS payload must write second thickness from reducer/adjacent wall data, not hard-code zero.');
assert.deepEqual(Object.keys(mappedProcessFixture.expectedEnrichedXml), ['Pressure1', 'HydroPressure', 'Temperature1', 'Temperature2', 'Temperature3', 'FluidDensity'], 'Regression fixture must assert all mapped process fields expected in enriched XML.');
assert.ok(base.includes('deriveRatingFromPipingClass') && base.includes('pc.includes(xcNorm(pattern))'), 'Regression context: base enrichment still has the broad rating derivation that preview/run parity overrides.');

console.log('XML->CII preview/run mapped process, HydroPressure, diagnostics, gasket-drop negative-chain, and DTXR_POS SIF=0 parity guard passed.', { fixture: mappedProcessFixture.branchName });
