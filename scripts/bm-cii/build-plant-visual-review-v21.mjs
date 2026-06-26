#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const SCRIPT_SCHEMA = 'bm-cii-plant-visual-review-v21/v1';
const DEFAULT_OUT_DIR = 'artifacts/bm-cii-plant-visual-review-v21';
const UP = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const EPS = 1e-6;

const PLANT_TYPES = new Set([
  'PIPE', 'PIPE_TRIMMED_FOR_BEND', 'BEND', 'ELBOW', 'TEE', 'OLET',
  'REDUCER', 'REDUCER-CONCENTRIC', 'REDUCER-ECCENTRIC',
  'VALVE', 'VALVE_FLANGED', 'FLANGE', 'FLANGE_PAIR',
  'RIGID', 'RIGID_UNSPECIFIED', 'CAP',
]);

const SUPPORT_OR_ANNOTATION_TYPES = new Set([
  'SUPPORT', 'RESTRAINT', 'GUIDE', 'LINESTOP', 'LIMIT', 'REST',
  'NODE_LABEL', 'MESSAGE-SQUARE', 'MESSAGE-CIRCLE', 'ANNOTATION',
  'CALL_OUT', 'CALLOUT', 'ISONOTE',
]);

function usage() {
  return `Usage:\n  node scripts/bm-cii/build-plant-visual-review-v21.mjs --sidecar <sidecar.json> [--out-dir <dir>] [--color-mode engineering|temp1]\n\nPurpose:\n  Build BM_CII plant-only visual GLB after v21 inline-component fix.\n  Supports/restraints/annotations remain disabled. RIGID/VALVE/FLANGE are rendered\n  as compact inline plant components, not blue reducers or support artefacts.\n`;
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

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

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
function perpendicularAxis(axis) { const basis = Math.abs(axis.dot(UP)) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP; const side = new THREE.Vector3().crossVectors(axis, basis); return side.length() < EPS ? new THREE.Vector3(1, 0, 0) : side.normalize(); }
function diameterMm(comp = {}, fallback = 50) { return Math.max(Number(comp.diameterMm) || Number(comp.outsideDiameterMm) || Number(comp.outsideDiameter) || Number(comp.bore) || Number(comp.ep1?.bore) || Number(comp.ep2?.bore) || fallback, 1); }
function pipeRadius(comp = {}, fallbackDiameter = 50) { return Math.max(diameterMm(comp, fallbackDiameter) / 2, 0.5); }
function material(color, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.64, metalness: 0.05, ...extra }); }

function stamp(object, data) {
  if (!object) return object;
  const userData = {
    bmCiiTrace: { entity: data.entity || 'plant', visualReviewMode: 'plant-only-v21', sourceId: data.sourceId || '', sourceType: data.sourceType || '', fromNode: data.fromNode || '', toNode: data.toNode || '', glbShape: data.glbShape || '', scriptSchema: SCRIPT_SCHEMA },
    bmCiiLayer: { layerIds: ['plant.geometry'], defaultVisible: true, sourceType: data.sourceType || '' },
    ...data.extra,
  };
  object.userData = userData;
  object.traverse?.((child) => { child.userData = userData; });
  return object;
}

function cylinderBetween(start, end, radius, color, name, radialSegments = 24) {
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
  constructor(points) { super(); this.points = points.map((point) => point.clone()); this.lengths = [0]; for (let i = 1; i < this.points.length; i += 1) this.lengths[i] = this.lengths[i - 1] + this.points[i].distanceTo(this.points[i - 1]); this.totalLength = this.lengths[this.lengths.length - 1] || 1; }
  getPoint(t, target = new THREE.Vector3()) { if (!this.points.length) return target.set(0, 0, 0); if (this.points.length === 1) return target.copy(this.points[0]); const distance = THREE.MathUtils.clamp(t, 0, 1) * this.totalLength; let i = 1; while (i < this.lengths.length - 1 && this.lengths[i] < distance) i += 1; const prevLength = this.lengths[i - 1]; const segLength = Math.max(this.lengths[i] - prevLength, EPS); return target.copy(this.points[i - 1]).lerp(this.points[i], (distance - prevLength) / segLength); }
}

function buildPipeObject(comp) {
  const start = compStart(comp); const end = compEnd(comp);
  if (!start || !end || start.distanceTo(end) < 0.1) return null;
  const radius = pipeRadius(comp);
  return stamp(cylinderBetween(start, end, radius, 0xb8bec8, comp.id || 'pipe'), { entity: 'plant-pipe', sourceId: comp.id, sourceType: comp.type, fromNode: comp.fromNode, toNode: comp.toNode, glbShape: 'straight-cylinder', extra: { diameterMm: diameterMm(comp), radiusMm: radius } });
}

function buildReducerObject(comp) {
  const start = compStart(comp); const end = compEnd(comp);
  if (!start || !end || start.distanceTo(end) < 0.1) return buildPipeObject(comp);
  const r1 = Math.max(Number(comp.startDiameterMm || comp.ep1?.bore || comp.diameterMm || comp.bore || 50) / 2, 0.5);
  const r2 = Math.max(Number(comp.endDiameterMm || comp.ep2?.bore || comp.diameterMm || comp.bore || 50) / 2, 0.5);
  const dir = new THREE.Vector3().subVectors(end, start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, dir.length(), 24), material(0x9aa3ad));
  mesh.name = comp.id || 'reducer'; mesh.position.copy(midpoint(start, end)); orientFromY(mesh, dir.normalize());
  return stamp(mesh, { entity: 'plant-reducer', sourceId: comp.id, sourceType: comp.type, fromNode: comp.fromNode, toNode: comp.toNode, glbShape: 'reducer-taper', extra: { startRadiusMm: r1, endRadiusMm: r2 } });
}

function buildRigidObject(comp) {
  const start = compStart(comp); const end = compEnd(comp);
  if (!start || !end || start.distanceTo(end) < 0.1) return null;
  const radius = pipeRadius(comp);
  const obj = cylinderBetween(start, end, radius * 0.96, 0xaeb5bf, comp.id || 'rigid-inline', 24);
  return stamp(obj, { entity: 'plant-rigid', sourceId: comp.id, sourceType: comp.type, fromNode: comp.fromNode, toNode: comp.toNode, glbShape: 'subtle-rigid-inline-sleeve', extra: { diameterMm: diameterMm(comp), radiusMm: radius } });
}

function buildFlangeObject(comp) {
  const start = compStart(comp); const end = compEnd(comp); const center = start && end ? midpoint(start, end) : (start || end);
  if (!center) return null;
  const axis = start && end ? safeDirection(start, end) : Z_AXIS.clone();
  const radius = pipeRadius(comp); const group = new THREE.Group(); group.name = comp.id || 'flange';
  const ringCount = String(comp.type || '').toUpperCase() === 'FLANGE_PAIR' ? 2 : 1;
  const spacing = ringCount === 2 ? Math.max(radius * 0.95, 6) : 0;
  for (let i = 0; i < ringCount; i += 1) {
    const offset = ringCount === 2 ? (i === 0 ? -spacing : spacing) : 0;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.35, radius * 1.35, Math.max(radius * 0.18, 2), 32), material(0x8b8f98, { metalness: 0.12 }));
    ring.name = `${group.name}-ring-${i + 1}`; ring.position.copy(center.clone().add(axis.clone().multiplyScalar(offset))); orientFromY(ring, axis); group.add(ring);
  }
  return stamp(group, { entity: 'plant-flange', sourceId: comp.id, sourceType: comp.type, fromNode: comp.fromNode, toNode: comp.toNode, glbShape: ringCount === 2 ? 'compact-flange-pair' : 'compact-flange', extra: { diameterMm: diameterMm(comp), radiusMm: radius } });
}

function buildValveObject(comp) {
  const start = compStart(comp); const end = compEnd(comp); const center = start && end ? midpoint(start, end) : (start || end);
  if (!center) return null;
  const axis = start && end ? safeDirection(start, end) : Z_AXIS.clone();
  const radius = pipeRadius(comp); const sourceLength = start && end ? start.distanceTo(end) : radius * 4;
  const length = Math.max(Math.min(sourceLength * 0.62, radius * 5.0), radius * 2.4);
  const group = new THREE.Group(); group.name = comp.id || 'valve';
  const body = cylinderBetween(center.clone().add(axis.clone().multiplyScalar(-length / 2)), center.clone().add(axis.clone().multiplyScalar(length / 2)), radius * 1.10, 0x6f8295, `${group.name}-body`, 32);
  if (body) group.add(body);
  const collarOffset = length * 0.44;
  for (const sign of [-1, 1]) {
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.28, radius * 1.28, Math.max(radius * 0.16, 2), 32), material(0x858b95, { metalness: 0.12 }));
    collar.name = `${group.name}-flange-${sign < 0 ? 'a' : 'b'}`; collar.position.copy(center.clone().add(axis.clone().multiplyScalar(sign * collarOffset))); orientFromY(collar, axis); group.add(collar);
  }
  const bonnetDir = perpendicularAxis(axis);
  const stem = cylinderBetween(center.clone().add(bonnetDir.clone().multiplyScalar(radius * 1.15)), center.clone().add(bonnetDir.clone().multiplyScalar(radius * 2.15)), Math.max(radius * 0.10, 0.7), 0x4b5561, `${group.name}-stem`, 12);
  if (stem) group.add(stem);
  return stamp(group, { entity: 'plant-valve', sourceId: comp.id, sourceType: comp.type, fromNode: comp.fromNode, toNode: comp.toNode, glbShape: 'compact-valve-with-inline-flange-collars', extra: { diameterMm: diameterMm(comp), radiusMm: radius } });
}

function buildTeeOrOletObject(comp) {
  const start = compStart(comp); const end = compEnd(comp); const center = asVector(comp.centrePoint || comp.centerGlbMm) || (start && end ? midpoint(start, end) : (start || end));
  if (!center) return null;
  const radius = pipeRadius(comp); const axis = start && end ? safeDirection(start, end) : Z_AXIS.clone(); const branchPoint = asVector(comp.branch1Point || comp.branchGlbMm); const branchDir = branchPoint ? safeDirection(center, branchPoint) : perpendicularAxis(axis);
  const group = new THREE.Group(); group.name = comp.id || String(comp.type || 'tee').toLowerCase();
  if (start && end && start.distanceTo(end) > 0.1) { const main = cylinderBetween(start, end, radius, 0x9fb6a5, `${group.name}-main`); if (main) group.add(main); }
  const branchLength = branchPoint ? center.distanceTo(branchPoint) : Math.max(radius * 3.0, 20);
  const branch = cylinderBetween(center, center.clone().add(branchDir.clone().multiplyScalar(branchLength)), radius * 0.72, 0x88a892, `${group.name}-branch`);
  if (branch) group.add(branch);
  return stamp(group, { entity: 'plant-branch', sourceId: comp.id, sourceType: comp.type, fromNode: comp.fromNode, toNode: comp.toNode, glbShape: String(comp.type || '').toUpperCase() === 'OLET' ? 'compact-olet' : 'compact-tee', extra: { diameterMm: diameterMm(comp), radiusMm: radius } });
}

function buildCapObject(comp) {
  const center = compStart(comp) || compEnd(comp); if (!center) return null;
  const radius = pipeRadius(comp); const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, Math.max(radius * 0.4, 3), 24), material(0x777b84)); mesh.name = comp.id || 'cap'; mesh.position.copy(center);
  return stamp(mesh, { entity: 'plant-cap', sourceId: comp.id, sourceType: comp.type, fromNode: comp.fromNode, toNode: comp.toNode, glbShape: 'terminal-cap' });
}

function buildBendArcObject(arc = {}, index = 0) {
  const points = (arc.pointsGlbMm || arc.points || []).map(asVector).filter(Boolean);
  if (points.length < 2) return null;
  const radius = Math.max(Number(arc.pipeRadiusMm) || Number(arc.radiusPipeMm) || 10, 0.5);
  const curve = new PolylineCurve3(points);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(points.length * 3, 24), radius, 16, false), material(0xb8bec8));
  mesh.name = `plant-bend-arc-${arc.vertexNode || index}`;
  return stamp(mesh, { entity: 'plant-bend', sourceId: `bendTrimArc:${arc.vertexNode || index}`, sourceType: 'BEND_ARC', fromNode: arc.incomingNode || '', toNode: arc.outgoingNode || '', glbShape: 'compact-polyline-arc-from-bendTrimArcs', extra: { vertexNode: arc.vertexNode || '', radiusMm: Number(arc.radiusMm) || null, pipeRadiusMm: radius, bendContract: 'compact-elbow-arc-not-route-spline' } });
}

function buildPlantComponent(comp) {
  const type = String(comp?.type || '').toUpperCase();
  if (!PLANT_TYPES.has(type) || SUPPORT_OR_ANNOTATION_TYPES.has(type)) return null;
  if (type === 'PIPE' || type === 'PIPE_TRIMMED_FOR_BEND') return buildPipeObject(comp);
  if (type === 'RIGID' || type === 'RIGID_UNSPECIFIED') return buildRigidObject(comp);
  if (type === 'REDUCER' || type === 'REDUCER-CONCENTRIC' || type === 'REDUCER-ECCENTRIC') return buildReducerObject(comp);
  if (type === 'VALVE' || type === 'VALVE_FLANGED') return buildValveObject(comp);
  if (type === 'FLANGE' || type === 'FLANGE_PAIR') return buildFlangeObject(comp);
  if (type === 'TEE' || type === 'OLET') return buildTeeOrOletObject(comp);
  if (type === 'CAP') return buildCapObject(comp);
  return null;
}

function makePlantOnlyModel(sidecar = {}) {
  const components = Array.isArray(sidecar.components) ? sidecar.components : [];
  const plantComponents = []; const skipped = [];
  for (const comp of components) {
    const type = String(comp?.type || '').toUpperCase();
    if (SUPPORT_OR_ANNOTATION_TYPES.has(type)) { skipped.push({ id: comp.id || '', type, reason: 'support-or-annotation-disabled' }); continue; }
    if (!PLANT_TYPES.has(type)) { skipped.push({ id: comp.id || '', type, reason: 'non-plant-or-unsupported-for-visual-review' }); continue; }
    plantComponents.push(comp);
  }
  return { components: plantComponents, bendTrimArcs: Array.isArray(sidecar.bendTrimArcs) ? sidecar.bendTrimArcs : [], skipped };
}

function collectSceneStats(root) {
  const stats = { meshCount: 0, pipeCount: 0, bendCount: 0, valveCount: 0, flangeCount: 0, rigidCount: 0, supportLikeCount: 0, annotationLikeCount: 0, boundingBox: null, basicQc: { pass: true, failures: [] } };
  root.traverse((obj) => {
    const name = String(obj.name || '').toUpperCase(); const trace = obj.userData?.bmCiiTrace || {};
    if (obj.isMesh) stats.meshCount += 1;
    if (trace.entity === 'plant-pipe') stats.pipeCount += 1;
    if (trace.entity === 'plant-bend') stats.bendCount += 1;
    if (trace.entity === 'plant-valve') stats.valveCount += 1;
    if (trace.entity === 'plant-flange') stats.flangeCount += 1;
    if (trace.entity === 'plant-rigid') stats.rigidCount += 1;
    if (/SUPPORT|RESTRAINT|GUIDE|LINESTOP|LIMIT|REST/.test(name)) stats.supportLikeCount += 1;
    if (/ANNOTATION|CALLOUT|ISONOTE|NODE_LABEL|LABEL:/.test(name)) stats.annotationLikeCount += 1;
  });
  const box = new THREE.Box3().setFromObject(root);
  if (!box.isEmpty()) { const size = new THREE.Vector3(); const center = new THREE.Vector3(); box.getSize(size); box.getCenter(center); stats.boundingBox = { min: box.min.toArray(), max: box.max.toArray(), size: size.toArray(), center: center.toArray() }; if (![size.x, size.y, size.z].every(Number.isFinite)) { stats.basicQc.pass = false; stats.basicQc.failures.push('non-finite-bounding-box'); } if (Math.max(size.x, size.y, size.z) <= 1) { stats.basicQc.pass = false; stats.basicQc.failures.push('collapsed-bounding-box'); } } else { stats.basicQc.pass = false; stats.basicQc.failures.push('empty-scene-bounding-box'); }
  if (stats.pipeCount <= 0) { stats.basicQc.pass = false; stats.basicQc.failures.push('no-pipes-rendered'); }
  if (stats.supportLikeCount > 0) { stats.basicQc.pass = false; stats.basicQc.failures.push('support-like-objects-present-in-plant-only-mode'); }
  if (stats.annotationLikeCount > 0) { stats.basicQc.pass = false; stats.basicQc.failures.push('annotation-like-objects-present-in-plant-only-mode'); }
  return stats;
}

function buildPlantVisualReviewScene(sidecar = {}, options = {}) {
  const scene = new THREE.Scene(); scene.name = `BM_CII_plant_visual_review_v21_${options.colorMode || 'engineering'}`;
  const root = new THREE.Group(); root.name = 'PCF_EXPORT_ROOT';
  root.userData = { schema: SCRIPT_SCHEMA, visualReviewMode: 'plant-only-v21', disabled: { supports: true, restraints: true, annotations: true, nodeLabels: true, callouts: true, debugMarkers: true }, layerManifest: { schema: 'bm-cii-plant-only-layer-manifest/v21', layers: [{ id: 'plant.geometry', label: 'Plant Geometry', defaultVisible: true }] } };
  scene.add(root);
  const model = makePlantOnlyModel(sidecar);
  for (const comp of model.components) { const obj = buildPlantComponent(comp); if (obj) root.add(obj); }
  model.bendTrimArcs.forEach((arc, index) => { const obj = buildBendArcObject(arc, index); if (obj) root.add(obj); });
  const stats = collectSceneStats(root); root.userData.plantVisualReviewStats = stats; root.userData.plantVisualReviewSkipped = model.skipped;
  scene.userData = { schema: SCRIPT_SCHEMA, visualReviewMode: 'plant-only-v21', plantVisualReviewStats: stats };
  return { scene, stats, skipped: model.skipped };
}

async function build(args) {
  const sidecar = await readJson(args.sidecarPath); const outDir = path.resolve(args.outDir || DEFAULT_OUT_DIR); await fs.mkdir(outDir, { recursive: true });
  const { scene, stats, skipped } = buildPlantVisualReviewScene(sidecar, { colorMode: args.colorMode });
  const fileName = `BM_CII_plant_visual_review_v21_${args.colorMode === 'temp1' ? 'temp1' : 'engineering'}.glb`; const filePath = path.join(outDir, fileName);
  await fs.writeFile(filePath, await exportGlb(scene)); const fileStat = await fs.stat(filePath);
  const manifest = { schema: 'bm-cii-plant-visual-review-v21-manifest/v1', scriptSchema: SCRIPT_SCHEMA, createdAtUtc: new Date().toISOString(), source: args.sidecarPath, output: { fileName, filePath, bytes: fileStat.size }, visualReviewMode: 'plant-only-v21', inlineComponentFix: { rigid: 'subtle-grey-inline-sleeve', valve: 'compact-valve-with-inline-flange-collars', flange: 'compact-grey-collars', reducer: 'only-real-reducer-uses-taper' }, disabled: { supports: true, restraints: true, annotations: true, nodeLabels: true, callouts: true, debugMarkers: true }, stats, skipped, acceptance: { frozenBaseline: false, userScreenshotAccepted: false, note: 'Review-only GLB. Do not use as frozen benchmark until screenshot acceptance.' } };
  await writeJson(path.join(outDir, 'BM_CII_plant_visual_review_v21.manifest.json'), manifest); return manifest;
}

async function main() {
  try { const args = parseArgs(process.argv.slice(2)); if (args.help) { process.stdout.write(usage()); return; } const manifest = await build(args); process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`); if (!manifest.stats?.basicQc?.pass) process.exitCode = 2; }
  catch (error) { process.stderr.write(`${error?.stack || error?.message || String(error)}\n\n${usage()}`); process.exitCode = 1; }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const modulePath = fileURLToPath(import.meta.url);
if (invokedPath === modulePath) await main();

export { SCRIPT_SCHEMA, build, buildPlantVisualReviewScene, makePlantOnlyModel, parseArgs };
