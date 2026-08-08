import fs from 'node:fs';

let failures = 0;
const app = fs.readFileSync('assets/js/app.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const version = JSON.parse(fs.readFileSync('version.json', 'utf8')).version;

function check(condition, message) {
  if (condition) console.log(`PASS - ${message}`);
  else { console.error(`FAIL - ${message}`); failures += 1; }
}

const dashboardStart = app.indexOf('function dashboardData');
const renderStart = app.indexOf('function renderDashboard');
const nextMajor = renderStart >= 0 ? app.indexOf('\nfunction ', renderStart + 10) : -1;
const dashboardSlice = dashboardStart >= 0 && renderStart >= 0
  ? app.slice(dashboardStart, nextMajor > renderStart ? nextMajor : renderStart + 30000)
  : '';

check(dashboardStart >= 0, 'dashboardData exists');
check(renderStart >= 0, 'renderDashboard exists');
check(!/customerSupabase|\.from\s*\(|\.rpc\s*\(/.test(dashboardSlice), 'Dashboard has no direct Supabase access');
check(/customers/i.test(dashboardSlice), 'Dashboard consumes customers state');
check(/followups/i.test(dashboardSlice), 'Dashboard consumes followups state');
check(/quotations/i.test(dashboardSlice), 'Dashboard consumes quotations state');
check(index.includes(`smart-cache.js?v=${version}`), 'Smart Cache loads before application');
check(index.indexOf('smart-cache.js') < index.indexOf('app.js'), 'Smart Cache load order is valid');
check(index.includes(`app.js?v=${version}`), 'Dashboard application version is unified');

if (failures) {
  console.error(`Dashboard Offline Certification: FAIL (${failures})`);
  process.exit(1);
}
console.log('Dashboard Offline Certification: PASS');
