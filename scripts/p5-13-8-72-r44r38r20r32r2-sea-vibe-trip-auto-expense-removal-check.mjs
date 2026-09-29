import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

const ui=read('assets/js/sea-vibe.js');
const service=read('assets/js/sea-vibe-service.js');
const index=read('index.html');
const loc=read('assets/js/localization-center.js');
const pwa=read('assets/js/pwa.js');
const sw=read('service-worker.js');
const version=JSON.parse(read('version.json'));
const pkg=JSON.parse(read('package.json'));

const checks=[];
const ok=(name,cond)=>checks.push({name,pass:Boolean(cond)});

ok('Version 18.56.134',version.version==='18.56.134');
ok('Build 185734',version.build===185734);
ok('Package aligned',pkg.version==='18.56.134');
ok('Certification registered',pkg.scripts?.['check:r44r38r20r32r2']?.includes('r44r38r20r32r2'));
ok('PWA aligned',pwa.includes('const CURRENT_VERSION = "18.56.134";'));
ok('Service worker aligned',sw.includes('petatoe-pwa-18-56-134-sea-vibe-trip-auto-expense-removal-r44r38r20r32r2-p5-13-8-72'));
ok('SEA VIBE service cache-busted',index.includes('sea-vibe-service.js?v=18.56.134'));
ok('SEA VIBE UI cache-busted',index.includes('sea-vibe.js?v=18.56.134'));

ok('R20R32 RPC wired',service.includes('sea_vibe_set_trip_commission_exclusion_r44r38r20r32'));
ok('Existing seaVibeTrips.edit permission owner reused',service.includes("permission('seaVibeTrips','edit')"));
ok('Removal is online-only',service.includes('seaVibe.trip.removeAutomaticExpenseOnlineOnly')&&service.includes('navigator.onLine===false'));
ok('Exclusion RPC sets p_excluded',service.includes('p_excluded:excluded!==false'));
ok('Removal refreshes canonical expense/trip data',service.includes("refreshSections(['expenses','trips','treasuryMovements'])"));
ok('Service method exported',service.includes('setTripStatus,setTripAutomaticExpenseExcluded,saveCustomer'));

ok('Only persisted commission rows become removable',ui.includes("startsWith('commission:')")&&ui.includes('removable:true'));
ok('New/type-changed preview rows are not removable',ui.includes("map(row=>({...row,removable:false}))"));
ok('Delete button is inside automatic expense preview',ui.includes('data-sv-remove-trip-auto-expense'));
ok('Delete button uses seaVibeTrips.edit visibility',ui.includes('data-permission-screen="seaVibeTrips" data-permission-action="edit"'));
ok('Delete confirmation is trip-only',ui.includes('seaVibe.trip.removeAutomaticExpenseConfirm'));
ok('UI calls exclusion service',ui.includes('SeaVibeService.setTripAutomaticExpenseExcluded(tripId,ruleId,true)'));
ok('UI rerenders preview after server refresh',ui.includes('await window.SeaVibeService.setTripAutomaticExpenseExcluded(tripId,ruleId,true);updateTripCalculated();'));
ok('Success status is shown',ui.includes('seaVibe.trip.automaticExpenseRemoved'));

ok('Fuel cost remains outside removal selector',!ui.includes('data-sv-remove-trip-auto-expense="fuel_cost"'));
ok('Sailing permit remains outside removal selector',!ui.includes('data-sv-remove-trip-auto-expense="sailing_permit"'));
ok('Existing generic system expense deletion remains blocked',service.includes("if(row?.systemGenerated)throw new Error('لا يمكن حذف مصروف نظامي.')"));
ok('Existing trip save path preserved',service.includes('saveTrip,setTripStatus,setTripAutomaticExpenseExcluded'));
ok('No new offline queue mutation introduced',!service.includes("kind:'trip_commission_exclusion'"));
ok('No direct client DELETE for commission removal',!service.includes("from('sea_vibe_expenses').delete().eq('commission_rule_id'"));
ok('No new CSS layer',!index.includes('r44r38r20r32r2.css'));

ok('UI localization fallback present',loc.includes('seaVibe.trip.removeAutomaticExpense')&&loc.includes('seaVibe.trip.removeAutomaticExpenseConfirm'));
ok('Release localization present',loc.includes('pwa.update.release.r44r38r20r32r2.title'));
ok('R20R31 sales invoice scripts remain referenced',index.includes('sales-invoices-service.js?v=18.56.134')&&index.includes('sales-invoices.js?v=18.56.134'));

const failed=checks.filter(x=>!x.pass);
for(const c of checks)console.log(`${c.pass?'PASS':'FAIL'}  ${c.name}`);
console.log(`\nR44R38R20R32R2 Certification: ${checks.length-failed.length}/${checks.length} PASS`);
if(failed.length)process.exit(1);
