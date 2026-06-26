import fs from 'node:fs';

const app = fs.readFileSync('viewer/core/app.js', 'utf8');
const bridge = fs.readFileSync('viewer/rvm/RvmFileLoadedBridge.js', 'utf8');

const mustContain = [
  {
    text: "../rvm/RvmFileLoadedBridge.js?v=20260618-modular-rvm-file-loaded-1",
    message: 'modular app must install the RVM FILE_LOADED bridge before rendering the RVM tab',
    source: app,
  },
  {
    text: 'on(RuntimeEvents.FILE_LOADED',
    message: 'bridge must listen for FILE_LOADED events',
    source: bridge,
  },
  {
    text: "kind === 'aveva-json'",
    message: 'bridge must route staged managed_stage.json / ATT hierarchy files',
    source: bridge,
  },
  {
    text: "loadRvmSource({ kind: 'aveva-json', data: payload.payload }",
    message: 'bridge must call loadRvmSource for aveva-json payloads',
    source: bridge,
  },
  {
    text: "kind === 'bundle'",
    message: 'bridge must preserve bundle loading',
    source: bridge,
  },
  {
    text: "kind === 'raw-rev'",
    message: 'bridge must preserve REV local conversion',
    source: bridge,
  },
];

const missing = mustContain.filter((item) => !item.source.includes(item.text));
if (missing.length) {
  for (const item of missing) {
    console.error(`❌ ${item.message}`);
  }
  process.exit(1);
}

console.log('✅ RVM FILE_LOADED bridge smoke passed. managed_stage.json routes through loadRvmSource again.');
