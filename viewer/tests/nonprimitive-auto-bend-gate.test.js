import { canUseAutoBend, normalizeSourceKind } from '../overlays/autobend/NonPrimitiveAutoBendGate.js';
import { readNonPrimitiveAutoBendSettings } from '../overlays/autobend/NonPrimitiveAutoBendSettings.js';

let passed = 0;
let failed = 0;
function check(condition, label) {
  if (condition) { console.log(`PASS: ${label}`); passed += 1; }
  else { console.error(`FAIL: ${label}`); failed += 1; }
}

check(normalizeSourceKind('.xml') === 'inputxml', 'auto-bend xml aliases to inputxml');
for (const sourceKind of ['json', 'jscon', 'inputxml', 'txt']) {
  check(canUseAutoBend({ sourceKind }), `auto-bend accepts ${sourceKind}`);
}
for (const sourceKind of ['rvm', 'glb', 'gltf']) {
  check(!canUseAutoBend({ sourceKind }), `auto-bend rejects ${sourceKind}`);
}
check(!canUseAutoBend({ sourceKind: 'inputxml', modelPrimitiveMode: 'rvm-native' }), 'auto-bend rejects rvm-native primitive mode');
check(!canUseAutoBend({ sourceKind: 'json', modelPrimitiveMode: 'glb-native' }), 'auto-bend rejects glb-native primitive mode');
check(canUseAutoBend({ fileName: 'line.inputxml' }), 'auto-bend accepts inputxml filename');
check(!canUseAutoBend({ fileName: 'line.glb' }), 'auto-bend rejects glb filename');

const storage = new Map();
const storageAdapter = { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) };
const settings = readNonPrimitiveAutoBendSettings(storageAdapter);
check(settings.enabled === true && settings.radiusMode === 'source-or-od' && settings.defaultRadiusFactor === 1.5, 'auto-bend settings have source-preview defaults');

if (failed) {
  console.error(`FAILURES: ${failed}`);
  process.exit(1);
}
console.log(`All non-primitive auto-bend gate checks passed (${passed}).`);
