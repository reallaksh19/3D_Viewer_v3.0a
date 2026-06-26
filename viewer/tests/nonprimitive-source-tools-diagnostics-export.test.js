import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const uiBridgeSource = await fs.readFile(new URL('../tabs/RvmNonPrimitiveSourceToolsUiBridge.js', import.meta.url), 'utf8');
const workflowSource = await fs.readFile(new URL('../../.github/workflows/rvm-pcf-ci.yml', import.meta.url), 'utf8');

assert.match(uiBridgeSource, /NonPrimitiveSourceToolsDiagnostics\.js/, 'source-tools UI imports pure diagnostics module');
assert.match(uiBridgeSource, /buildNonPrimitiveSourceToolsDiagnosticsSnapshot/, 'source-tools UI delegates snapshot construction to pure module');
assert.match(uiBridgeSource, /sourceToolsDiagnosticsFileName/, 'source-tools UI delegates diagnostics filename generation to pure module');
assert.match(uiBridgeSource, /Copy diagnostics JSON/, 'source-tools UI exposes diagnostics copy action');
assert.match(uiBridgeSource, /Download diagnostics JSON/, 'source-tools UI exposes diagnostics download action');
assert.match(uiBridgeSource, /JSON\.stringify\(buildSourceToolsDiagnosticsSnapshot\(viewer, context\), null, 2\)/, 'copy action uses the canonical diagnostics snapshot JSON');
assert.match(uiBridgeSource, /navigator\?\.clipboard\?\.writeText/, 'copy action uses Clipboard API when available');
assert.match(uiBridgeSource, /document\.execCommand\?\.\('copy'\)/, 'copy action keeps a DOM fallback');
assert.match(uiBridgeSource, /new BlobCtor\(\[text\], \{ type: 'application\/json' \}\)/, 'download action exports JSON as a Blob');
assert.doesNotMatch(uiBridgeSource, /Support Summary|SupportATT|SupportEngine|rvm_support_render_mode_v1|rvm_support_geometry_mode_v1/, 'diagnostics export does not revive retired RVM support UI or settings');

assert.match(workflowSource, /nonprimitive-source-tools-diagnostics-export\.test\.js/, 'CI runs the diagnostics export contract');
assert.match(workflowSource, /nonprimitive-source-tools-diagnostics-module\.test\.js/, 'CI runs the diagnostics module behavior contract');

console.log('nonprimitive-source-tools-diagnostics-export passed');
