// Passive local snapshot only: no database opening, writes, HTTP or new channels.
(() => {
  'use strict';
  const auth=window.CustomerAuth?.getState?.()||{};
  const channels={notification:0,execution:0,other:0};
  for(const channel of window.customerSupabase?.getChannels?.()||[]){
    const topic=String(channel?.topic||'');
    if(topic.includes('kyum-notifications-'))channels.notification++;
    else if(topic.includes('petatoe-execution-workspace-updates'))channels.execution++;
    else channels.other++;
  }
  const result={
    phase:'SC1-SMARTCACHE-RECOVERY',operation:'PASSIVE_LOCAL_CAPTURE',
    verdict:'LOCAL_STATE_ONLY_PRODUCTION_RECOVERY_AND_REGRESSION_NOT_PROVEN',
    capturedAt:new Date().toISOString(),version:window.KYUM_RELEASE_VERSION||null,
    configured:window.customerSupabaseStatus?.configured===true,
    clientReady:typeof window.customerSupabase?.rpc==='function',
    authInitialized:auth.initialized===true,authOffline:auth.offline===true,
    browserOnline:navigator.onLine,documentVisible:document.visibilityState==='visible',
    cacheRuntime:window.KYUMSmartCache?.runtimeVersion||null,
    cacheConnection:window.KYUMSmartCache?.getConnectionStatus?.()||null,
    notificationRuntime:window.NotificationCenterService?.runtimeVersion||null,
    executionRuntime:window.ExecutionRealtimeLifecycle?.runtimeVersion||null,
    financeRuntimes:{vehicle:window.VehicleTreasuryService?.runtimeVersion||null,payroll:window.PayrollService?.runtimeVersion||null,seaVibePayroll:window.SeaVibePayrollService?.runtimeVersion||null},
    channels
  };
  console.log('SC1_RESULT\n'+JSON.stringify(result,null,2));
})()
