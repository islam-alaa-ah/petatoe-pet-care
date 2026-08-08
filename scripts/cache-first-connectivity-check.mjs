import fs from 'node:fs';
const read = p => fs.readFileSync(p, 'utf8');
const checks = [];
const add = (name, ok, detail='') => checks.push({name, ok, detail});
const cache = read('assets/js/smart-cache.js');
add('Smart Cache supports unlimited stale fallback', cache.includes('allowStaleAnyAge'));
for (const [label,file] of [['Customers','assets/js/customers-service.js'],['Followups','assets/js/followups-service.js'],['Quotations','assets/js/quotations-service.js']]) {
  const s=read(file);
  add(`${label} reads stale cache at any age`, s.includes('allowStaleAnyAge: true'));
  add(`${label} scope has cached fallback`, s.includes('cached scope retained'));
  add(`${label} cache refresh does not depend only on navigator.onLine`, s.includes('if (window.customerSupabase)'));
  add(`${label} exposes read freshness metadata`, s.includes('getLastReadStatus'));
}
const app=read('assets/js/app.js');
add('UI shows last synchronization status', app.includes('formatOfflineCacheStatus'));
const version = JSON.parse(read('version.json')).version;
const cacheVersion = version.replaceAll('.', '-');
add('Version unified', read('index.html').includes(`?v=${version}`) && read('assets/js/pwa.js').includes(version) && read('service-worker.js').includes(`petatoe-pwa-${cacheVersion}`));
for (const c of checks) console.log(`${c.ok?'PASS':'FAIL'}: ${c.name}${c.detail?` — ${c.detail}`:''}`);
const failed=checks.filter(c=>!c.ok);
console.log(`\n${checks.length-failed.length}/${checks.length} PASS`);
if (failed.length) process.exit(1);
