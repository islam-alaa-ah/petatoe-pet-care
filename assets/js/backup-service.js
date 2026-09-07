// KYUM Phase 12 — Backup Service
(function () {

  function requirePermission(screenKey, action) {
    if (!window.CustomerPermissions?.requireAction?.(screenKey, action, { silent: true })) {
      throw new Error(`Permission denied: ${screenKey}.${action}`);
    }
  }
  function client() {
    if (!window.customerSupabase) throw new Error(window.PetatoeLocalization.t("auth.error.supabaseNotReady"));
    return window.customerSupabase;
  }

  async function invoke(body) {
    const { data, error } = await client().functions.invoke("backup-admin", { body });
    if (error) throw new Error(window.PetatoeLocalization.t("backups.error.operation", { error: error.message }));
    if (!data?.success) throw new Error(data?.error || window.PetatoeLocalization.t("backups.error.failed"));
    return data;
  }

  async function createBackup() {
    requirePermission("backups", "export");
    return invoke({ action: "export" });
  }

  async function validateBackup(backup) {
    return invoke({ action: "validate", backup });
  }

  async function dryRunRestore(backup) {
    requirePermission("backups", "edit");
    return invoke({ action: "restore_dry_run", backup });
  }

  async function restoreBackup(backup, confirmation) {
    requirePermission("backups", "edit");
    return invoke({ action: "restore", backup, confirmation });
  }

  async function listHistory() {
    const { data, error } = await client()
      .from("backup_operations")
      .select(`
        id,
        operation_type,
        file_name,
        total_records,
        status,
        details,
        created_at,
        user:user_profiles (
          full_name,
          email
        )
      `)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw new Error(window.PetatoeLocalization.t("backups.error.history", { error: error.message }));
    return data || [];
  }

  window.BackupService = Object.freeze({
    createBackup,
    validateBackup,
    dryRunRestore,
    restoreBackup,
    listHistory
  });
})();