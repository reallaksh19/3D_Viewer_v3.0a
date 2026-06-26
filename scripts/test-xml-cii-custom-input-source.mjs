#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildXmlCiiCustomInputXml,
  parseXmlCiiStagedJsonInputSource,
  stagedTraceToCsv,
} from '../viewer/converters/xml-cii2019-core/custom-input-api.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const files = [
  'viewer/converters/xml-cii2019-core/custom-input-table-parser.js',
  'viewer/converters/xml-cii2019-core/custom-input-model.js',
  'viewer/converters/xml-cii2019-core/custom-input-xml-builder.js',
  'viewer/converters/xml-cii2019-core/custom-input-auto-bend.js',
  'viewer/converters/xml-cii2019-core/custom-input-auto-tee.js',
  'viewer/converters/xml-cii2019-core/custom-input-auto-reducer.js',
  'viewer/converters/xml-cii2019-core/custom-input-staged-json-source.js',
  'viewer/converters/xml-cii2019-core/custom-input-api.js',
  'viewer/tabs/model-converters/custom-input/custom-input-panel.js',
  'viewer/tabs/model-converters/json-trace/json-trace-panel.js',
  'viewer/tabs/model-converters/workflow/services/xml-cii-staged-source-service.js',
  'viewer/tabs/model-converters/workflow/services/xml-cii-workflow-state-service.js',
  'viewer/tabs/model-converters/custom-input/xml-cii-custom-input-workflow-tab.js',
];

for (const file of files) {
  const abs = path.join(root, file);
  assert.ok(fs.existsSync(abs), `${file} must exist`);
  const lines = read(file).split(/\r?\n/).length;
  assert.ok(lines < 260, `${file} must stay modular, got ${lines} lines`);
}

const shell = read('viewer/tabs/model-converters/WorkflowShell.js');
const modelTab = read('viewer/tabs/model-converters/ModelConvertersTab.js');
const customPanel = read('viewer/tabs/model-converters/custom-input/custom-input-panel.js');
const jsonTracePanel = read('viewer/tabs/model-converters/json-trace/json-trace-panel.js');
const sourceService = read('viewer/tabs/model-converters/workflow/services/xml-cii-staged-source-service.js');
const popup = read('viewer/tabs/model-converters/xml-cii-workflow-popup.js');

assert.ok(shell.includes("id: 'custom-input'") && shell.includes("id: 'json-trace'"), 'Workflow must expose separate Custom Input and JSON Trace phases');
assert.ok(shell.indexOf("id: 'custom-input'") < shell.indexOf("id: 'json-trace'"), 'JSON Trace must be a separate phase after Custom Input');
assert.ok(modelTab.includes('installXmlCiiCustomInputWorkflowTab'), 'ModelConvertersTab must install Custom Input workflow UI');
assert.ok(customPanel.includes('Custom Input') && customPanel.includes('Generate XML'), 'Custom Input UI must remain an XML generator');
assert.ok(customPanel.includes('Branches') && customPanel.includes('Nodes/components') && customPanel.includes('Build XML'), 'Custom Input tabs must keep synthetic XML source tables');
assert.ok(!customPanel.includes('Parse staged JSON') && !customPanel.includes('Node Trace'), 'Custom Input must not own staged JSON import or trace UI');
assert.ok(jsonTracePanel.includes('JsonNode Trace') && jsonTracePanel.includes('XML Node Wise Trace'), 'JSON Trace UI must expose trace subtabs');
assert.ok(jsonTracePanel.includes('PREVIEW_LINES = 300') && jsonTracePanel.includes('Use JSON Trace staged source'), 'JSON Trace import must expose 300-line preview and source toggle');
assert.ok(sourceService.includes('xmlCiiWorkflowParsedStagedSource') && sourceService.includes('XML_CII_JSON_TRACE_STORE_KEY'), 'Staged-source resolver must live outside legacy adapter');
assert.ok(popup.includes('createXmlCiiMasterService') && popup.includes('createXmlCiiPreviewService') && popup.includes('createXmlCiiRunService'), 'Popup must call modular XML CII services');
assert.ok(popup.includes('xmlCiiWorkflowPhaseTabs'), 'Popup must use state service to disable Custom Input when XML is loaded');

const largeStagedPreview = Array.from({ length: 350 }, (_, index) => `preview-line-${index + 1}`).join('\n');
globalThis.localStorage = {
  getItem: (key) => key === 'xmlCii.jsonTrace.v1' ? JSON.stringify({ active: 'import', stagedJsonText: largeStagedPreview, sourceFileName: 'large.json' }) : null,
  setItem: () => {},
};
const { renderXmlCiiJsonTracePanel, bindXmlCiiJsonTracePanel } = await import(new URL('../viewer/tabs/model-converters/json-trace/json-trace-panel.js?preview-test', import.meta.url).href);
const previewHtml = renderXmlCiiJsonTracePanel({ useJsonTraceSource: true });
assert.ok(previewHtml.includes('Previewing first 300 of 350 lines from large.json'), 'Large staged JSON must show a bounded preview count');
assert.ok(previewHtml.includes('preview-line-300') && !previewHtml.includes('preview-line-301'), 'Large staged JSON preview must stop at 300 visible lines');
assert.ok(previewHtml.includes('data-json-trace-preview-only="true"') && previewHtml.includes('readonly'), 'Truncated staged JSON preview must not overwrite retained full source');

globalThis.localStorage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
const quotaModule = await import(new URL('../viewer/tabs/model-converters/json-trace/json-trace-panel.js?quota-test', import.meta.url).href);
let quotaImportHandler = null;
const quotaFileInput = { addEventListener: (event, handler) => { if (event === 'change') quotaImportHandler = handler; } };
const quotaBody = { innerHTML: '', querySelectorAll: () => [], querySelector: (selector) => selector === '[data-json-trace-file]' ? quotaFileInput : null };
quotaModule.bindXmlCiiJsonTracePanel(quotaBody, {});
await quotaImportHandler({ target: { files: [{ name: 'quota.json', text: async () => largeStagedPreview }] } });
assert.ok(quotaBody.innerHTML.includes('Previewing first 300 of 350 lines from quota.json'), 'JSON Trace import preview must survive storage quota failure');
assert.ok(quotaBody.innerHTML.includes('retained in memory only'), 'Quota fallback should tell the user the full import is session-scoped');

const tables = {
  branchRows: 'BranchName\tNodeNumber\tBoreMm\tWallThickness\tP1\tT1\tT2\tT3\tFluidDensity\n/CUSTOM/B1\t100\t100\t6.02\t4140\t260\t151\t5\t983\n/CUSTOM/B1\t110\t100\t6.02\t4140\t260\t151\t5\t983',
  coordinateRows: 'BranchName\tNodeNumber\tX\tY\tZ\n/CUSTOM/B1\t100\t0\t0\t0\n/CUSTOM/B1\t110\t500\t0\t0',
  weightRows: 'BranchName\tNodeNumber\tComponentType\tRigid\tEndpoint\tWeight\n/CUSTOM/B1\t100\tPIPE\t0\t1\t0\n/CUSTOM/B1\t110\tRIGID\t2\t2\t0',
  dtxrRows: 'BranchName\tNodeNumber\tDTXR\n/CUSTOM/B1\t110\tGATE VALVE FLGD 300#',
};
const { xmlText, summary } = buildXmlCiiCustomInputXml(tables, { dropShortElementLengthNodes: false });
assert.equal(summary.branches, 1);
assert.equal(summary.nodes, 2);
assert.ok(xmlText.includes('<Branchname>/CUSTOM/B1</Branchname>'));
assert.ok(xmlText.includes('<NodeNumber>110</NodeNumber>'));
assert.ok(xmlText.includes('<Position>500 0 0</Position>'));
assert.ok(xmlText.includes('<DTXR_POS>GATE VALVE FLGD 300#</DTXR_POS>'));

const staged = { children: [{ type: 'BRANCH', name: '/STAGED/B1', children: [{ type: 'VALV', name: '1006649732/115524', attributes: { REF: '=1006649732/115524', DTXR: 'GATE VALVE FLGD 300#', APOS: 'E 10mm S 20mm U 30mm', ABORE: '100', WEIGHT: '99' } }, { type: 'SUPPORT', attributes: { NAME: 'PS-1001', POS: 'E 10mm S 20mm U 30mm', SUPPORT_KIND: 'GUIDE', NODEGAP: '5' } }] }] };
const parsed = parseXmlCiiStagedJsonInputSource(JSON.stringify(staged));
assert.equal(parsed.summary.branches, 1);
assert.equal(parsed.summary.dtxr, 1);
assert.equal(parsed.summary.supports, 1);
assert.ok(parsed.tablesText.dtxrRows.includes('GATE VALVE FLGD 300#'));
assert.ok(parsed.tablesText.restraintRows.includes('GUIDE'));
assert.ok(parsed.trace.some((row) => row.field === 'DTXR' && row.sourcePath.includes('attributes.DTXR') && row.matchMethod === 'component-refno-exact'));
assert.ok(stagedTraceToCsv(parsed.trace).includes('sourcePath'));

globalThis.localStorage = {
  getItem: (key) => key === 'xmlCii.jsonTrace.v1' ? JSON.stringify({ stagedJsonText: JSON.stringify(staged), trace: parsed.trace, sourceFileName: 'trace.json' }) : null,
  setItem: () => {},
};
const { xmlCiiWorkflowParsedStagedSource } = await import(new URL('../viewer/tabs/model-converters/workflow/services/xml-cii-staged-source-service.js?source-test', import.meta.url).href);
const approved = xmlCiiWorkflowParsedStagedSource({ useJsonTraceStagedSource: true });
assert.ok(approved.text.includes('/STAGED/B1'), 'Approved JSON Trace staged source must return imported staged JSON text');
assert.ok(approved.label.includes('JSON Trace staged source'), 'Approved staged source label must identify JSON Trace');

console.log('XML CII Custom Input / JSON Trace source guard passed', {
  customBranches: summary.branches,
  customNodes: summary.nodes,
  stagedTrace: parsed.trace.length,
});
