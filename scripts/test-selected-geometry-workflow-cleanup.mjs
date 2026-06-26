import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..');
const appSource = fs.readFileSync(path.join(repoRoot, 'viewer/core/app.js'), 'utf8');
const packageSource = fs.readFileSync(path.join(repoRoot, 'viewer/enrichment/selected-geometry-package.js'), 'utf8');

assert.ok(appSource.includes('LEGACY_GEOMETRY_WORKFLOW_FLAG'), 'legacy geometry workflow buttons must be behind an explicit flag');
assert.ok(appSource.includes('shouldInstallLegacyGeometryWorkflowButtons'), 'app startup must guard legacy geometry workflow installers');
assert.ok(appSource.includes('installLegacyGeometryWorkflowBridges'), 'legacy bridge installer must be isolated');
assert.ok(appSource.includes('Promise.allSettled'), 'legacy bridge loading must not break default startup');
assert.ok(appSource.includes('rvm.enableLegacyGeometryWorkflowButtons'), 'legacy enablement key must be documented in source');

for (const token of [
  'installGeometryExportWorkspaceBridge();',
  'installGeometryMappingProfileBridge();',
  'installGeometryCalculationCanvasBridge();',
  'installGeometryCalculationInputBridge();',
  'installGeometryEnrichedStagedJsonBridge();',
  'installGeometrySupportLoadMasterDataBridge();',
  'installGeometrySupportLoadInputBridge();',
  'installGeometrySupportLoadFormulaBridge();',
  'installGeometrySupportLoadReportBridge();',
  'installGeometrySupportLoadConflictBridge();',
  'installGeometrySupportLoadQaDashboardBridge();',
  'installGeometrySupportLoadBulkPackageBridge();',
  'installGeometrySupportLoadCanvasOverlayBridge();',
]) {
  assert.ok(!appSource.includes(`\n${token}`), `${token} must not run as a default top-ribbon installer`);
}

assert.ok(packageSource.includes('CALCULATION_PAYLOAD_KEYS'), 'selected geometry export must explicitly strip calculation payloads');
assert.ok(packageSource.includes("'calculatedFields'"), 'selected geometry export must strip calculatedFields');
assert.ok(packageSource.includes("'supportLoadInput'"), 'selected geometry export must strip support-load inputs from DB package');
assert.ok(packageSource.includes("'supportLoadReport'"), 'selected geometry export must strip support-load reports from DB package');
assert.ok(packageSource.includes('sanitizeDbOnlyGeometryObject'), 'selected geometry export must sanitize objects before serialization');

console.log('selected geometry workflow cleanup tests passed');
