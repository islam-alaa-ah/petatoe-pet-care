import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });

const version = JSON.parse(read('version.json'));
const pkg = JSON.parse(read('package.json'));
const index = read('index.html');
const sw = read('service-worker.js');
const pwa = read('assets/js/pwa.js');
const retention = read('assets/js/sync-retention.js');
const localization = read('assets/js/localization-center.js');

check('Release is 18.56.139 / build 185739', version.version === '18.56.139' && version.build === 185739 && pkg.version === '18.56.139');
check('Runtime version is 18.56.139', pwa.includes('const CURRENT_VERSION = "18.56.139";'));
check('Service Worker cache token is aligned', sw.includes('petatoe-pwa-18-56-139-queue-ack-stability-r44r38r20r34a4') && version.cacheToken === 'petatoe-pwa-18-56-139-queue-ack-stability-r44r38r20r34a4');
check('Index local asset version tokens are unified', !index.match(/(?:src|href)="assets\/(?:js|css)\/[^"?]+\?v=18\.56\.(?!139\b)[0-9]+/));
check('Index contains the new sync-retention version', index.includes('assets/js/sync-retention.js?v=18.56.139'));
check('Canonical release localization keys exist', localization.includes('pwa.update.release.r44r38r20r34a4.title') && localization.includes('pwa.update.release.r44r38r20r34a4.note2'));
check('Queue ACK signature guard exists', retention.includes('const lastQueueAckSignature = new Map();') && retention.includes('function queueSummarySignature(summary)'));
check('Queue ACK signature is recorded only after successful RPC', retention.includes('lastQueueAckSignature.set(key, signature);') && retention.includes('if (error) throw new Error(error.message || "sync_queue_watermark_ack_failed");'));
check('Identical queue summaries are suppressed even for forced lifecycle ACKs', retention.includes('if (lastQueueAckSignature.get(key) === signature) return true;'));
check('Existing queue throttle remains intact', retention.includes('QUEUE_ACK_THROTTLE_MS = 60 * 1000') && retention.includes('now - Number(lastQueueAckAt.get(key) || 0) < QUEUE_ACK_THROTTLE_MS'));
check('Queue RPC contract is unchanged', retention.includes('ack_sync_queue_watermark_v2') && retention.includes('p_replay_policy_version: summary.replayPolicyVersion') && retention.includes('p_latest_replay_deadline_at: summary.latestReplayDeadlineAt'));

// Lightweight behavioral certification of the retention module in a VM.
const rpcCalls = [];
let queueRows = [];
let fakeNow = 1_000_000;
const listeners = new Map();
const local = new Map();
const windowMock = {
  customerSupabase: {
    rpc: async (fn, params) => { rpcCalls.push({ fn, params }); return { data: { ok: true }, error: null }; }
  },
  KYUMOfflineQueue: { list: async () => queueRows },
  KYUMOfflineSessionStore: { currentUserId: () => 'user-1' },
  addEventListener: (type, fn) => listeners.set(type, fn),
  dispatchEvent: () => true
};
const context = {
  window: windowMock,
  globalThis: { crypto: { randomUUID: () => 'client-123456789' } },
  crypto: { randomUUID: () => 'client-123456789' },
  localStorage: { getItem: key => local.get(key) ?? null, setItem: (key, value) => local.set(key, String(value)) },
  navigator: { onLine: true },
  document: { visibilityState: 'visible', addEventListener: () => {} },
  Date: class extends Date {
    static now() { return fakeNow; }
  },
  setTimeout: () => 1,
  clearTimeout: () => {},
  console,
  Map, Set, Object, JSON, String, Number, Math, Promise, Error
};
context.Date.parse = Date.parse;
context.Date.UTC = Date.UTC;
vm.runInNewContext(retention, context, { filename: 'sync-retention.js' });

await windowMock.KYUMSyncRetention.ackQueueWatermarks({ force: true });
const firstCount = rpcCalls.length;
await windowMock.KYUMSyncRetention.ackQueueWatermarks({ force: true });
check('Behavior: identical queue state is ACKed once per session state', firstCount === 2 && rpcCalls.length === 2, `RPC calls after two forced ACKs: ${rpcCalls.length}`);

fakeNow += 61_000;
queueRows = [{ entity: 'sea_vibe', status: 'pending', createdAt: fakeNow - 1000 }];
await windowMock.KYUMSyncRetention.ackQueueWatermarks();
check('Behavior: changed queue state produces a new ACK after throttle window', rpcCalls.length === 3, `RPC calls after changed state: ${rpcCalls.length}`);

const failedCalls = [];
windowMock.customerSupabase.rpc = async (fn, params) => {
  failedCalls.push({ fn, params });
  if (failedCalls.length === 1) return { data: null, error: { message: 'simulated failure' } };
  return { data: { ok: true }, error: null };
};
fakeNow += 61_000;
queueRows = [];
try { await windowMock.KYUMSyncRetention.ackQueueWatermarks({ force: true }); } catch (_) {}
await windowMock.KYUMSyncRetention.ackQueueWatermarks({ force: true });
check('Behavior: failed ACK does not poison the signature guard', failedCalls.length === 2, `RPC calls across failed first domain + retry: ${failedCalls.length}`);

const failed = checks.filter(item => !item.ok);
for (const item of checks) console.log(`${item.ok ? 'PASS' : 'FAIL'}: ${item.name}${item.detail ? ` — ${item.detail}` : ''}`);
console.log(`\nR44R38R20R34A4 certification: ${checks.length - failed.length}/${checks.length} PASS`);
if (failed.length) process.exit(1);
