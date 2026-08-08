import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ verified: false, error: "POST is required." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) throw new Error("Missing Supabase environment variables.");

    const authorization = request.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return response({ verified: false, error: "Unauthorized." }, 401);
    const token = authorization.slice(7).trim();

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: callerData, error: callerError } = await admin.auth.getUser(token);
    if (callerError || !callerData.user?.email) return response({ verified: false, error: "Invalid session." }, 401);

    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("id, role, is_active")
      .eq("id", callerData.user.id)
      .single();
    if (profileError || !profile?.is_active || profile.role !== "super_admin") {
      return response({ verified: false, error: "هذا الإجراء متاح لمدير النظام فقط." }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "verify");

    if (action === "finalize") {
      const auditId = String(body.auditId || "");
      if (!auditId) return response({ finalized: false, error: "Audit ID is required." }, 400);

      const status = ["completed", "completed_with_errors", "failed"].includes(String(body.status))
        ? String(body.status)
        : "completed";

      const { data: updated, error: updateError } = await admin
        .from("admin_import_overrides")
        .update({
          status,
          inserted_rows: Number(body.insertedRows || 0),
          updated_rows: Number(body.updatedRows || 0),
          request_rows: Number(body.requestRows || 0),
          skipped_rows: Number(body.skippedRows || 0),
          failed_rows: Number(body.failedRows || 0),
          override_rows: Number(body.overrideRows || 0),
          completed_at: new Date().toISOString(),
          metadata: {
            source: "petatoe-web",
            finalized_by_edge_function: true,
            user_agent: request.headers.get("user-agent") || "",
          },
        })
        .eq("id", auditId)
        .eq("user_id", callerData.user.id)
        .select("id, status, completed_at")
        .single();

      if (updateError || !updated) {
        return response({ finalized: false, error: updateError?.message || "تعذر تحديث سجل الاعتماد." }, 500);
      }
      return response({ finalized: true, audit: updated });
    }

    const password = String(body.password || "");
    if (!password) return response({ verified: false, error: "كلمة المرور مطلوبة." }, 400);

    const verifier = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: passwordError } = await verifier.auth.signInWithPassword({
      email: callerData.user.email,
      password,
    });
    if (passwordError) return response({ verified: false, error: "كلمة المرور غير صحيحة." }, 401);

    const auditPayload = {
      user_id: callerData.user.id,
      file_name: String(body.fileName || ""),
      total_rows: Number(body.totalRows || 0),
      override_rows: Number(body.overrideRows || 0),
      duplicate_rows: Number(body.duplicateRows || 0),
      status: "authorized",
      metadata: {
        source: "petatoe-web",
        user_agent: request.headers.get("user-agent") || "",
      },
    };
    const { data: auditRow, error: auditError } = await admin
      .from("admin_import_overrides")
      .insert(auditPayload)
      .select("id")
      .single();
    if (auditError) return response({ verified: false, error: `تعذر تسجيل الاعتماد: ${auditError.message}` }, 500);

    return response({ verified: true, auditId: auditRow.id });
  } catch (error) {
    return response({ verified: false, error: error instanceof Error ? error.message : "Unexpected error." }, 500);
  }
});
