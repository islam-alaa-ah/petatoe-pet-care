import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const css=read('assets/css/installation-completion.css');
const js=read('assets/js/installation-completion.js');
const html=read('index.html');
const version=JSON.parse(read('version.json'));
const pkg=JSON.parse(read('package.json'));
const manifest=JSON.parse(read('supabase/migration-manifest.json'));
const localization=read('assets/js/localization-center.js');

const desktopOwnerStart=css.indexOf('/* P5.12.3 — Desktop completion specialized visual owner. */');
const desktopOwner=desktopOwnerStart>=0?css.slice(desktopOwnerStart):'';
const tabletStart=css.indexOf('/* Phase M14.9.2.3 — completion modal theme surface contract');
const quantityOwnerStart=css.indexOf('/* P5.12.8 — Execution confirmation workspace canonical owner. */');

const checks=[];
const check=(name,ok)=>checks.push([name,Boolean(ok)]);
check('desktop canonical completion owner exists',desktopOwnerStart>=0);
check('desktop completion body has explicit themed inner surface',desktopOwner.includes('#installationCompletionDialog .installation-completion-body{background:var(--dialog-inner-surface'));
check('desktop summary cards are owned by completion CSS',desktopOwner.includes('.installation-completion-summary>div,.installation-invoice-section,.installation-evidence-section'));
check('surface fix uses existing dialog variables rather than hard-coded light-only color',desktopOwner.includes('var(--dialog-inner-surface') && desktopOwner.includes('var(--desk-glass-strong)') && desktopOwner.includes('var(--desk-glass-soft)'));
check('no zero-value UI branch introduced in completion JS',!/(invoiceAmount|invoiceValue|finalAmountIncludingTax)\s*[<>=!]+\s*0[\s\S]{0,120}(classList|style|hidden)/.test(js));
check('zero-value visit still reads canonical financial RPC',js.includes('completionInvoiceFinancials(r.id,r.visitId)'));
check('confirmed visit conversion mode remains installationVisit',js.includes('r.confirmedHistory&&r.visitId?"installationVisit":"installation"'));
check('quantity confirmation canonical dialog remains present',html.includes('id="installationQuantityConfirmationDialog"'));
check('legacy completion dialog remains one shared dialog',html.includes('id="installationCompletionDialog"') && (html.match(/id="installationCompletionDialog"/g)||[]).length===1);
check('tablet owner remains before quantity desktop owner and was not replaced',tabletStart>=0 && quantityOwnerStart>=0 && tabletStart<quantityOwnerStart);
check('release version/build R44R26',version.version==='18.56.69' && Number(version.build)===185669 && String(version.cacheToken||'').includes('r44r26'));
check('package version unified',pkg.version===version.version);
check('manifest release version/build unified',manifest.release?.version===version.version && Number(manifest.release?.build)===Number(version.build));
check('index cache-bust token unified',html.includes('installation-completion.css?v=18.56.69') && !html.includes('?v=18.56.68'));
check('localized release title exists',localization.includes('pwa.update.release.r44r26.title'));
check('localized release note1 exists',localization.includes('pwa.update.release.r44r26.note1'));
check('localized release note2 exists',localization.includes('pwa.update.release.r44r26.note2'));
check('localized release note3 exists',localization.includes('pwa.update.release.r44r26.note3'));

let fail=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} - ${name}`);if(!ok)fail++;}
console.log(`R44R26 completion dialog surface certification: ${checks.length-fail}/${checks.length} PASS`);
if(fail)process.exit(1);
