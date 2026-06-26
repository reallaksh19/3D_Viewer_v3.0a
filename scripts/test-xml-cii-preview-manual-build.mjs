import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const previewPath = path.join(repoRoot, 'viewer/tabs/model-converters/converters/xmltocii2019_helper/preview-renderer.js');
const source = fs.readFileSync(previewPath, 'utf8');

const checks = [
  {
    name: 'Preview phase renders a manual build button',
    pass: source.includes('data-mc-preview-build') && source.includes('Build Preview'),
  },
  {
    name: 'Preview build is gated by forceBuild',
    pass: source.includes('forceBuild = false') && source.includes('if (!forceBuild)'),
  },
  {
    name: 'Automatic preview visit renders idle state, not dry-run table',
    pass: source.includes('_renderManualPreviewIdle(host, rootEl, xmlText, config, options);'),
  },
  {
    name: 'Override save does not call refreshPreview',
    pass: !source.includes('refreshPreview();'),
  },
  {
    name: 'Override save leaves manual rebuild notice',
    pass: source.includes('_markPreviewSaved(host') && source.includes('Click Rebuild Preview'),
  },
];

const failed = checks.filter((check) => !check.pass);
for (const check of checks) {
  console.log(`${check.pass ? '✓' : '✗'} ${check.name}`);
}

if (failed.length) {
  console.error(`\n${failed.length} manual-preview regression check(s) failed.`);
  process.exit(1);
}
