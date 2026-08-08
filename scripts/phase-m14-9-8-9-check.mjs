import fs from "node:fs";

const app = fs.readFileSync("assets/js/app.js", "utf8");
const service = fs.readFileSync("assets/js/daily-suggestions-service.js", "utf8");
const version = JSON.parse(fs.readFileSync("version.json", "utf8"));
const sw = fs.readFileSync("service-worker.js", "utf8");

const checks = [
  ["service exposes completeForCustomer", service.includes("completeForCustomer")],
  ["service queries active suggestion by customer", service.includes('.eq("customer_id", customerId)') && service.includes('.eq("status", "active")')],
  ["any saved followup attempts suggestion completion", app.includes("DailySuggestionsService?.completeForCustomer")],
  ["optimistic row removal exists", app.includes("dailySuggestedSuggestionRows = dailySuggestedSuggestionRows.filter")],
  ["progress increments after completion", app.includes("completed: Number(progress.completed || 0) + 1")],
  ["server reload remains after followup save", app.includes("await loadDailySuggestedCustomers(true)")],
  ["version is 18.46.12", version.version === "18.46.12" && version.build === 184612],
  ["service worker cache token synchronized", sw.includes(version.cacheToken)]
];

let failed = 0;
for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} - ${name}`);
  if (!passed) failed += 1;
}
if (failed) process.exit(1);
