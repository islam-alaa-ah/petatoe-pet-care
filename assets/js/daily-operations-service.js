// KYUM Phase M13.7.1 — Daily Operations Offline Integration
(function () {
  "use strict";

  const CACHE_TTL_MS = 5 * 60 * 1000;
  const CACHE_STALE_MAX_MS = 30 * 24 * 60 * 60 * 1000;
  const CACHE_SCHEMA_VERSION = 2;
  const refreshes = new Map();

  function requirePermission(action = "view") {
    if (!window.CustomerPermissions?.requireAction?.("dailyOperations", action, { silent: true })) {
      throw new Error(`Permission denied: dailyOperations.${action}`);
    }
  }

  function client() {
    if (!window.customerSupabase) throw new Error("اتصال Supabase غير جاهز.");
    return window.customerSupabase;
  }

  function todayIso() {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString().slice(0, 10);
  }

  function authState() {
    return window.CustomerAuth?.getState?.() || {};
  }

  async function currentNamespace() {
    const stateId = authState()?.user?.id;
    if (stateId) return `user:${stateId}`;
    try {
      const result = await client().auth.getUser();
      return `user:${result?.data?.user?.id || "anonymous"}`;
    } catch (_) {
      return "user:anonymous";
    }
  }

  function cacheKey(type, workDate) {
    return `daily-operations:${type}:${workDate || "global"}`;
  }

  function emit(type, workDate, data, source) {
    window.dispatchEvent(new CustomEvent("kyum-daily-operations-cache-updated", {
      detail: { type, workDate, data, source, updatedAt: Date.now() }
    }));
  }

  async function readCache(type, workDate) {
    if (!window.KYUMSmartCache) return null;
    return window.KYUMSmartCache.get(cacheKey(type, workDate), {
      namespace: await currentNamespace(),
      allowStale: true,
      staleMaxMs: CACHE_STALE_MAX_MS
    });
  }

  async function writeCache(type, workDate, data, source = "supabase") {
    if (!window.KYUMSmartCache) return;
    await window.KYUMSmartCache.set(cacheKey(type, workDate), data, {
      namespace: await currentNamespace(),
      ttlMs: CACHE_TTL_MS,
      staleMaxMs: CACHE_STALE_MAX_MS,
      source,
      schemaVersion: CACHE_SCHEMA_VERSION
    });
  }

  function normalizeCompletion(row) {
    return {
      id: row.id,
      taskKey: row.task_key,
      taskName: row.task?.task_name || row.task_key,
      permissionKey: row.task?.permission_key || "",
      workDate: row.work_date,
      userId: row.user_id,
      representativeId: row.representative_id || null,
      completed: Boolean(row.is_completed),
      completedAt: row.completed_at || null,
      updatedAt: row.updated_at || null,
      serverUpdatedAt: row.serverUpdatedAt || row.updated_at || null,
      userName: row.user_profile?.full_name || "",
      representativeName: row.representative?.full_name || "",
      pendingSync: Boolean(row.pendingSync)
    };
  }

  function normalizeTargets(row, workDate) {
    return row ? {
      workDate: row.work_date || workDate,
      customersTarget: Number(row.customers_target || 0),
      followupsTarget: Number(row.followups_target || 0),
      quotationsTarget: Number(row.quotations_target || 0),
      updatedAt: row.updated_at || null,
      pendingSync: Boolean(row.pendingSync)
    } : {
      workDate,
      customersTarget: 3,
      followupsTarget: 10,
      quotationsTarget: 3,
      updatedAt: null,
      pendingSync: false
    };
  }

  function normalizeManagerNote(row) {
    return row ? {
      id: row.id || null,
      workDate: row.work_date,
      title: row.title || "",
      noteText: row.note_text || "",
      createdBy: row.created_by || null,
      audienceScope: row.audience_scope || "all",
      recipientUserIds: Array.isArray(row.recipient_user_ids) ? row.recipient_user_ids : [],
      updatedAt: row.updated_at || null,
      pendingSync: Boolean(row.pendingSync)
    } : null;
  }


  function canReadPermissionOwnedDailyData(screenKey = "dailyOperations") {
    const permissions = window.CustomerPermissions;
    if (!permissions?.canScreen) return false;
    if (screenKey === "dailyPerformanceReport") {
      return Boolean(permissions.canScreen("dailyPerformanceReport", "view"));
    }
    return Boolean(permissions.canScreen("dailyOperations", "view"));
  }

  async function fetchPermissionOwnedCrmData(workDate, screenKey = "dailyOperations") {
    if (!canReadPermissionOwnedDailyData(screenKey)) {
      throw new Error(`Permission denied: ${screenKey}.view`);
    }
    const { data, error } = await client().rpc("get_daily_permission_owned_crm_snapshot", {
      p_work_date: workDate
    });
    if (error) throw new Error(`تعذر تحميل بيانات التشغيل اليومية: ${error.message}`);
    const payload = data && typeof data === "object" ? data : {};
    return {
      workDate: payload.workDate || workDate,
      customers: Array.isArray(payload.customers) ? payload.customers : [],
      followups: Array.isArray(payload.followups) ? payload.followups : [],
      quotations: Array.isArray(payload.quotations) ? payload.quotations : []
    };
  }

  async function listPermissionOwnedCrmData(workDate = todayIso(), options = {}) {
    const screenKey = options.screenKey === "dailyPerformanceReport"
      ? "dailyPerformanceReport"
      : "dailyOperations";
    if (!canReadPermissionOwnedDailyData(screenKey)) {
      throw new Error(`Permission denied: ${screenKey}.view`);
    }
    const type = `permission-crm:${screenKey}`;
    const cached = !options.force ? await readCache(type, workDate) : null;
    if (cached?.hit && cached.data && typeof cached.data === "object") {
      if (window.customerSupabase) {
        refreshSingle(type, workDate, cached.data, date => fetchPermissionOwnedCrmData(date, screenKey)).catch(() => {});
      }
      return cached.data;
    }
    try {
      const data = await fetchPermissionOwnedCrmData(workDate, screenKey);
      await writeCache(type, workDate, data);
      return data;
    } catch (error) {
      if (cached?.data) return cached.data;
      throw error;
    }
  }

  async function fetchDefinitions() {
    const { data, error } = await client()
      .from("daily_task_definitions")
      .select("task_key, task_name, description, display_order, permission_key, is_active")
      .eq("is_active", true)
      .order("display_order", { ascending: true });
    if (error) throw new Error(`تعذر تحميل تعريفات المهام: ${error.message}`);
    return (data || []).map(row => ({
      taskKey: row.task_key,
      taskName: row.task_name,
      description: row.description || "",
      displayOrder: Number(row.display_order || 100),
      permissionKey: row.permission_key || ""
    }));
  }

  async function listDefinitions(options = {}) {
    requirePermission("view");
    const cached = !options.force ? await readCache("definitions", "global") : null;
    if (cached?.hit && Array.isArray(cached.data)) {
      if (navigator.onLine !== false) refreshDefinitions(cached.data).catch(() => {});
      return cached.data;
    }
    try {
      const rows = await fetchDefinitions();
      await writeCache("definitions", "global", rows);
      return rows;
    } catch (error) {
      if (cached?.data) return cached.data;
      throw error;
    }
  }

  async function refreshDefinitions(previousRows = []) {
    const key = "definitions:global";
    if (refreshes.has(key)) return refreshes.get(key);
    const job = (async () => {
      const rows = await fetchDefinitions();
      await writeCache("definitions", "global", rows);
      if (window.KYUMSmartCache?.hashValue?.(rows) !== window.KYUMSmartCache?.hashValue?.(previousRows)) {
        emit("definitions", "global", rows, "network-full");
      }
      return rows;
    })();
    refreshes.set(key, job);
    try { return await job; } finally { refreshes.delete(key); }
  }

  function completionsSelect() {
    return `
      id, task_key, work_date, user_id, representative_id,
      is_completed, completed_at, updated_at,
      task:daily_task_definitions(task_name, permission_key),
      user_profile:user_profiles!daily_task_completions_user_profile_fkey(full_name),
      representative:sales_representatives(full_name)
    `;
  }

  async function fetchCompletions(workDate, updatedSince = "") {
    let request = client().from("daily_task_completions").select(completionsSelect()).eq("work_date", workDate);
    if (updatedSince) request = request.gte("updated_at", updatedSince);
    const { data, error } = await request;
    if (error) throw new Error(`تعذر تحميل المهام اليومية: ${error.message}`);
    return (data || []).map(normalizeCompletion);
  }

  function sortCompletions(rows) {
    return [...(rows || [])].sort((a, b) => String(a.taskKey || "").localeCompare(String(b.taskKey || "")));
  }

  async function syncCompletions(workDate, cachedRows, forceFull = false) {
    const namespace = await currentNamespace();
    const result = window.KYUMSyncEngine ? await window.KYUMSyncEngine.sync({
      entity: `daily-task-completions:${workDate}`,
      namespace,
      scopeKey: cacheKey("completions", workDate),
      cachedRows,
      fetchFull: () => fetchCompletions(workDate),
      fetchDelta: since => fetchCompletions(workDate, since),
      sortRows: sortCompletions,
      forceFull
    }) : { rows: await fetchCompletions(workDate), mode: "full" };
    await writeCache("completions", workDate, result.rows);
    return result;
  }

  async function listForDate(workDate = todayIso(), options = {}) {
    requirePermission("view");
    const cached = !options.force ? await readCache("completions", workDate) : null;
    if (cached?.hit && Array.isArray(cached.data)) {
      if (navigator.onLine !== false) {
        syncCompletions(workDate, cached.data, false).then(result => {
          if (window.KYUMSmartCache?.hashValue?.(result.rows) !== window.KYUMSmartCache?.hashValue?.(cached.data)) {
            emit("completions", workDate, result.rows, `network-${result.mode}`);
          }
        }).catch(() => {});
      }
      return cached.data;
    }
    try {
      return (await syncCompletions(workDate, cached?.data, true)).rows;
    } catch (error) {
      if (cached?.data) return cached.data;
      throw error;
    }
  }


  async function invalidateDerivedDailyReports(workDate, entity = "daily_task_completions") {
    if (window.KYUMCacheDependencyEngine) {
      await window.KYUMCacheDependencyEngine.invalidate(entity, {
        workDate,
        source: "daily-operations-service"
      });
    } else if (window.KYUMOfflineReadCache) {
      await Promise.allSettled([
        window.KYUMOfflineReadCache.invalidate(`daily-performance:${workDate}`),
        window.KYUMOfflineReadCache.invalidate(`daily-activity:${workDate}`)
      ]);
    }
    window.dispatchEvent(new CustomEvent("kyum-daily-derived-invalidated", {
      detail: { workDate, source: "daily-operations-write", updatedAt: Date.now() }
    }));
  }

  async function setTaskStateOnline(taskKey, completed, workDate = todayIso()) {
    const state = authState();
    const userId = state?.user?.id;
    const representativeId = state?.profile?.representative_id || null;
    if (!userId) throw new Error("تعذر تحديد المستخدم الحالي.");
    const payload = {
      task_key: taskKey,
      work_date: workDate,
      user_id: userId,
      representative_id: representativeId,
      is_completed: Boolean(completed),
      completed_at: completed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    };
    const { data, error } = await client().from("daily_task_completions")
      .upsert(payload, { onConflict: "task_key,work_date,user_id" })
      .select(completionsSelect()).single();
    if (error) throw new Error(`تعذر تحديث المهمة اليومية: ${error.message}`);
    try {
      await client().from("audit_logs").insert({
        user_id: userId,
        action: completed ? "complete" : "reopen",
        entity_type: "daily_task_completions",
        entity_id: String(data.id),
        new_data: { task_key: taskKey, work_date: workDate, is_completed: Boolean(completed) },
        metadata: { source: "kyum-crm-web", phase: "M13.7.1" }
      });
    } catch (auditError) { console.warn("Daily task audit skipped:", auditError); }
    const normalized = normalizeCompletion(data);
    await mergeCompletionIntoCache(normalized, workDate, "online-write");
    await invalidateDerivedDailyReports(workDate);
    return normalized;
  }

  async function mergeCompletionIntoCache(record, workDate, source) {
    const cached = await readCache("completions", workDate);
    const rows = Array.isArray(cached?.data) ? [...cached.data] : [];
    const index = rows.findIndex(row => (record.id && String(row.id) === String(record.id)) ||
      (row.taskKey === record.taskKey && row.workDate === record.workDate && row.userId === record.userId));
    if (index >= 0) rows[index] = { ...rows[index], ...record };
    else rows.push(record);
    const sorted = sortCompletions(rows);
    await writeCache("completions", workDate, sorted, source);
    emit("completions", workDate, sorted, source);
    return record;
  }

  async function requireTaskEditPermission(taskKey) {
    const definitions = await listDefinitions();
    const definition = definitions.find(item => item.taskKey === taskKey);
    const permissionKey = definition?.permissionKey || "";
    if (!permissionKey || !window.CustomerPermissions?.canScreen?.(permissionKey, "edit")) {
      throw new Error(`Permission denied: ${permissionKey || taskKey}.edit`);
    }
    return definition;
  }

  async function latestPendingTaskOperation(taskKey, workDate) {
    if (!window.KYUMOfflineQueue?.list || !window.KYUMOfflineQueue?.getNamespace) return null;
    const namespace = await window.KYUMOfflineQueue.getNamespace({ allowNetwork: false });
    const rows = await window.KYUMOfflineQueue.list({
      namespace,
      statuses: ["pending", "retry", "processing"]
    });
    return [...rows].reverse().find(row =>
      row.entity === "daily_task_completions" &&
      row.payload?.taskKey === taskKey &&
      row.payload?.workDate === workDate
    ) || null;
  }

  async function setTaskState(taskKey, completed, workDate = todayIso(), context = {}) {
    await requireTaskEditPermission(taskKey);
    const queueTaskState = async () => {
      const state = authState();
      const now = new Date().toISOString();
      const cached = await readCache("completions", workDate);
      const existing = (cached?.data || []).find(row => row.taskKey === taskKey && row.userId === state?.user?.id);
      const baseServerUpdatedAt = existing?.serverUpdatedAt || existing?.updatedAt || "";
      const predecessor = await latestPendingTaskOperation(taskKey, workDate);
      if (predecessor && Boolean(predecessor.payload?.completed) === Boolean(completed) && existing?.pendingSync) {
        return existing;
      }
      const optimistic = {
        id: existing?.id || `local:daily-task:${state?.user?.id || "anonymous"}:${workDate}:${taskKey}`,
        taskKey,
        taskName: existing?.taskName || taskKey,
        permissionKey: existing?.permissionKey || "",
        workDate,
        userId: state?.user?.id || null,
        representativeId: state?.profile?.representative_id || null,
        completed: Boolean(completed),
        completedAt: completed ? now : null,
        updatedAt: now,
        serverUpdatedAt: baseServerUpdatedAt || null,
        userName: existing?.userName || state?.profile?.full_name || "",
        representativeName: existing?.representativeName || "",
        pendingSync: true
      };
      await window.KYUMOfflineQueue.enqueue({
        entity: "daily_task_completions",
        action: "upsert",
        payload: { taskKey, completed: Boolean(completed), workDate },
        localEntityId: optimistic.id,
        baseUpdatedAt: baseServerUpdatedAt,
        dependsOn: predecessor ? [predecessor.id] : [],
        idempotencyKey: `daily-task:${workDate}:${taskKey}:${completed ? 1 : 0}:${predecessor?.id || baseServerUpdatedAt || "new"}`
      });
      const merged = await mergeCompletionIntoCache(optimistic, workDate, "offline-optimistic");
      await invalidateDerivedDailyReports(workDate);
      return merged;
    };

    if (!context.skipOfflineQueue && navigator.onLine === false && window.KYUMOfflineQueue) {
      return queueTaskState();
    }
    try {
      return await setTaskStateOnline(taskKey, completed, workDate);
    } catch (error) {
      if (!context.skipOfflineQueue && window.KYUMOfflineQueue?.isRetryableError?.(error)) {
        return queueTaskState();
      }
      throw error;
    }
  }

  async function fetchTargets(workDate) {
    const { data, error } = await client().from("daily_operation_targets")
      .select("work_date, customers_target, followups_target, quotations_target, updated_at")
      .eq("work_date", workDate).maybeSingle();
    if (error) throw new Error(`تعذر تحميل الأهداف اليومية: ${error.message}`);
    return normalizeTargets(data, workDate);
  }

  async function getTargets(workDate = todayIso(), options = {}) {
    requirePermission("view");
    const cached = !options.force ? await readCache("targets", workDate) : null;
    if (cached?.hit && cached.data) {
      if (navigator.onLine !== false) refreshSingle("targets", workDate, cached.data, fetchTargets).catch(() => {});
      return cached.data;
    }
    try {
      const data = await fetchTargets(workDate);
      await writeCache("targets", workDate, data);
      return data;
    } catch (error) {
      if (cached?.data) return cached.data;
      throw error;
    }
  }

  async function saveTargetsOnline(targets, workDate = todayIso()) {
    const auth = authState();
    const payload = {
      work_date: workDate,
      customers_target: Math.max(0, Number(targets.customersTarget || 0)),
      followups_target: Math.max(0, Number(targets.followupsTarget || 0)),
      quotations_target: Math.max(0, Number(targets.quotationsTarget || 0)),
      updated_by: auth?.user?.id || null,
      updated_at: new Date().toISOString()
    };
    const { data, error } = await client().from("daily_operation_targets")
      .upsert(payload, { onConflict: "work_date" }).select("*").single();
    if (error) throw new Error(`تعذر حفظ الأهداف اليومية: ${error.message}`);
    const normalized = normalizeTargets(data, workDate);
    await writeCache("targets", workDate, normalized, "online-write");
    emit("targets", workDate, normalized, "online-write");
    await invalidateDerivedDailyReports(workDate, "daily_operation_targets");
    return normalized;
  }

  async function saveTargets(targets, workDate = todayIso(), context = {}) {
    requirePermission("edit");
    if (!context.skipOfflineQueue && navigator.onLine === false && window.KYUMOfflineQueue) {
      const current = await getTargets(workDate);
      const optimistic = { ...normalizeTargets({
        work_date: workDate,
        customers_target: targets.customersTarget,
        followups_target: targets.followupsTarget,
        quotations_target: targets.quotationsTarget,
        updated_at: new Date().toISOString(),
        pendingSync: true
      }, workDate), pendingSync: true };
      await window.KYUMOfflineQueue.enqueue({
        entity: "daily_operation_targets", action: "upsert", payload: { ...targets, workDate },
        localEntityId: workDate, baseUpdatedAt: current?.updatedAt || ""
      });
      await writeCache("targets", workDate, optimistic, "offline-optimistic");
      emit("targets", workDate, optimistic, "offline-optimistic");
      await invalidateDerivedDailyReports(workDate, "daily_operation_targets");
      return optimistic;
    }
    return saveTargetsOnline(targets, workDate);
  }

  async function fetchManagerNote(workDate) {
    const { data, error } = await client().from("daily_manager_notes")
      .select("id, work_date, title, note_text, created_by, audience_scope, recipient_user_ids, updated_at")
      .eq("work_date", workDate).maybeSingle();
    if (error) throw new Error(`تعذر تحميل ملاحظة المدير: ${error.message}`);
    return normalizeManagerNote(data);
  }

  async function getManagerNote(workDate = todayIso(), options = {}) {
    requirePermission("view");
    const cached = !options.force ? await readCache("manager-note", workDate) : null;
    if (cached?.hit) {
      if (navigator.onLine !== false) refreshSingle("manager-note", workDate, cached.data, fetchManagerNote).catch(() => {});
      return cached.data;
    }
    try {
      const data = await fetchManagerNote(workDate);
      await writeCache("manager-note", workDate, data);
      return data;
    } catch (error) {
      if (cached) return cached.data;
      throw error;
    }
  }

  async function saveManagerNoteOnline(note, workDate = todayIso()) {
    const auth = authState();
    const payload = {
      work_date: workDate,
      title: String(note.title || "").trim(),
      note_text: String(note.noteText || "").trim(),
      audience_scope: ["all","report_participants","selected"].includes(note.audienceScope) ? note.audienceScope : "all",
      recipient_user_ids: Array.isArray(note.recipientUserIds) ? note.recipientUserIds : [],
      created_by: auth?.user?.id || null,
      updated_at: new Date().toISOString()
    };
    const { data, error } = await client().from("daily_manager_notes")
      .upsert(payload, { onConflict: "work_date" }).select("*").single();
    if (error) throw new Error(`تعذر حفظ ملاحظة المدير: ${error.message}`);
    const normalized = normalizeManagerNote(data);
    await writeCache("manager-note", workDate, normalized, "online-write");
    emit("manager-note", workDate, normalized, "online-write");
    await invalidateDerivedDailyReports(workDate, "daily_manager_notes");
    return normalized;
  }

  async function saveManagerNote(note, workDate = todayIso(), context = {}) {
    requirePermission("edit");
    if (!context.skipOfflineQueue && navigator.onLine === false && window.KYUMOfflineQueue) {
      const current = await getManagerNote(workDate);
      const optimistic = {
        id: current?.id || `local:manager-note:${workDate}`,
        workDate,
        title: String(note.title || "").trim(),
        noteText: String(note.noteText || "").trim(),
        audienceScope: ["all","report_participants","selected"].includes(note.audienceScope) ? note.audienceScope : "all",
        recipientUserIds: Array.isArray(note.recipientUserIds) ? note.recipientUserIds : [],
        createdBy: authState()?.user?.id || null,
        updatedAt: new Date().toISOString(),
        pendingSync: true
      };
      await window.KYUMOfflineQueue.enqueue({
        entity: "daily_manager_notes", action: "upsert", payload: { ...note, workDate },
        localEntityId: optimistic.id, baseUpdatedAt: current?.updatedAt || ""
      });
      await writeCache("manager-note", workDate, optimistic, "offline-optimistic");
      emit("manager-note", workDate, optimistic, "offline-optimistic");
      await invalidateDerivedDailyReports(workDate, "daily_manager_notes");
      return optimistic;
    }
    return saveManagerNoteOnline(note, workDate);
  }

  async function refreshSingle(type, workDate, previous, fetcher) {
    const key = `${type}:${workDate}`;
    if (refreshes.has(key)) return refreshes.get(key);
    const job = (async () => {
      const next = await fetcher(workDate);
      await writeCache(type, workDate, next);
      if (window.KYUMSmartCache?.hashValue?.(next) !== window.KYUMSmartCache?.hashValue?.(previous)) {
        emit(type, workDate, next, "network-full");
      }
      return next;
    })();
    refreshes.set(key, job);
    try { return await job; } finally { refreshes.delete(key); }
  }

  async function assertTaskNotConflicted(operation) {
    const userId = authState()?.user?.id;
    if (!userId) throw new Error("تعذر تحديد المستخدم الحالي.");
    const { data, error } = await client().from("daily_task_completions")
      .select("id,is_completed,updated_at")
      .eq("task_key", operation.payload.taskKey)
      .eq("work_date", operation.payload.workDate)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(`تعذر التحقق من تعارض المهمة اليومية: ${error.message}`);

    const predecessorId = Array.isArray(operation.dependsOn) && operation.dependsOn.length ? operation.dependsOn[operation.dependsOn.length - 1] : null;
    if (predecessorId && window.KYUMOfflineQueue?.list) {
      const rows = await window.KYUMOfflineQueue.list({ namespace: operation.namespace });
      const predecessor = rows.find(row => row.id === predecessorId);
      if (predecessor?.status === "synced" && data && Boolean(data.is_completed) === Boolean(predecessor.payload?.completed)) {
        return;
      }
      throw new window.KYUMOfflineQueue.ConflictError("تم تغيير حالة المهمة اليومية بعد العملية المحلية السابقة.", {
        taskKey: operation.payload.taskKey,
        workDate: operation.payload.workDate,
        serverUpdatedAt: data?.updated_at || "",
        baseUpdatedAt: operation.baseUpdatedAt || ""
      });
    }

    if (!operation.baseUpdatedAt) {
      if (!data) return;
      throw new window.KYUMOfflineQueue.ConflictError("تم إنشاء أو تعديل المهمة اليومية على الخادم بعد آخر مزامنة.", {
        taskKey: operation.payload.taskKey,
        workDate: operation.payload.workDate,
        serverUpdatedAt: data.updated_at || "",
        baseUpdatedAt: ""
      });
    }

    const serverTime = Date.parse(data?.updated_at || "") || 0;
    const baseTime = Date.parse(operation.baseUpdatedAt || "") || 0;
    if (!data || (serverTime && baseTime && serverTime > baseTime + 1000)) {
      throw new window.KYUMOfflineQueue.ConflictError("تم تعديل المهمة اليومية على الخادم بعد آخر مزامنة.", {
        taskKey: operation.payload.taskKey,
        workDate: operation.payload.workDate,
        serverUpdatedAt: data?.updated_at || "",
        baseUpdatedAt: operation.baseUpdatedAt || ""
      });
    }
  }

  async function assertNotConflicted(table, workDate, baseUpdatedAt, label) {
    if (!baseUpdatedAt) return;
    const { data, error } = await client().from(table).select("updated_at").eq("work_date", workDate).maybeSingle();
    if (error) throw new Error(`تعذر التحقق من تعارض ${label}: ${error.message}`);
    const serverTime = Date.parse(data?.updated_at || "") || 0;
    const baseTime = Date.parse(baseUpdatedAt || "") || 0;
    if (serverTime && baseTime && serverTime > baseTime + 1000) {
      throw new window.KYUMOfflineQueue.ConflictError(`تم تعديل ${label} على الخادم بعد آخر مزامنة.`, {
        workDate, serverUpdatedAt: data.updated_at, baseUpdatedAt
      });
    }
  }

  window.KYUMOfflineQueue?.register?.("daily_task_completions", async operation => {
    await assertTaskNotConflicted(operation);
    return setTaskStateOnline(operation.payload.taskKey, operation.payload.completed, operation.payload.workDate);
  });
  window.KYUMOfflineQueue?.register?.("daily_operation_targets", async operation => {
    await assertNotConflicted("daily_operation_targets", operation.payload.workDate, operation.baseUpdatedAt, "الأهداف اليومية");
    return saveTargetsOnline(operation.payload, operation.payload.workDate);
  });
  window.KYUMOfflineQueue?.register?.("daily_manager_notes", async operation => {
    await assertNotConflicted("daily_manager_notes", operation.payload.workDate, operation.baseUpdatedAt, "ملاحظة المدير");
    return saveManagerNoteOnline(operation.payload, operation.payload.workDate);
  });

  window.KYUMSyncEngine?.register?.("daily-operations", async () => {
    const workDate = todayIso();
    const cached = await readCache("completions", workDate);
    await Promise.all([
      syncCompletions(workDate, cached?.data, false),
      refreshSingle("targets", workDate, (await readCache("targets", workDate))?.data, fetchTargets),
      refreshSingle("manager-note", workDate, (await readCache("manager-note", workDate))?.data, fetchManagerNote)
    ]);
  });

  window.DailyOperationsService = Object.freeze({
    version: "M13.7.1",
    todayIso,
    listDefinitions,
    listForDate,
    setTaskState,
    getTargets,
    saveTargets,
    getManagerNote,
    saveManagerNote,
    listPermissionOwnedCrmData
  });
})();
