import fs from "node:fs";
const required = [
  "assets/js/offline-read-cache.js",
  "assets/js/daily-alerts-service.js",
  "assets/js/daily-suggestions-service.js",
  "assets/js/daily-activity-service.js",
  "assets/js/daily-performance-service.js",
  "assets/js/reference-data-service.js"
];
let failures = 0;
for (const file of required) {
  if (!fs.existsSync(file)) { console.error(`FAIL missing ${file}`); failures++; }
}
const app = fs.readFileSync("assets/js/app.js", "utf8");
if (/customerSupabase\s*\n?\s*\.from\(["']daily_alerts["']\)/.test(app)) { console.error("FAIL direct daily_alerts read remains in app.js"); failures++; }
for (const file of required.slice(1,5)) {
  const text = fs.readFileSync(file,"utf8");
  if (!text.includes("KYUMOfflineReadCache")) { console.error(`FAIL ${file} is not cache-first`); failures++; }
}
const index = fs.readFileSync("index.html","utf8");
const version = JSON.parse(fs.readFileSync("version.json","utf8")).version;
if (!index.includes(`offline-read-cache.js?v=${version}`)) { console.error("FAIL helper load order/version"); failures++; }
if (failures) process.exit(1);
console.log("Remaining Modules Offline Integration: PASS");
