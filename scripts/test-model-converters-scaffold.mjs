/**
 * test-model-converters-scaffold.mjs
 *
 * Phase 0 + Phase 1 baseline tests.
 *
 * Verifies:
 *   1. Required scaffold files exist and have the expected exports.
 *   2. Workflow phases have no duplicate IDs.
 *   3. "4A Weight Match" (weight-match) appears before "5 Run" (run).
 *   4. No "9 CII Support Mapping" phase exists.
 *   5. WorkflowShell phase-order assertion fires correctly.
 *   6. ConverterSelector helpers return correct values.
 *   7. ConverterRunner.runConverter handles missing run() gracefully.
 */

import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function pass(label) {
  console.log(`  ✓ ${label}`);
}

function fail(label, err) {
  console.error(`  ✗ ${label}`);
  throw err;
}

let passed = 0;
let failed = 0;

async function test(label, fn) {
  try {
    await fn();
    pass(label);
    passed++;
  } catch (err) {
    fail(label, err);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// 1. Required scaffold files exist
// ---------------------------------------------------------------------------
console.log('\n1. Scaffold file existence');

const REQUIRED_SCAFFOLD = [
  'viewer/tabs/model-converters/index.js',
  'viewer/tabs/model-converters/ModelConvertersTab.js',
  'viewer/tabs/model-converters/ConverterSelector.js',
  'viewer/tabs/model-converters/ConverterRunner.js',
  'viewer/tabs/model-converters/WorkflowShell.js',
];

for (const rel of REQUIRED_SCAFFOLD) {
  await test(`exists: ${rel}`, () => {
    const full = path.join(root, rel);
    assert.ok(existsSync(full), `Missing required file: ${rel}`);
  });
}

// ---------------------------------------------------------------------------
// 2. model-converters-tab.js is a shim (<= 20 lines of non-blank, non-comment)
// ---------------------------------------------------------------------------
console.log('\n2. Wrapper / shim size');

await test('model-converters-tab.js is a thin shim (<= 20 non-blank lines)', () => {
  const src = readFileSync(path.join(root, 'viewer/tabs/model-converters-tab.js'), 'utf8');
  const nonBlank = src.split('\n').filter((l) => l.trim() && !l.trim().startsWith('*') && !l.trim().startsWith('/*') && !l.trim().startsWith('//'));
  assert.ok(
    nonBlank.length <= 20,
    `model-converters-tab.js has ${nonBlank.length} non-blank lines — expected <= 20 (shim only).`,
  );
});

// ---------------------------------------------------------------------------
// 3. WorkflowShell: phase definitions and ordering
// ---------------------------------------------------------------------------
console.log('\n3. WorkflowShell');

const { XML_CII_WORKFLOW_PHASES, normalizeWorkflowPhaseId, getWorkflowPhase } = await import(
  '../viewer/tabs/model-converters/WorkflowShell.js'
);

await test('XML_CII_WORKFLOW_PHASES is a non-empty frozen array', () => {
  assert.ok(Array.isArray(XML_CII_WORKFLOW_PHASES));
  assert.ok(XML_CII_WORKFLOW_PHASES.length > 0);
  assert.ok(Object.isFrozen(XML_CII_WORKFLOW_PHASES));
});

await test('no duplicate phase IDs', () => {
  const ids = XML_CII_WORKFLOW_PHASES.map((p) => p.id);
  const unique = new Set(ids);
  assert.equal(unique.size, ids.length, `Duplicate phase IDs found: ${ids.join(', ')}`);
});

await test('"4A Weight Match" (weight-match) appears before "5 Run" (run)', () => {
  const ids = XML_CII_WORKFLOW_PHASES.map((p) => p.id);
  const wmIdx = ids.indexOf('weight-match');
  const runIdx = ids.indexOf('run');
  assert.ok(wmIdx !== -1, '"weight-match" phase not found');
  assert.ok(runIdx !== -1, '"run" phase not found');
  assert.ok(wmIdx < runIdx, `"weight-match" (idx ${wmIdx}) must be before "run" (idx ${runIdx})`);
});

await test('no "9 CII Support Mapping" phase', () => {
  const hasCiiSupportMapping = XML_CII_WORKFLOW_PHASES.some(
    (p) => /9\s*cii\s*support/i.test(p.label) || /cii.support.mapping/i.test(p.id),
  );
  assert.ok(!hasCiiSupportMapping, 'Found forbidden "9 CII Support Mapping" phase.');
});

await test('normalizeWorkflowPhaseId returns valid ID for known phase', () => {
  assert.equal(normalizeWorkflowPhaseId('preview'), 'preview');
  assert.equal(normalizeWorkflowPhaseId('run'), 'run');
});

await test('normalizeWorkflowPhaseId falls back to first phase for unknown ID', () => {
  const fallback = normalizeWorkflowPhaseId('nonexistent-phase-xyz');
  assert.equal(fallback, XML_CII_WORKFLOW_PHASES[0].id);
});

await test('getWorkflowPhase returns phase for known ID', () => {
  const phase = getWorkflowPhase('weight-match');
  assert.ok(phase);
  assert.equal(phase.id, 'weight-match');
  assert.ok(/4A/i.test(phase.label));
});

await test('getWorkflowPhase returns undefined for unknown ID', () => {
  assert.equal(getWorkflowPhase('no-such-phase'), undefined);
});

// ---------------------------------------------------------------------------
// 4. ConverterSelector helpers
// ---------------------------------------------------------------------------
console.log('\n4. ConverterSelector');

const { getDefaultConverterId, isValidConverterId } = await import(
  '../viewer/tabs/model-converters/ConverterSelector.js'
);

await test('getDefaultConverterId returns first enabled converter ID', () => {
  const defs = [{ id: 'a', disabled: true }, { id: 'b' }, { id: 'c' }];
  assert.equal(getDefaultConverterId(defs), 'b');
});

await test('getDefaultConverterId falls back to rvm_to_rev on empty list', () => {
  assert.equal(getDefaultConverterId([]), 'rvm_to_rev');
});

await test('isValidConverterId returns true for enabled converter', () => {
  const defs = [{ id: 'x' }, { id: 'y', disabled: true }];
  assert.equal(isValidConverterId('x', defs), true);
});

await test('isValidConverterId returns false for disabled converter', () => {
  const defs = [{ id: 'x' }, { id: 'y', disabled: true }];
  assert.equal(isValidConverterId('y', defs), false);
});

await test('isValidConverterId returns false for unknown converter', () => {
  const defs = [{ id: 'x' }];
  assert.equal(isValidConverterId('unknown', defs), false);
});

// ---------------------------------------------------------------------------
// 5. ConverterRunner
// ---------------------------------------------------------------------------
console.log('\n5. ConverterRunner');

const { runConverter, buildNoopLogger } = await import(
  '../viewer/tabs/model-converters/ConverterRunner.js'
);

await test('runConverter returns error result when converter has no run()', async () => {
  const result = await runConverter({ id: 'bad' }, { converterId: 'bad' });
  assert.equal(result.ok, false);
  assert.ok(result.error);
  assert.ok(Array.isArray(result.outputs));
});

await test('runConverter calls converter.run() with context', async () => {
  let receivedContext = null;
  const converter = {
    run: (ctx) => {
      receivedContext = ctx;
      return Promise.resolve({ ok: true, outputs: [] });
    },
  };
  const ctx = { converterId: 'test' };
  const result = await runConverter(converter, ctx);
  assert.equal(result.ok, true);
  assert.strictEqual(receivedContext, ctx);
});

await test('buildNoopLogger returns logger with stdout/stderr arrays', () => {
  const logger = buildNoopLogger();
  logger.log('hello');
  logger.error('world');
  assert.deepEqual(logger.stdout, ['hello']);
  assert.deepEqual(logger.stderr, ['world']);
});

// ---------------------------------------------------------------------------
// 6. ConverterSelector — live registry import (Phase 2: duplicate-ID guard)
// ---------------------------------------------------------------------------
console.log('\n6. Converter registry integrity (Phase 2)');

// The ConverterSelector re-exports from converter-registry.  If the registry's
// startup guard fires, the import itself will throw — we catch that here.
await test('converter-registry imports without duplicate-ID errors', async () => {
  // Dynamic import so we get a fresh module evaluation (or the cached one).
  const mod = await import('../viewer/tabs/model-converters/ConverterSelector.js');
  assert.ok(typeof mod.getConverterById === 'function');
  assert.ok(Array.isArray(mod.CONVERTERS));
});

await test('all CONVERTERS have unique IDs', async () => {
  const { CONVERTERS } = await import('../viewer/tabs/model-converters/ConverterSelector.js');
  const ids = CONVERTERS.map((c) => c.id);
  const unique = new Set(ids);
  assert.equal(
    unique.size,
    ids.length,
    `Duplicate converter IDs: ${ids.filter((id, i) => ids.indexOf(id) !== i).join(', ')}`,
  );
});

await test('getConverterById returns a converter for known ID', async () => {
  const { getConverterById } = await import('../viewer/tabs/model-converters/ConverterSelector.js');
  const c = getConverterById('rvm_to_rev');
  assert.ok(c, 'Expected rvm_to_rev to be registered');
  assert.equal(c.id, 'rvm_to_rev');
});

await test('getConverterById returns null for unknown ID', async () => {
  const { getConverterById } = await import('../viewer/tabs/model-converters/ConverterSelector.js');
  assert.equal(getConverterById('no_such_converter'), null);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${'─'.repeat(50)}`);
if (failed === 0) {
  console.log(`\n✅ All ${passed} scaffold tests passed.\n`);
  process.exit(0);
} else {
  console.error(`\n❌ ${failed} test(s) failed out of ${passed + failed}.\n`);
  process.exit(1);
}
