import { decodeTextUtf8, encodeTextUtf8, baseNameWithoutExtension } from '../core/output-utils.js';
import { collectXmlCiiZeroRigidWeightIssues, applyXmlCiiRigidWeightOverrides } from '../../../converters/xml-cii2019-core/weight-match-model.js?v=20260626-weight-review-2';
import { applyXmlCiiFlangeWeightFallbackToIssues } from '../../../converters/xml-cii2019-core/flange-weight-fallback.js?v=20260620-flange-fallback-1';
import { applyXmlCiiAutoRigidWeightsFromIssues } from '../../../converters/xml-cii2019-core/rigid-weight-auto-apply.js?v=20260625-length-auto-weight-1';
import { applyXmlCiiStagedGeometryAuthority } from '../../../converters/xml-cii2019-core/staged-geometry-authority.js?v=20260625-length-auto-weight-1';
import { buildXmlCiiNodeResolverIndex } from '../../../converters/xml-cii2019-core/sideload-resolver.js';
import { resolveManualRestraintRows } from '../../../converters/xml-cii2019-core/sideload-restraints.js';
import { mergeXmlCiiMatchedFacts, matchedFactsFromEnrichmentDiagnostics } from '../../../converters/xml-cii2019-core/sideload-ledger.js';
import { applyManualMatchedFactsToEnrichedXml } from '../../../converters/xml-cii2019-core/sideload-apply.js';
import { enrichXmlForCii2019 } from './xmltocii2019_helper/enrichment-run-parity.js?v=20260623-preview-run-parity-2';

const XML_CII_STAGE_TIMEOUT_MS = 120000;
const MATCHED_PREVIEW_STORAGE_KEY = 'xmlCii2019.matchedPreview.lastDiagnostics.v1';
const MATCHED_PREVIEW_EVENT = 'xml-cii-matched-preview:diagnostics';

function timeoutMessage(stage, timeoutMs) {
  return `XML->CII(2019) timed out during ${stage} after ${Math.round(timeoutMs / 1000)}s. Check network access to Pyodide/CDN and converter script loading.`;
}
function withTimeout(promise, stage, timeoutMs = XML_CII_STAGE_TIMEOUT_MS) {
  let timeoutId = null;
  const timeout = new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error(timeoutMessage(stage, timeoutMs))), timeoutMs); });
  return Promise.race([promise, timeout]).finally(() => { if (timeoutId) clearTimeout(timeoutId); });
}
function publishMatchedPreviewDiagnostics(payload) {
  if (typeof window === 'undefined' || !payload || typeof payload !== 'object') return;
  const eventPayload = { ...payload, source: payload.source || 'latest-run' };
  try { window.localStorage?.setItem(MATCHED_PREVIEW_STORAGE_KEY, JSON.stringify(eventPayload)); } catch {}
  try { window.dispatchEvent(new CustomEvent(MATCHED_PREVIEW_EVENT, { detail: eventPayload })); } catch {}
}
function parseSupportConfig(options = {}) { try { const parsed = JSON.parse(options.supportConfigJson || '{}'); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }
function text(value) { return value === undefined || value === null ? '' : String(value).trim(); }
function mergeRuntimeOverridesIntoConfig(targetConfig, sourceConfig) {
  const target = targetConfig && typeof targetConfig === 'object' && !Array.isArray(targetConfig) ? targetConfig : {};
  const source = sourceConfig && typeof sourceConfig === 'object' && !Array.isArray(sourceConfig) ? sourceConfig : {};
  const sourceOverrides = source.overrides && typeof source.overrides === 'object' && !Array.isArray(source.overrides) ? source.overrides : {};
  if (Object.keys(sourceOverrides).length) {
    target.overrides = target.overrides && typeof target.overrides === 'object' && !Array.isArray(target.overrides) ? { ...target.overrides } : {};
    for (const [bucketName, bucketValue] of Object.entries(sourceOverrides)) {
      if (bucketValue && typeof bucketValue === 'object' && !Array.isArray(bucketValue)) target.overrides[bucketName] = { ...(target.overrides[bucketName] || {}), ...bucketValue };
      else if (text(bucketValue)) target.overrides[bucketName] = bucketValue;
    }
  }
  if (text(source?.rating?.defaultRating)) target.rating = { ...(target.rating || {}), defaultRating: text(source.rating.defaultRating) };
  return target;
}
function optionText(options, supportConfig, ...keys) {
  for (const key of keys) { const value = options?.[key]; if (value !== undefined && value !== null && String(value).trim()) return String(value); }
  const sideload = supportConfig?.sideload && typeof supportConfig.sideload === 'object' ? supportConfig.sideload : {};
  for (const key of keys) { const value = sideload?.[key]; if (value !== undefined && value !== null && String(value).trim()) return String(value); }
  return '';
}
function optionNumber(options, supportConfig, fallback, ...keys) {
  const sideload = supportConfig?.sideload && typeof supportConfig.sideload === 'object' ? supportConfig.sideload : {};
  for (const source of [options || {}, sideload]) for (const key of keys) { const numeric = Number(source?.[key]); if (Number.isFinite(numeric)) return numeric; }
  return fallback;
}
function optionPolicy(options, supportConfig) { return options.sideloadPolicy || supportConfig?.sideload?.policy || 'ADD_IF_MISSING'; }
function sideloadDiagnosticRows(facts = [], type) { return facts.map((fact) => ({ type, nodeNumber: fact.resolvedNodeNumber || '', method: fact.basis || '', kind: fact.value || '', message: fact.meta?.rawLine || fact.key || fact.status || '', source: fact.source || '', status: fact.status || '' })); }
function ensureEnrichedPreviewLedger(enriched) {
  if (!enriched || typeof enriched !== 'object') return { matchedFacts: [], rejectedFacts: [] };
  if (!Array.isArray(enriched.matchedFacts) || !enriched.matchedFacts.length) enriched.matchedFacts = matchedFactsFromEnrichmentDiagnostics(enriched.diagnostics || []);
  if (!Array.isArray(enriched.rejectedFacts)) enriched.rejectedFacts = [];
  if (!enriched.stats || typeof enriched.stats !== 'object') enriched.stats = {};
  enriched.stats.previewMatchedFacts = enriched.matchedFacts.length;
  enriched.stats.previewRejectedFacts = enriched.rejectedFacts.length;
  return { matchedFacts: enriched.matchedFacts, rejectedFacts: enriched.rejectedFacts };
}
function applyOptionalManualSideload(enriched, runValues) {
  const supportConfig = parseSupportConfig(runValues);
  const sideloadText = optionText(runValues, supportConfig, 'sideloadRestraintsText', 'xmlCiiSideloadRestraintsText', 'restraintsText');
  ensureEnrichedPreviewLedger(enriched);
  if (!sideloadText.trim()) return { applied: false, stdout: [] };
  const exactToleranceMm = optionNumber(runValues, supportConfig, 1, 'sideloadPosExactToleranceMm', 'posExactToleranceMm');
  const nearestToleranceMm = optionNumber(runValues, supportConfig, 5, 'sideloadPosToleranceMm', 'posToleranceMm');
  const policy = optionPolicy(runValues, supportConfig);
  const resolverIndex = buildXmlCiiNodeResolverIndex(enriched.xmlText, { exactToleranceMm });
  const manual = resolveManualRestraintRows(sideloadText, resolverIndex, { exactToleranceMm, nearestToleranceMm });
  const previewFacts = enriched.matchedFacts || [];
  const merged = mergeXmlCiiMatchedFacts(previewFacts, manual.matchedFacts, { policy });
  const applied = applyManualMatchedFactsToEnrichedXml(enriched.xmlText, merged.matchedFacts, enriched.config, { policy });
  enriched.xmlText = applied.xmlText;
  enriched.matchedFacts = merged.matchedFacts;
  enriched.rejectedFacts = [...(enriched.rejectedFacts || []), ...manual.rejectedFacts, ...merged.rejectedFacts, ...applied.rejectedFacts];
  enriched.stats.manualSideloadRows = manual.rows.length;
  enriched.stats.manualSideloadMatched = manual.matchedFacts.length;
  enriched.stats.manualSideloadRejected = manual.rejectedFacts.length + merged.rejectedFacts.length + applied.rejectedFacts.length;
  enriched.stats.manualSideloadApplied = applied.stats.appliedManualRestraints;
  enriched.stats.normalizedRestraints = (enriched.stats.normalizedRestraints || 0) + applied.stats.appliedManualRestraints;
  enriched.stats.previewMatchedFacts = enriched.matchedFacts.length;
  enriched.stats.previewRejectedFacts = enriched.rejectedFacts.length;
  enriched.diagnostics.push({ type: 'sideload-restraint-summary', rows: manual.rows.length, matched: manual.matchedFacts.length, applied: applied.stats.appliedManualRestraints, rejected: enriched.stats.manualSideloadRejected, policy, exactToleranceMm, nearestToleranceMm });
  enriched.diagnostics.push(...sideloadDiagnosticRows(manual.rejectedFacts, 'sideload-restraint-rejected'));
  enriched.diagnostics.push(...sideloadDiagnosticRows(merged.rejectedFacts, 'sideload-restraint-skipped'));
  enriched.diagnostics.push(...sideloadDiagnosticRows(applied.appliedFacts, 'sideload-restraint-applied'));
  enriched.diagnostics.push(...sideloadDiagnosticRows(applied.rejectedFacts, 'sideload-restraint-apply-skipped'));
  return { applied: true, stdout: [`Manual side-load restraints parsed: ${manual.rows.length}.`, `Manual side-load restraints matched: ${manual.matchedFacts.length}.`, `Manual side-load restraints applied: ${applied.stats.appliedManualRestraints}.`, `Manual side-load restraints rejected/skipped: ${enriched.stats.manualSideloadRejected}.`] };
}
function xmlLocalName(node) { return text(node?.localName || node?.nodeName).replace(/^.*:/, ''); }
function xmlChildrenByName(parent, name) { return [...(parent?.childNodes || [])].filter((node) => node.nodeType === 1 && xmlLocalName(node) === name); }
function xmlFirstChild(parent, name) { return xmlChildrenByName(parent, name)[0] || null; }
function xmlChildText(parent, name) { return text(xmlFirstChild(parent, name)?.textContent); }
function xmlElementTextMap(parent) { const out = {}; for (const child of [...(parent?.childNodes || [])]) if (child.nodeType === 1) out[xmlLocalName(child)] = text(child.textContent); return out; }
function xmlNodeRecord(node) {
  return { nodeNumber: xmlChildText(node, 'NodeNumber'), nodeName: xmlChildText(node, 'NodeName'), endpoint: xmlChildText(node, 'Endpoint'), rigid: xmlChildText(node, 'Rigid'), componentType: xmlChildText(node, 'ComponentType'), connectionType: xmlChildText(node, 'ConnectionType'), weight: xmlChildText(node, 'Weight'), componentRefNo: xmlChildText(node, 'ComponentRefNo'), outsideDiameter: xmlChildText(node, 'OutsideDiameter'), wallThickness: xmlChildText(node, 'WallThickness'), corrosionAllowance: xmlChildText(node, 'CorrosionAllowance'), insulationThickness: xmlChildText(node, 'InsulationThickness'), position: xmlChildText(node, 'Position'), bendRadius: xmlChildText(node, 'BendRadius'), sif: xmlChildText(node, 'SIF'), pipingClass: xmlChildText(node, 'PipingClass'), rating: xmlChildText(node, 'Rating'), boreMm: xmlChildText(node, 'BoreMm'), materialName: xmlChildText(node, 'MaterialName'), materialCode: xmlChildText(node, 'MaterialCode'), elementLengthMm: xmlChildText(node, 'ElementLengthMm'), dtxrPs: xmlChildText(node, 'DTXR_PS'), dtxrPos: xmlChildText(node, 'DTXR_POS') };
}
function buildEnrichedStageJson(xmlText, meta = {}) {
  const payload = { schema: 'xml-cii2019-enriched-stage/v1', profile: 'XML_CII_2019_RICH_WORKFLOW', converter: 'XML->CII(2019)', generatedAt: new Date().toISOString(), source: meta.inputName || '', enrichedXml: meta.enrichedName || '', units: { length: 'mm', pressure: 'pascal', temperature: 'degC', density: 'kg/m3' }, stats: meta.stats || {}, diagnosticsName: meta.diagnosticsName || '', branches: [] };
  if (typeof DOMParser === 'undefined') return payload;
  let document = null;
  try { document = new DOMParser().parseFromString(text(xmlText), 'application/xml'); if (document.getElementsByTagName('parsererror').length) return payload; } catch { return payload; }
  for (const branch of [...document.getElementsByTagName('Branch')]) payload.branches.push({ branchName: xmlChildText(branch, 'Branchname'), pipelineReference: xmlChildText(branch, 'PipelineReference'), lineNo: xmlChildText(branch, 'LineNo'), pressure: xmlElementTextMap(xmlFirstChild(branch, 'Pressure')), temperature: xmlElementTextMap(xmlFirstChild(branch, 'Temperature')), materialNumber: xmlChildText(branch, 'MaterialNumber'), insulationDensity: xmlChildText(branch, 'InsulationDensity'), fluidDensity: xmlChildText(branch, 'FluidDensity'), nodes: xmlChildrenByName(branch, 'Node').map(xmlNodeRecord) });
  payload.stats = { ...payload.stats, enrichedStageBranches: payload.branches.length, enrichedStageNodes: payload.branches.reduce((sum, branch) => sum + branch.nodes.length, 0) };
  return payload;
}
function applyStagedGeometryAuthorityToEnriched(enriched, stagedJsonText) {
  const result = applyXmlCiiStagedGeometryAuthority(enriched.xmlText, stagedJsonText, { config: enriched.config });
  enriched.xmlText = result.xmlText;
  enriched.stats = { ...(enriched.stats || {}), ...(result.stats || {}) };
  enriched.diagnostics = Array.isArray(enriched.diagnostics) ? enriched.diagnostics : [];
  enriched.diagnostics.push(...(result.diagnostics || []));
  if ((result.stats?.stagedGeometryMatches || 0) > 0) enriched.diagnostics.push({ type: 'staged-geometry-authority-summary', matched: result.stats.stagedGeometryMatches, lengthAnnotations: result.stats.stagedLengthAnnotations, boreAnnotations: result.stats.stagedBoreAnnotations, message: 'ElementLengthMm and BoreMm corrected from exact staged ComponentRefNo geometry before weight review and Python CII conversion.' });
  return enriched;
}

export async function run(context) {
  const primary = context.inputFiles.find(f => f.role === 'primary');
  if (!primary || !primary.bytes) throw new Error('Primary XML input is required for XML->CII(2019).');
  const secondary = context.inputFiles.find(f => f.role === 'secondary');
  const secondaryBytes = secondary ? secondary.bytes : null;
  const originalXmlText = decodeTextUtf8(primary.bytes);
  const stagedJsonText = secondaryBytes ? decodeTextUtf8(secondaryBytes) : '';
  const runValues = context.options || {};
  const stem = baseNameWithoutExtension(primary.name);
  if (runValues.createEnrichedXml === false) {
    if (!context.workerRunner) throw new Error('Python worker runtime is not available.');
    context.setStatus?.('Starting Python worker...', 'running');
    const serializableOptions = Object.fromEntries(Object.entries(runValues).filter(([, v]) => typeof v !== 'function'));
    return await withTimeout(context.workerRunner.runJob({ converterId: context.converterId, inputFiles: context.inputFiles, options: serializableOptions }), 'Python worker conversion');
  }

  context.setStatus?.('Enriching XML before CII conversion...', 'running');
  const liveSupportConfig = parseSupportConfig(runValues);
  const enriched = await withTimeout(enrichXmlForCii2019(originalXmlText, stagedJsonText, runValues), 'browser-side XML enrichment');
  enriched.config = mergeRuntimeOverridesIntoConfig(enriched.config, liveSupportConfig);
  applyStagedGeometryAuthorityToEnriched(enriched, stagedJsonText);
  const rigidReviewLogLines = [];
  let rigidWeightIssues = applyXmlCiiFlangeWeightFallbackToIssues(collectXmlCiiZeroRigidWeightIssues(enriched.xmlText, stagedJsonText, enriched.config), enriched.config);
  const autoWeights = applyXmlCiiAutoRigidWeightsFromIssues(enriched.xmlText, rigidWeightIssues);
  if (autoWeights.appliedCount > 0) {
    enriched.xmlText = autoWeights.xmlText;
    enriched.stats.rigidWeightAutoApplied = (enriched.stats.rigidWeightAutoApplied || 0) + autoWeights.appliedCount;
    enriched.stats.weightAnnotations = (enriched.stats.weightAnnotations || 0) + autoWeights.appliedCount;
    enriched.diagnostics.push(...autoWeights.appliedRows);
    rigidWeightIssues = autoWeights.remainingIssues;
    rigidReviewLogLines.push(`Component zero-weight auto-applied: ${autoWeights.appliedCount} resolved component weight(s).`);
  }

  if (rigidWeightIssues.length > 0 && typeof runValues.openXmlCiiZeroRigidWeightPopup === 'function') {
    context.setStatus(`Review needed: ${rigidWeightIssues.length} component weight(s) are zero.`, 'running');
    let review = null;
    try { review = await withTimeout(runValues.openXmlCiiZeroRigidWeightPopup(rigidWeightIssues), 'rigid zero-weight review', 300000); } catch (error) { review = { cancelled: true, error }; }
    if (review?.cancelled) {
      rigidReviewLogLines.push(`Component zero-weight review dismissed: ${rigidWeightIssues.length} unresolved component(s) left unchanged.`);
      enriched.diagnostics.push({ type: 'component-zero-weight-review-dismissed', count: rigidWeightIssues.length, message: 'Review popup was dismissed; CII generation continued with zero weights unchanged.' });
    } else if (review?.skipped) {
      rigidReviewLogLines.push(`Component zero-weight review skipped: ${rigidWeightIssues.length} unresolved component(s) left unchanged.`);
      enriched.diagnostics.push({ type: 'component-zero-weight-review-skipped', count: rigidWeightIssues.length, message: 'User skipped component zero-weight review; CII generation continued with zero weights unchanged.' });
    } else {
      const applied = applyXmlCiiRigidWeightOverrides(enriched.xmlText, review?.weightsByKey || {});
      enriched.xmlText = applied.xmlText;
      enriched.stats.rigidWeightManualOverrides = applied.appliedCount;
      enriched.stats.weightAnnotations = (enriched.stats.weightAnnotations || 0) + applied.appliedCount;
      enriched.diagnostics.push(...applied.appliedRows);
      if (typeof runValues.saveXmlCiiRigidWeightOverrides === 'function') runValues.saveXmlCiiRigidWeightOverrides(review?.weightsByKey || {});
      rigidReviewLogLines.push(`Component zero-weight review applied: ${applied.appliedCount} manual component weight(s).`);
    }
  }

  ensureEnrichedPreviewLedger(enriched);
  const sideloadLogLines = applyOptionalManualSideload(enriched, runValues).stdout;
  const enrichedName = `${stem}_enriched.xml`;
  const enrichedStageName = `${stem}_enriched_staged.json`;
  if (!context.workerRunner) throw new Error('Python worker runtime is not available.');
  const serializableOptions = Object.fromEntries(Object.entries({ ...runValues, createEnrichedXml: false }).filter(([, v]) => typeof v !== 'function'));
  context.setStatus?.('Running CII conversion in Python worker...', 'running');
  const ciiResponse = await withTimeout(context.workerRunner.runJob({ converterId: context.converterId, inputFiles: [{ role: 'primary', name: enrichedName, bytes: encodeTextUtf8(enriched.xmlText) }], options: serializableOptions }), 'Python worker conversion');
  const ciiOutputs = Array.isArray(ciiResponse.outputs) ? ciiResponse.outputs : [];
  const stats = enriched.stats;
  const diagnostics = enriched.diagnostics;
  const diagnosticPayload = { generatedAt: new Date().toISOString(), source: 'latest-run', inputName: primary.name, enrichedName, enrichedStageName, diagnosticsName: `${stem}_enrichment_diagnostics.json`, stats, diagnostics, matchedFacts: enriched.matchedFacts || [], rejectedFacts: enriched.rejectedFacts || [] };
  const enrichedStageText = JSON.stringify(buildEnrichedStageJson(enriched.xmlText, diagnosticPayload), null, 2);
  const diagnosticText = JSON.stringify(diagnosticPayload, null, 2);
  publishMatchedPreviewDiagnostics(diagnosticPayload);
  const diagnosticRows = (Array.isArray(diagnostics) ? diagnostics : []).map((item) => ({ type: item?.type || '', nodeNumber: item?.nodeNumber || item?.keptNode || item?.removedNode || '', branchName: item?.branchName || '', pipingClass: item?.pipingClass || item?.resolvedPipingClass || '', rating: item?.rating || '', boreMm: item?.boreMm == null ? '' : Number(item.boreMm).toFixed ? Number(item.boreMm).toFixed(3) : item.boreMm, lengthMm: item?.lengthMm == null ? '' : Number(item.lengthMm).toFixed ? Number(item.lengthMm).toFixed(3) : item.lengthMm, weight: item?.weight ?? '', method: item?.method || item?.reason || item?.source || item?.status || '', kind: item?.kind || '', message: item?.message || item?.stagedName || item?.url || item?.reason || '' }));
  return {
    outputs: [{ name: enrichedName, text: enriched.xmlText, mime: 'text/xml;charset=utf-8' }, { name: enrichedStageName, text: enrichedStageText, mime: 'application/json;charset=utf-8' }, { name: `${stem}_enrichment_diagnostics.json`, text: diagnosticText, mime: 'application/json;charset=utf-8' }, ...ciiOutputs],
    logs: { stdout: ['Created enriched XML before XML->CII(2019).', `Created enriched staged JSON: ${enrichedStageName}.`, `DATUM duplicate support nodes removed: ${stats.removedDuplicateSupports}.`, `XML restraints normalized: ${stats.normalizedRestraints}.`, `Staged JSON support matches applied: ${stats.stagedSupportsMapped}.`, `DTXR_PS annotations: ${stats.dtxrPsAnnotations || 0}.`, `DTXR_POS annotations: ${stats.dtxrPosAnnotations || 0}.`, `Branch line keys annotated from Branchname: ${stats.branchLineKeys}.`, `Preview/run parity branches: ${stats.previewRunParityBranches || 0}; process fields: ${stats.previewRunParityProcessFields || 0}; node facts: ${stats.previewRunParityNodeFacts || 0}.`, `Staged geometry matches: ${stats.stagedGeometryMatches || 0}; lengths: ${stats.stagedLengthAnnotations || 0}; bores: ${stats.stagedBoreAnnotations || 0}.`, `Rating annotations: ${stats.ratingAnnotations}; weight annotations: ${stats.weightAnnotations}.`, `Matched enrichment preview facts: ${stats.previewMatchedFacts || 0}.`, `Rejected enrichment preview facts: ${stats.previewRejectedFacts || 0}.`, ...rigidReviewLogLines, ...sideloadLogLines, `Enrichment diagnostics written: ${stem}_enrichment_diagnostics.json`, ...(ciiResponse.logs?.stdout || [])], stderr: [...(ciiResponse.logs?.stderr || [])] },
    diagnosticsRows: diagnosticRows
  };
}
