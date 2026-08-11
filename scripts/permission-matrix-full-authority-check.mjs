import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const users = read('assets/js/users-service.js');
const migration = read('supabase/migrations/phase_p5_11_4_9_permission_matrix_full_authority_recovery.sql');

const checks = [
  ['CRM scope save is atomic RPC', users.includes('.rpc("save_user_data_access_scope"') && !users.includes('.from("user_data_access_profiles")\n      .upsert')],
  ['Appointment scope save is atomic RPC', users.includes('.rpc("save_installation_data_access_scope"') && !users.includes('.from("installation_data_access_profiles").upsert')],
  ['Scope save still requires users.edit', users.includes('requirePermission("users", "edit")')],
  ['Canonical appointment access mode exists', migration.includes('function public.current_installation_data_access_mode()')],
  ['All appointments bypass team binding for non-viewer', migration.includes("when public.current_installation_data_access_mode()='all' then true")],
  ['Groomer Driver remains team-only', migration.includes("when public.current_user_role()='viewer' then") && migration.includes('public.can_access_installation_team(p_installation_team_id)')],
  ['Selected and own remain representative scoped', migration.includes('public.can_access_installation_representative(p_representative_id)')],
  ['CRM scope RPC authorized by users.edit', migration.includes('function public.save_user_data_access_scope') && migration.includes("public.has_screen_permission('users','edit')")],
  ['Appointment scope RPC authorized by users.edit', migration.includes('function public.save_installation_data_access_scope') && migration.includes("Missing users.edit permission")],
  ['Historical scope policies are normalized', migration.includes("'user_data_access_profiles'") && migration.includes('drop policy if exists %I on public.%I')],
  ['User scope RLS follows users view edit', migration.includes('create policy "user data access profiles read"') && migration.includes('create policy "user data access profiles manage"')],
  ['Appointment scope RLS follows users view edit', migration.includes('create policy "appointment data access profiles read"') && migration.includes('create policy "appointment data access profiles manage"')],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} PASS`);
if (failed) process.exit(1);
