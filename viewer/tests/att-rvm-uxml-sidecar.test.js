import assert from 'node:assert/strict';
import { runRvmAttrToXmlWithUxml, installRvmAttrUxmlAddon } from '../tabs/model-converters/rvmattr-uxml-addon.js';
import { getConverterById } from '../tabs/model-converters/converter-registry.js?v=20260617-basic-glb-2';

const attText = `
NEW BRAN PE00001-BRANCH-001
TYPE := BRAN
NAME := PE00001-BRANCH-001
HBOR := 100
HPOS := 1000 0 1000
TPOS := 3000 0 1000
END

NEW VALV V-001
TYPE := VALV
NAME := V-001
OWNER := PE00001-BRANCH-001
BORE := 100
APOS := 1500 0 1000
LPOS := 2500 0 1000
END

NEW ATTA SUP-001
TYPE := ATTA
NAME := SUP-001
OWNER := PE00001-BRANCH-001
CMPSUPTYPE := REST
BORE := 100
APOS := 2000 -60 1000
END
`;

const result = await runRvmAttrToXmlWithUxml({
  inputFiles: [{ role: 'secondary', name: 'RMSS_ATTRIBUTE.ATT', text: attText }],
  options: {},
  setStatus() {},
  converterId: 'rvmattr_to_xml',
});

assert.equal(result.ok, true, 'ATT-only wrapper run should keep base converter success');
assert.ok(result.outputs.some((o) => /_rvmattr_to_xml\.xml$/i.test(o.name)), 'existing XML output must remain');
assert.ok(result.outputs.some((o) => /_managed_stage\.json$/i.test(o.name)), 'existing managed_stage JSON output must remain');

const uxmlOutput = result.outputs.find((o) => /_managed_stage\.uxml\.json$/i.test(o.name));
assert.ok(uxmlOutput, 'UXML sidecar output must be appended');

const uxml = JSON.parse(uxmlOutput.text);
assert.equal(uxml.header?.purpose, 'att-stagedjson-sidecar-uxml');
assert.ok(Array.isArray(uxml.components) && uxml.components.length >= 2, 'UXML should contain component records');
assert.ok(Array.isArray(uxml.anchors) && uxml.anchors.length >= 2, 'UXML should contain anchor records');
assert.ok(Array.isArray(uxml.ports) && uxml.ports.length >= 2, 'UXML should contain port records');
assert.ok(Array.isArray(uxml.segments) && uxml.segments.length >= 1, 'UXML should contain segment records');
assert.ok(Array.isArray(uxml.supports) && uxml.supports.length >= 1, 'UXML should contain support records');
assert.ok(
  result.logs?.stdout?.some((line) => /Generated UXML sidecar/i.test(line)),
  'logs should mention generated UXML sidecar',
);

installRvmAttrUxmlAddon();
const converter = getConverterById('rvmattr_to_xml');
assert.equal(converter.__rvmAttrUxmlAddonInstalled, true, 'UI addon should patch the active cache-keyed converter object');

console.log('✅ att-rvm-uxml-sidecar.test.js passed');
