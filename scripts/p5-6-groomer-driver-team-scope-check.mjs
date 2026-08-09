import fs from "node:fs";

const read = p => fs.readFileSync(p, "utf8");
const permissions = read("assets/js/permissions.js");
const app = read("assets/js/app.js");
const users = read("assets/js/users-service.js");
const installations = read("assets/js/installations-service.js");
const html = read("index.html");
const migration = read("supabase/migrations/p5_6_groomer_driver_team_only_scope.sql");

const checks = [
  ["viewer visible label", permissions.includes('viewer: "جرومر / سائق"')],
  ["representative hidden for viewer", app.includes('representativeField?.classList.toggle("hidden", isTeamOperatorRole)')],
  ["viewer representative forced null", app.includes('document.getElementById("userRole").value === "viewer" ? null')],
  ["viewer team required", app.includes('اختر فرقة المواعيد المرتبطة بالجرومر / السائق')],
  ["technician name input hidden", html.includes('id="userInstallationTechnicianName" type="hidden"')],
  ["team-only runtime identity", installations.includes("isTechnicianRole&&accessMode==='own'&&teamId")],
  ["viewer request scope bypasses representative", migration.includes("when public.current_user_role()='viewer' then") && migration.includes("public.can_access_installation_team(p_installation_team_id)")],
  ["viewer assignment scope uses team", migration.includes("b.installation_team_id=p_installation_team_id")],
  ["viewer representative cleanup", migration.includes("set representative_id=null")],
  ["viewer rep scope cleanup", migration.includes("delete from public.user_data_access_representatives")]
];

for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} - ${name}`);
const failed = checks.filter(([,ok]) => !ok);
console.log(`${checks.length - failed.length}/${checks.length} PASS`);
if (failed.length) process.exit(1);
