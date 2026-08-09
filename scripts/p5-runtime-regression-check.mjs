import fs from "node:fs";

const checks = [];
const add = (name, ok) => checks.push({ name, ok: Boolean(ok) });
const read = path => fs.readFileSync(path, "utf8");

const packageJson = JSON.parse(read("package.json"));
const versionJson = JSON.parse(read("version.json"));
const pwa = read("assets/js/pwa.js");
const sw = read("service-worker.js");
const installations = read("assets/js/installations-module.js");
const dailyOps = read("assets/js/daily-operations-service.js");
const dailyAlerts = read("assets/js/daily-alerts-service.js");
const dailyActivity = read("assets/js/daily-activity-service.js");
const policy = JSON.parse(read("enterprise-offline-policy.json"));

add("package/version.json unified", packageJson.version === versionJson.version);
add("PWA/version.json unified", pwa.includes(`const CURRENT_VERSION = "${versionJson.version}";`));
add("service worker cache token unified", sw.includes(`const CACHE_VERSION = "${versionJson.cacheToken}";`));

add("daily task PostgREST relationship contract retained",
  dailyOps.includes("daily_task_completions_user_profile_fkey"));
add("daily alerts PostgREST relationship contract retained",
  dailyAlerts.includes("daily_alerts_user_profile_fkey"));

add("appointment prefill no legacy customer geo select",
  !/customer:customers\([^)]*\bregion\b[^)]*\)/s.test(installations)
  && !/customer:customers\([^)]*\bcity\b[^)]*\)/s.test(installations)
  && !/customer:customers\([^)]*\bdistrict\b[^)]*\)/s.test(installations));

add("new appointment no customer representative ownership",
  !installations.includes("representativeId: customer?.representative_id"));

add("daily activity uses contracts terminology",
  dailyActivity.includes('quotations: "عقود العملاء"'));
add("daily activity uses appointments terminology",
  dailyActivity.includes('installation_requests: "المواعيد"'));

const requiredRegistered = [
  "assets/js/data-access-scope.js",
  "assets/js/installation-operations-reports.js",
  "assets/js/installation-scheduling.js",
  "assets/js/installation-settings-management.js",
  "assets/js/installations-module.js",
  "assets/js/notification-center-service.js",
  "assets/js/sales-invoices-service.js"
];
add("all known direct data modules registered",
  requiredRegistered.every(file => policy.registeredDirectDataFiles.includes(file)));

for (const check of checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"} - ${check.name}`);
}
const failed = checks.filter(check => !check.ok);
console.log(`${checks.length - failed.length}/${checks.length} PASS`);
if (failed.length) process.exit(1);
