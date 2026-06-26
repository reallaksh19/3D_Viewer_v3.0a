import {
  evaluateAccessSupportLoadFixture,
  parseAccessSupportLoadFixtureText,
  SUPPORT_LOAD_ACCESS_FIXTURE_SCHEMA
} from './GeometrySupportLoadAccessFixturePack.js?v=20260623-access-fixture-import-1';

export const SUPPORT_LOAD_ACCESS_FIXTURE_BATCH_VERSION = '20260623-access-fixture-batch-validator-1';

function freezeDeep(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freezeDeep(child)])));
}

export function evaluateAccessSupportLoadFixtures(fixtures) {
  const rows = Array.isArray(fixtures) ? fixtures : [];
  const results = rows.map(evaluateAccessSupportLoadFixture);
  const failed = results.filter(result => result.status !== 'PASS');
  return freezeDeep({
    schema: SUPPORT_LOAD_ACCESS_FIXTURE_SCHEMA,
    version: SUPPORT_LOAD_ACCESS_FIXTURE_BATCH_VERSION,
    status: failed.length ? 'FAIL' : 'PASS',
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    failedFixtureIds: failed.map(result => result.fixtureId),
    results,
    audit: [{
      source: 'ACCESS_FIXTURE_BATCH_VALIDATOR',
      field: 'scope',
      value: 'regression-fixture-only',
      note: 'Batch validation consumes parsed regression fixtures only; it does not hydrate runtime objects or write calculated fields.'
    }]
  });
}

export function evaluateAccessSupportLoadFixtureText(sourceText, options = {}) {
  const imported = parseAccessSupportLoadFixtureText(sourceText, options);
  const validation = evaluateAccessSupportLoadFixtures(imported.fixtures || []);
  const blocked = imported.status === 'EMPTY';
  const status = blocked
    ? 'EMPTY'
    : validation.failed
      ? 'FAIL'
      : imported.warnings?.length
        ? 'PASS_WITH_IMPORT_WARNINGS'
        : 'PASS';
  return freezeDeep({
    schema: SUPPORT_LOAD_ACCESS_FIXTURE_SCHEMA,
    version: SUPPORT_LOAD_ACCESS_FIXTURE_BATCH_VERSION,
    status,
    importStatus: imported.status,
    delimiter: imported.delimiter,
    fixtureCount: imported.fixtureCount || 0,
    importWarnings: imported.warnings || [],
    total: validation.total,
    passed: validation.passed,
    failed: validation.failed,
    failedFixtureIds: validation.failedFixtureIds,
    results: validation.results,
    audit: [{
      source: 'ACCESS_FIXTURE_TEXT_BATCH_VALIDATOR',
      field: 'scope',
      value: 'regression-fixture-only',
      note: 'Text batch validation is not a runtime top-up/import path for support-load inputs.'
    }]
  });
}
