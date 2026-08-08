import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const fail = message => { console.error(`FAIL: ${message}`); process.exitCode = 1; };
const pass = message => console.log(`PASS: ${message}`);

const index = read("index.html");
const sw = read("service-worker.js");
const version = JSON.parse(read("version.json"));
const pkg = JSON.parse(read("package.json"));

const localAssets = [...index.matchAll(/(?:src|href)="(assets\/(?:js|css)\/[^"?]+)(?:\?[^\"]*)?"/g)]
  .map(match => `./${match[1]}`);
const uniqueAssets = [...new Set(localAssets)];
const missingFromShell = uniqueAssets.filter(asset => !sw.includes(`"${asset}"`));

if (missingFromShell.length) fail(`App Shell missing: ${missingFromShell.join(", ")}`);
else pass(`All ${uniqueAssets.length} local CSS/JS assets are registered in App Shell`);

if (!sw.includes("ignoreSearch: true")) fail("Service Worker does not normalize versioned asset requests");
else pass("Version query strings are normalized with ignoreSearch");

for (const vendor of [
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
  "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
  "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"
]) {
  if (!sw.includes(vendor)) fail(`Vendor asset is not registered: ${vendor}`);
}
if (!process.exitCode) pass("Critical CDN libraries are registered in Vendor Cache");

if (sw.includes("cache.addAll(APP_SHELL)")) fail("Legacy all-or-nothing cache.addAll installation is still present");
else pass("App Shell installation is resilient and caches assets independently");

const expectedVersion = version.version;
if (version.version !== expectedVersion || pkg.version !== expectedVersion) {
  fail(`Version mismatch: version.json=${version.version}, package.json=${pkg.version}`);
} else pass(`Release version is unified at ${expectedVersion}`);

const staleLocalVersions = [...index.matchAll(/(?:src|href)="assets\/(?:js|css)\/[^"?]+\?v=([^\"]+)"/g)]
  .map(match => match[1])
  .filter(value => value !== expectedVersion);
if (staleLocalVersions.length) fail(`Stale local asset versions: ${[...new Set(staleLocalVersions)].join(", ")}`);
else pass("All local CSS/JS version tokens are unified");

if (!sw.includes("daily-suggestions-service.js") || !sw.includes("representative-excel-center.js") || !sw.includes("native.js")) {
  fail("Previously omitted runtime scripts are still missing from App Shell");
} else pass("Previously omitted runtime scripts are now included");

if (!process.exitCode) console.log("\nOffline Runtime Reliability Certification: PASS");
