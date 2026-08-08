import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
const service=read('assets/js/notification-center-service.js');
const ui=read('assets/js/notification-center.js');
const html=read('index.html');
const css=read('assets/css/notification-center.css');
const version=JSON.parse(read('version.json'));
const checks=[
 ['version 18.53.25',version.version==='18.53.25'&&html.includes('v=18.53.25')],
 ['upsert includes event_name',service.includes('event_name:x.eventName')],
 ['upsert preserves event metadata',service.includes('module_name:x.moduleName')&&service.includes('target_view:x.targetView')&&service.includes('display_order:Number.isFinite')],
 ['collect carries event metadata',ui.includes('eventName:ev.event_name')&&ui.includes('moduleName:ev.module_name')&&ui.includes('targetView:ev.target_view')],
 ['select-all fields declared',ui.includes("MATRIX_FIELDS=['enabled','inApp','push','owner','roleRecipient']")],
 ['column bulk toggle implemented',ui.includes('function setColumnChecked(field,checked)')&&ui.includes("[data-matrix-select-all]" )],
 ['header select-all checkboxes rendered',(html.match(/data-matrix-select-all=/g)||[]).length===5],
 ['role recipient wording clarified',html.includes('إرسال للدور المحدد')],
 ['indeterminate header support',ui.includes('head.indeterminate=checked>0&&checked<boxes.length')],
 ['header checkbox styling',css.includes('.notification-column-toggle')]
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++}if(failed)process.exit(1);console.log(`PASS ${checks.length}/${checks.length}`);
