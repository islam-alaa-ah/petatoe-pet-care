// P5: passive local state only. No requests, RPC, sync triggers, writes or channels.
(() => {
  'use strict';
  const counts={notification:0,execution:0,other:0};
  for(const channel of window.customerSupabase?.getChannels?.()||[]){
    const topic=String(channel?.topic||'');
    if(topic.includes('kyum-notifications-'))counts.notification++;
    else if(topic.includes('petatoe-execution-workspace-updates'))counts.execution++;
    else counts.other++;
  }
  const moduleStatus=service=>({runtime:service?.runtimeVersion||null,lifecycle:service?.getLifecycleReadStatus?.()||null});
  const rawView=window.KYUMNavigation?.current?.(),rawVersion=window.KYUM_RELEASE_VERSION;
  return JSON.stringify({
    phase:'P5-VISIBLE-FINANCE-READS',operation:'PASSIVE_LOCAL_CAPTURE',
    verdict:'LOCAL_STATE_ONLY_LIVE_READ_TIMING_NOT_PROVEN',capturedAt:new Date().toISOString(),
    version:typeof rawVersion==='string'&&/^\d+\.\d+\.\d+$/.test(rawVersion)?rawVersion:null,
    view:typeof rawView==='string'&&/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(rawView)?rawView:'unknown',
    online:navigator.onLine,documentVisible:document.visibilityState==='visible',channels:counts,
    vehicleTreasury:moduleStatus(window.VehicleTreasuryService),
    payroll:moduleStatus(window.PayrollService),seaVibePayroll:moduleStatus(window.SeaVibePayrollService),
    executionRuntime:window.ExecutionRealtimeLifecycle?.runtimeVersion||null,
    executionLifecycle:window.ExecutionRealtimeLifecycle?.getStatus?.()||null
  },null,2);
})()
