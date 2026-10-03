import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const index = read('index.html');
const app = read('assets/js/app.js');
const ui = read('assets/js/sales-reports.js');
const css = read('assets/css/sales-reports.css');
const loc = read('assets/js/localization-center.js');
const translationCenter = read('assets/js/translation-center.js');
const sw = read('service-worker.js');
const migration = read('supabase/migrations/phase_p5_13_8_72_r44r38r20r35_sales_reports_screen.sql');
const version = JSON.parse(read('version.json'));
const pkg = JSON.parse(read('package.json'));

const checks = [];
const ok = (name, condition) => checks.push({ name, pass: Boolean(condition) });

ok('Version 18.56.138', version.version === '18.56.138');
ok('Build 185738', version.build === 185738);
ok('Package aligned', pkg.version === '18.56.138');
ok('Phase check registered', pkg.scripts?.['check:r44r38r20r35']?.includes('r44r38r20r35'));
ok('PWA aligned', read('assets/js/pwa.js').includes('const CURRENT_VERSION = "18.56.138";'));
ok('Service worker cache aligned', sw.includes('petatoe-pwa-18-56-138-sales-reports-r44r38r20r35'));
ok('Sales report CSS precached', sw.includes('./assets/css/sales-reports.css'));
ok('Sales report JS precached', sw.includes('./assets/js/sales-reports.js'));
ok('Sales report CSS loaded', index.includes('assets/css/sales-reports.css?v=18.56.138'));
ok('Sales report JS loaded', index.includes('assets/js/sales-reports.js?v=18.56.138'));
ok('App cache-buster upgraded', index.includes('assets/js/app.js?v=18.56.138'));
ok('Localization cache-buster upgraded', index.includes('assets/js/localization-center.js?v=18.56.138'));

ok('Sales Reports nav item', index.includes('data-view="salesReports"') && index.includes('data-petatoe-i18n="sidebar.salesReports"'));
ok('Sales Reports view registered in HTML', index.includes('id="salesReportsView"'));
ok('Year filter exists', index.includes('id="salesReportsYear"'));
ok('Month filter exists', index.includes('id="salesReportsMonth"'));
ok('No representative filter in Sales Reports view', !index.slice(index.indexOf('id="salesReportsView"'), index.indexOf('id="reportsOverviewView"')).includes('salesReportsRepresentative'));
ok('No date range inputs in Sales Reports view', !index.slice(index.indexOf('id="salesReportsView"'), index.indexOf('id="reportsOverviewView"')).match(/salesReports.*(From|To)|type="date"/));
ok('Vehicle/customer/team/payment/status filters exist', ['salesReportsVehicle','salesReportsCustomer','salesReportsTeam','salesReportsPayment','salesReportsStatusFilter'].every(id => index.includes(`id="${id}"`)));
ok('Vertical full-width report cards', (index.match(/sales-report-card--wide/g) || []).length >= 9 && css.includes('.sales-report-card{width:100%'));
ok('Daily sales report exists', ui.includes('salesReportsDailyChart'));
ok('Payment report exists', ui.includes('salesReportsPaymentChart'));
ok('Invoice-status report exists', ui.includes('salesReportsStatusChart'));
ok('Monthly report exists', ui.includes('salesReportsMonthlyChart'));
ok('Neighborhood report exists', ui.includes('salesReportsNeighborhoodTable'));
ok('Previous-period comparison exists', ui.includes('salesReportsComparisonChart'));
ok('Weekday report exists', ui.includes('salesReportsWeekdayChart'));
ok('Discount report exists', ui.includes('salesReportsDiscountChart'));
ok('VAT report exists', ui.includes('salesReportsVatChart'));
ok('Sales detail table exists', ui.includes('salesReportsTableBody'));
ok('Invoice analysis report removed', !index.includes('salesReportsInvoiceAnalysis') && !ui.includes('salesReportsInvoiceAnalysis') && !ui.includes('تحليل الفواتير'));
ok('Current year/month default logic exists', ui.includes('currentYear()') && ui.includes('currentMonth()'));
ok('Month options depend on selected year', ui.includes('availableMonths(year)') && ui.includes('salesReportsYear') && ui.includes('salesReportsMonth'));
ok('Neighborhood uses current customer master', migration.includes('left join public.customers c on c.id=h.customer_id') && migration.includes('left join public.installation_neighborhoods n on n.id=c.neighborhood_id'));
ok('No Sync/ACK registration added', !ui.includes('ack_sync_client_watermark') && !ui.includes('ack_sync_queue_watermark_v2') && !migration.includes('sync_engine'));
ok('No invoice write path added', !migration.includes('insert into public.sales_invoices') && !migration.includes('update public.sales_invoices') && !migration.includes('delete from public.sales_invoices'));

ok('App views map contains salesReports', app.includes('salesReports: document.getElementById("salesReportsView")'));
ok('App page metadata contains salesReports', app.includes('salesReports: ["salesReports.page.title", "salesReports.page.subtitle"]'));
ok('App activates Sales Reports', app.includes('if (name === "salesReports")') && app.includes('window.SalesReportsUI?.activate?.(false)'));
ok('Customer cache rerenders report', app.includes('activeViewKey === "salesReports"') && app.includes('window.SalesReportsUI?.render?.()'));
ok('Localization fallback contains salesReports', loc.includes("['sidebar.salesReports','navigation','تقارير المبيعات','Sales Reports']") && loc.includes("if(value.startsWith('salesReports.'))return{screenKey:'salesReports',moduleName:'crm'};"));
ok('Translation Center screen label map contains salesReports', translationCenter.includes('salesReports:\'sidebar.salesReports\''));

ok('DB screen registration', migration.includes("'salesReports','تقارير المبيعات','التقارير والتحليلات',67,true"));
ok('Role permissions are read/export only', migration.includes("('super_admin','salesReports',true,false,false,false,true)") && migration.includes("('sales_representative','salesReports',false,false,false,false,false)"));
ok('Reporting RPC registered', migration.includes('create or replace function public.sales_reports_rows_r44r38r20r35()'));
ok('RPC checks screen permission', migration.includes("public.has_screen_permission('salesReports','view')"));
ok('RPC preserves representative scope', migration.includes('public.can_access_representative(si.representative_id)'));
ok('Historical rows are included', migration.includes('from public.appointment_historical_sales_reporting h'));
ok('Translation rows registered', migration.includes("'salesReports.page.title'"));

const failed = checks.filter(item => !item.pass);
for (const check of checks) console.log(`${check.pass ? 'PASS' : 'FAIL'}  ${check.name}`);
console.log(`\nR44R38R20R35 Sales Reports Certification: ${checks.length - failed.length}/${checks.length} PASS`);
if (failed.length) process.exit(1);
