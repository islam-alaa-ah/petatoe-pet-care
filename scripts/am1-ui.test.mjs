import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {digest} from '../assets/js/attachment-pdf.mjs';
const root=new URL('../',import.meta.url);
const {parseHTML}=await import(pathToFileURL(process.env.PETATOE_AM1_TEST_DEPS+'/linkedom/esm/index.js'));
const source=await readFile(new URL('assets/js/attachment-management.js',root),'utf8');
const html=await readFile(new URL('index.html',root),'utf8');
const application=await readFile(new URL('assets/js/app.js',root),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function settle(predicate){for(let i=0;i<60;i++){await tick();if(predicate())return;}assert.fail('UI did not settle');}
function mount({archiveState='ready',responseOverride}={}){
 const{window,document}=parseHTML(html);let view='dashboard';const requests=[];
 Object.defineProperty(document,'readyState',{value:'complete'});
 // Linkedom lacks browser dialog/file picker APIs and the select.value setter.
 for(const select of document.querySelectorAll('select')){let selected='';Object.defineProperty(select,'value',{get:()=>selected,set:v=>{selected=String(v);},configurable:true});}
 for(const dialog of document.querySelectorAll('dialog')){dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;};}
 const state={user:{id:'admin'},profile:{id:'admin',role:'super_admin',is_active:true},offline:false};
 const file=new Blob(['SYNTHETIC SAVED PDF CONTENT']);
 const archive={id:'archive',month:'2026-10',status:archiveState,confirmed_at:archiveState==='confirmed'?'2026-11-08T00:00:00Z':null,created_at:'2026-11-08T00:00:00Z',item_count:1,remaining:1,protected_count:0,pdf_sha256:digest(new TextEncoder().encode('SYNTHETIC SAVED PDF CONTENT')),pdf_bytes:file.size};
 window.KYUMNavigation={current:()=>view};window.CustomerAuth={getState:()=>state};
 window.PetatoeLocalization={t:key=>key,getLanguage:()=> 'en'};
 window.CUSTOMER_APP_CONFIG={supabaseUrl:'https://example.supabase.co'};
 window.customerSupabase={functions:{invoke:async(name,{body})=>{
  requests.push({name,body});
  if(responseOverride){const result=await responseOverride(body);if(result)return result;}
  if(body.action==='status')return{data:{runtime:'AM1R1',currentMonth:'2026-11',deletionEnabled:true,archives:[{...archive}]}};
  if(body.action==='list')return{data:{items:[],hasMore:false}};
  if(body.action==='confirm'){archive.status='confirmed';archive.confirmed_at='2026-11-08T00:00:00Z';return{data:{confirmed:true}};}
  if(body.action==='purge'){archive.status='purged';archive.remaining=0;return{data:{done:true,removed:1}};}
  return{data:{}};
 }}};
 vm.runInNewContext(source,{window,document,navigator:{onLine:true},URL,AbortController,Blob,console,setTimeout},{filename:fileURLToPath(new URL('assets/js/attachment-management.js',root)),importModuleDynamically:vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER});
 return{window,document,requests,state,file,archive,navigate:async next=>{view=next;window.dispatchEvent(new window.CustomEvent('kyum-view-changed',{detail:{view:next}}));await settle(()=>!window.AttachmentManagement.getStatus().busy);},click:id=>document.getElementById(id).click()};
}
test('real screen markup initializes without requests and loads only when opened',async()=>{
 const h=mount();assert.equal(h.requests.length,0);await h.navigate('attachmentManagement');assert.deepEqual(h.requests.map(x=>x.body.action),['status','list']);
 assert.equal(h.document.getElementById('am1Delete').hidden,true);assert.equal(h.document.getElementById('am1Export').disabled,true);
 await h.navigate('dashboard');assert.equal(h.window.AttachmentManagement.getStatus().listed,0);
});
test('an old backend runtime cannot enable export or proceed to listing',async()=>{
 const h=mount({responseOverride:async body=>body.action==='status'?{data:{runtime:'AM1',currentMonth:'2026-11',deletionEnabled:true,archives:[]}}:null});
 await h.navigate('attachmentManagement');assert.deepEqual(h.requests.map(x=>x.body.action),['status']);
 assert.equal(h.document.getElementById('am1Export').disabled,true);assert.equal(h.document.getElementById('am1Status').textContent,'attachments.error.AM1_REVISION_MISMATCH');
});
test('a wrong saved PDF cannot unlock deletion or display a verified message',async()=>{
 const h=mount();await h.navigate('attachmentManagement');const input=h.document.getElementById('am1PdfFile');
 Object.defineProperty(input,'files',{value:[new Blob(['SYNTHETIC WRONG PDF CONTENT'])],configurable:true});
 input.dispatchEvent(new h.window.Event('change'));await settle(()=>!h.window.AttachmentManagement.getStatus().busy);
 assert.ok(!h.requests.some(x=>x.body.action==='confirm'));assert.equal(h.document.getElementById('am1Delete').hidden,true);assert.equal(h.document.getElementById('am1Status').textContent,'attachments.error.AM1_PDF_MISMATCH');
});
test('the matching saved PDF unlocks the deletion control only after server confirmation',async()=>{
 const h=mount();await h.navigate('attachmentManagement');const input=h.document.getElementById('am1PdfFile');Object.defineProperty(input,'files',{value:[h.file],configurable:true});
 input.dispatchEvent(new h.window.Event('change'));await settle(()=>!h.window.AttachmentManagement.getStatus().busy);
 assert.ok(h.requests.some(x=>x.body.action==='confirm'));assert.equal(h.document.getElementById('am1Delete').hidden,false);assert.equal(h.document.getElementById('am1Status').textContent,'attachments.verified');
});
test('deletion requires the typed month and explicit backup acknowledgment',async()=>{
 const h=mount({archiveState:'confirmed'});await h.navigate('attachmentManagement');h.click('am1Delete');
 assert.equal(h.document.getElementById('am1DeleteExecute').disabled,true);
 const input=h.document.getElementById('am1DeleteConfirm');input.value='2026-10';input.dispatchEvent(new h.window.Event('input'));assert.equal(h.document.getElementById('am1DeleteExecute').disabled,true);
 const checkbox=h.document.getElementById('am1DeleteAccepted');checkbox.checked=true;checkbox.dispatchEvent(new h.window.Event('change'));assert.equal(h.document.getElementById('am1DeleteExecute').disabled,false);
 h.click('am1DeleteExecute');await settle(()=>!h.window.AttachmentManagement.getStatus().busy);
 const request=h.requests.find(x=>x.body.action==='purge');assert.equal(request.body.archiveId,'archive');assert.equal(request.body.confirmMonth,'2026-10');assert.equal(h.document.getElementById('am1Delete').hidden,true);
});
test('identity changes clear previous account data and ignore its late response',async()=>{
 let release;const deferred=new Promise(resolve=>{release=resolve;});
 const h=mount({responseOverride:async body=>body.action==='list'?await deferred:null});
 const navigation=h.navigate('attachmentManagement');await settle(()=>h.requests.some(x=>x.body.action==='list'));
 h.state.user={id:'other'};h.state.profile={id:'other',role:'viewer',is_active:true};h.window.dispatchEvent(new h.window.Event('kyum-auth-state-changed'));
 release({data:{items:[{objectId:'secret',fileName:'OLD ACCOUNT IMAGE'}],hasMore:false}});await navigation;await tick();
 assert.equal(h.window.AttachmentManagement.getStatus().listed,0);assert.ok(!h.document.getElementById('am1Rows').textContent.includes('OLD ACCOUNT IMAGE'));assert.equal(h.document.getElementById('am1Delete').hidden,true);
});
test('untrusted file names and customer metadata are escaped in the actual list',async()=>{
 const h=mount({responseOverride:async body=>body.action==='list'?{data:{items:[{objectId:'id',fileName:'<img src=x onerror=alert(1)>',bucket:'test',bytes:1,uploader:{name:'<script>bad</script>'},customer:{name:'<iframe></iframe>'},source:'<svg onload=alert(1)>',protected:false}],hasMore:false}}:null});
 await h.navigate('attachmentManagement');const rows=h.document.getElementById('am1Rows');assert.equal(rows.querySelectorAll('script,img,iframe,svg').length,0);assert.ok(rows.textContent.includes('<img src=x onerror=alert(1)>'));
});
test('AM2 shows missing-link warnings without inventing a customer or bypassing saved-PDF confirmation',async()=>{
 const h=mount({responseOverride:async body=>body.action==='list'?{data:{items:[{objectId:'id',fileName:'evidence.jpg',bucket:'installation-evidence',bytes:100,uploader:{name:'Uploader'},customer:null,reference:null,source:'unmapped',sourceMatches:0,protected:false,mappingWarning:'UNMAPPED_BACKUP_REQUIRED'}],hasMore:false}}:null});
 await h.navigate('attachmentManagement');const rows=h.document.getElementById('am1Rows');
 assert.ok(rows.textContent.includes('attachments.warning.UNMAPPED_BACKUP_REQUIRED'));
 assert.ok(rows.textContent.includes('attachments.notLinked'));assert.ok(rows.textContent.includes('attachments.unknown'));
 assert.equal(h.document.getElementById('am1Delete').hidden,true);
 assert.ok(!h.requests.some(x=>x.body.action==='purge'||x.body.action==='confirm'));
});
test('leaving while snapshot preparation is pending cancels the late export and releases its locks',async()=>{
 let release;const pending=new Promise(resolve=>{release=resolve;});
 const h=mount({responseOverride:async body=>body.action==='begin'?await pending:null});
 await h.navigate('attachmentManagement');const month=h.document.getElementById('am1Month');month.value='2026-10';month.dispatchEvent(new h.window.Event('change'));await settle(()=>!h.window.AttachmentManagement.getStatus().busy);
 h.click('am1Export');await settle(()=>h.requests.some(x=>x.body.action==='begin'));await h.navigate('dashboard');
 release({data:{id:'late-archive',count:1,bytes:123,month:'2026-10'}});await settle(()=>h.requests.some(x=>x.body.action==='cancel'));
 assert.equal(h.window.AttachmentManagement.getStatus().archiveInProgress,false);assert.equal(h.window.AttachmentManagement.getStatus().busy,false);
});
test('permission matrix fixes only AM1 to administrator access and preserves existing rows',()=>{
 const{document}=parseHTML('<div id="permissionsMatrix"></div>');
 const start=application.indexOf('function renderPermissionsMatrix(role) {'),end=application.indexOf('\nasync function savePermissions()',start);
 assert.ok(start>=0&&end>start);
 vm.runInNewContext(application.slice(start,end)+'\nrenderPermissionsMatrix("viewer");',{document,permissionScreens:[{screen_key:'dashboard',screen_name:'Dashboard',group_name:'System'},{screen_key:'attachmentManagement',screen_name:'Attachments',group_name:'System'}],rolePermissionRows:[{screen_key:'dashboard',can_view:true,can_edit:true},{screen_key:'attachmentManagement',can_view:true,can_delete:true}],escapeHtml:s=>String(s),l1T:s=>s});
 const existing=document.querySelector('[data-screen-key="dashboard"]');assert.equal(existing.querySelector('[data-permission="can_view"]').hasAttribute('checked'),true);assert.equal(existing.querySelector('[data-permission="can_edit"]').hasAttribute('checked'),true);assert.equal(existing.querySelector('[data-permission="can_view"]').hasAttribute('disabled'),false);
 const am1=document.querySelector('[data-screen-key="attachmentManagement"]');assert.equal(am1.querySelectorAll('input[disabled]').length,5);assert.equal(am1.querySelectorAll('input[checked]').length,0);
});
