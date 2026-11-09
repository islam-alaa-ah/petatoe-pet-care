// Local fixtures only. No Supabase requests, credentials, SQL or Production writes.
// Run: node --experimental-vm-modules --test scripts/am1r2-pdf-assets.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('../', import.meta.url));
const vendor = path.join(app, 'assets/vendor/noble-hashes-2.0.1');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

async function fixtureServer({ legacyImports = false } = {}) {
  const requests = [];
  // Reproduce the documented name exclusion only, not the complete Jekyll engine.
  const server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://fixture.invalid').pathname;
    const rel = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
    const target = path.resolve(app, rel);
    const excluded = rel.split('/').some(part => /^[._#~]/.test(part));
    const status = excluded || !target.startsWith(app) ? 404 : 200;
    if (status === 404) {
      requests.push({ pathname, status });
      response.writeHead(status); response.end(); return;
    }
    try {
      let bytes = await fs.readFile(target);
      if (legacyImports && rel === 'assets/vendor/noble-hashes-2.0.1/sha2.js') {
        bytes = Buffer.from(bytes.toString().replace('./md.js', './_md.js').replace('./u64.js', './_u64.js'));
      }
      const mime = /\.m?js$/.test(rel) ? 'application/javascript' :
        /\.json$/.test(rel) ? 'application/json' :
        /\.css$/.test(rel) ? 'text/css' : 'application/octet-stream';
      requests.push({ pathname, status: 200 });
      response.writeHead(200, { 'Content-Type': mime }); response.end(bytes);
    } catch (_) {
      requests.push({ pathname, status: 404 });
      response.writeHead(404); response.end();
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return {
    url: 'http://127.0.0.1:' + server.address().port,
    requests,
    close: async () => {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  };
}

async function loadPDFModule(origin) {
  assert.equal(typeof vm.SourceTextModule, 'function', 'Run Node with --experimental-vm-modules');
  const context = vm.createContext({
    Uint8Array, Uint32Array, Int32Array, BigUint64Array, DataView, ArrayBuffer,
    TextEncoder, TextDecoder, Blob, URL, AbortController, console
  });
  const modules = new Map();
  const get = url => {
    if (!modules.has(url)) modules.set(url, (async () => {
      assert.equal(new URL(url).origin, origin);
      const response = await fetch(url);
      if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + new URL(url).pathname);
      assert.match(response.headers.get('content-type'), /javascript/);
      return new vm.SourceTextModule(await response.text(), {
        context, identifier: url,
        initializeImportMeta: meta => { meta.url = url; }
      });
    })());
    return modules.get(url);
  };
  try {
    const entry = await get(origin + '/assets/js/attachment-pdf.mjs');
    await entry.link((specifier, parent) => {
      assert.ok(specifier.startsWith('.'), 'Only local dependencies are allowed');
      return get(new URL(specifier, parent.identifier).href);
    });
    await entry.evaluate();
    return entry.namespace;
  } catch (error) {
    await Promise.allSettled([...modules.values()]);
    throw error;
  }
}

function workerMetadata(source) {
  const sandbox = { self: { addEventListener() {} } };
  vm.runInNewContext(source + '\nglobalThis.__core = CORE_APP_SHELL; globalThis.__token = CACHE_VERSION;', sandbox);
  return { core: Array.from(sandbox.__core), token: sandbox.__token };
}

test('public aliases preserve the exact vendored implementations and licenses', async () => {
  for (const [oldName, newName] of [['_md.js', 'md.js'], ['_u64.js', 'u64.js']]) {
    assert.deepEqual(await fs.readFile(path.join(vendor, newName)), await fs.readFile(path.join(vendor, oldName)));
  }
  const source = await fs.readFile(path.join(vendor, 'sha2.js'), 'utf8');
  const manifest = JSON.parse(await fs.readFile(path.join(app, 'docs/AM1R2/manifest.json'), 'utf8'));
  const original = source.replace('./md.js', './_md.js').replace('./u64.js', './_u64.js');
  const recorded = manifest.modifiedFiles.find(x => x.path === 'assets/vendor/noble-hashes-2.0.1/sha2.js');
  assert.equal(sha(original), recorded.beforeSha256, 'Only import paths may differ from 18.56.145');
  assert.ok((await fs.readFile(path.join(vendor, 'LICENSE'), 'utf8')).includes('MIT'));
});

test('legacy underscore imports reproduce the observed 404 module-loading failure', async () => {
  const server = await fixtureServer({ legacyImports: true });
  try {
    await assert.rejects(loadPDFModule(server.url), /HTTP 404: .*\/_(?:md|u64)\.js/);
    assert.ok(server.requests.some(x => x.status === 404 && /\/(?:_md|_u64)\.js$/.test(x.pathname)));
  } finally { await server.close(); }
});

test('the corrected HTTP module graph loads and preserves SHA-256 and incremental hashing', async () => {
  const server = await fixtureServer();
  try {
    const module = await loadPDFModule(server.url);
    for (const text of ['', 'abc', 'أرشيف PETATOE 🐾\n']) {
      const bytes = new TextEncoder().encode(text);
      assert.equal(module.digest(bytes), sha(bytes));
    }
    const large = new Uint8Array(1048593);
    for (let i = 0; i < large.length; i++) large[i] = i % 251;
    assert.equal(await module.hashFile(new Blob([large])), sha(large));
    assert.ok(server.requests.every(x => x.status === 200));
    assert.ok(server.requests.some(x => /\/md\.js$/.test(x.pathname)));
    assert.ok(server.requests.some(x => /\/u64\.js$/.test(x.pathname)));
    assert.ok(!server.requests.some(x => /\/(?:_md|_u64)\.js$/.test(x.pathname)));
  } finally { await server.close(); }
});

test('all required app-shell assets remain reachable under the publication-name filter', async () => {
  const worker = workerMetadata(await fs.readFile(path.join(app, 'service-worker.js'), 'utf8'));
  const server = await fixtureServer();
  try {
    const results = await Promise.all(worker.core.map(async rel => {
      const response = await fetch(new URL(rel, server.url + '/'));
      await response.arrayBuffer();
      return { rel, status: response.status };
    }));
    assert.deepEqual(results.filter(x => x.status !== 200), []);
    assert.ok(worker.core.includes('./assets/vendor/noble-hashes-2.0.1/md.js'));
    assert.ok(worker.core.includes('./assets/vendor/noble-hashes-2.0.1/u64.js'));
    assert.ok(!worker.core.some(x => /\/(?:_md|_u64)\.js$/.test(x)));
  } finally { await server.close(); }
});

test('release/cache metadata advance coherently while AM1R1 server compatibility is retained', async () => {
  const version = JSON.parse(await fs.readFile(path.join(app, 'version.json'), 'utf8'));
  const pkg = JSON.parse(await fs.readFile(path.join(app, 'package.json'), 'utf8'));
  const pwa = await fs.readFile(path.join(app, 'assets/js/pwa.js'), 'utf8');
  const html = await fs.readFile(path.join(app, 'index.html'), 'utf8');
  const worker = workerMetadata(await fs.readFile(path.join(app, 'service-worker.js'), 'utf8'));
  assert.equal(version.version, '18.56.146'); assert.equal(version.build, 185746);
  assert.equal(pkg.version, version.version); assert.equal(version.forceUpdate, false);
  assert.ok(pwa.includes('const CURRENT_VERSION = "18.56.146";'));
  assert.equal(worker.token, version.cacheToken);
  assert.ok(html.includes('assets/js/pwa.js?v=18.56.146-AM1R2'));
  const ui = await fs.readFile(path.join(app, 'assets/js/attachment-management.js'), 'utf8');
  const edge = await fs.readFile(path.join(app, 'supabase/functions/attachment-admin/core.mjs'), 'utf8');
  assert.ok(ui.includes("runtime:'AM1R1'")); assert.ok(edge.includes("REVISION = 'AM1R1'"));
});
