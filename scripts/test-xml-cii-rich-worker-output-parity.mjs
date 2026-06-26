import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

const guard = read('viewer/tabs/model-converters/xml-cii-rich-worker-cache-bust.js');
const tab = read('viewer/tabs/model-converters/ModelConvertersTab.js');
const index = read('viewer/tabs/model-converters/index.js');
const shim = read('viewer/tabs/model-converters-tab.js');
const runtime = read('viewer/core/app-label-perf-runtime.js');
const app = read('viewer/core/app.js');
const worker = read('viewer/converters/py-worker.js');
const legacy = read('viewer/tabs/model-converters/legacy-adapter.js');

assert.ok(legacy.includes('py-worker.js?v=20260515-cii-compat-check2'), 'Legacy Rich Workflow worker entrypoint still contains the stale worker key targeted by the guard.');
assert.ok(guard.includes('py-worker.js?v=20260515-cii-compat-check2'), 'Guard must detect the stale Rich Workflow worker key.');
assert.ok(guard.includes('py-worker.js?v=20260623-xml-cii-rich-worker-1'), 'Guard must rewrite to the fresh Rich Workflow worker key.');
assert.ok(guard.includes('installXmlCiiRichWorkerCacheBust();'), 'Guard must auto-install when imported by ModelConvertersTab.');
assert.ok(tab.includes('xml-cii-rich-worker-cache-bust.js?v=20260623-xml-cii-rich-worker-1'), 'ModelConvertersTab must import the Rich Workflow worker guard.');
assert.ok(index.includes('ModelConvertersTab.js?v=20260623-xml-cii-rich-worker-1'), 'Model Converters index must cache-bust ModelConvertersTab.');
assert.ok(shim.includes('model-converters/index.js?v=20260623-xml-cii-rich-worker-1'), 'Compatibility shim must cache-bust model-converters index.');
assert.ok(runtime.includes('model-converters-tab.js?v=20260623-xml-cii-rich-worker-1'), 'App runtime must cache-bust Model Converters tab import.');
assert.ok(app.includes('app-label-perf-runtime.js?v=20260623-xml-cii-rich-worker-1'), 'App delegate must cache-bust app-label-perf-runtime.');
assert.ok(worker.includes('enrichedInputXmlResult'), 'Worker must include enriched InputXML debug artifact in successful outputs.');
assert.ok(worker.includes('pyodide.FS.readFile(enrichedInputXmlResult.outputPath'), 'Worker must read the enriched InputXML debug artifact as downloadable output text.');

console.log('✓ XML->CII Rich Workflow uses fresh worker and returns enriched InputXML artifact.');
