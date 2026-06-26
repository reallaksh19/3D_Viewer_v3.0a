#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const SCRIPT_SCHEMA = 'bm-cii-component-metadata-fixer/v1';
const SUPPORT_TYPES = new Set(['SUPPORT', 'RESTRAINT', 'GUIDE', 'LINESTOP', 'LINE STOP', 'LIMIT', 'REST', 'HANGER', 'SPRING', 'ANCHOR']);
const SENTINELS = new Set(['-1.010100', '-1.0101', '-999', '-999.0', '-9999', '-9999.0']);

function usage() {
  return `Usage:
  node scripts/bm-cii/fix-component-metadata-from-inputxml.mjs --glb <in.glb> --inputxml <BM_CII.xml> --out <out.glb> [--line-no-node 10 --line-no "LINE XYZ"]

Purpose:
  Stamp resolved BM_CII InputXML component/process metadata into selectable GLB node extras.
  This is component-only: restraint/support records remain record-scoped and do not use carry-forward.
`;
}

function parseArgs(argv) {
  const args = { lineNoNode: '10', lineNo: 'LINE XYZ' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--glb') args.glbPath = argv[++i];
    else if (arg === '--inputxml') args.inputXmlPath = argv[++i];
    else if (arg === '--out') args.outPath = argv[++i];
    else if (arg === '--line-no-node') args.lineNoNode = argv[++i];
    else if (arg === '--line-no') args.lineNo = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.help) return args;
  if (!args.glbPath) throw new Error('Missing --glb.');
  if (!args.inputXmlPath) throw new Error('Missing --inputxml.');
  if (!args.outPath) throw new Error('Missing --out.');
  return args;
}

function text(value) {
  return String(value ?? '').trim();
}

function normalizeNode(value) {
  const raw = text(value);
  if (!raw) return '';
  const n = Number(raw);
  return Number.isFinite(n) ? String(Math.trunc(n)) : raw;
}

function cleanComponentValue(value) {
  const raw = text(value);
  if (!raw) return '';
  if (SENTINELS.has(raw)) return '';
  const n = Number(raw);
  if (Number.isFinite(n)) {
    for (const sentinel of SENTINELS) {
      if (Math.abs(n - Number(sentinel)) < 1e-6) return '';
    }
  }
  return raw;
}

function parseAttributes(raw = '') {
  const out = {};
  const pattern = /([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = pattern.exec(raw))) out[match[1]] = match[2];
  return out;
}

function parseInputXmlComponentRecords(xmlText) {
  const records = [];
  const context = {};
  const elementPattern = /<PIPINGELEMENT\b([^>]*)>([\s\S]*?)<\/PIPINGELEMENT\s*>|<PIPINGELEMENT\b([^>]*)\/>/gi;
  let match;
  while ((match = elementPattern.exec(xmlText))) {
    const attrs = parseAttributes(match[1] || match[3] || '');
    const body = match[2] || '';
    const fromNode = normalizeNode(attrs.FROM_NODE || attrs.FromNode);
    const toNode = normalizeNode(attrs.TO_NODE || attrs.ToNode);
    const rawValues = {
      diameterMm: attrs.DIAMETER,
      bore: attrs.DIAMETER,
      wallThickness: attrs.WALL_THICK,
      materialThickness: attrs.WALL_THICK,
      materialName: attrs.MATERIAL_NAME,
      pressure: attrs.PRESSURE1,
      hydroPressure: attrs.HYDRO_PRESSURE,
      temp1: attrs.TEMP_EXP_C1,
      temp2: attrs.TEMP_EXP_C2,
      temp3: attrs.TEMP_EXP_C3,
    };
    const resolved = {};
    const sources = {};
    for (const [key, value] of Object.entries(rawValues)) {
      const explicit = cleanComponentValue(value);
      if (explicit) {
        resolved[key] = explicit;
        context[key] = explicit;
        sources[key] = 'explicit InputXML PIPINGELEMENT attribute';
      } else if (context[key]) {
        resolved[key] = context[key];
        sources[key] = 'component/process carry-forward from previous PIPINGELEMENT';
      } else {
        resolved[key] = '';
        sources[key] = 'unavailable';
      }
    }
    const rigidMatch = body.match(/<RIGID\b([^>]*)\/?\s*>/i);
    records.push({
      sourceIndex: records.length + 1,
      fromNode,
      toNode,
      raw: attrs,
      resolved,
      sources,
      rigid: rigidMatch ? parseAttributes(rigidMatch[1]) : {},
    });
  }
  return records;
}

function readGlb(buffer) {
  const magic = buffer.subarray(0, 4).toString('ascii');
  const version = buffer.readUInt32LE(4);
  if (magic !== 'glTF' || version !== 2) throw new Error('Expected binary glTF 2.0 GLB.');
  let offset = 12;
  let gltf = null;
  const chunks = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 8 + length;
    if (type === 'JSON') gltf = JSON.parse(data.toString('utf8').replace(/[\u0000\s]+$/g, ''));
    else chunks.push({ type, data });
  }
  if (!gltf) throw new Error('GLB has no JSON chunk.');
  return { gltf, chunks };
}

function packGlb(gltf, chunks) {
  const json = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = (4 - (json.length % 4)) % 4;
  const jsonChunk = Buffer.concat([json, Buffer.alloc(jsonPad, 0x20)]);
  const packedChunks = [{ type: 'JSON', data: jsonChunk }, ...chunks.map((chunk) => {
    const pad = (4 - (chunk.data.length % 4)) % 4;
    return { type: chunk.type, data: pad ? Buffer.concat([chunk.data, Buffer.alloc(pad)]) : chunk.data };
  })];
  const total = 12 + packedChunks.reduce((sum, chunk) => sum + 8 + chunk.data.length, 0);
  const out = Buffer.alloc(total);
  out.write('glTF', 0, 'ascii');
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  let offset = 12;
  for (const chunk of packedChunks) {
    out.writeUInt32LE(chunk.data.length, offset);
    out.write(chunk.type, offset + 4, 'ascii');
    chunk.data.copy(out, offset + 8);
    offset += 8 + chunk.data.length;
  }
  return out;
}

function componentTypeFromId(id = '') {
  const match = text(id).match(/^PE_\d+_(.+)_\d+_TO_\d+/i);
  return match ? match[1].toUpperCase() : '';
}

function isSupportLikeNodeName(name = '') {
  const upper = text(name).toUpperCase();
  return Array.from(SUPPORT_TYPES).some((token) => upper.includes(token));
}

function recordForComponent(componentId, records) {
  const match = text(componentId).match(/^PE_(\d+)_.*?_(\d+)_TO_(\d+)/i);
  if (!match) return null;
  const sourceIndex = Number(match[1]);
  const fromNode = normalizeNode(match[2]);
  const toNode = normalizeNode(match[3]);
  return records[sourceIndex - 1]
    || records.find((record) => record.fromNode === fromNode && record.toNode === toNode)
    || null;
}

function stampNodeExtras(gltf, records, options = {}) {
  const pePattern = /(PE_\d+_[A-Z0-9_]+?_\d+_TO_\d+)/i;
  const updated = [];
  for (const node of gltf.nodes || []) {
    const nodeName = text(node.name);
    const match = nodeName.match(pePattern);
    if (!match || isSupportLikeNodeName(nodeName)) continue;
    const componentId = match[1];
    const record = recordForComponent(componentId, records);
    if (!record) continue;
    const type = componentTypeFromId(componentId);
    const resolved = record.resolved || {};
    const extras = { ...(node.extras || {}) };
    Object.assign(extras, {
      name: nodeName,
      pcfId: componentId,
      id: componentId,
      pcfType: type,
      type,
      refNo: componentId,
      sourceComponentType: type,
      sourceId: componentId,
      fromNode: record.fromNode,
      toNode: record.toNode,
      bore: Number(resolved.bore) || resolved.bore || '',
      diameterMm: Number(resolved.diameterMm) || resolved.diameterMm || '',
      wallThickness: resolved.wallThickness || '',
      'Wall Thickness': resolved.wallThickness || '',
      materialName: resolved.materialName || '',
      Material: resolved.materialName || '',
      pressure: resolved.pressure || '',
      Pressure: resolved.pressure || '',
      hydroPressure: resolved.hydroPressure || '',
      'Hydro Pressure': resolved.hydroPressure || '',
      materialThickness: resolved.materialThickness || '',
      'Material Thickness': resolved.materialThickness || '',
      temp1: resolved.temp1 || '',
      Temp1: resolved.temp1 || '',
      temp2: resolved.temp2 || '',
      Temp2: resolved.temp2 || '',
      temp3: resolved.temp3 || '',
      Temp3: resolved.temp3 || '',
      lineNo: options.lineNo || '',
      'Line No': options.lineNo || '',
      LINE_NO_SOURCE: 'BM_CII_LINE_NO_sideload.csv',
      LINE_NO_ANCHOR_NODE: options.lineNoNode || '',
      LINE_NO_SCOPE: 'node-wise sideload topology carry-forward',
      componentPropertySources: record.sources || {},
      inputXmlPropertyResolution: 'component/process fields only; restraints/supports are record-scoped and not carry-forward',
      provenanceTrace: 'InputXML -> ISONOTE sideload -> BM_CII_Enriched_v8_lite.XML -> GLB support source variants',
      componentMetadataFixSchema: SCRIPT_SCHEMA,
    });
    if (record.rigid?.TYPE) extras.rigidType = record.rigid.TYPE;
    if (record.rigid?.WEIGHT) extras.rigidWeight = record.rigid.WEIGHT;
    node.extras = extras;
    updated.push({ componentId, nodeName, fromNode: record.fromNode, toNode: record.toNode, type });
  }
  const scene = gltf.scenes?.[gltf.scene || 0];
  if (scene) {
    scene.extras = {
      ...(scene.extras || {}),
      BM_CII_COMPONENT_METADATA_FIX: SCRIPT_SCHEMA,
      updatedNodeExtrasCount: updated.length,
      lineNoSideload: { [options.lineNoNode || '10']: options.lineNo || '' },
      componentMetadataFix: 'Resolved InputXML component/process properties stamped into selectable GLB node extras. Restraints/supports remain record-scoped and do not carry-forward.',
    };
  }
  return updated;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  const xmlText = await fs.readFile(args.inputXmlPath, 'utf8');
  const records = parseInputXmlComponentRecords(xmlText);
  const { gltf, chunks } = readGlb(await fs.readFile(args.glbPath));
  const updated = stampNodeExtras(gltf, records, args);
  await fs.mkdir(path.dirname(path.resolve(args.outPath)), { recursive: true });
  await fs.writeFile(args.outPath, packGlb(gltf, chunks));
  process.stdout.write(`${JSON.stringify({ schema: SCRIPT_SCHEMA, records: records.length, updatedNodeExtrasCount: updated.length, out: args.outPath }, null, 2)}\n`);
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : '';
const modulePath = new URL(import.meta.url).pathname;
if (invoked === modulePath) await main();

export {
  SCRIPT_SCHEMA,
  parseInputXmlComponentRecords,
  stampNodeExtras,
};
