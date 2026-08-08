import fs from "node:fs";
const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const files = {
  queue: read("assets/js/offline-queue.js"), sync: read("assets/js/sync-engine.js"),
  customers: read("assets/js/customers-service.js"), followups: read("assets/js/followups-service.js"),
  quotations: read("assets/js/quotations-service.js"), center: read("assets/js/sync-recovery-center.js"),
  html: read("index.html"), sw: read("service-worker.js"), version: read("version.json")
};
const checks = [
  ["Queue exposes retryAll", /retryAll/.test(files.queue)],
  ["Queue M13.13", /version: "M13\.13"/.test(files.queue)],
  ["Sync engine has no navigator online hard gate", !/if \(!task \|\| navigator\.onLine === false\)/.test(files.sync) && !/if \(navigator\.onLine === false\) return Promise\.resolve/.test(files.sync)],
  ["Customer retryable network fallback", /isRetryableError/.test(files.customers) && /action: "delete"/.test(files.customers)],
  ["Followup retryable network fallback", /isRetryableError/.test(files.followups) && /action: "delete"/.test(files.followups)],
  ["Quotation retryable network fallback", /isRetryableError/.test(files.quotations) && /action: "delete"/.test(files.quotations)],
  ["Recovery Center implementation", /KYUMSyncRecoveryCenter/.test(files.center) && /data-sync-retry/.test(files.center)],
  ["Recovery Center UI", /syncRecoveryRows/.test(files.html) && /syncRetryAllBtn/.test(files.html)],
  ["Recovery Center app shell", /sync-recovery-center\.js/.test(files.sw)],
  ["Version matches runtime cache", (() => { const v = JSON.parse(files.version).version; return files.sw.includes(v.replaceAll(".", "-")); })()]
];
let passed=0;
for (const [name, ok] of checks) { console.log(`${ok ? "PASS" : "FAIL"} — ${name}`); if (ok) passed++; }
console.log(`\n${passed} / ${checks.length} checks passed`);
if (passed !== checks.length) process.exit(1);
