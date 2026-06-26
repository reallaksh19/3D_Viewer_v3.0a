#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const SCRIPT_SCHEMA = 'bm-cii-plant-visual-review-v22/v1';
const DEFAULT_OUT_DIR = 'artifacts/bm-cii-plant-visual-review-v22';
const UP = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const EPS = 1e-6;

const SUPPORT_OR_ANNOTATION_TYPES = new Set([
  'SUPPORT', 'RESTRAINT', 'GUIDE', 'LINESTOP', 'LIMIT', 'REST',
  'NODE_LABEL', 'MESSAGE-SQUARE', 'MESSAGE-CIRCLE', 'ANNOTATION',
  'CALL_OUT', 'CALLOUT', 'ISONOTE',
]);

function usage() {
  return `Usage:\n  node scripts/bm-cii/build-plant-visual-review-v22.mjs --sidecar <sidecar.json> [--out-dir <dir>] [--color-mode engineering|temp1]\n\nPurpose:\n  Build BM_CII plant-only visual GLB after v22 inline-topology fix.\n  Supports/restraints/annotations remain disabled. Inline components fill their\n  source spans so valves/flanges/rigids do not float or create pipe gaps.\n`;
}

function parseArgs(argv) {
  const args = { outDir: DEFAULT_OUT_DIR, colorMode: 'engineering' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--sidecar') args.sidecarPath = argv[++i];
    else if (arg === '--out-dir') args.outDir = argv[++i];
    else if (arg === '--color-mode') args.colorMode = argv[++i] || 'engineering';
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.help && !args.sidecarPath) throw new Error('Missing --sidecar.');
  return args;
}

async function readJson(filePath) { return JSON.parse(await fs.readFile(filePath, 'utf8')); }
async function writeJson(filePath, data) { await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8'); }

function ensureNodeFileReader() {
  if (typeof globalThis.FileReader !== 'undefined') return;
  if (typeof Blob === 'undefined') return;
  class NodeFileReader {
    constructor() { this.result = null; this.error = null; this.onload = null; this.onloadend = null; this.onerror = null; }
    addEventListener(type, listener) { if (type === 'load') this.onload = listener; else if (type === 'loadend') this.onloadend = listener; else if (type === 'error') this.onerror = listener; }
    removeEventListener(type, listener) { if (type === 'load' && this.onload === listener) this.onload = null; else if (type === 'loadend' && this.onloadend === listener) this.onloadend = null; else if (type === 'error' && this.onerror === listener) this.onerror = null; }
    async readAsArrayBuffer(blob) { try { this.result = await blob.arrayBuffer(); this.onload?.({ target: this }); this.onloadend?.({ target: this }); } catch (error) { this.error = error; this.onerror?.({ target: this }); this.onloadend?.({ target: this }); } }
    async readAsDataURL(blob) { try { const buffer = Buffer.from(await blob.arrayBuffer()); const mime = blob.type || 'application/octet-stream'; this.result = `data:${mime};base64,${buffer.toString('base64')}`; this.onload?.({ target: this }); this.onloadend?.({ target: this }); } catch (error) { this.error = error; this.onerror?.({ target: this }); this.onloadend?.({ target: this }); } }
  }
  globalThis.FileReader = NodeFileReader;
}

async function exportGlb(scene) {
  ensureNodeFileReader();
  const exporter = new GLTFExporter();
  const result = await new Promise((resolve, reject) => exporter.parse(scene, resolve, reject, { binary: true, onlyVisible: true, trs: false }));
  return result instanceof ArrayBuffer ? Buffer.from(result) : Buffer.from(await result.arrayBuffer());
}

function asVector(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    const [x, y, z] = value.map(Number);
    return [x, y, z].every(Number.isFinite) ? new THREE.Vector3(x, y, z) : null;
  }
  const x = Number(value.x ?? value.X ?? value.east ?? value.E);
  const y = Number(value.y ?? value.Y ?? value.up ?? value.U);
  const z = Number(value.z ?? value.Z ?? value.south ?? value.S);
  return [x, y, z].every(Number.isFinite) ? new THREE.Vector3(x, y, z) : null;
}

function compStart(comp = {}) { return asVector(comp.startGlbMm || comp.ep1 || comp.start || comp.p1 || comp.coOrds || comp.centrePoint); }
function compEnd(comp = {}) { return asVector(comp.endGlbMm || comp.ep2 || comp.end || comp.p2 || comp.branch1Point || comp.centrePoint); }
function midpoint(a, b) { return new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5); }
function safeDirection(a, b, fallback = Z_AXIS) { const dir = new THREE.Vector3().subVectors(b, a); return dir.length() < EPS ? fallback.clone() : dir.normalize(); }
function orientFromY(object, direction) { if (object && direction && direction.length() >= EPS) object.quaternion.setFromUnitVectors(UP, direction.clone().normalize()); }
function orientFromZ(object, direction) { if (object && direction && direction.length() >= EPS) object.quaternion.setFromUnitVectors(Z_AXIS, direction.clone().normalize()); }
function diameterMm(comp = {}, fallback = 50) { return Math.max(Number(comp.diameterMm) || Number(comp.outsideDiameterMm) || Number(comp.outsideDiameter) || Number(comp.bore) || Number(comp.ep1?.bore) || Number(comp.ep2?.bore) || fallback, 1); }
function pipeRadius(comp = {}, fallbackDiameter = 50) { return Math.max(diameterMm(comp, fallbackDiameter) / 2, 0.5); }
function material(color, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.64, metalness: 0.05, ...extra }); }

function sideAxis(axis) {
  const normalized = axis.clone().normalize();
  const upProjection = UP.clone().sub(normalized.clone().multiplyScalar(UP.dot(normalized)));
  if (upProjection.length() > EPS) return upProjection.normalize();
  const x = new THREE.Vector3(1, 0, 0).sub(normalized.clone().multiplyScalar(normalized.x));
  return x.length() > EPS ? x.normalize() : new THREE.Vector3(1, 0, 0);
}

function stamp(object, data) {
  if (!object) return object;
  const userData = {
    bmCiiTrace: {
      entity: data.entity || 'plant',
      visualReviewMode: 'plant-only-v22',
      sourceId: data.sourceId || '',
      sourceType: data.sourceType || '',
      fromNode: data.fromNode || '',
      toNode: data.toNode || '',
      glbShape: data.glbShape || '',
      topologyContract: data.topologyContract || '',
      scriptSchema: SCRIPT_SCHEMA,
    },
    bmCiiLayer: { layerIds: ['plant.geometry'], defaultVisible: true, sourceType: data.sourceType || '' },
    ...data.extra,
  };
  object.userData = userData;
  object.traverse?.((child) => { child.userData = userData; });
  return object;
}

function cylinderBetween(start, end, radius, color, name, radialSegments = 32) {
  const dir = new THREE.Vector3().subVectors(end, start);
  const length = dir.length();
  if (length < 0.01) return null;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, radialSegments), material(color));
  mesh.name = name || 'plant-cylinder';
  mesh.position.copy(midpoint(start, end));
  orientFromY(mesh, dir.normalize());
  return mesh;
}

class PolylineCurve3 extends THREE.Curve {
  constructor(points) {
    super();
    this.points = points.map((point) => point.clone());
    this.lengths = [0];
    for (let i = 1; i < this.points.length; i += 1) this.lengths[i] = this.lengths[i - 1] + this.points[i].distanceTo(this.points[i - 1]);
    this.totalLength = this.lengths[this.lengths.length - 1] || 1;
  }
  getPoint(t, target = new THREE.Vector3()) {
    if (!this.points.length) return target.set(0, 0, 0);
    if (this.points.length === 1) return target.copy(this.points[0]);
    const distance = THREE.MathUtils.clamp(t, 0, 1) * this.totalLength;
    let i = 1;
    while (i < this.lengths.length - 1 && this.lengths[i] < distance) i += 1;
    const prevLength = this.lengths[i - 1];
    const segLength = Math.max(this.lengths[i] - prevLength, EPS);
    return target.copy(this.points[i - 1]).lerp(this.points[i], (distance - prevLength) / segLength);
  }
}

function buildPipeObject(comp) {
  const start = compStart(comp); const end = compEnd(comp);
  if (!start || !end || start.distanceTo(end) < 0.1) return null;
  const radius = pipeRadius(comp);
  return stamp(cylinderBetween(start, end, radius, 0xb8bec8, comp.id || 'pipe'), {
    entity: 'plant-pipe', sourceId: comp.id, sourceType: comp.type, fromNode: comp.fromNode, toNode: comp.toNode,
    glbShape: 'straight-cylinder', topologyContract: 'straight-pipe-span', extra: { diameterMm: diameterMm(comp), radiusMm: radius },
  });
}

function buildRigidObject(comp) {
  const start = compStart(comp); const end = compEnd(comp);
  if (!start || !end || start.distanceTo(end) < 0.1) return null;
  const radius = pipeRadius(comp);
  const obj = cylinderBetween(start, end, radius, 0xb8bec8, comp.id || 'rigid-inline', 32);
  return stamp(obj, {
    entity: 'plant-rigid', sourceId: comp.id, sourceType: comp.type, fromNode: comp.fromNode, toNode: comp.toNode,
    glbShape: 'full-span-rigid-inline-sleeve', topologyContract: 'rigid-filled-span-no-gap', extra: { diameterMm: diameterMm(comp), radiusMm: radius },
  });
}

function buildFlangeObject(comp) {
  const start = compStart(comp); const end = compEnd(comp);
  if (!start || !end || start.distanceTo(end) < 0.1) return null;
  const axis = safeDirection(start, end);
  const center = midpoint(start, end);
  const length = start.distanceTo(end);
  const radius = pipeRadius(comp);
  const group = new THREE.Group(); group.name = comp.id || 'flange';

  const spool = cylinderBetween(start, end, radius * 1.01, 0xb8bec8, `${group.name}-filled-spool`, 32);
  if (spool) group.add(spool);

  const ringCount = String(comp.type || '').toUpperCase() === 'FLANGE_PAIR' ? 2 : 1;
  const collarThickness = Math.min(Math.max(radius * 0.22, 4), Math.max(length * 0.42, 1));
  const offsets = ringCount === 2 ? [-Math.max(length * 0.28, collarThickness * 0.6), Math.max(length * 0.28, collarThickness * 0.6)] : [0];
  offsets.forEach((offset, index) => {
    const cc = center.clone().add(axis.clone().multiplyScalar(offset));
    const ring = cylinderBetween(
      cc.clone().add(axis.clone().multiplyScalar(-collarThickness / 2)),
      cc.clone().add(axis.clone().multiplyScalar(collarThickness / 2)),
      radius * 1.42,
      0x969aa0,
      `${group.name}-collar-${index + 1}`,
      40,
    );
    if (ring) group.add(ring);
  });

  return stamp(group, {
    entity: 'plant-flange', sourceId: comp.id, sourceType: comp.type, fromNode: comp.fromNode, toNode: comp.toNode,
    glbShape: ringCount === 2 ? 'filled-flange-pair' : 'filled-flange', topologyContract: 'component-span-filled-no-gap',
    extra: { diameterMm: diameterMm(comp), radiusMm: radius },
  });
}

function buildValveObject(comp) {
  const start = compStart(comp); const end = compEnd(comp);
  if (!start || !end || start.distanceTo(end) < 0.1) return null;
  const axis = safeDirection(start, end);
  const center = midpoint(start, end);
  const length = start.distanceTo(end);
  const radius = pipeRadius(comp);
  const group = new THREE.Group(); group.name = comp.id || 'valve';

  const body = cylinderBetween(start, end, radius * (String(comp.type).toUpperCase() === 'VALVE_FLANGED' ? 1.2 : 1.15), 0x7e8892, `${group.name}-body`, 40);
  if (body) group.add(body);

  const collarThickness = Math.min(Math.max(radius * 0.2, 3), Math.max(length * 0.18, 1));
  [
    { point: start.clone().add(axis.clone().multiplyScalar(collarThickness * 0.55)), label: 'start' },
    { point: end.clone().add(axis.clone().multiplyScalar(-collarThickness * 0.55)), label: 'end' },
  ].forEach(({ point, label }) => {
    const collar = cylinderBetween(
      point.clone().add(axis.clone().multiplyScalar(-collarThickness / 2)),
      point.clone().add(axis.clone().multiplyScalar(collarThickness / 2)),
      radius * 1.42,
      0x969aa0,
      `${group.name}-${label}-collar`,
      40,
    );
    if (collar) group.add(collar);
  });

  const side = sideAxis(axis);
  const stem = cylinderBetween(center.clone().add(side.clone().multiplyScalar(radius * 1.05)), center.clone().add(side.clone().multiplyScalar(radius * 1.48)), Math.max(radius * 0.07, 0.8), 0x565c65, `${group.name}-stem`, 12);
  if (stem) group.add(stem);

  return stamp(group, {
    entity: 'plant-valve', sourceId: comp.id, sourceType: comp.type, fromNode: comp.fromNode, toNode: comp.toNode,
    glbShape: 'full-span-compact-valve', topologyContract: 'component-span-filled-no-gap',
    extra: { diameterMm: diameterMm(comp), radiusMm: radius },
  });
}

function buildReducerObject(comp) {
  const start = compStart(comp); const end = compEnd(comp);
  if (!start || !end || start.distanceTo(end) < 0.1) return buildPipeObject(comp);
  const radius = pipeRadius(comp);
  const mesh = cylinderBetween(start, end, radius, 0xa0a6ae, comp.id || 'reducer-filled-span', 32);
  return stamp(mesh, {
    entity: 'plant-reducer', sourceId: comp.id, sourceType: comp.type, fromNode: comp.fromNode, toNode: comp.toNode,
    glbShape: 'reducer-source-span', topologyContract: 'filled-source-span', extra: { diameterMm: diameterMm(comp), radiusMm: radius },
  });
}

function buildOletObject(comp) {
  const start = compStart(comp); const end = compEnd(comp);
  if (!start || !end || start.distanceTo(end) < 0.1) return null;
  const radius = pipeRadius(comp);
  const obj = cylinderBetween(start, end, radius * 0.92, 0xa0b2a4, comp.id || 'olet-span', 24);
  return stamp(obj, {
    entity: 'plant-olet', sourceId: comp.id, sourceType: comp.type, fromNode: comp.fromNode, toNode: comp.toNode,
    glbShape: 'olet-filled-span', topologyContract: 'filled-source-span', extra: { diameterMm: diameterMm(comp), radiusMm: radius },
  });
}

function buildBendArcObject(arc, index) {
  const points = (arc.pointsGlbMm || arc.points || []).map(asVector).filter(Boolean);
  if (points.length < 2) return null;
  const pipeRadiusMm = Math.max(Number(arc.pipeRadiusMm || arc.radiusPipeMm || arc.diameterMm / 2 || 10), 0.5);
  const curve = new PolylineCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, Math.max(6, points.length * 5), pipeRadiusMm, 20, false);
  const mesh = new THREE.Mesh(geometry, material(0xb8bec8));
  mesh.name = `bend-${arc.recordId || arc.id || index}`;
  return stamp(mesh, {
    entity: 'plant-bend', sourceId: String(arc.recordId || arc.id || index), sourceType: 'BEND',
    glbShape: 'compact-bend-arc', topologyContract: 'compact-elbow-arc-not-route-spline',
    extra: { bendRecordId: String(arc.recordId || arc.id || index), componentKind: 'BEND', pipeRadiusMm },
  });
}

function buildScene(sidecar, colorMode) {
  const scene = new THREE.Scene();
  scene.name = `BM_CII_v22_plant_only_${colorMode}`;
  const stats = { pipe: 0, bend: 0, valve: 0, flange: 0, rigid: 0, tee: 0, reducer: 0, cap: 0, skipped: 0 };
  for (const comp of sidecar.components || []) {
    const type = String(comp.type || '').toUpperCase();
    if (SUPPORT_OR_ANNOTATION_TYPES.has(type)) { stats.skipped += 1; continue; }
    let object = null;
    if (type === 'PIPE' || type === 'PIPE_TRIMMED_FOR_BEND') { object = buildPipeObject(comp); if (object) stats.pipe += 1; }
    else if (type === 'RIGID' || type === 'RIGID_UNSPECIFIED') { object = buildRigidObject(comp); if (object) stats.rigid += 1; }
    else if (type === 'VALVE' || type === 'VALVE_FLANGED') { object = buildValveObject(comp); if (object) stats.valve += 1; }
    else if (type === 'FLANGE' || type === 'FLANGE_PAIR') { object = buildFlangeObject(comp); if (object) stats.flange += 1; }
    else if (type === 'REDUCER' || type === 'REDUCER-CONCENTRIC' || type === 'REDUCER-ECCENTRIC') { object = buildReducerObject(comp); if (object) stats.reducer += 1; }
    else if (type === 'TEE' || type === 'OLET') { object = buildOletObject(comp); if (object) stats.tee += 1; }
    else { stats.skipped += 1; }
    if (object) scene.add(object);
  }

  (sidecar.bendTrimArcs || []).forEach((arc, index) => {
    const object = buildBendArcObject(arc, index);
    if (object) { scene.add(object); stats.bend += 1; }
  });

  scene.userData = {
    scriptSchema: SCRIPT_SCHEMA,
    visualReviewMode: 'plant-only-v22',
    disabled: ['supports', 'restraints', 'annotations', 'nodeLabels', 'callouts', 'debugMarkers'],
    fix: 'inline components fill their source spans; flanges/collars attached to faces; no loose washers/cylinders',
    stats,
  };
  return { scene, stats };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(usage()); return; }
  const sidecar = await readJson(args.sidecarPath);
  await fs.mkdir(args.outDir, { recursive: true });
  const { scene, stats } = buildScene(sidecar, args.colorMode);
  const suffix = args.colorMode === 'temp1' ? 'temp1' : 'engineering';
  const glbPath = path.join(args.outDir, `BM_CII_Enriched_v22_plant_topology_inline_${suffix}.glb`);
  const manifestPath = path.join(args.outDir, `BM_CII_Enriched_v22_plant_topology_inline_${suffix}.manifest.json`);
  await fs.writeFile(glbPath, await exportGlb(scene));
  await writeJson(manifestPath, {
    schema: SCRIPT_SCHEMA,
    generatedAtUtc: new Date().toISOString(),
    sidecar: path.resolve(args.sidecarPath),
    glb: path.resolve(glbPath),
    colorMode: args.colorMode,
    stats,
    visualAcceptance: 'pending-user-review',
    baselineFrozen: false,
  });
  console.log(JSON.stringify({ ok: true, glbPath, manifestPath, stats }, null, 2));
}

main().catch((error) => { console.error(error?.stack || String(error)); process.exitCode = 1; });
