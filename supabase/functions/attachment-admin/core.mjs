// No credentials or application globals here. All dependencies are injected for tests.
export const ACTIONS = new Set(['status', 'list', 'begin', 'item', 'preview', 'complete', 'confirm', 'cancel', 'purge']);
export const REVISION = 'AM1R1';
// Inspect binding only on URLs obtained directly from our trusted Storage SDK.
// This is NOT authentication/verification of a caller-provided JWT.
export function assertVersionBoundSignedUrl(signedUrl, baseUrl, bucket, path, versionId) {
  try {
    if (typeof versionId !== 'string' || !versionId) throw Error();
    const u = new URL(signedUrl), base = new URL(baseUrl);
    if (u.origin !== base.origin || decodeURIComponent(u.pathname) !== '/storage/v1/object/sign/' + bucket + '/' + path) throw Error();
    const parts = (u.searchParams.get('token') || '').split('.');
    if (parts.length !== 3) throw Error();
    const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='));
    const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0))));
    if (payload.versionId !== versionId || payload.url !== bucket + '/' + path || typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) throw Error();
    return signedUrl;
  } catch (_) { throw new Error('AM1_VERSION_READ_UNSUPPORTED'); }
}
export function isDefinitiveStorageRejection(error) {
  // A gateway timeout/client disconnect can be a 4xx while the upstream still
  // runs. Never classify 408/499 (or unknown/network/5xx errors) as safe to retry.
  return error?.name === 'StorageApiError' && [400,401,403,404,409,413,415,422,429].includes(Number(error.statusCode));
}
export function createHandler({ authenticate, rpc, sign, remove, origins }) {
  const allowed = new Set(origins);
  return async function handle(request) {
    const origin = request.headers.get('origin');
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin' };
    if (origin && allowed.has(origin)) Object.assign(headers, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    });
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
    if (origin && !allowed.has(origin)) return reply({ error: 'AM1_ORIGIN_DENIED' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply({ error: 'AM1_METHOD_NOT_ALLOWED' }, 405);
    try {
      const authorization = request.headers.get('authorization') || '';
      if (!/^Bearer\s+\S+$/i.test(authorization)) return reply({ error: 'AM1_AUTH_REQUIRED' }, 401);
      const actor = await authenticate(authorization.replace(/^Bearer\s+/i, ''));
      if (!actor?.id) return reply({ error: 'AM1_AUTH_REQUIRED' }, 401);
      // Size checked before parsing; no caller-supplied identity or bucket/path is forwarded.
      const reader=request.body?.getReader();
      const chunks=[];let length=0;
      if(reader)try{
        while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;
          if(length>900000){await reader.cancel();return reply({error:'AM1_REQUEST_TOO_LARGE'},413);}chunks.push(value);}
      }finally{reader.releaseLock();}
      const bytes=new Uint8Array(length);let offset=0;
      for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
      const raw=new TextDecoder().decode(bytes);
      const body = JSON.parse(raw);
      if (!ACTIONS.has(body.action)) return reply({ error: 'AM1_UNSUPPORTED_ACTION' }, 400);
      if (body.revision !== REVISION) return reply({ error: 'AM1_REVISION_MISMATCH' }, 409);
      const input = { revision: REVISION };
      for (const key of ['month','offset','archiveId','ordinal','objectId','sha256','bytes','originals','confirmMonth']) {
        if (Object.hasOwn(body, key)) input[key] = body[key];
      }
      const call = (action, extra = {}) => rpc(actor.id, action, { ...input, ...extra });
      if (body.action === 'item' || body.action === 'preview') {
        const item = await call(body.action);
        if (typeof item.objectVersion !== 'string' || !item.objectVersion) throw new Error('AM1_VERSION_READ_UNSUPPORTED');
        const url = await sign(item.bucket, item.path, 120, item.objectVersion);
        if (body.action === 'item') await call('item_signed', { boundVersion: item.objectVersion });
        return reply({ ...item, signedUrl: url });
      }
      if (body.action !== 'purge') return reply(await call(body.action));
      // Each explicit request removes at most five objects. No schedule/retry worker.
      await call('purge_prepare');
      const lease = await call('purge_batch_begin');
      let removed = 0;
      let done = false;
      try {
        for (let i = 0; i < 5; i++) {
          const next = await call('purge_next', { token: lease.token });
          if (next.done) { done = true; break; }
          if (next.reconciled) continue;
          // Path came from the locked server snapshot, not the request body.
          try {
            if (typeof next.objectVersion !== 'string' || !next.objectVersion) throw Object.assign(new Error('AM1_VERSION_DELETE_UNSUPPORTED'), {definite:true});
            await remove(next.bucket, next.path, next.objectVersion);
          } catch (error) {
            await call('purge_failure', { ordinal: next.ordinal, token: lease.token, definiteFailure: error?.definite === true });
            if (error?.definite !== true) throw new Error('AM1_STORAGE_OUTCOME_UNCERTAIN');
            throw error;
          }
          await call('purge_mark', { ordinal: next.ordinal, token: lease.token });
          removed++;
        }
        return reply({ removed, done });
      } finally {
        await call('purge_batch_end', { token: lease.token });
      }
    } catch (error) {
      const message = String(error?.message || '');
      const code = message.match(/AM1_[A-Z_]+/)?.[0] || 'AM1_SERVER_ERROR';
      // Never return signed URLs, storage paths, SQL text or internal exception details.
      return reply({ error: code }, code === 'AM1_FORBIDDEN' ? 403 : code === 'AM1_AUTH_REQUIRED' ? 401 : 409);
    }
  };
}
