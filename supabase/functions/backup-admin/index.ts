import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BACKUP_PRODUCT = "PETATOE";
const BACKUP_FORMAT_VERSION = "2.0";
const PAGE_SIZE = 1000;

type JsonRecord = Record<string, unknown>;

type ManifestRow = {
  table_name: string;
  restore_order: number;
  category: string;
  required: boolean;
};

class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }

  const record = value as JsonRecord;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(canonicalize(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function requireBackupPermission(
  admin: ReturnType<typeof createClient>,
  request: Request,
  action: string,
) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing bearer token.");
  }

  const token = authorization.slice("Bearer ".length).trim();
  const { data: callerData, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !callerData.user) {
    throw new HttpError(401, "UNAUTHORIZED", "Invalid authenticated user.");
  }

  const { data: profile, error: profileError } = await admin
    .from("user_profiles")
    .select("role,is_active")
    .eq("id", callerData.user.id)
    .single();

  if (profileError || !profile?.is_active) {
    throw new HttpError(403, "FORBIDDEN", "Active user profile is required.");
  }

  if (profile.role === "super_admin") return callerData.user;

  const permissionAction = action === "export" ? "export"
    : action === "validate" ? "view"
    : action === "restore_dry_run" || action === "restore" ? "edit"
    : "";
  const permissionField = permissionAction === "export" ? "can_export"
    : permissionAction === "edit" ? "can_edit"
    : permissionAction === "view" ? "can_view"
    : "";

  if (!permissionField) {
    throw new HttpError(400, "UNSUPPORTED_ACTION", "Unsupported backup action.");
  }

  const { data: permissionRow, error: permissionError } = await admin
    .from("role_screen_permissions")
    .select(`screen_key,${permissionField},screen:app_screens!inner(is_active)`)
    .eq("role", profile.role)
    .eq("screen_key", "backups")
    .maybeSingle();

  const screenActive = Array.isArray(permissionRow?.screen)
    ? permissionRow.screen.some((screen: any) => screen?.is_active === true)
    : (permissionRow?.screen as any)?.is_active === true;
  if (permissionError || !permissionRow?.[permissionField] || !screenActive) {
    throw new HttpError(403, "FORBIDDEN", `Missing backups.${permissionAction} permission.`);
  }

  return callerData.user;
}

async function loadManifest(admin: ReturnType<typeof createClient>) {
  const { data, error } = await admin.rpc("kyum_backup_table_manifest");
  if (error) {
    throw new HttpError(500, "MANIFEST_LOAD_FAILED", error.message);
  }

  const rows = (data ?? []) as ManifestRow[];
  if (!rows.length) {
    throw new HttpError(500, "EMPTY_MANIFEST", "Backup manifest returned no tables.");
  }

  return rows
    .map((row) => ({
      table_name: String(row.table_name),
      restore_order: Number(row.restore_order),
      category: String(row.category ?? "business"),
      required: Boolean(row.required),
    }))
    .sort((a, b) => a.restore_order - b.restore_order);
}

async function exportTable(
  admin: ReturnType<typeof createClient>,
  tableName: string,
) {
  const rows: unknown[] = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await admin
      .from(tableName)
      .select("*")
      .range(from, to);

    if (error) {
      throw new HttpError(
        500,
        "TABLE_EXPORT_FAILED",
        `Export failed for ${tableName}: ${error.message}`,
      );
    }

    const page = data ?? [];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

async function loadAuthDirectory(admin: ReturnType<typeof createClient>) {
  const users: JsonRecord[] = [];
  let page = 1;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) {
      throw new HttpError(500, "AUTH_DIRECTORY_EXPORT_FAILED", error.message);
    }

    const batch = data?.users ?? [];
    users.push(
      ...batch.map((user) => ({
        id: user.id,
        email: user.email ?? null,
        phone: user.phone ?? null,
        created_at: user.created_at,
        updated_at: user.updated_at ?? null,
        last_sign_in_at: user.last_sign_in_at ?? null,
        email_confirmed_at: user.email_confirmed_at ?? null,
        phone_confirmed_at: user.phone_confirmed_at ?? null,
        user_metadata: user.user_metadata ?? {},
        app_metadata: user.app_metadata ?? {},
      })),
    );

    if (batch.length < 1000) break;
    page += 1;
  }

  return users;
}

function validateBackupEnvelope(backup: any) {
  if (!backup || typeof backup !== "object") {
    throw new HttpError(400, "INVALID_BACKUP", "Invalid backup object.");
  }

  if (backup.product !== BACKUP_PRODUCT) {
    throw new HttpError(400, "INVALID_PRODUCT", "This file is not a PETATOE backup.");
  }

  if (backup.format_version !== BACKUP_FORMAT_VERSION) {
    throw new HttpError(
      400,
      "UNSUPPORTED_BACKUP_VERSION",
      `Expected backup format ${BACKUP_FORMAT_VERSION}.`,
    );
  }

  if (!Array.isArray(backup.manifest) || !backup.tables || typeof backup.tables !== "object") {
    throw new HttpError(400, "INVALID_STRUCTURE", "Backup manifest or tables are missing.");
  }

  return backup;
}

async function verifyBackupIntegrity(backup: any) {
  const verified = validateBackupEnvelope(backup);
  const errors: string[] = [];
  const tableCounts: Record<string, number> = {};
  const tableChecksums: Record<string, string> = {};

  for (const item of verified.manifest) {
    const tableName = String(item.table_name ?? "");
    const rows = verified.tables[tableName];

    if (!tableName || !Array.isArray(rows)) {
      errors.push(`Missing or invalid table: ${tableName || "(unknown)"}`);
      continue;
    }

    tableCounts[tableName] = rows.length;
    tableChecksums[tableName] = await sha256(rows);

    const expectedCount = Number(item.row_count ?? -1);
    if (expectedCount !== rows.length) {
      errors.push(
        `${tableName}: row count mismatch (${rows.length} != ${expectedCount})`,
      );
    }

    if (item.sha256 && item.sha256 !== tableChecksums[tableName]) {
      errors.push(`${tableName}: checksum mismatch`);
    }
  }

  const calculatedPayloadChecksum = await sha256({
    manifest: verified.manifest,
    tables: verified.tables,
    auth_directory: verified.auth_directory ?? [],
  });

  if (
    verified.integrity?.payload_sha256 &&
    verified.integrity.payload_sha256 !== calculatedPayloadChecksum
  ) {
    errors.push("Backup payload checksum mismatch");
  }

  return {
    valid: errors.length === 0,
    errors,
    table_counts: tableCounts,
    table_checksums: tableChecksums,
    payload_sha256: calculatedPayloadChecksum,
    total_records: Object.values(tableCounts).reduce((sum, count) => sum + count, 0),
  };
}

async function logBackupOperation(
  admin: ReturnType<typeof createClient>,
  payload: JsonRecord,
) {
  const { error } = await admin.from("backup_operations").insert(payload);
  if (error) {
    console.warn("Backup operation log failed:", error.message);
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
      throw new HttpError(
        500,
        "SERVER_CONFIG_ERROR",
        "Missing Supabase environment variables.",
      );
    }

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "").trim();
    const caller = await requireBackupPermission(admin, request, action);

    if (action === "export") {
      const manifest = await loadManifest(admin);
      const tables: Record<string, unknown[]> = {};
      const exportedManifest: JsonRecord[] = [];

      for (const item of manifest) {
        const rows = await exportTable(admin, item.table_name);
        tables[item.table_name] = rows;
        exportedManifest.push({
          ...item,
          row_count: rows.length,
          sha256: await sha256(rows),
        });
      }

      const authDirectory = await loadAuthDirectory(admin);
      const generatedAt = new Date().toISOString();
      const payloadChecksum = await sha256({
        manifest: exportedManifest,
        tables,
        auth_directory: authDirectory,
      });
      const totalRecords = Object.values(tables)
        .reduce((sum, rows) => sum + rows.length, 0);

      const backup = {
        product: BACKUP_PRODUCT,
        format_version: BACKUP_FORMAT_VERSION,
        schema_version: "17.3-A",
        generated_at: generatedAt,
        generated_by: caller.id,
        source: {
          project_ref: new URL(url).hostname.split(".")[0],
          database_schema: "public",
        },
        manifest: exportedManifest,
        tables,
        auth_directory: authDirectory,
        integrity: {
          algorithm: "SHA-256",
          payload_sha256: payloadChecksum,
        },
      };

      const fileName =
        `petatoe-enterprise-backup-${generatedAt.slice(0, 10)}-` +
        `${generatedAt.slice(11, 19).replaceAll(":", "-")}.json`;

      await logBackupOperation(admin, {
        operation_type: "export",
        file_name: fileName,
        total_records: totalRecords,
        status: "completed",
        details: {
          format_version: BACKUP_FORMAT_VERSION,
          schema_version: "17.3-A",
          table_counts: Object.fromEntries(
            exportedManifest.map((item) => [item.table_name, item.row_count]),
          ),
          auth_directory_count: authDirectory.length,
          payload_sha256: payloadChecksum,
        },
        created_by: caller.id,
      });

      return jsonResponse({
        success: true,
        file_name: fileName,
        total_records: totalRecords,
        table_count: exportedManifest.length,
        auth_directory_count: authDirectory.length,
        payload_sha256: payloadChecksum,
        backup,
      });
    }

    if (action === "validate") {
      const result = await verifyBackupIntegrity(body.backup);

      return jsonResponse({
        success: result.valid,
        format_version: body.backup?.format_version ?? null,
        schema_version: body.backup?.schema_version ?? null,
        generated_at: body.backup?.generated_at ?? null,
        ...result,
      }, result.valid ? 200 : 400);
    }

    if (action === "restore_dry_run") {
      const integrity = await verifyBackupIntegrity(body.backup);
      if (!integrity.valid) {
        return jsonResponse({
          success: false,
          code: "BACKUP_INTEGRITY_FAILED",
          ...integrity,
        }, 400);
      }

      const { data: dryRun, error: dryRunError } = await admin.rpc(
        "kyum_validate_backup_restore",
        {
          p_backup: body.backup,
          p_actor: caller.id,
        },
      );

      if (dryRunError) {
        throw new HttpError(400, "RESTORE_DRY_RUN_FAILED", dryRunError.message);
      }

      return jsonResponse({
        success: Boolean(dryRun?.valid),
        dry_run: true,
        integrity,
        validation: dryRun,
      }, dryRun?.valid ? 200 : 400);
    }

    if (action === "restore") {
      if (body.confirmation !== "RESTORE PETATOE DATA") {
        throw new HttpError(
          400,
          "INVALID_RESTORE_CONFIRMATION",
          "Restore confirmation phrase is invalid.",
        );
      }

      const integrity = await verifyBackupIntegrity(body.backup);
      if (!integrity.valid) {
        throw new HttpError(
          400,
          "BACKUP_INTEGRITY_FAILED",
          integrity.errors.join("; "),
        );
      }

      const { data: dryRun, error: dryRunError } = await admin.rpc(
        "kyum_validate_backup_restore",
        {
          p_backup: body.backup,
          p_actor: caller.id,
        },
      );

      if (dryRunError) {
        throw new HttpError(400, "RESTORE_DRY_RUN_FAILED", dryRunError.message);
      }

      if (!dryRun?.valid) {
        return jsonResponse({
          success: false,
          code: "RESTORE_VALIDATION_FAILED",
          validation: dryRun,
        }, 400);
      }

      const operationFileName =
        `restore-${new Date().toISOString().replaceAll(":", "-")}.json`;

      const { data: operation, error: operationError } = await admin
        .from("backup_operations")
        .insert({
          operation_type: "restore",
          file_name: operationFileName,
          total_records: integrity.total_records,
          status: "started",
          details: {
            format_version: body.backup?.format_version ?? null,
            schema_version: body.backup?.schema_version ?? null,
            payload_sha256: integrity.payload_sha256,
            dry_run: dryRun,
          },
          created_by: caller.id,
        })
        .select("id")
        .single();

      if (operationError) {
        throw new HttpError(400, "RESTORE_LOG_CREATE_FAILED", operationError.message);
      }

      const { data: restored, error: restoreError } = await admin.rpc(
        "restore_kyum_backup_enterprise",
        {
          p_backup: body.backup,
          p_actor: caller.id,
        },
      );

      if (restoreError) {
        await admin.from("backup_operations").update({
          status: "failed",
          details: {
            format_version: body.backup?.format_version ?? null,
            schema_version: body.backup?.schema_version ?? null,
            payload_sha256: integrity.payload_sha256,
            dry_run: dryRun,
            error: restoreError.message,
          },
        }).eq("id", operation.id);

        throw new HttpError(400, "TRANSACTIONAL_RESTORE_FAILED", restoreError.message);
      }

      await admin.from("backup_operations").update({
        status: "completed",
        total_records: restored?.total_records ?? integrity.total_records,
        details: {
          format_version: body.backup?.format_version ?? null,
          schema_version: body.backup?.schema_version ?? null,
          payload_sha256: integrity.payload_sha256,
          dry_run: dryRun,
          restore_result: restored,
        },
      }).eq("id", operation.id);

      return jsonResponse({
        success: true,
        dry_run: dryRun,
        integrity,
        restore: restored,
      });
    }

    throw new HttpError(
      400,
      "UNSUPPORTED_ACTION",
      "Supported actions: export, validate, restore_dry_run, restore.",
    );
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 400;
    const code = error instanceof HttpError ? error.code : "REQUEST_FAILED";
    const message = error instanceof Error ? error.message : String(error);

    return jsonResponse({ success: false, code, error: message }, status);
  }
});
