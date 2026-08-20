import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const index=read('index.html');
const sw=read('service-worker.js');
const version=JSON.parse(read('version.json')).version;
const pkg=JSON.parse(read('package.json'));
const phase41=read('scripts/phase-p5-13-8-41-completion-invoice-ghost-check.mjs');
const tokens=[...index.matchAll(/(?:src|href)="assets\/(?:js|css)\/[^"?]+\?v=([^"]+)"/g)].map(m=>m[1]);
const checks=[
 ['release metadata is unified', pkg.version===version && read('assets/js/pwa.js').includes(`CURRENT_VERSION = "${version}"`)],
 ['all local CSS/JS tokens use the release version', tokens.length>0 && tokens.every(v=>v===version)],
 ['service worker cache belongs to release', sw.includes('petatoe-pwa-18-55-66-maintenance-cache-certification')],
 ['versioned assets can reuse canonical shell cache', sw.includes('await matchIgnoringVersion(request, APP_SHELL_CACHE)') && !/requestUrl\.search\s*\?\s*null\s*:\s*await matchIgnoringVersion/.test(sw)],
 ['old caches are still evicted on activation', sw.includes(".filter(key => !key.startsWith(CACHE_VERSION))")],
 ['phase 41 compatibility check follows canonical phase 42 DB authority', phase41.includes('invoice group expansion is delegated to canonical DB authority') && phase41.includes('groupAuthorityMigration')],
 ['no legacy JS group expansion was reintroduced', !read('assets/js/installations-service.js').includes('completionCandidateVisits')]
];
let fail=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} - ${name}`); if(!ok) fail++;}
console.log(`Maintenance/cache certification: ${checks.length-fail}/${checks.length} PASS`);
if(fail) process.exit(1);
