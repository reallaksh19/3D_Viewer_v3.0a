import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let passed = 0;
let failed = 0;
function check(condition, label) {
  if (condition) { console.log(`PASS: ${label}`); passed += 1; }
  else { console.error(`FAIL: ${label}`); failed += 1; }
}
function read(relPath) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const full = path.resolve(here, '..', relPath);
  check(fs.existsSync(full), `${relPath} exists`);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
}
function contains(text, token, label) {
  check(text.includes(token), label || `contains ${token}`);
}
function notContains(text, token, label) {
  check(!text.includes(token), label || `does not contain ${token}`);
}

const certification = read('geometry-workspace/SUPPORT_LOAD_TRACK_CERTIFICATION.md');
contains(certification, 'pipe.attributes.supportLoadInput', 'certification documents pipe input source of truth');
contains(certification, 'calculatedFields.supportLoads', 'certification documents calculated support load result location');
contains(certification, 'No master lookup inside the formula engine.', 'certification blocks formula-engine master lookup');
contains(certification, 'RVM support-runtime cleanup and non-primitive overlay work are separate tracks', 'certification separates RVM support cleanup track');

const inputModel = read('geometry-workspace/GeometrySupportLoadInputModel.js');
contains(inputModel, "PIPE_SUPPORT_LOAD_INPUT_SCHEMA = 'support-load-input/v1'", 'input model writes pipe-level support-load input schema');
contains(inputModel, 'PROJECT_MASTER_TABLE', 'input model can audit controlled project master table usage');
contains(inputModel, 'DERIVED_PIPE_WEIGHT', 'input model audits deterministic pipe-weight derivation');
contains(inputModel, 'DERIVED_FLUID_WEIGHT', 'input model audits deterministic fluid-weight derivation');
contains(inputModel, 'supportLoadInputRef', 'input model keeps supports as input references');
contains(inputModel, 'autoSpanBySupport', 'input model stores support-specific AutoSpan data on pipe input');

const review = read('geometry-workspace/GeometrySupportLoadInputReview.js');
contains(review, "SUPPORT_LOAD_INPUT_REVIEW_SCHEMA='support-load-input-review/v1'", 'input review schema exists');
contains(review, 'lockedForCalculation', 'input review controls calculation lock state');
contains(review, 'calculationGateStatus', 'input review exposes calculation gate status');

const overrides = read('geometry-workspace/GeometrySupportLoadInputOverrides.js');
contains(overrides, "SUPPORT_LOAD_INPUT_OVERRIDE_SCHEMA = 'support-load-input-override/v1'", 'input override schema exists');
contains(overrides, "spans.autoSpanMm", 'override editor includes AutoSpan input field');
contains(overrides, "spans.depSpanMm", 'override editor includes DEPSpan input field');

const master = read('geometry-workspace/GeometrySupportLoadMasterData.js');
contains(master, "SUPPORT_LOAD_MASTER_DATA_SCHEMA = 'support-load-master-data/v1'", 'master-data schema exists');
contains(master, 'noSilentTopUp: true', 'master-data policy blocks silent top-up');
contains(master, 'noFormulaExecution: true', 'master-data policy blocks formula execution');
contains(master, 'supportLoadMasterData', 'master-data package is named explicitly');

const autoSpan = read('geometry-workspace/GeometrySupportLoadAutoSpanResolver.js');
contains(autoSpan, 'support-load-autospan-resolver/v1', 'AutoSpan resolver schema exists');
contains(autoSpan, 'AUTO_RESOLVED_SUPPORT_GRAPH', 'AutoSpan resolver audits graph-derived spans');
contains(autoSpan, 'REVIEW_REQUIRED_NO_NEIGHBOR_SUPPORTS', 'AutoSpan resolver blocks incomplete support graphs for review');

const conflicts = read('geometry-workspace/GeometrySupportLoadConflictResolver.js');
contains(conflicts, 'support-load-enrichment-conflict/v1', 'conflict resolver schema exists');
contains(conflicts, 'REVIEW_REQUIRED', 'conflict resolver marks source conflicts for review');

const formula = read('geometry-workspace/GeometrySupportLoadFormulaEngine.js');
contains(formula, "SUPPORT_LOAD_FORMULA_SCHEMA = 'support-load-formula-results/v1'", 'formula result schema exists');
contains(formula, 'Calculation reads only locked pipe.attributes.supportLoadInput packages.', 'formula info states locked-input-only calculation');
contains(formula, 'inputMutation: \'FORBIDDEN\'', 'formula writeback audit forbids input mutation');
contains(formula, "allowedCalculatedFields: ['calculatedFields.supportLoads', 'calculatedFields.supportLoadReference']", 'formula writeback is restricted to calculated fields');
notContains(formula, 'GeometrySupportLoadMasterData', 'formula engine does not import/use master-data manager');
notContains(formula, 'RvmNonPrimitiveSupportOverlay', 'formula engine is independent from RVM overlay/support-runtime work');

const advancedProfiles = read('geometry-workspace/GeometrySupportLoadAdvancedProfiles.js');
contains(advancedProfiles, 'support-load-advanced-profile/v1', 'advanced profile registry schema exists');
contains(advancedProfiles, 'ACCESS_TEMP_WALL_WEIGHTED_V1', 'Access profile remains available');
contains(advancedProfiles, 'DISABLED_ADVANCED_PROFILES', 'future profiles remain disabled unless project/imported data exists');
contains(advancedProfiles, 'DISABLED_REQUIRES_PROJECT_RULES', 'thermal/friction/axial profile remains disabled until project rules exist');

const report = read('geometry-workspace/GeometrySupportLoadReportExporter.js');
contains(report, 'support-load-report/v1', 'report schema exists');
contains(report, 'supportLoadInput', 'report consumes input package');
contains(report, 'calculatedFields', 'report consumes calculated fields');

const stagedJson = read('geometry-workspace/GeometryEnrichedStagedJsonExporter.js');
contains(stagedJson, 'geometry-enriched-stagedjson/v2', 'enriched stagedJSON v2 export exists');
contains(stagedJson, 'supportLoadInput', 'stagedJSON exports input package');
contains(stagedJson, 'supportLoads', 'stagedJSON exports calculated support loads');

const bulkPackage = read('geometry-workspace/GeometrySupportLoadBulkPackageExporter.js');
contains(bulkPackage, 'support-load-bulk-package/v1', 'bulk package schema exists');
contains(bulkPackage, 'masterData', 'bulk package includes master-data export');
contains(bulkPackage, 'conflictModel', 'bulk package includes conflict audit export');
contains(bulkPackage, 'packageDoesNotTopUpMissingFields: true', 'bulk package cannot top-up missing fields');

const qa = read('geometry-workspace/GeometrySupportLoadQaDashboard.js');
contains(qa, 'support-load-qa-dashboard/v1', 'QA dashboard schema exists');
contains(qa, 'blocked', 'QA dashboard tracks blocked rows');
contains(qa, 'calculated', 'QA dashboard tracks calculated rows');

const overlayModel = read('geometry-workspace/GeometrySupportLoadCanvasOverlayModel.js');
contains(overlayModel, 'support-load-canvas-overlay/v1', 'support-load canvas overlay schema exists');
contains(overlayModel, 'calculatedFields.supportLoadReference', 'support-load overlay model consumes calculated support references');
const overlayBridge = read('geometry-workspace/GeometrySupportLoadCanvasOverlayBridge.js');
contains(overlayBridge, 'supportLoadCanvasOverlay', 'support-load overlay bridge writes only overlay metadata');
notContains(overlayBridge, 'RvmSupportSymbols', 'support-load overlay does not use retired RVM support symbols');

const workflow = read('../.github/workflows/rvm-pcf-ci.yml');
contains(workflow, 'Verify support-load formula engine', 'CI runs formula-engine regression');
contains(workflow, 'Verify support-load advanced profiles', 'CI runs advanced-profile regression');
contains(workflow, 'Verify support-load track certification', 'CI runs track certification regression');
contains(workflow, 'Verify support-load Access benchmark', 'CI runs Access benchmark regression');

if (failed) {
  console.error(`FAILED ${failed} checks, passed ${passed}`);
  process.exit(1);
}
console.log(`All support-load track certification checks passed (${passed}).`);
