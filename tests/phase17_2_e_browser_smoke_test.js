/*
 * KYUM CRM Phase 17.2-E — Browser permission smoke test
 * Run from DevTools Console after signing in.
 * Read-only: it does not create, update, delete or export data.
 */
(async () => {
  const results = [];
  const check = (name, passed, details = '') => {
    results.push({ test: name, result: passed ? 'PASS' : 'FAIL', details });
  };

  const permissions = window.CustomerPermissions;
  check('CustomerPermissions API exists', Boolean(permissions));
  check('KYUMNavigation API exists', Boolean(window.KYUMNavigation));

  if (!permissions || !window.KYUMNavigation) {
    console.table(results);
    throw new Error('Permission APIs are not loaded.');
  }

  const current = window.KYUMNavigation.current?.();
  check('Current view is resolved', Boolean(current), String(current ?? ''));

  const allowedScreens = permissions.allowedScreens?.() || [];
  check('Allowed screens is an array', Array.isArray(allowedScreens), JSON.stringify(allowedScreens));
  check('At least one screen is allowed', allowedScreens.length > 0, JSON.stringify(allowedScreens));

  const knownScreens = permissions.knownScreens?.() || [];
  check('Known screens is an array', Array.isArray(knownScreens), JSON.stringify(knownScreens));

  const unknownDecision = permissions.authorizeView?.('__phase17_unknown_screen__', current || 'dashboard');
  check(
    'Unknown screen is blocked',
    Boolean(unknownDecision && unknownDecision.allowed === false),
    JSON.stringify(unknownDecision || null),
  );

  const deniedKnownScreen = knownScreens.find((screen) => !permissions.canScreen?.(screen, 'view'));
  if (deniedKnownScreen) {
    const before = window.KYUMNavigation.current?.();
    const opened = window.KYUMNavigation.open?.(deniedKnownScreen);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const after = window.KYUMNavigation.current?.();
    check('Denied known screen cannot become active', after !== deniedKnownScreen, `open=${opened}; before=${before}; after=${after}`);
  } else {
    check('Denied-screen route test', true, 'Skipped: current role can view every known screen.');
  }

  const navItems = [...document.querySelectorAll('[data-view]')];
  const badNavItems = navItems.filter((item) => {
    const screen = item.dataset.view;
    if (permissions.canScreen?.(screen, 'view')) return false;
    const hidden = item.hidden || item.getAttribute('aria-hidden') === 'true';
    const disabled = item.getAttribute('aria-disabled') === 'true';
    const tabRemoved = item.getAttribute('tabindex') === '-1';
    return !(hidden && disabled && tabRemoved);
  });
  check('Unauthorized navigation items are inaccessible', badNavItems.length === 0, badNavItems.map((x) => x.dataset.view).join(', '));

  const visibleViews = [...document.querySelectorAll('.view')].filter((view) => !view.hidden && view.getAttribute('aria-hidden') !== 'true');
  check('Only one application view is active', visibleViews.length === 1, visibleViews.map((x) => x.id).join(', '));

  const actionNames = ['view', 'add', 'edit', 'delete', 'export'];
  const invalidActions = [];
  for (const screen of allowedScreens) {
    for (const action of actionNames) {
      const value = permissions.canScreen?.(screen, action);
      if (typeof value !== 'boolean') invalidActions.push(`${screen}:${action}=${String(value)}`);
    }
  }
  check('All action decisions return booleans', invalidActions.length === 0, invalidActions.join(', '));

  console.table(results);
  const failed = results.filter((row) => row.result === 'FAIL');
  if (failed.length) {
    throw new Error(`Phase 17.2-E smoke test failed: ${failed.length} check(s).`);
  }
  console.info('Phase 17.2-E browser smoke test: PASS');
  return results;
})();
