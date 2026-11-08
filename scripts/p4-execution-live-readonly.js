// P4: one local snapshot only. No requests, writes, auth calls or new channels.
(() => {
 'use strict';
 const counts={notification:0,execution:0,other:0},executionStates=[];
 for(const channel of window.customerSupabase?.getChannels?.()||[]){
  const topic=String(channel?.topic||'');
  if(topic.includes('kyum-notifications-'))counts.notification++;
  else if(topic.includes('petatoe-execution-workspace-updates')){
   counts.execution++;executionStates.push(['joined','joining','leaving','closed','errored'].includes(channel.state)?channel.state:'unknown');
  }else counts.other++;
 }
 const rawView=window.KYUMNavigation?.current?.(),rawVersion=window.KYUM_RELEASE_VERSION;
 return JSON.stringify({phase:'P4-EXECUTION-REALTIME',operation:'PASSIVE_LOCAL_CAPTURE',verdict:'REVIEW_REQUIRED_LIVE_TRANSITIONS_NOT_PROVEN',
  capturedAt:new Date().toISOString(),version:typeof rawVersion==='string'&&/^\d+\.\d+\.\d+$/.test(rawVersion)?rawVersion:null,
  runtime:window.ExecutionRealtimeLifecycle?.runtimeVersion||null,
  view:typeof rawView==='string'&&/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(rawView)?rawView:'unknown',
  online:navigator.onLine,documentVisible:document.visibilityState!=='hidden',channels:counts,executionStates,
  lifecycle:window.ExecutionRealtimeLifecycle?.getStatus?.()||null
 },null,2);
})()
