import fs from 'node:fs';

const tabsCss = fs.readFileSync('viewer/styles/tabs.css', 'utf8');
const indexHtml = fs.readFileSync('viewer/index.html', 'utf8');

const requiredCssTokens = [
  '.app-shell',
  '.app-nav',
  '.app-nav-group',
  '.app-nav-group-label',
  '.app-nav button[data-tab-id]',
  '.app-nav button[data-tab-id].active',
  '.app-content',
];

const missingCss = requiredCssTokens.filter((token) => !tabsCss.includes(token));
if (missingCss.length) {
  console.error('Missing modular app shell CSS selectors:', missingCss.join(', '));
  process.exit(1);
}

if (!/styles\/tabs\.css\?v=20260618-modular-app-shell-1/.test(indexHtml)) {
  console.error('viewer/index.html does not cache-bust the modular app shell tabs.css import.');
  process.exit(1);
}

console.log('✅ App shell CSS smoke passed. Modular tab buttons have matching CSS selectors.');
