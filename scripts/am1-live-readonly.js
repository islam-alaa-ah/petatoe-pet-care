// Paste only after AM1R1 is deployed. Passive local state; no requests or file reads.
(() => {
  const auth=window.CustomerAuth?.getState?.()||{};
  const result={
    phase:'AM1R1-ATTACHMENTS',operation:'PASSIVE_LOCAL_CAPTURE',verdict:'LOCAL_STATE_ONLY_NOT_AN_ACCESS_PDF_OR_DELETION_PASS',
    capturedAt:new Date().toISOString(),version:window.KYUM_RELEASE_VERSION||window.KYUM_UPDATE?.currentVersion||null,
    view:window.KYUMNavigation?.current?.()||null,browserOnline:navigator.onLine,
    configured:window.customerSupabaseStatus?.configured===true,clientReady:typeof window.customerSupabase?.functions?.invoke==='function',
    authOffline:auth.offline===true,identityMatches:Boolean(auth.user?.id&&auth.user.id===auth.profile?.id),role:auth.profile?.role||null,
    attachments:window.AttachmentManagement?.getStatus?.()||null,attachmentRuntime:window.AttachmentManagement?.runtime||null,
    smartCacheRuntime:window.KYUMSmartCache?.runtimeVersion||null,
    noRequestsPerformed:true,noStorageObjectsDeleted:true
  };
  console.log(JSON.stringify(result,null,2));
  return result;
})();
