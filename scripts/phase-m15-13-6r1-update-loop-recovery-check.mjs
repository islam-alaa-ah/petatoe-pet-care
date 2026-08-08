import fs from 'node:fs';
const files = {
  pwa: fs.readFileSync('assets/js/pwa.js','utf8'),
  index: fs.readFileSync('index.html','utf8'),
  sw: fs.readFileSync('service-worker.js','utf8'),
  version: JSON.parse(fs.readFileSync('version.json','utf8')),
  pkg: JSON.parse(fs.readFileSync('package.json','utf8')),
};
const checks = [
  ['pwa current version', files.pwa.includes('const CURRENT_VERSION = "18.53.33";')],
  ['version manifest', files.version.version === '18.53.33'],
  ['package version', files.pkg.version === '18.53.33'],
  ['index cache refs', files.index.includes('assets/js/pwa.js?v=18.53.33')],
  ['service worker token', files.sw.includes('18-53-33-update-loop-recovery')],
  ['no stale pwa runtime version', !files.pwa.includes('const CURRENT_VERSION = "18.53.31";') && !files.pwa.includes('const CURRENT_VERSION = "18.53.32";')],
];
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
if (checks.some(([,ok])=>!ok)) process.exit(1);
