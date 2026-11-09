(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const tr = (key, vars) => window.PetatoeLocalization?.t?.('attachments.' + key, vars) || key;
  const lang = () => window.PetatoeLocalization?.getLanguage?.() === 'en' ? 'en' : 'ar';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let owner = null, status = null, rows = [], page = 0, more = false, busy = false, generation = 0;
  let controller = null, jobArchive = null, modulePromise = null;
  let previewURL=null,previewController=null;
  const active = () => window.KYUMNavigation?.current?.() === 'attachmentManagement';
  const pdf = () => modulePromise || (modulePromise = import('./attachment-pdf.mjs'));
  function identity() {
    const s = window.CustomerAuth?.getState?.();
    if (!s?.user?.id || s.profile?.id !== s.user.id || s.profile.role !== 'super_admin' || s.profile.is_active === false || s.offline === true || !window.customerSupabase || navigator.onLine === false) throw new Error('AM1_FORBIDDEN');
    return s.user.id;
  }
  function stillHere(id, seq = generation) { return active() && id === owner && seq === generation && identity() === id; }
  async function call(action, input = {}) {
    const id = identity();
    const { data, error } = await window.customerSupabase.functions.invoke('attachment-admin', { body: { action, ...input, revision:'AM1R1' } });
    if (identity() !== id) throw new Error('AM1_IDENTITY_CHANGED');
    if (error) {
      let code;
      try { code = (await error.context?.json?.())?.error; } catch (_) { /* no internal error details */ }
      throw new Error(code || 'AM1_SERVER_UNAVAILABLE');
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }
  function message(key, error = false, vars) {
    const node = $('am1Status');
    if (node) { node.textContent = tr(key, vars); node.classList.toggle('is-error', error); }
  }
  function errorMessage(error) {
    const code = String(error?.message || '').match(/AM1_[A-Z_]+/)?.[0] || 'AM1_SERVER_UNAVAILABLE';
    const value = tr('error.' + code);
    if ($('am1Status')) { $('am1Status').textContent = value.startsWith('[') ? tr('error.AM1_SERVER_UNAVAILABLE') : value; $('am1Status').classList.add('is-error'); }
  }
  function month() { return $('am1Month')?.value || ''; }
  function archiveOptions() { return status?.archives?.filter(a => !month() || a.month === month()) || []; }
  function archiveSelected() { return archiveOptions().find(a => a.id === $('am1Archive')?.value); }
  function date(value) {
    return value ? new Intl.DateTimeFormat(lang() === 'en' ? 'en-GB' : 'ar-SA-u-ca-gregory-nu-latn', { dateStyle:'medium', timeStyle:'short', timeZone:'Asia/Riyadh' }).format(new Date(value)) : tr('unknown');
  }
  function size(value) { return `${(Number(value || 0) / 1048576).toFixed(2)} MB`; }
  function clearPreview(){previewController?.abort();previewController=null;if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;$('am1Preview')?.removeAttribute('src');}
  function controls() {
    const closed = Boolean(month() && status?.currentMonth && month() < status.currentMonth);
    const a = archiveSelected();
    for (const id of ['am1Month','am1Refresh','am1All','am1Archive']) if ($(id)) $(id).disabled = busy;
    if ($('am1Export')) $('am1Export').disabled = busy || !closed || !status;
    if ($('am1Next')) { $('am1Next').disabled = busy || !more; $('am1Next').hidden = !more; }
    if ($('am1Previous')) $('am1Previous').disabled = busy || page === 0;
    if ($('am1Cancel')) $('am1Cancel').hidden = !busy;
    if ($('am1Verify')) $('am1Verify').disabled = busy || !a || !['ready','confirmed'].includes(a.status);
    const canDelete = !!(a?.confirmed_at && ['confirmed','purging'].includes(a.status) && Number(a.remaining) > 0);
    if ($('am1Delete')) { $('am1Delete').hidden = !canDelete; $('am1Delete').disabled = busy || !status?.deletionEnabled; }
    if ($('am1ArchiveInfo')) $('am1ArchiveInfo').textContent = a ? tr('archiveInfo', { month:a.month, count:a.item_count, remaining:a.remaining, protected:a.protected_count, state:tr('state.'+a.status) }) : tr('noArchive');
    if ($('am1MonthHint')) $('am1MonthHint').textContent = closed ? tr('closedMonth') : tr('monthHint');
  }
  function renderArchives(selected) {
    if (!$('am1Archive')) return;
    const previous = selected || $('am1Archive').value;
    $('am1Archive').innerHTML = '<option value="">'+esc(tr('chooseArchive'))+'</option>' + archiveOptions().map(a => `<option value="${esc(a.id)}">${esc(a.month)} · ${esc(date(a.created_at))} · ${esc(tr('state.'+a.status))}</option>`).join('');
    if (archiveOptions().some(a => a.id === previous)) $('am1Archive').value = previous;
    else if (archiveOptions()[0]) $('am1Archive').value = archiveOptions()[0].id;
    controls();
  }
  function renderRows() {
    if (!$('am1Rows')) return;
    $('am1Rows').innerHTML = rows.map(r => `<tr><td><strong>${esc(r.fileName)}</strong><small dir="ltr">${esc(r.bucket)}</small><small>${esc(size(r.bytes))}</small></td><td>${esc(date(r.uploadedAt))}</td><td>${esc(r.uploader?.name || tr('unknown'))}${r.uploaderEvidence==='storage_owner'?'<small>'+esc(tr('storageOwnerOnly'))+'</small>':''}</td><td>${esc(r.customer?.name || tr('unknown'))}</td><td>${esc(r.reference || tr('notLinked'))}<small>${esc(r.source)}</small></td><td><span class="am1-tag ${r.protected ? 'is-protected' : ''}">${esc(tr(r.protected ? 'protected' : 'archivable'))}</span>${r.protected ? '<small>'+esc(tr('protection.'+r.protectionReason))+'</small>' : ''}</td><td><button class="secondary-btn" type="button" data-am1-details="${esc(r.objectId)}">${esc(tr('details'))}</button></td></tr>`).join('') || `<tr><td colspan="7" class="empty-state">${esc(tr('empty'))}</td></tr>`;
    $('am1Page').textContent = tr('page', { n:page+1, count:rows.length });
    controls();
  }
  async function load({ refreshStatus = false, selected } = {}) {
    if (!active() || busy) return;
    let id;
    try { id=identity(); } catch(error) {errorMessage(error);return;}
    const seq = generation;
    owner = id; busy = true; controls(); message('loading');
    try {
      if (!status || refreshStatus) {
        const snapshot=await call('status');
        if(!stillHere(id,seq))return;
        if(snapshot?.runtime!=='AM1R1')throw new Error('AM1_REVISION_MISMATCH');
        status=snapshot;
      }
      if (!stillHere(id, seq)) return;
      const result = await call('list', { month:month(), offset:page*50 });
      if (!stillHere(id, seq)) return;
      rows = result.items; more = result.hasMore;
      renderArchives(selected); renderRows(); message('loaded');
    } catch (error) { if (owner === id && active()) errorMessage(error); }
    finally { if (seq === generation) { busy = false; controls(); } }
  }
  function beginJob() {
    if (busy) throw new Error('AM1_ARCHIVE_BUSY');
    owner = identity(); busy = true; controller = new AbortController(); controls();
    return { id:owner, seq:generation, signal:controller.signal };
  }
  function checkJob(job) { if (job.signal.aborted || !stillHere(job.id,job.seq)) throw new Error('AM1_CANCELLED'); }
  async function cancelOwnExport(archiveId,id){try{if(identity()===id)await call('cancel',{archiveId});}catch(_){/* expiring export locks remain safe if offline or signed out */}}
  async function exportMonth() {
    let job, handle, stream, sink, archive, selected, failure;
    const exportMonth = month();
    if (!exportMonth || !status || exportMonth >= status.currentMonth || busy) return;
    try {
      job = beginJob();
      // Must open inside the click's user gesture, before any awaited network work.
      if (typeof window.showSaveFilePicker === 'function') handle = await window.showSaveFilePicker({ suggestedName:`PETATOE_Attachments_${exportMonth}_${Date.now()}.pdf`, types:[{description:'PDF',accept:{'application/pdf':['.pdf']}}] });
      checkJob(job); message('preparing');
      archive = await call('begin', { month:exportMonth });
      checkJob(job);
      jobArchive = archive.id;
      const chunks = [];
      let retained = 0;
      if (handle) {
        stream = await handle.createWritable();
        sink = { write:b => stream.write(b), close:() => stream.close(), abort:() => stream.abort() };
      } else {
        // A large download requires streaming to disk; never silently export part of a month.
        if (Number(archive.bytes) > 100*1048576) throw new Error('AM1_USE_STREAMING_BROWSER');
        sink = { write:async b => { retained += b.length; if(retained > 200*1048576) throw new Error('AM1_USE_STREAMING_BROWSER'); chunks.push(b); }, close:async () => {}, abort:async () => {chunks.length=0;} };
      }
      const module = await pdf();
      await document.fonts?.ready;
      const language = lang();
      const receipt = await module.writeArchive({ archive, sink, signal:job.signal,
        load:async (ordinal, signal) => {
          checkJob(job);
          const item = await call('item', {archiveId:archive.id, ordinal});
          checkJob(job);
          const u = new URL(item.signedUrl), base = new URL(window.CUSTOMER_APP_CONFIG.supabaseUrl);
          if (u.origin !== base.origin || !u.pathname.startsWith('/storage/v1/object/sign/')) throw new Error('AM1_IMAGE_UNAVAILABLE');
          const response = await fetch(u, { signal, credentials:'omit', cache:'no-store', referrerPolicy:'no-referrer' });
          if (!response.ok) throw new Error('AM1_IMAGE_UNAVAILABLE');
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (Number(item.bytes) > 0 && bytes.length !== Number(item.bytes)) throw new Error('AM1_IMAGE_UNAVAILABLE');
          return {item, bytes};
        },
        render:(item,bytes) => module.renderImagePage(item,bytes,{language}),
        progress:p => {checkJob(job); message('progress',false,{n:p.ordinal,total:p.total});}
      });
      checkJob(job);
      await call('complete', {archiveId:archive.id, ...receipt});
      checkJob(job);
      selected = archive.id; jobArchive = null;
      if (!handle) {
        const blob = new Blob(chunks, { type:'application/pdf' }), url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href=url; link.download=`PETATOE_Attachments_${archive.month}_${archive.id}.pdf`;
        document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
      message('savedVerify');
    } catch(error) {
      failure=error;
      if (archive) await cancelOwnExport(archive.id,job?.id);
      if (error?.name !== 'AbortError' && job?.seq===generation) errorMessage(error);
    } finally {
      if (job?.seq === generation) {
        jobArchive = null;
        busy = false; controller = null; controls();
        await load({refreshStatus:true, selected});
        if(selected) message('savedVerify');else if(failure && failure.name!=='AbortError')errorMessage(failure);
      }
    }
  }
  async function verifyFile(file) {
    const archive = archiveSelected();
    if (!file || !archive || busy) return;
    let job, verified=false, failure;
    try {
      job=beginJob(); message('verifying');
      if (file.size !== Number(archive.pdf_bytes)) throw new Error('AM1_PDF_MISMATCH');
      const module=await pdf(), sha256=await module.hashFile(file,job.signal); checkJob(job);
      if(sha256!==archive.pdf_sha256) throw new Error('AM1_PDF_MISMATCH');
      await call('confirm',{archiveId:archive.id,sha256,bytes:file.size});
      verified=true;
      message('verified');
    } catch(error) {failure=error;if(job?.seq===generation)errorMessage(error);}
    finally {if(job?.seq===generation){busy=false;controller=null;await load({refreshStatus:true,selected:archive.id});if(verified)message('verified');else if(failure)errorMessage(failure);$('am1PdfFile').value='';}}
  }
  async function purge() {
    const archive=archiveSelected();
    if(!archive?.confirmed_at || !status?.deletionEnabled || busy) return;
    $('am1DeleteMonth').textContent=archive.month;
    $('am1DeleteConfirm').value=''; $('am1DeleteAccepted').checked=false;
    $('am1DeleteExecute').disabled=true;
    $('am1DeleteDialog').showModal();
  }
  async function confirmPurge() {
    const archive=archiveSelected();
    if(!archive || $('am1DeleteConfirm').value!==archive.month || !$('am1DeleteAccepted').checked) return;
    $('am1DeleteDialog').close();
    let job, failure, complete=false;
    try {
      job=beginJob(); message('deleting');
      // One foreground operation; no background worker or automatic HTTP retry.
      while(true){checkJob(job);const result=await call('purge',{archiveId:archive.id,confirmMonth:archive.month});checkJob(job);if(result.done)break;}
      complete=true;
      message('deleted');
    } catch(error){failure=error;if(job?.seq===generation)errorMessage(error);}
    finally {if(job?.seq===generation){busy=false;controller=null;await load({refreshStatus:true,selected:archive.id});if(complete)message('deleted');else if(failure)errorMessage(failure);}}
  }
  function reset() {
    const pendingExport=jobArchive,previousOwner=owner;
    generation++; controller?.abort(); controller=null; owner=null; status=null; rows=[]; more=false; page=0; busy=false;
    jobArchive=null;
    $('am1DetailsDialog')?.close(); $('am1DeleteDialog')?.close();
    clearPreview();
    renderRows(); renderArchives();
    if(pendingExport)void cancelOwnExport(pendingExport,previousOwner);
  }
  function attach() {
    $('am1Refresh')?.addEventListener('click',()=>load({refreshStatus:true}));
    $('am1All')?.addEventListener('click',()=>{if(!busy){$('am1Month').value='';page=0;load();}});
    $('am1Month')?.addEventListener('change',()=>{page=0;load();});
    $('am1Previous')?.addEventListener('click',()=>{if(page>0&&!busy){page--;load();}});
    $('am1Next')?.addEventListener('click',()=>{if(more&&!busy){page++;load();}});
    $('am1Archive')?.addEventListener('change',controls);
    $('am1Export')?.addEventListener('click',exportMonth);
    $('am1Cancel')?.addEventListener('click',()=>controller?.abort());
    $('am1Verify')?.addEventListener('click',()=>{$('am1PdfFile').value='';$('am1PdfFile').click();});
    $('am1PdfFile')?.addEventListener('change',event=>verifyFile(event.target.files?.[0]));
    $('am1Delete')?.addEventListener('click',purge);
    $('am1DeleteExecute')?.addEventListener('click',confirmPurge);
    const deleteValidation=()=>{const a=archiveSelected();$('am1DeleteExecute').disabled=!a||$('am1DeleteConfirm').value!==a.month||!$('am1DeleteAccepted').checked;};
    $('am1DeleteConfirm')?.addEventListener('input',deleteValidation);
    $('am1DeleteAccepted')?.addEventListener('change',deleteValidation);
    document.querySelectorAll('[data-am1-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
    $('am1DetailsDialog')?.addEventListener('close',clearPreview);
    $('am1Rows')?.addEventListener('click',async event=>{
      if(busy)return;
      const id=event.target.closest('[data-am1-details]')?.dataset.am1Details;
      const row=rows.find(r=>r.objectId===id);if(!row)return;
      clearPreview();previewController=new AbortController();const signal=previewController.signal;
      $('am1DetailsDialog').dataset.objectId=id;$('am1Details').textContent=JSON.stringify(row,null,2);$('am1DetailsDialog').showModal();
      const idOwner=owner,seq=generation;
      try{
        const result=await call('preview',{objectId:row.objectId});
        if(!stillHere(idOwner,seq)||!$('am1DetailsDialog').open||$('am1DetailsDialog').dataset.objectId!==id)return;
        const url=new URL(result.signedUrl),base=new URL(window.CUSTOMER_APP_CONFIG.supabaseUrl);
        if(url.origin!==base.origin||!url.pathname.startsWith('/storage/v1/object/sign/'))throw new Error('AM1_IMAGE_UNAVAILABLE');
        const response=await fetch(url,{signal,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
        if(!response.ok)throw new Error('AM1_IMAGE_UNAVAILABLE');
        const blob=await response.blob();
        if(signal.aborted||!stillHere(idOwner,seq)||!$('am1DetailsDialog').open||$('am1DetailsDialog').dataset.objectId!==id)return;
        previewURL=URL.createObjectURL(blob);$('am1Preview').src=previewURL;$('am1Preview').alt=row.fileName||'';
      }catch(error){if(seq===generation&&active()&&error.name!=='AbortError')errorMessage(error);}
    });
    window.addEventListener('kyum-view-changed',event=>{
      if(event.detail?.view==='attachmentManagement'){try{identity();load({refreshStatus:true});}catch(error){errorMessage(error);}}
      else if(owner)reset();
    });
    window.addEventListener('kyum-auth-state-changed',()=>{if(owner){try{if(identity()!==owner)reset();}catch(_){reset();}}});
    window.addEventListener('offline',()=>controller?.abort());
    window.addEventListener('petatoe-language-changed',()=>{if(active()){renderRows();renderArchives();}});
    if(active()) load({refreshStatus:true}).catch(errorMessage);
  }
  window.AttachmentManagement=Object.freeze({runtime:'AM1R1',getStatus:()=>({active:active(),busy,listed:rows.length,archiveInProgress:!!jobArchive})});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach,{once:true});else attach();
})();
