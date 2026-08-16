import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const catalog = fs.readFileSync(new URL('../assets/js/localization-center.js', import.meta.url), 'utf8');
const service = fs.readFileSync(new URL('../assets/js/localization-center-service.js', import.meta.url), 'utf8');
const notifications = fs.readFileSync(new URL('../assets/js/notification-center.js', import.meta.url), 'utf8');
const arabic = /[\u0600-\u06FF]/;

const start = catalog.indexOf('const rows=[');
const end = catalog.indexOf('];\n  const defaults=', start);
if (start < 0 || end < 0) throw new Error('Unable to locate canonical localization rows');
const literal = catalog.slice(start + 'const rows='.length, end + 1);
const rawRows = vm.runInNewContext(literal, Object.create(null), { timeout: 1000 });
const keyRows = rawRows.map(([key, type, ar, en]) => ({ key, type, ar, en }));
const keys = new Set(keyRows.map(row => row.key));
const usedKeys = new Set([
  ...[...html.matchAll(/data-petatoe-i18n="([^"]+)"/g)].map(m => m[1]),
  ...[...html.matchAll(/data-petatoe-i18n-aria="([^"]+)"/g)].map(m => m[1]),
  ...[...html.matchAll(/data-petatoe-i18n-title="([^"]+)"/g)].map(m => m[1]),
  ...[...html.matchAll(/data-execution-i18n="([^"]+)"/g)].map(m => m[1]),
  ...[...html.matchAll(/data-execution-i18n-placeholder="([^"]+)"/g)].map(m => m[1]),
]);
const missing = [...usedKeys].filter(key => !keys.has(key));
if (missing.length) throw new Error(`Missing localization keys: ${missing.join(', ')}`);

const protectedRows = keyRows.filter(row => row.key.startsWith('sidebar.') || row.key.startsWith('shared.') || row.key.startsWith('execution.'));
const englishLeak = protectedRows.filter(row => arabic.test(String(row.en || '')));
if (englishLeak.length) throw new Error(`Arabic leakage in English catalog: ${englishLeak.map(x => x.key).join(', ')}`);

const sidebarRows = keyRows.filter(row => row.key.startsWith('sidebar.'));
if (sidebarRows.length < 30) throw new Error(`Sidebar translation regression: only ${sidebarRows.length} keys found`);
if (!service.includes("'shared'")) throw new Error('Translation Center service does not load shared catalog rows');

const requiredMarkup = [
  'data-petatoe-i18n="shared.header.menu"',
  'data-petatoe-i18n-aria="shared.header.notifications"',
  'data-petatoe-i18n="shared.header.markAllRead"',
  'data-petatoe-i18n="shared.header.systemUser"',
  'data-petatoe-i18n-aria="shared.header.scrollAria"',
  'data-petatoe-i18n-title="shared.header.scrollTitle"',
];
for (const marker of requiredMarkup) if (!html.includes(marker)) throw new Error(`Missing shared UI localization marker: ${marker}`);

for (const key of ['shared.notifications.empty','shared.notifications.now','shared.notifications.minutesAgo','shared.notifications.hoursAgo']) {
  if (!notifications.includes(key)) throw new Error(`Notification shell is not using ${key}`);
}

console.log('P5.13.3 Localization Lockdown: PASSED');
console.log(`Catalog rows: ${keyRows.length}`);
console.log(`Sidebar preserved: ${sidebarRows.length} keys`);
console.log(`Shared UI: ${keyRows.filter(x => x.key.startsWith('shared.')).length} keys`);
console.log(`Referenced keys checked: ${usedKeys.size}`);
