// AM2: persist an upload intent before sending image bytes. No background work.
(function () {
  'use strict';
  const inFlight = new Map();
  const tr = key => window.PetatoeLocalization?.t?.('attachments.upload.' + key) || key;
  function identity() {
    const state = window.CustomerAuth?.getState?.();
    if (!state?.user?.id || state.profile?.id !== state.user.id || state.profile.is_active === false || state.offline || navigator.onLine === false) throw new Error(tr('onlineRequired'));
    return state.user.id;
  }
  function assertOwner(owner) { if (identity() !== owner) throw new Error(tr('identityChanged')); }
  async function hash(bytes) {
    if (!window.crypto?.subtle) throw new Error(tr('secureBrowserRequired'));
    return Array.from(new Uint8Array(await window.crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  }
  async function rpc(owner, action, input) {
    assertOwner(owner);
    const { data, error } = await window.customerSupabase.rpc('petatoe_attachment_upload_am2', { p_action:action, p_input:input });
    assertOwner(owner);
    if (error) {
      const code = String(error.message || '').match(/AM2_[A-Z_]+/)?.[0];
      throw new Error(tr(code === 'AM2_FORBIDDEN' ? 'forbidden' : code === 'AM2_INTENT_CONFLICT' ? 'conflict' : code === 'AM2_OBJECT_ARCHIVING' ? 'archiving' : code === 'AM2_NOT_ENABLED' ? 'updateRequired' : 'retry'));
    }
    if (data?.revision !== 'AM2') throw new Error(tr('updateRequired'));
    return data;
  }
  async function perform(owner, input, file, sha256) {
    const prepared = await rpc(owner, 'prepare', { ...input, fileName:file.name, mimeType:file.type, bytes:file.size, sha256 });
    if (prepared.registered) return { id:prepared.id, path:prepared.path, reused:true, retained:true };
    if (!prepared.intentId || prepared.bucket !== 'installation-evidence' || !prepared.path?.startsWith(input.requestId + '/')) throw new Error(tr('conflict'));
    if (!prepared.uploaded) {
      assertOwner(owner);
      const { error } = await window.customerSupabase.storage.from(prepared.bucket).upload(prepared.path, file, {
        contentType:file.type, upsert:false, metadata:{ petatoe_intent:prepared.intentId, client_sha256:sha256 }
      });
      assertOwner(owner);
      // A concurrent tab may have uploaded this exact intent. Commit validates its
      // owner, intent marker, size and MIME. Network failures remain resumable.
      if (error && ![409, '409', 'Duplicate'].includes(error.statusCode || error.status || error.error)) throw new Error(tr('retry'));
    }
    const committed = await rpc(owner, 'commit', { intentId:prepared.intentId });
    if (!committed.registered || !committed.id || committed.path !== prepared.path) throw new Error(tr('retry'));
    return { id:committed.id, path:committed.path, reused:committed.reused === true, retained:true };
  }
  async function upload({ requestId, visitId = null, target = 'execution', fileKind = 'execution', evidenceKey = null, file } = {}) {
    if (!file) return null;
    const owner = identity();
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size < 1 || file.size > 10485760) throw new Error(tr('invalidImage'));
    const sha256 = await hash(await file.arrayBuffer());
    assertOwner(owner);
    // Content identity survives refresh/reselection. Financial callers retain
    // their existing operation-specific evidence key without changing RPC keys.
    const key = evidenceKey || 'am2:' + await hash(new TextEncoder().encode(JSON.stringify([owner,requestId,visitId,target,fileKind,sha256])));
    assertOwner(owner);
    const input = { requestId, visitId, target, fileKind, evidenceKey:key };
    const localKey = JSON.stringify([owner,key]);
    if (inFlight.has(localKey)) return inFlight.get(localKey);
    const promise = perform(owner,input,file,sha256);
    inFlight.set(localKey,promise);
    try { return await promise; } finally { if (inFlight.get(localKey) === promise) inFlight.delete(localKey); }
  }
  // Registration is a completed attachment write. A later business-RPC failure
  // must not undo it: the next explicit attempt reuses it. In particular, reused
  // attachments and uncertain network outcomes are never rolled back by path.
  function retainedFailure(error, files) {
    if ((files || []).some(Boolean)) {
      const original = String(error?.message || error || '');
      if (!original.includes(tr('retained'))) {
        const wrapped = new Error(original + ' ' + tr('retained'), { cause:error });
        wrapped.code = error?.code;
        return wrapped;
      }
    }
    return error;
  }
  window.PetatoeAttachmentUpload = Object.freeze({ revision:'AM2', upload, retainedFailure });
})();
