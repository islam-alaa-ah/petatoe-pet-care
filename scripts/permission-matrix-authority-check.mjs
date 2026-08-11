import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const app = read('assets/js/app.js');
const backup = read('assets/js/backup-service.js');
const backupFn = read('supabase/functions/backup-admin/index.ts');
const manageFn = read('supabase/functions/manage-user/index.ts');
const migration = read('supabase/migrations/phase_p5_11_4_8_permission_matrix_authority_screen_names.sql');

const checks = [
  ['Backup client uses canonical backups key', backup.includes('requirePermission("backups", "export")') && !backup.includes('requirePermission("backup",')],
  ['Backup runtime does not use Super Admin gate', !app.includes('function canManageBackupAndSettings()') && app.includes('requireScreenAction("backups", "export"')],
  ['System settings edit uses matrix', app.includes('requireScreenAction("systemSettings", "edit"')],
  ['System health runtime uses matrix', app.includes('canScreenAction("systemHealth", "view")') && !app.includes('مراقبة النظام متاحة لمدير النظام فقط.')],
  ['Daily team visibility uses matrix', app.includes('canScreenAction("dailyOperations", "export")')],
  ['Backup Edge Function uses matrix row', backupFn.includes('role_screen_permissions') && backupFn.includes('Missing backups.${permissionAction} permission.') && !backupFn.includes('Super Admin only.')],
  ['Manage User Edge Function uses users action permission', manageFn.includes('Missing users.${permissionAction} permission.') && !manageFn.includes('profileError || !callerProfile?.is_active || callerProfile.role !== "super_admin"')],
  ['User data access RLS aligned to users.view/edit', migration.includes("public.has_screen_permission('users','view')") && migration.includes("public.has_screen_permission('users','edit')")],
  ['System health RPC aligned to matrix', migration.includes("public.has_screen_permission('systemHealth','view')")],
  ['Permissions screen appointment names updated', migration.includes("screen_name='جدولة وتوزيع المواعيد'") && migration.includes("group_name='إدارة المواعيد'")],
  ['Permissions screen contracts name updated', migration.includes("screen_name='عقود العملاء'")],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} PASS`);
if (failed) process.exit(1);
