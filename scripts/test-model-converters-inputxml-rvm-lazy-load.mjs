import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const wrapperPath = path.join(root, 'viewer/tabs/model-converters/converters/inputxml-to-rvm.js');
const runtimePath = path.join(root, 'viewer/core/app-label-perf-runtime.js');
const appPath = path.join(root, 'viewer/core/app.js');

const wrapper = readFileSync(wrapperPath, 'utf8');
const runtime = readFileSync(runtimePath, 'utf8');
const app = readFileSync(appPath, 'utf8');

const runnerSpecifier = '../../../converters/inputxml-rvm/inputxml-to-rvm-runner.js';
const staticRunnerImport = `import { run as runInputXmlToRvm } from '${runnerSpecifier}';`;

assert.ok(!wrapper.includes(staticRunnerImport), 'inputxml-to-rvm wrapper must not statically import the RVM runner.');
assert.ok(wrapper.includes(`import('${runnerSpecifier}')`), 'inputxml-to-rvm wrapper must lazy-import the RVM runner inside execution.');
assert.ok(wrapper.includes('loadInputXmlToRvmRun'), 'inputxml-to-rvm wrapper must cache the lazy runner import.');
assert.ok(runtime.includes('model-converters-tab.js?v=20260622-inputxml-rvm-lazy-1'), 'app runtime must cache-bust the Model Converters tab import.');
assert.ok(app.includes('app-label-perf-runtime.js?v=20260622-model-converters-lazy-rvm-1'), 'app delegate must cache-bust the app runtime import.');

console.log('✓ InputXML→RVM leaf module is isolated from Model Converters tab startup.');
