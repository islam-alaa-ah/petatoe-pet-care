import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const ui=read('assets/js/notification-center.js');
const css=read('assets/css/notification-center.css');
const html=read('index.html');
const service=read('assets/js/notification-center-service.js');
const ver=JSON.parse(read('version.json'));
const checks=[
 ['role dropdown above matrix',/id="notificationRoleSelect"/.test(html) && html.indexOf('notificationRoleSelect')<html.indexOf('notificationMatrixRows')],
 ['users column removed',!/<th>المستخدمون<\/th>/.test(html) && !/data-field="users"/.test(ui)],
 ['roles multi-select removed',!/<th>الأدوار<\/th>/.test(html) && !/data-field="roles"/.test(ui)],
 ['selected role recipient toggle',/data-field="roleRecipient"/.test(ui)],
 ['role switch preserves draft',/syncCurrentRoleDraft\(\)/.test(ui) && /notificationRoleSelect/.test(ui)],
 ['all role rules preserved on collect',/roles:\[\.\.\.selectedSet\(ev,'role'\)\]/.test(ui)],
 ['direct user rules cleared on save',/users:\[\]/.test(ui) && /recipient_type:'user'/.test(service)],
 ['request owner retained',/data-field="owner"/.test(ui) && /request_owner/.test(ui)],
 ['role filter responsive styling',/notification-role-filter/.test(css)],
 ['matrix six columns',/استلام الدور المحدد/.test(html) && /colspan="6"/.test(html)],
 ['version 18.53.24',ver.version==='18.53.24' && html.includes('v=18.53.24')]
];
let fail=0;for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${n}`);if(!ok)fail++}if(fail)process.exit(1);console.log(`PASS ${checks.length}/${checks.length}`);
