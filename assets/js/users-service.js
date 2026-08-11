(function () {

  function requirePermission(screenKey, action) {
    if (!window.CustomerPermissions?.requireAction?.(screenKey, action, { silent: true })) {
      throw new Error(`Permission denied: ${screenKey}.${action}`);
    }
  }

  const client = () => {
    if (!window.customerSupabase) throw new Error("اتصال Supabase غير جاهز.");
    return window.customerSupabase;
  };

  async function listUsers() {
    const { data, error } = await client()
      .from("user_profiles")
      .select("id,full_name,email,role,representative_id,is_active,must_change_password,last_login_at,created_at,representative:sales_representatives!user_profiles_representative_id_fkey(id,full_name)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(`تعذر تحميل المستخدمين: ${error.message}`);

    const users = data || [];
    if (!users.length) return users;

    const userIds = users.map(user => user.id);
    const [profilesResult, representativesResult, installationProfilesResult, installationRepresentativesResult, technicianBindingsResult] = await Promise.all([
      client().from("user_data_access_profiles")
        .select("user_id,access_mode")
        .in("user_id", userIds),
      client().from("user_data_access_representatives")
        .select("user_id,representative_id,representative:sales_representatives(id,full_name)")
        .in("user_id", userIds),
      client().from("installation_data_access_profiles").select("user_id,access_mode").in("user_id", userIds),
      client().from("installation_data_access_representatives").select("user_id,representative_id,representative:sales_representatives(id,full_name)").in("user_id", userIds),
      client().from("installation_user_technician_bindings").select("user_id,installation_team_id,technician_name,team:installation_teams(id,name)").in("user_id", userIds)
    ]);

    if (profilesResult.error) throw new Error(`تعذر تحميل نطاقات البيانات: ${profilesResult.error.message}`);
    if (representativesResult.error) throw new Error(`تعذر تحميل المندوبين المسموحين: ${representativesResult.error.message}`);
    if (installationProfilesResult.error) throw new Error(`تعذر تحميل نطاق التركيبات: ${installationProfilesResult.error.message}`);
    if (installationRepresentativesResult.error) throw new Error(`تعذر تحميل مندوبي التركيبات المسموحين: ${installationRepresentativesResult.error.message}`);
    if (technicianBindingsResult.error && technicianBindingsResult.error.code !== "42P01") throw new Error(`تعذر تحميل ربط الجرومر / السائق: ${technicianBindingsResult.error.message}`);

    const modeByUser = new Map((profilesResult.data || []).map(row => [row.user_id, row.access_mode]));
    const repsByUser = new Map();
    (representativesResult.data || []).forEach(row => {
      if (!repsByUser.has(row.user_id)) repsByUser.set(row.user_id, []);
      repsByUser.get(row.user_id).push({
        id: row.representative_id,
        full_name: row.representative?.full_name || ""
      });
    });

    const installationModeByUser = new Map((installationProfilesResult.data || []).map(row => [row.user_id, row.access_mode]));
    const installationRepsByUser = new Map();
    (installationRepresentativesResult.data || []).forEach(row => {
      if (!installationRepsByUser.has(row.user_id)) installationRepsByUser.set(row.user_id, []);
      installationRepsByUser.get(row.user_id).push({ id: row.representative_id, full_name: row.representative?.full_name || "" });
    });
    const technicianBindingByUser = new Map((technicianBindingsResult.data || []).map(row => [row.user_id, {
      installation_team_id: row.installation_team_id || "",
      technician_name: row.technician_name || "",
      team: row.team || null
    }]));
    return users.map(user => ({
      ...user,
      data_access_mode: modeByUser.get(user.id) || defaultAccessMode(user),
      data_access_representatives: repsByUser.get(user.id) || [],
      installation_access_mode: installationModeByUser.get(user.id) || (user.role === "super_admin" ? "all" : (user.representative_id ? "own" : "selected")),
      installation_access_representatives: installationRepsByUser.get(user.id) || [],
      installation_technician_binding: technicianBindingByUser.get(user.id) || null
    }));
  }

  function defaultAccessMode(user) {
    if (user?.role === "super_admin") return "all";
    return user?.representative_id ? "own" : "selected";
  }


  async function invokeManageUser(body) {
    const { data: sessionData, error: sessionError } = await client().auth.getSession();
    if (sessionError || !sessionData?.session?.access_token) {
      throw new Error("انتهت جلسة تسجيل الدخول. سجّل الدخول مرة أخرى ثم أعد المحاولة.");
    }

    let result;
    try {
      result = await client().functions.invoke("manage-user", { body });
    } catch (networkError) {
      throw new Error(`تعذر الاتصال بوظيفة إدارة المستخدمين manage-user. تأكد من نشر Edge Function ثم أعد المحاولة. (${networkError?.message || "NETWORK_ERROR"})`);
    }
    const { data, error } = result;
    if (!error) return data;

    let details = null;
    try {
      if (error.context && typeof error.context.clone === "function") {
        details = await error.context.clone().json();
      } else if (error.context && typeof error.context.json === "function") {
        details = await error.context.json();
      }
    } catch (_) {
      // Keep the original Functions error when the response body is unavailable.
    }

    const rawMessage = details?.error || details?.message || error.message || "تعذر تنفيذ عملية المستخدم.";
    const isTransportFailure = /failed to send a request|failed to fetch|networkerror/i.test(String(rawMessage));
    const message = isTransportFailure
      ? "تعذر الوصول إلى Edge Function المسؤولة عن إدارة المستخدمين. يلزم التأكد من نشر manage-user على مشروع Supabase الحالي."
      : rawMessage;
    const code = details?.code ? ` (${details.code})` : "";
    throw new Error(`${message}${code}`);
  }

  async function createUser(payload) {
    requirePermission("users", "add");
    const data = await invokeManageUser({
      action: "create",
      full_name: payload.fullName,
      email: payload.email,
      password: payload.password,
      role: payload.role,
      representative_id: payload.role === "viewer" ? null : (payload.representativeId || null),
      is_active: payload.isActive,
      must_change_password: payload.mustChangePassword,
      access_mode: payload.role === "viewer" ? "selected" : payload.accessMode,
      allowed_representative_ids: payload.role === "viewer" ? [] : (payload.allowedRepresentativeIds || [])
    });
    if (!data?.success) throw new Error(data?.error || "تعذر إنشاء المستخدم.");
    const user = data.user;
    if (!user?.id) throw new Error("تم إنشاء الحساب بدون معرف مستخدم صالح.");
    await saveInstallationDataAccess(user.id, payload.role === "viewer" ? "own" : payload.installationAccessMode, payload.role === "viewer" ? [] : payload.allowedInstallationRepresentativeIds);
    await saveInstallationTechnicianBinding(user.id, payload.role, payload.installationTeamId, payload.installationTechnicianName);
    return user;
  }

  async function updateUser(payload) {
    requirePermission("users", "edit");
    const { data, error } = await client()
      .from("user_profiles")
      .update({
        full_name: payload.fullName.trim(),
        role: payload.role,
        representative_id: payload.role === "viewer" ? null : (payload.representativeId || null),
        is_active: payload.isActive,
        must_change_password: payload.mustChangePassword
      })
      .eq("id", payload.id)
      .select()
      .single();
    if (error) throw new Error(`تعذر تعديل المستخدم: ${error.message}`);
    await saveUserDataAccess(payload.id, payload.role === "viewer" ? "selected" : payload.accessMode, payload.role === "viewer" ? [] : payload.allowedRepresentativeIds);
    await saveInstallationDataAccess(payload.id, payload.role === "viewer" ? "own" : payload.installationAccessMode, payload.role === "viewer" ? [] : payload.allowedInstallationRepresentativeIds);
    await saveInstallationTechnicianBinding(payload.id, payload.role, payload.installationTeamId, payload.installationTechnicianName);
    await audit("update", payload.id, payload);
    return data;
  }

  async function saveUserDataAccess(userId, accessMode = "own", allowedRepresentativeIds = []) {
    requirePermission("users", "edit");
    const normalizedMode = ["own", "selected", "all"].includes(accessMode) ? accessMode : "own";
    const uniqueIds = [...new Set((allowedRepresentativeIds || []).filter(Boolean))];
    const { error } = await client().rpc("save_user_data_access_scope", {
      p_user_id: userId,
      p_access_mode: normalizedMode,
      p_representative_ids: normalizedMode === "selected" ? uniqueIds : []
    });
    if (error) throw new Error(`تعذر حفظ نطاق البيانات: ${error.message}`);
  }

  async function saveInstallationDataAccess(userId, accessMode = "own", allowedRepresentativeIds = []) {
    requirePermission("users", "edit");
    const normalizedMode = ["own", "selected", "all"].includes(accessMode) ? accessMode : "own";
    const uniqueIds = [...new Set((allowedRepresentativeIds || []).filter(Boolean))];
    const { error } = await client().rpc("save_installation_data_access_scope", {
      p_user_id: userId,
      p_access_mode: normalizedMode,
      p_representative_ids: normalizedMode === "selected" ? uniqueIds : []
    });
    if (error) throw new Error(`تعذر حفظ نطاق المواعيد: ${error.message}`);
  }

  async function resetPassword(userId, password) {
    requirePermission("users", "edit");
    const data = await invokeManageUser({ action: "reset_password", user_id: userId, password });
    if (!data?.success) throw new Error(data?.error || "تعذر إعادة التعيين.");
  }

  async function listInstallationTeams() {
    const { data, error } = await client().from("installation_teams").select("id,name,status").neq("status","غير نشطة").order("name");
    if (error) throw new Error(`تعذر تحميل فرق التركيبات: ${error.message}`);
    return data || [];
  }

  async function saveInstallationTechnicianBinding(userId, role, teamId, technicianName) {
    const normalizedName = String(technicianName || "").trim().replace(/\s+/g, " ");
    const isTechnicianRole = role === "viewer";
    if (!isTechnicianRole) {
      const { error } = await client().from("installation_user_technician_bindings").delete().eq("user_id", userId);
      if (error && error.code !== "42P01") throw new Error(`تعذر حذف ربط الجرومر / السائق: ${error.message}`);
      return;
    }
    if (!teamId) throw new Error("اختر فرقة المواعيد المرتبطة بالجرومر / السائق.");
    const safeName = normalizedName || "team-operator";
    const { error } = await client().from("installation_user_technician_bindings").upsert({
      user_id: userId,
      installation_team_id: teamId,
      technician_name: safeName,
      normalized_technician_name: safeName.toLocaleLowerCase("ar").replace(/\s+/g, " "),
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
    if (error) throw new Error(`تعذر حفظ ربط الجرومر / السائق: ${error.message}`);
    const { error: accessDeleteError } = await client().from("installation_team_access").delete().eq("user_id", userId);
    if (accessDeleteError) throw new Error(`تعذر تحديث نطاق فرقة الفني: ${accessDeleteError.message}`);
    const { error: accessInsertError } = await client().from("installation_team_access").insert({ user_id: userId, installation_team_id: teamId });
    if (accessInsertError) throw new Error(`تعذر ربط المستخدم بفرقة المواعيد: ${accessInsertError.message}`);
  }

  async function audit(action, entityId, newData) {
    try {
      const { data } = await client().auth.getUser();
      await client().from("audit_logs").insert({
        user_id: data.user?.id || null,
        action,
        entity_type: "user_profiles",
        entity_id: String(entityId),
        new_data: newData,
        metadata: { source: "petatoe-web", phase: "M10" }
      });
    } catch (error) {
      console.warn("User audit skipped:", error);
    }
  }

  window.UsersService = Object.freeze({
    listUsers,
    createUser,
    updateUser,
    saveUserDataAccess,
    saveInstallationDataAccess,
    saveInstallationTechnicianBinding,
    listInstallationTeams,
    resetPassword
  });
})();
