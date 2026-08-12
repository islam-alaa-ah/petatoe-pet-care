import fs from "node:fs";
const read = p => fs.readFileSync(p, "utf8");
const checks = [
  ["canonical resolver registered", read("assets/js/data-access-scope.js").includes("window.KYUMDataAccessScope")],
  ["customers use canonical scope", read("assets/js/customers-service.js").includes("KYUMDataAccessScope.resolve")],
  ["followups use canonical scope", read("assets/js/followups-service.js").includes("KYUMDataAccessScope.resolve")],
  ["quotations use canonical scope", read("assets/js/quotations-service.js").includes("KYUMDataAccessScope.resolve")],
  ["sales representative baseline removed", !read("assets/js/permissions.js").includes("roleActionBaseline")],
  ["legacy role action visibility removed", !read("assets/js/permissions.js").includes("manage_followups\"))")],
  ["import mapping canonical", read("assets/js/permission-engine.js").includes('import: "can_add"')],
  ["daily rows permission-owned visibility", read("assets/js/app.js").includes("listPermissionOwnedCrmData") && read("assets/js/app.js").includes("function dailyScopedRows(rows) {\n  return rows || [];")],
  ["representative dropdown canonical scoped", read("assets/js/app.js").includes("filterRepresentatives(representatives")],
  ["restrictive default scope", !read("assets/js/users-service.js").includes('["super_admin", "sales_manager", "viewer"].includes')],
  ["resolver in html", read("index.html").includes("assets/js/data-access-scope.js")],
  ["resolver in app shell", read("service-worker.js").includes("assets/js/data-access-scope.js")]
];
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? "PASS" : "FAIL"} - ${name}`); if (!ok) failed++; }
console.log(`${checks.length-failed}/${checks.length} PASS`);
process.exit(failed ? 1 : 0);
