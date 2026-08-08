import fs from 'node:fs';
const checks=[];
function check(name,ok){checks.push({name,ok:Boolean(ok)});console.log(`${ok?'PASS':'FAIL'} - ${name}`)}
const auth=fs.readFileSync('assets/js/auth-session.js','utf8');
const app=fs.readFileSync('assets/js/app.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const migration=fs.readFileSync('supabase/migrations/phase_m14_9_8_3_permission_visibility_consistency_recovery.sql','utf8');
check('permissions refresh applies actions after authoritative load',auth.includes('PermissionEngine.refresh({ validateCurrentView: false })'));
check('quotation add button has canonical permission metadata',html.includes('id="addQuotationBtn"')&&html.includes('data-permission-screen="quotations" data-permission-action="add"'));
check('quotation renderer no longer races by manually hiding add button',!app.includes('classList.toggle("hidden", !canManageQuotations("add"))'));
check('installation ownership is synchronized to customer representative',migration.includes('trg_sync_installation_request_representative'));
check('requests view is not blocked by installation team scope',migration.includes("public.has_screen_permission('installationRequests','view')"));
const failed=checks.filter(x=>!x.ok);
console.log(`\n${checks.length-failed.length}/${checks.length} checks passed.`);
if(failed.length)process.exit(1);
