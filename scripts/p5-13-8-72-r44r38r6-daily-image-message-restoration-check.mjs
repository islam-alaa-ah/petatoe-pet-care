import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const app = read('assets/js/app.js');
const loc = read('assets/js/localization-center.js');
const css = read('assets/css/style.css');
const service = read('assets/js/whatsapp-template-service.js');
const version = JSON.parse(read('version.json'));
const pkg = JSON.parse(read('package.json'));
const manifest = JSON.parse(read('supabase/migration-manifest.json'));

const checks = [];
function check(name, condition) { checks.push([name, Boolean(condition)]); }

check('release version is 18.56.95', version.version === '18.56.95' && pkg.version === '18.56.95');
check('release build is 185695', version.build === 185695);
check('release phase metadata is R44R38R6', manifest?.release?.phase === 'R44R38R6' && manifest?.release?.build === 185695);
check('suggested-customer renderer restores Image + Message trigger', /renderDailySuggestedCustomers\(\)[\s\S]*?data-daily-whatsapp-share="\$\{escapeHtml\(whatsappNumber\)\}"/.test(app));
check('share action uses canonical localized label', app.includes('l1T("dailyOperations.suggested.imageMessage")'));
check('share action stays beside canonical WhatsApp action', app.includes('daily-whatsapp-btn') && app.includes('daily-whatsapp-share-btn'));
check('share trigger is phone-scoped', app.includes('data-daily-whatsapp-share="${escapeHtml(whatsappNumber)}"'));
check('existing delegated click handler remains canonical owner', app.includes('event.target.closest("[data-daily-whatsapp-share]")'));
check('existing handler reuses WhatsAppTemplateService', app.includes('WhatsAppTemplateService?.shareImageAndMessage?.('));
check('existing service supports image + message native sharing', service.includes('const shareData = { text: message, files: [file] };') && service.includes('navigator.share(shareData)'));
check('existing service keeps no-image text fallback', service.includes('return { mode: "direct-text" };'));
check('existing service keeps unsupported-share fallback', service.includes('return { mode: "direct-text-fallback" };'));
check('button localization is complete AR/EN', loc.includes('["dailyOperations.suggested.imageMessage","button","صورة + رسالة","Image + Message"]'));
check('existing button styling is reused', css.includes('.daily-whatsapp-share-btn {') && css.includes('.daily-suggested-actions .daily-whatsapp-share-btn'));
check('suggested actions support wrapping on desktop/tablet', /\.daily-suggested-actions\s*\{[\s\S]*?flex-wrap:\s*wrap/.test(css));
check('mobile has no hide rule for share button', !/@media\s*\(max-width:\s*767px\)[\s\S]*?\.daily-whatsapp-share-btn\s*\{[^}]*display:\s*none/.test(css));
check('release localization metadata exists', loc.includes('pwa.update.release.r44r38r6.title') && loc.includes('pwa.update.release.r44r38r6.note3'));
check('R44 pruning remains explicitly disabled in historical owner', read('supabase/migrations/phase_p5_13_8_72_r44_bounded_pruning_engine_disabled.sql').includes('false'));

let passed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}`);
  if (ok) passed++;
}
console.log(`\n${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exit(1);
