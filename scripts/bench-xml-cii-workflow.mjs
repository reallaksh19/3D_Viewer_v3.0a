#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Quantitative XML->CII workflow benchmark.
 * Inputs: real XML/staged JSON files, app URL, run count, optional baseline.
 * Outputs: JSON benchmark rows and optional baseline/candidate comparison.
 * Fallback: selector overrides can be supplied when the UI shell changes.
 */

const DEFAULT_URL = 'http://localhost:3000/viewer/index.html';
const DEFAULT_OUT = 'artifacts/bench/xml-cii-workflow-result.json';

function argValue(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1 || index + 1 >= args.length) return fallback;
  return args[index + 1];
}

function hasArg(args, name) {
  return args.includes(name);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value || '').digest('hex');
}

function percentile(values, pct) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1));
  return sorted[index];
}

function median(values) {
  return percentile(values, 50);
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  ensureParent(filePath);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function groupDurations(result) {
  const grouped = new Map();
  for (const row of result.metrics || []) {
    if (!Number.isFinite(row.duration_ms)) continue;
    if (!grouped.has(row.step)) grouped.set(row.step, []);
    grouped.get(row.step).push(row.duration_ms);
  }
  return grouped;
}

function compareResults(baseline, candidate) {
  const baseGroups = groupDurations(baseline);
  const candidateGroups = groupDurations(candidate);
  const rows = [];
  for (const step of new Set([...baseGroups.keys(), ...candidateGroups.keys()])) {
    const base = baseGroups.get(step) || [];
    const cand = candidateGroups.get(step) || [];
    const baseMedian = median(base);
    const candMedian = median(cand);
    const ratio = baseMedian && candMedian ? candMedian / baseMedian : null;
    rows.push({
      step,
      baseline_median_ms: baseMedian,
      candidate_median_ms: candMedian,
      baseline_p95_ms: percentile(base, 95),
      candidate_p95_ms: percentile(cand, 95),
      median_ratio: ratio,
      pass: ratio === null ? false : ratio <= 1.10,
    });
  }

  const baseHashes = baseline.output_hashes || {};
  const candidateHashes = candidate.output_hashes || {};
  const hashRows = [];
  for (const name of new Set([...Object.keys(baseHashes), ...Object.keys(candidateHashes)])) {
    hashRows.push({
      output: name,
      baseline_hash: baseHashes[name] || '',
      candidate_hash: candidateHashes[name] || '',
      pass: !!baseHashes[name] && baseHashes[name] === candidateHashes[name],
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    baseline: baseline.commit_sha || baseline.dataset_id || '',
    candidate: candidate.commit_sha || candidate.dataset_id || '',
    timing: rows,
    outputParity: hashRows,
    pass: rows.every((row) => row.pass) && hashRows.every((row) => row.pass)
      && (candidate.console_error_count || 0) === 0
      && (candidate.duplicate_overlay_count || 0) === 0
      && (candidate.blank_panel_count || 0) === 0,
  };
}

function markdownCompare(report) {
  const lines = ['# XML->CII Workflow Benchmark Compare', '', `Overall: ${report.pass ? 'PASS' : 'FAIL'}`, '', '## Timing', '', '| Step | Baseline median ms | Candidate median ms | Ratio | Pass |', '|---|---:|---:|---:|---|'];
  for (const row of report.timing) {
    lines.push(`| ${row.step} | ${row.baseline_median_ms ?? ''} | ${row.candidate_median_ms ?? ''} | ${row.median_ratio == null ? '' : row.median_ratio.toFixed(3)} | ${row.pass ? 'PASS' : 'FAIL'} |`);
  }
  lines.push('', '## Output Parity', '', '| Output | Pass | Baseline hash | Candidate hash |', '|---|---|---|---|');
  for (const row of report.outputParity) {
    lines.push(`| ${row.output} | ${row.pass ? 'PASS' : 'FAIL'} | ${row.baseline_hash} | ${row.candidate_hash} |`);
  }
  return `${lines.join('\n')}\n`;
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch (error) {
    throw new Error(`Playwright is required for browser benchmarking. Install project dependencies first. ${error?.message || error}`);
  }
}

async function timeStep(metrics, runId, step, fn) {
  const started = performance.now();
  const value = await fn();
  const duration = performance.now() - started;
  metrics.push({ run_id: runId, step, duration_ms: Math.round(duration * 1000) / 1000 });
  return value;
}

async function clickTab(page, tabId) {
  await page.locator(`[data-modal-tab="${tabId}"]`).click({ timeout: 15000 });
  await page.locator('[data-xml-cii-workflow-body]').waitFor({ timeout: 15000 });
}

async function collectDownloads(page, action) {
  const downloads = [];
  page.on('download', (download) => downloads.push(download));
  await action();
  await page.waitForTimeout(500);
  const hashes = {};
  for (const download of downloads) {
    const filePath = await download.path().catch(() => '');
    if (!filePath) continue;
    const name = download.suggestedFilename();
    hashes[name] = sha256(fs.readFileSync(filePath));
  }
  return hashes;
}

async function runBrowserBenchmark(options) {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: options.headless });
  const page = await browser.newPage();
  const metrics = [];
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  const outputHashes = {};
  for (let runId = 0; runId < options.runs + options.warmups; runId += 1) {
    const measuredRunId = runId - options.warmups;
    const record = measuredRunId >= 0;
    const runMetrics = record ? metrics : [];
    await timeStep(runMetrics, measuredRunId, 'app_load', async () => {
      await page.goto(options.url, { waitUntil: 'domcontentloaded' });
      await page.locator(options.selectors.root).waitFor({ timeout: 30000 });
    });
    await timeStep(runMetrics, measuredRunId, 'select_xml_to_cii', async () => {
      await page.locator(options.selectors.converterSelect).selectOption('xml_to_cii');
    });
    if (options.xmlPath) await page.locator(options.selectors.primaryInput).setInputFiles(options.xmlPath);
    if (options.stagedPath) await page.locator(options.selectors.secondaryInput).setInputFiles(options.stagedPath);
    await timeStep(runMetrics, measuredRunId, 'open_workflow_popup', async () => {
      await page.locator(options.selectors.workflowButton).first().click();
      await page.locator('[data-xml-cii-workflow-body]').waitFor({ timeout: 30000 });
    });
    for (const tab of ['regex', 'import-masters', 'json-trace', 'preview', 'diagnostics', 'weight-match', 'support-mapper', 'config']) {
      await timeStep(runMetrics, measuredRunId, `switch_${tab}`, async () => clickTab(page, tab));
    }
    await timeStep(runMetrics, measuredRunId, 'build_preview', async () => {
      await clickTab(page, 'preview');
      const button = page.locator('[data-mc-preview-build], [data-native-build-preview]').first();
      if (await button.count()) await button.click({ timeout: 15000 });
      await page.waitForTimeout(500);
    });
    await timeStep(runMetrics, measuredRunId, 'run_diagnostics', async () => {
      await clickTab(page, 'diagnostics');
      const button = page.locator('#mc-diag-dry-run-btn, [data-native-dry-run]').first();
      if (await button.count()) await button.click({ timeout: 15000 });
      await page.waitForTimeout(500);
    });
    await timeStep(runMetrics, measuredRunId, 'compute_weight_match', async () => {
      await clickTab(page, 'weight-match');
      const button = page.locator('[data-native-compute-weights], #mc-weight-build-btn').first();
      if (await button.count()) await button.click({ timeout: 15000 });
      await page.waitForTimeout(500);
    });
    if (record && options.finalRun) {
      Object.assign(outputHashes, await collectDownloads(page, async () => {
        await timeStep(runMetrics, measuredRunId, 'finalize_run', async () => {
          await clickTab(page, 'run');
          const button = page.locator('[data-native-finalise-run], [data-xml-cii-finalize-run]').first();
          if (await button.count()) await button.click({ timeout: 15000 });
          await page.waitForTimeout(1500);
        });
      }));
    }
  }

  const overlayCount = await page.locator('.model-converters-workflow-popup-overlay').count().catch(() => 0);
  const blankPanelCount = await page.locator('[data-xml-cii-workflow-body]').evaluateAll((nodes) => nodes.filter((node) => !(node.textContent || '').trim()).length).catch(() => 0);
  const heapMb = await page.evaluate(() => performance?.memory?.usedJSHeapSize ? performance.memory.usedJSHeapSize / 1024 / 1024 : null).catch(() => null);
  await browser.close();

  return {
    generatedAt: new Date().toISOString(),
    dataset_id: options.datasetId,
    commit_sha: options.commitSha,
    url: options.url,
    runs: options.runs,
    warmups: options.warmups,
    metrics,
    output_hashes: outputHashes,
    console_error_count: consoleErrors.length,
    console_errors: consoleErrors,
    duplicate_overlay_count: Math.max(0, overlayCount - 1),
    blank_panel_count: blankPanelCount,
    heap_mb: heapMb,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (hasArg(args, '--compare')) {
    const index = args.indexOf('--compare');
    const baselinePath = args[index + 1];
    const candidatePath = args[index + 2];
    const outPath = argValue(args, '--out', 'artifacts/bench/xml-cii-workflow-compare.md');
    if (!baselinePath || !candidatePath) throw new Error('Usage: --compare baseline.json candidate.json [--out compare.md]');
    const report = compareResults(readJson(baselinePath), readJson(candidatePath));
    ensureParent(outPath);
    fs.writeFileSync(outPath, markdownCompare(report));
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const options = {
    url: argValue(args, '--url', DEFAULT_URL),
    xmlPath: argValue(args, '--xml', ''),
    stagedPath: argValue(args, '--staged-json', ''),
    datasetId: argValue(args, '--dataset-id', 'local-real-data'),
    commitSha: argValue(args, '--commit-sha', ''),
    runs: Number(argValue(args, '--runs', '5')),
    warmups: Number(argValue(args, '--warmups', '1')),
    outPath: argValue(args, '--out', DEFAULT_OUT),
    finalRun: hasArg(args, '--final-run'),
    headless: !hasArg(args, '--headed'),
    selectors: {
      root: argValue(args, '--root-selector', '.model-converters-root'),
      converterSelect: argValue(args, '--converter-selector', '#model-converters-select'),
      primaryInput: argValue(args, '--primary-selector', '#model-converters-primary-input'),
      secondaryInput: argValue(args, '--secondary-selector', '#model-converters-secondary-input'),
      workflowButton: argValue(args, '--workflow-button-selector', '#model-converters-xml-cii-workflow-btn,[data-xml-cii-unified-workflow-launcher="true"]'),
    },
  };

  const result = await runBrowserBenchmark(options);
  writeJson(options.outPath, result);
  console.log(`Wrote XML->CII benchmark: ${options.outPath}`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
