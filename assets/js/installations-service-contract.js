(function () {
  'use strict';

  const REQUIRED_METHODS = [
    'list', 'options', 'requestEditDetail', 'requestEditOptions', 'createRequest', 'updateRequest', 'updateRequestServices', 'updateRequestContextServices', 'remove', 'technicians', 'scheduleTeams', 'technicianNameSuggestions', 'scheduleList', 'schedulePlan', 'assignMultiDay', 'cancelSchedule', 'assign', 'executionWorkspace', 'executionIdentity', 'selectExecutionRequest', 'recordMapOpened', 'advanceExecution', 'subscribeExecutionWorkspace', 'completionList', 'completionCollectionRecoveryState', 'recoverCompletionCollectionStage', 'confirmActualQuantities', 'confirmActualQuantitiesAndInvoice', 'cancelConfirmedQuantity', 'saveCompletion', 'signedFileUrl', 'exceptionList', 'saveRevisit', 'operationalReport', 'installationSummaryReport', 'settingsCatalog', 'saveSettingItem', 'toggleSettingItem', 'removeSettingItem'
  ];

  function isValid(service) {
    return !!service && REQUIRED_METHODS.every((name) => typeof service[name] === 'function');
  }

  function loadFreshService() {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-kyum-installations-service-recovery="true"]');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', () => reject(new Error('تعذر تحميل خدمة إدارة المواعيد.')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'assets/js/installations-service.js?v=18.56.28';
      script.async = false;
      script.dataset.kyumInstallationsServiceRecovery = 'true';
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', () => reject(new Error('تعذر تحميل خدمة إدارة المواعيد.')), { once: true });
      document.head.appendChild(script);
    });
  }

  let recoveryPromise = null;

  async function resolveService() {
    if (isValid(window.InstallationsService)) return window.InstallationsService;

    if (!recoveryPromise) {
      recoveryPromise = loadFreshService().then(() => {
        if (!isValid(window.InstallationsService)) {
          throw new Error('تعذر تهيئة خدمة بيانات إدارة المواعيد.');
        }
        return window.InstallationsService;
      });
    }

    return recoveryPromise;
  }

  window.KYUMInstallationsServiceReady = resolveService();
  window.getKYUMInstallationsService = async function (methodName) {
    const service = await resolveService();
    if (methodName && typeof service[methodName] !== 'function') {
      throw new Error(`وظيفة خدمة المواعيد غير متاحة: ${methodName}`);
    }
    return service;
  };

  window.InstallationsServiceSafe = new Proxy({}, {
    get(_target, property) {
      if (property === 'then') return undefined;
      return async function (...args) {
        const service = await window.getKYUMInstallationsService(String(property));
        return service[property](...args);
      };
    }
  });
})();
