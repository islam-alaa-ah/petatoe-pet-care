import fs from 'node:fs';
import crypto from 'node:crypto';

const read=p=>fs.readFileSync(p,'utf8');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const css=read('assets/css/installation-completion.css');
const js=read('assets/js/installation-completion.js');
const html=read('index.html');
const version=JSON.parse(read('version.json'));
const pkg=JSON.parse(read('package.json'));
const manifest=JSON.parse(read('supabase/migration-manifest.json'));
const localization=read('assets/js/localization-center.js');
const serviceWorker=read('service-worker.js');
const pwa=read('assets/js/pwa.js');

const ownerMarker='/* P5.12.3 — Desktop completion specialized visual owner.';
const ownerStart=css.indexOf(ownerMarker);
const owner=ownerStart>=0?css.slice(ownerStart):'';
const dialogPos=html.indexOf('id="installationCompletionDialog"');
const appClosePos=html.indexOf('</div>', html.indexOf('<nav id="mobileBottomNav"'));

const checks=[];
const check=(name,ok)=>checks.push([name,Boolean(ok)]);
check('desktop completion specialized owner exists',ownerStart>=0);
check('completion dialog remains a single shared dialog',(html.match(/id="installationCompletionDialog"/g)||[]).length===1);
check('completion dialog is outside appView and needs local theme scope',dialogPos>appClosePos && appClosePos>0);
check('local light desktop theme variables exist',owner.includes('#installationCompletionDialog{') && owner.includes('--desk-glass-strong:rgba(255,255,255,.94)') && owner.includes('--desk-glass-soft:rgba(239,247,255,.86)') && owner.includes('--desk-text:#10233f'));
check('local dark desktop theme variables exist',owner.includes('html[data-theme="dark"] #installationCompletionDialog{') && owner.includes('--desk-glass-strong:rgba(6,20,40,.95)') && owner.includes('--desk-glass-soft:rgba(12,34,63,.88)') && owner.includes('--desk-text:#f7fbff'));
check('dialog body consumes resolved local inner surface',owner.includes('#installationCompletionDialog .installation-completion-body{background:var(--dialog-inner-surface);color:var(--desk-text)}'));
check('dialog shell consumes resolved local shell surface',owner.includes('#installationCompletionDialog .dialog-shell{') && owner.includes('background:var(--dialog-shell-surface)'));
check('header and footer consume resolved local chrome surface',owner.includes('#installationCompletionDialog :is(.dialog-header,.dialog-actions){') && owner.includes('background:var(--dialog-chrome-surface)'));
check('desktop inputs use the now-local dialog variables',css.includes('#installationCompletionDialog :is(input,select,textarea){border:1px solid var(--desk-line)'));
check('no important override added to corrected owner',!owner.includes('!important'));
check('no zero-value UI branch introduced in completion JS',!/(invoiceAmount|invoiceValue|finalAmountIncludingTax)\s*[<>=!]+\s*0[\s\S]{0,120}(classList|style|hidden)/.test(js));
check('zero-value visit still reads canonical financial RPC',js.includes('completionInvoiceFinancials(r.id,r.visitId)'));
check('confirmed visit conversion mode remains installationVisit',js.includes('r.confirmedHistory&&r.visitId?"installationVisit":"installation"'));
check('release version/build R44R27',version.version==='18.56.70' && Number(version.build)===185670 && String(version.cacheToken||'').includes('r44r27'));
check('package version unified',pkg.version===version.version);
check('manifest release version/build unified',manifest.release?.version===version.version && Number(manifest.release?.build)===Number(version.build));
check('index cache-bust token unified',html.includes('installation-completion.css?v=18.56.70') && !html.includes('?v=18.56.69'));
check('PWA current version unified',pwa.includes('const CURRENT_VERSION = "18.56.70";'));
check('service worker cache token unified',serviceWorker.includes(version.cacheToken));
check('localized R44R27 release title exists',localization.includes('pwa.update.release.r44r27.title'));
check('localized R44R27 release notes exist',[1,2,3].every(n=>localization.includes(`pwa.update.release.r44r27.note${n}`)));

let fail=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} - ${name}`);if(!ok)fail++;}
console.log(`R44R27 completion dialog theme-scope certification: ${checks.length-fail}/${checks.length} PASS`);
if(fail)process.exit(1);
