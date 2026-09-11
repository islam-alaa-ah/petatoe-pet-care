import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const index=read('index.html'), contact=read('assets/js/appointment-contact-data.js'), css=read('assets/css/appointment-contact-data.css'), loc=read('assets/js/localization-center.js'), app=read('assets/js/app.js'), ref=read('assets/js/reference-data-service.js'), excel=read('assets/js/representative-excel-center.js'), sw=read('service-worker.js'), pwa=read('assets/js/pwa.js');
const version=JSON.parse(read('version.json')), pkg=JSON.parse(read('package.json'));
const checks=[
 ['R44R31 version/build aligned',version.version==='18.56.74'&&version.build===185674&&pkg.version==='18.56.74'&&pwa.includes('CURRENT_VERSION = "18.56.74"')&&sw.includes('18-56-74-crm-l2a-contact-date-r44r31')],
 ['contact date picker exists',index.includes('id="appointmentContactWorkDateInput"')&&index.includes('data-petatoe-date-latin="true"')],
 ['contact date picker has canonical CSS',css.includes('.appointment-contact-date-picker')&&css.includes('.appointment-contact-date-input')],
 ['contact date change loads selected work_date',contact.includes('changeWorkDate')&&contact.includes('await load(next)')&&contact.includes('saveForDate(state.workDate||todayIso()')],
 ['unsaved change guard exists',contact.includes('hasUnsavedChanges()')&&contact.includes('appointments.contact.dateChange.confirm')],
 ['latin/gregorian date marker preserved by localization',loc.includes("el.dataset.petatoeDateLatin==='true'")&&loc.includes("el.lang='en-GB';el.dir='ltr'")],
 ['representatives static localization wired',index.includes('representatives.page.title')&&index.includes('representatives.import.title')&&loc.includes('representatives.page.subtitle')],
 ['reference data static localization wired',index.includes('referenceData.interests.title')&&index.includes('referenceData.customers.searchPlaceholder')&&loc.includes('referenceData.page.subtitle')],
 ['representative runtime localization wired',app.includes('representatives.confirm.delete')&&app.includes('representatives.import.complete')&&app.includes('renderRepresentativeImportPreview(representativeImportPreview)')],
 ['reference runtime localization wired',app.includes('referenceData.confirm.delete')&&app.includes('referenceData.error.linked')&&ref.includes('referenceData.service.dbNotReady')],
 ['excel runtime/generated labels localized',excel.includes('representatives.import.validation.codeRequired')&&excel.includes('representatives.import.sheet.template')&&excel.includes('representatives.import.header.failure')],
 ['new translation migration exists',fs.existsSync('supabase/migrations/phase_p5_13_8_72_r44r31_crm_l2a_contact_date_localization.sql')],
 ['protected sync files not referenced by new phase code',!contact.includes('offline-queue')&&!ref.includes('sync-engine')],
];
let fail=0;for(const [label,ok] of checks){console.log(`${ok?'PASS':'FAIL'} - ${label}`);if(!ok)fail++;}
console.log(`R44R31 certification: ${checks.length-fail}/${checks.length} PASS`);if(fail)process.exit(1);
