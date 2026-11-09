// Passive local capture only. No fetch, RPC, export, file writes or deletion.
(() => {
  const el = id => document.getElementById(id);
  const auth = window.CustomerAuth?.getState?.() || {};
  const result = {
    phase: 'AM1R2-PDF-READONLY',
    verdict: 'LOCAL_STATE_ONLY_NOT_A_PDF_OR_ACCESS_PASS',
    capturedAt: new Date().toISOString(),
    version: window.KYUM_RELEASE_VERSION || window.KYUM_UPDATE?.currentVersion || null,
    view: window.KYUMNavigation?.current?.() || null,
    attachmentRuntime: window.AttachmentManagement?.runtime || null,
    state: window.AttachmentManagement?.getStatus?.() || null,
    online: navigator.onLine,
    authOffline: auth.offline === true,
    identityMatches: Boolean(auth.user?.id && auth.user.id === auth.profile?.id),
    role: auth.profile?.role || null,
    selectedMonth: el('am1Month')?.value || null,
    exportDisabled: el('am1Export')?.disabled ?? null,
    statusMessage: el('am1Status')?.textContent?.trim() || null,
    statusIsError: el('am1Status')?.classList.contains('is-error') ?? null,
    secureContext: window.isSecureContext,
    topLevelWindow: window.top === window,
    filePickerSupported: typeof window.showSaveFilePicker === 'function',
    archiveFontStates: Array.from(document.fonts || []).filter(f => f.family.replace(/["']/g, '') === 'PETATOEArchive').map(f => f.status),
    noRequestsPerformed: true,
    noStorageObjectsDeleted: true
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
})();
