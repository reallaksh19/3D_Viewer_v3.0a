#!/usr/bin/env node
/**
 * BM_CII ISONOTE restraint validation.
 *
 * This is an engineering consistency report, not a drawing generator. It keeps
 * ISONOTE expectations separate from InputXML support/restraint records and does
 * not apply carry-forward to restraint fields.
 */

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_ISONOTE = 'benchmarks/bm-cii/BM_CII_ISONOTE_sideload.json';
const DEFAULT_RESTRAINTS = 'benchmarks/bm-cii/BM_CII_RESTRAINT_EXPECTED.json';
const DEFAULT_OUT_JSON = 'benchmarks/bm-cii/BM_CII_isonote_restraint_validation.json';
const DEFAULT_OUT_MD = 'benchmarks/bm-cii/BM_CII_isonote_restraint_validation.md';

function usage(exitCode = 0) {
  console.log(`Usage:
  node scripts/bm-cii/isonote-restraint-validation.mjs \
    [--isonote benchmarks/bm-cii/BM_CII_ISONOTE_sideload.json] \
    [--restraints benchmarks/bm-cii/BM_CII_RESTRAINT_EXPECTED.json] \
    [--out-json benchmarks/bm-cii/BM_CII_isonote_restraint_validation.json] \
    [--out-md benchmarks/bm-cii/BM_CII_isonote_restraint_validation.md]
`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {
    isonote: DEFAULT_ISONOTE,
    restraints: DEFAULT_RESTRAINTS,
    outJson: DEFAULT_OUT_JSON,
    outMd: DEFAULT_OUT_MD,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') usage(0);
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${token}`);
    if (!(key in args)) throw new Error(`Unknown option: ${token}`);
    args[key] = value;
    i += 1;
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function text(value) {
  return String(value ?? '').trim();
}

function nodeId(value) {
  const raw = text(value);
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? String(Math.trunc(numeric)) : raw;
}

function normalizeFamily(value) {
  const raw = text(value).toUpperCase().replace(/[\s-]+/g, '_');
  if (!raw) return 'UNKNOWN';
  if (raw.includes('LINE_STOP') || raw.includes('LINESTOP')) return 'LINE_STOP';
  if (raw.includes('LIMIT')) return 'LIMIT';
  if (raw.includes('GUIDE')) return 'GUIDE';
  if (raw.includes('ANCHOR')) return 'ANCHOR';
  if (raw.includes('HANGER') || raw.includes('SPRING')) return 'SPRING';
  if (raw.includes('HOLDDOWN') || raw.includes('HOLD_DOWN')) return 'HOLDDOWN';
  if (raw.includes('AXIS_RESTRAINT')) return 'AXIS_RESTRAINT';
  if (raw.includes('REST')) return 'REST';
  return raw;
}

function parseIsonoteIntent(rawText) {
  const raw = text(rawText);
  const upper = raw.toUpperCase();
  const intents = new Set();
  const warnings = [];

  if (/REST\s+NOT\s+DEFINED/.test(upper)) intents.add('REST_NOT_DEFINED');
  if (/\bREST\b/.test(upper) && !intents.has('REST_NOT_DEFINED')) intents.add('REST');
  if (/\bGUIDE\b/.test(upper)) intents.add('GUIDE');
  if (/LINE\s*STOP|LINESTOP/.test(upper)) intents.add('LINE_STOP');
  if (/HOLD\s*DOWN|HOLDDOWN/.test(upper)) intents.add('HOLDDOWN');
  if (/SINGLE\s+AXIS\s+Z|\bAXIS\s+Z\b/.test(upper)) intents.add('SINGLE_AXIS_Z');
  if (/SPRING/.test(upper)) {
    intents.add('SPRING_WARNING');
    warnings.push('ISONOTE contains spring-related warning text. Requires engineering review.');
  }

  return { raw, intents: Array.from(intents), warnings };
}

function actualByNode(records = []) {
  const map = new Map();
  for (const record of records) {
    const node = nodeId(record.node ?? record.NODE);
    if (!node) continue;
    const normalized = {
      ...record,
      node,
      family: normalizeFamily(record.family || record.renderKind || record.sourceItem),
      axis: text(record.cosine || record.axisPipeBasis || record.sourceItem).toUpperCase(),
    };
    if (!map.has(node)) map.set(node, []);
    map.get(node).push(normalized);
  }
  return map;
}

function hasFamily(actual, families) {
  const wanted = new Set(families);
  return actual.some((record) => wanted.has(record.family));
}

function hasAxisZ(actual) {
  return actual.some((record) => /(^|[^A-Z])\+?Z($|[^A-Z])/.test(record.axis) || record.sourceItem === 'Z' || record.sourceItem === '+Z');
}

function checkIntent(intent, actual) {
  switch (intent) {
    case 'REST':
      return hasFamily(actual, ['REST'])
        ? { status: 'PASS', remark: 'REST present in InputXML restraint records.' }
        : { status: 'MISSING_IN_INPUTXML', remark: 'ISONOTE expects REST but no REST family was found.' };
    case 'GUIDE':
      return hasFamily(actual, ['GUIDE'])
        ? { status: 'PASS', remark: 'GUIDE present in InputXML restraint records.' }
        : { status: 'MISSING_IN_INPUTXML', remark: 'ISONOTE expects GUIDE but no GUIDE family was found.' };
    case 'LINE_STOP':
      return hasFamily(actual, ['LINE_STOP', 'LIMIT'])
        ? { status: 'PASS', remark: 'LINE STOP intent is covered by LINE_STOP/LIMIT restraint.' }
        : { status: 'MISSING_IN_INPUTXML', remark: 'ISONOTE expects LINE STOP but no LINE_STOP/LIMIT family was found.' };
    case 'HOLDDOWN':
      return hasFamily(actual, ['HOLDDOWN'])
        ? { status: 'PASS', remark: 'HOLDDOWN present in InputXML restraint records.' }
        : hasFamily(actual, ['SPRING'])
          ? { status: 'NEEDS_ENGINEERING_REVIEW', remark: 'ISONOTE mentions HOLDDOWN; InputXML has HANGER/SPRING. Verify holddown/spring modelling basis.' }
          : { status: 'MISSING_IN_INPUTXML', remark: 'ISONOTE expects HOLDDOWN but no HOLDDOWN family was found.' };
    case 'SINGLE_AXIS_Z':
      return hasAxisZ(actual)
        ? { status: 'PASS', remark: 'Single-axis Z intent has an explicit Z-axis restraint record.' }
        : { status: 'VISUAL_WRONG_AXIS', remark: 'ISONOTE expects single-axis Z but actual records do not expose Z axis.' };
    case 'REST_NOT_DEFINED':
      return hasFamily(actual, ['REST'])
        ? { status: 'ISONOTE_CONFLICT', remark: 'ISONOTE says REST NOT DEFINED but InputXML has REST.' }
        : { status: 'PASS', remark: 'ISONOTE says REST NOT DEFINED and no REST family is present.' };
    case 'SPRING_WARNING':
      return { status: 'NEEDS_ENGINEERING_REVIEW', remark: 'ISONOTE spring warning retained for engineering review.' };
    default:
      return { status: 'NEEDS_ENGINEERING_REVIEW', remark: `Unhandled ISONOTE intent ${intent}.` };
  }
}

function aggregateStatus(checks) {
  const order = [
    'MISSING_IN_INPUTXML',
    'ISONOTE_CONFLICT',
    'VISUAL_WRONG_AXIS',
    'VISUAL_MISSING',
    'NEEDS_ENGINEERING_REVIEW',
    'EXTRA_IN_INPUTXML',
    'PASS',
  ];
  for (const status of order) {
    if (checks.some((check) => check.status === status)) return status;
  }
  return 'PASS';
}

function validate(isonotePayload, restraintPayload) {
  const actualMap = actualByNode(restraintPayload.records || []);
  const records = [];
  for (const note of isonotePayload.records || []) {
    const node = nodeId(note.node ?? note.NODE);
    const parsed = parseIsonoteIntent(note.sourceInfo || note.displayText || note.isonote);
    const actual = actualMap.get(node) || [];
    const checks = parsed.intents.map((intent) => ({ intent, ...checkIntent(intent, actual) }));
    for (const warning of parsed.warnings) checks.push({ intent: 'WARNING', status: 'NEEDS_ENGINEERING_REVIEW', remark: warning });
    records.push({
      node,
      isonote: parsed.raw,
      parsedIntents: parsed.intents,
      actualRestraints: actual.map((record) => ({
        family: record.family,
        sourceItem: record.sourceItem,
        axisPipeBasis: record.axisPipeBasis,
        cosine: record.cosine,
        renderKind: record.renderKind,
      })),
      checks,
      status: aggregateStatus(checks),
    });
  }
  return {
    schema: 'bm-cii-isonote-restraint-validation/v1',
    generatedBy: 'scripts/bm-cii/isonote-restraint-validation.mjs',
    rules: {
      restraintCarryForward: false,
      isonoteSourceTextExact: true,
      validationScope: 'ISONOTE intent vs approved InputXML Basic restraint records',
    },
    summary: records.reduce((acc, record) => {
      acc.total += 1;
      acc[record.status] = (acc[record.status] || 0) + 1;
      return acc;
    }, { total: 0 }),
    records,
  };
}

function markdown(report) {
  const lines = [];
  lines.push('# BM_CII ISONOTE Restraint Validation');
  lines.push('');
  lines.push('Restraint records are record-scoped. Carry-forward is not applied to supports/restraints.');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Status | Count |');
  lines.push('|---|---:|');
  for (const [key, value] of Object.entries(report.summary)) {
    lines.push(`| ${key} | ${value} |`);
  }
  lines.push('');
  lines.push('## Node-wise Results');
  lines.push('');
  for (const record of report.records) {
    lines.push(`### Node ${record.node} — ${record.status}`);
    lines.push('');
    lines.push(`ISONOTE: \`${record.isonote.replace(/`/g, '\\`')}\``);
    lines.push('');
    lines.push(`Parsed intents: ${record.parsedIntents.length ? record.parsedIntents.join(', ') : 'None'}`);
    lines.push('');
    lines.push('Actual restraints:');
    if (record.actualRestraints.length) {
      for (const actual of record.actualRestraints) {
        lines.push(`- ${actual.family} / ${actual.sourceItem || ''} / axis=${actual.axisPipeBasis || ''} / cosine=${actual.cosine || ''} / render=${actual.renderKind || ''}`);
      }
    } else {
      lines.push('- None');
    }
    lines.push('');
    lines.push('| Intent | Status | Remark |');
    lines.push('|---|---|---|');
    for (const check of record.checks) {
      lines.push(`| ${check.intent} | ${check.status} | ${check.remark} |`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv);
  const report = validate(readJson(args.isonote), readJson(args.restraints));
  ensureDir(args.outJson);
  fs.writeFileSync(args.outJson, `${JSON.stringify(report, null, 2)}\n`);
  ensureDir(args.outMd);
  fs.writeFileSync(args.outMd, markdown(report));
  console.log(`Wrote ${args.outJson}`);
  console.log(`Wrote ${args.outMd}`);
}

main();
