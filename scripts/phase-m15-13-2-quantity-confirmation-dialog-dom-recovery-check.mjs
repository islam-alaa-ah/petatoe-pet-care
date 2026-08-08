import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const html = read('index.html');
const js = read('assets/js/installation-completion.js');
const version = JSON.parse(read('version.json'));
const requiredIds = [
  'installationQuantityConfirmationDialog','installationQuantityConfirmationForm','installationQuantityRequestLabel',
  'installationQuantityLines','installationQuantityRemainingTotal','installationQuantityRemainingActionWrap',
  'installationQuantityRemainingAction','installationQuantityRescheduleFields','installationQuantityRescheduleDate',
  'installationQuantityRescheduleTime','installationQuantityRescheduleTeam','installationQuantityRescheduleTechnician',
  'installationQuantityScheduleLaterNote','installationQuantityConfirmationNotes','installationQuantityConfirmationStatus',
  'closeInstallationQuantityConfirmation','cancelInstallationQuantityConfirmation','saveInstallationQuantityConfirmation'
];
const tests = [
  ['all quantity confirmation DOM ids exist', requiredIds.every(id=>html.includes(`id="${id}"`))],
  ['dialog is a real HTML dialog', html.includes('<dialog id="installationQuantityConfirmationDialog"')],
  ['quantity lines container restored', html.includes('id="installationQuantityLines"')],
  ['remaining quantity UI restored', html.includes('id="installationQuantityRemainingTotal"') && html.includes('id="installationQuantityRemainingAction"')],
  ['notes and status restored', html.includes('id="installationQuantityConfirmationNotes"') && html.includes('id="installationQuantityConfirmationStatus"')],
  ['open guard exists', js.includes('function requireQuantityDialog()') && js.includes('عناصر الواجهة غير مكتملة')],
  ['execution number preferred in dialog label', js.includes('r.executionNumber||r.requestNumber')],
  ['quantity confirmation submit still calls canonical service', js.includes('InstallationsServiceSafe.confirmActualQuantities')],
  ['version is 18.53.29', version.version === '18.53.29'],
];
let fail=0;
for (const [name, ok] of tests) { console.log(`${ok?'PASS':'FAIL'} - ${name}`); if(!ok) fail++; }
console.log(`\n${tests.length-fail}/${tests.length} PASS`);
process.exitCode = fail ? 1 : 0;
