import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type JsonRecord = Record<string, unknown>;

class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function jsonResponse(body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requireString(value: unknown, field: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new HttpError(400, "VALIDATION_ERROR", `${field} is required.`);
  return text;
}

function normalizeEmail(value: unknown) {
  const email = requireString(value, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "INVALID_EMAIL", "A valid email is required.");
  }
  return email;
}

function validatePassword(value: unknown) {
  const password = requireString(value, "password");
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new HttpError(
      400,
      "WEAK_PASSWORD",
      "Password must be at least 8 characters and include letters and numbers.",
    );
  }
  return password;
}

function normalizeRole(value: unknown) {
  const role = String(value ?? "viewer").trim();
  const allowedRoles = new Set([
    "super_admin",
    "sales_manager",
    "sales_supervisor",
    "sales_representative",
    "customer_service",
    "viewer",
  ]);
  if (!allowedRoles.has(role)) {
    throw new HttpError(400, "INVALID_ROLE", "Unsupported user role.");
  }
  return role;
}

async function writeAudit(
  admin: ReturnType<typeof createClient>,
  payload: JsonRecord,
) {
  try {
    await admin.from("audit_logs").insert(payload);
  } catch {
    // Audit failure must not hide the main operation result.
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      { success: false, code: "METHOD_NOT_ALLOWED", error: "POST is required." },
      405,
    );
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) {
      throw new HttpError(500, "SERVER_CONFIG_ERROR", "Missing Supabase environment variables.");
    }

    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      throw new HttpError(401, "UNAUTHORIZED", "Missing bearer token.");
    }

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = authorization.slice("Bearer ".length).trim();
    const { data: callerData, error: callerError } = await admin.auth.getUser(token);
    if (callerError || !callerData.user) {
      throw new HttpError(401, "UNAUTHORIZED", "Invalid authenticated user.");
    }

    const { data: callerProfile, error: profileError } = await admin
      .from("user_profiles")
      .select("id,role,is_active")
      .eq("id", callerData.user.id)
      .single();

    if (profileError || !callerProfile?.is_active) {
      throw new HttpError(403, "FORBIDDEN", "Active user profile is required.");
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "").trim();

    const permissionAction = action === "create" ? "add" : action === "reset_password" ? "edit" : "";
    if (permissionAction && callerProfile.role !== "super_admin") {
      const permissionField = permissionAction === "add" ? "can_add" : "can_edit";
      const { data: permissionRow, error: permissionError } = await admin
        .from("role_screen_permissions")
        .select(`screen_key,${permissionField},screen:app_screens!inner(is_active)`)
        .eq("role", callerProfile.role)
        .eq("screen_key", "users")
        .maybeSingle();

      const screenActive = Array.isArray(permissionRow?.screen)
        ? permissionRow.screen.some((screen: any) => screen?.is_active === true)
        : (permissionRow?.screen as any)?.is_active === true;
      if (permissionError || !permissionRow?.[permissionField] || !screenActive) {
        throw new HttpError(403, "FORBIDDEN", `Missing users.${permissionAction} permission.`);
      }
    }

    if (action === "create") {
      const email = normalizeEmail(body.email);
      const password = validatePassword(
        body.password ?? body.temporary_password ?? body.temporaryPassword,
      );
      const fullName = requireString(
        body.full_name ?? body.fullName ?? body.name,
        "full_name",
      );
      const role = normalizeRole(body.role);
      const isActive = body.is_active ?? body.isActive ?? true;
      const defaultLanguage = String(body.default_language ?? body.defaultLanguage ?? "ar").trim().toLowerCase() === "en" ? "en" : "ar";

      const { data: existing } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      const duplicate = existing?.users?.find(
        (user) => String(user.email ?? "").toLowerCase() === email,
      );
      if (duplicate) {
        throw new HttpError(409, "USER_ALREADY_EXISTS", "A user with this email already exists.");
      }

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

      if (createError || !created.user) {
        throw new HttpError(
          400,
          "AUTH_USER_CREATE_FAILED",
          createError?.message ?? "Unable to create auth user.",
        );
      }

      const userId = created.user.id;
      const representativeId = body.representative_id ?? body.representativeId ?? null;
      const mustChangePassword = body.must_change_password ?? body.mustChangePassword ?? true;
      const accessModeRaw = String(body.access_mode ?? body.accessMode ?? "own").trim();
      const accessMode = ["own", "selected", "all"].includes(accessModeRaw) ? accessModeRaw : "own";
      const allowedRepresentativeIds = Array.isArray(body.allowed_representative_ids ?? body.allowedRepresentativeIds)
        ? [...new Set((body.allowed_representative_ids ?? body.allowedRepresentativeIds)
          .map((value: unknown) => String(value ?? "").trim())
          .filter(Boolean))]
        : [];

      const profilePayload = {
        id: userId,
        full_name: fullName,
        email,
        role,
        representative_id: representativeId || null,
        is_active: Boolean(isActive),
        must_change_password: Boolean(mustChangePassword),
        default_language: defaultLanguage,
      };

      const { error: upsertError } = await admin
        .from("user_profiles")
        .upsert(profilePayload, { onConflict: "id" });

      if (upsertError) {
        await admin.auth.admin.deleteUser(userId);
        throw new HttpError(
          400,
          "PROFILE_CREATE_FAILED",
          `Auth user was rolled back: ${upsertError.message}`,
        );
      }

      const { error: accessProfileError } = await admin
        .from("user_data_access_profiles")
        .upsert({
          user_id: userId,
          access_mode: accessMode,
          updated_by: callerData.user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (accessProfileError) {
        await admin.from("user_profiles").delete().eq("id", userId);
        await admin.auth.admin.deleteUser(userId);
        throw new HttpError(400, "DATA_SCOPE_CREATE_FAILED", `Auth user was rolled back: ${accessProfileError.message}`);
      }

      if (accessMode === "selected" && allowedRepresentativeIds.length) {
        const { error: allowedError } = await admin
          .from("user_data_access_representatives")
          .insert(allowedRepresentativeIds.map((representative_id) => ({ user_id: userId, representative_id })));
        if (allowedError) {
          await admin.from("user_profiles").delete().eq("id", userId);
          await admin.auth.admin.deleteUser(userId);
          throw new HttpError(400, "DATA_SCOPE_REPRESENTATIVES_FAILED", `Auth user was rolled back: ${allowedError.message}`);
        }
      }

      await writeAudit(admin, {
        action: "user_create",
        entity_type: "user_profile",
        entity_id: userId,
        actor_id: callerData.user.id,
        details: { email, full_name: fullName, role, is_active: Boolean(isActive), default_language: defaultLanguage },
      });

      return jsonResponse({
        success: true,
        user: {
          id: userId,
          email,
          full_name: fullName,
          role,
          is_active: Boolean(isActive),
        },
      }, 201);
    }

    if (action === "reset_password") {
      const password = validatePassword(
        body.password ?? body.new_password ?? body.newPassword ?? body.temporary_password,
      );

      let userId = String(body.user_id ?? body.userId ?? "").trim();
      const email = String(body.email ?? "").trim().toLowerCase();

      if (!userId && email) {
        const { data: listed, error: listError } = await admin.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        });
        if (listError) {
          throw new HttpError(400, "USER_LOOKUP_FAILED", listError.message);
        }
        userId = listed.users.find(
          (user) => String(user.email ?? "").toLowerCase() === email,
        )?.id ?? "";
      }

      if (!userId) {
        throw new HttpError(400, "USER_ID_REQUIRED", "user_id or email is required.");
      }

      const { data: targetUser, error: getUserError } =
        await admin.auth.admin.getUserById(userId);
      if (getUserError || !targetUser.user) {
        throw new HttpError(404, "USER_NOT_FOUND", "User was not found.");
      }

      const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
        password,
      });
      if (updateError) {
        throw new HttpError(400, "PASSWORD_RESET_FAILED", updateError.message);
      }

      await writeAudit(admin, {
        action: "user_password_reset",
        entity_type: "user_profile",
        entity_id: userId,
        actor_id: callerData.user.id,
        details: { email: targetUser.user.email ?? null },
      });

      return jsonResponse({
        success: true,
        user_id: userId,
        message: "Password updated successfully.",
      });
    }

    throw new HttpError(400, "UNSUPPORTED_ACTION", "Supported actions: create, reset_password.");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 400;
    const code = error instanceof HttpError ? error.code : "REQUEST_FAILED";
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ success: false, code, error: message }, status);
  }
});
