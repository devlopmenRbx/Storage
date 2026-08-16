import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase environment variables");
}

const adminClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

type Json = Record<string, unknown>;

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders,
  });
}

function errorResponse(message: string, status = 400, details?: unknown) {
  return response(
    {
      ok: false,
      error: message,
      ...(details === undefined ? {} : { details }),
    },
    status,
  );
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim() || null;
}

async function requireAdmin(req: Request) {
  const token = getBearerToken(req);
  if (!token) {
    throw new Error("UNAUTHENTICATED");
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) {
    throw new Error("UNAUTHENTICATED");
  }

  const user = data.user;

  const { data: roleRow, error: roleError } = await adminClient
    .from("user_roles")
    .select("user_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (roleError) {
    console.error("Role lookup failed:", roleError);
    throw new Error("ROLE_LOOKUP_FAILED");
  }

  if (!roleRow || roleRow.role !== "admin") {
    throw new Error("FORBIDDEN");
  }

  return user;
}

function requireUuid(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`INVALID_${field.toUpperCase()}`);
  }

  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuid.test(value)) {
    throw new Error(`INVALID_${field.toUpperCase()}`);
  }

  return value;
}

function requireString(
  value: unknown,
  field: string,
  maxLength = 500,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`INVALID_${field.toUpperCase()}`);
  }

  const result = value.trim();

  if (result.length > maxLength) {
    throw new Error(`${field.toUpperCase()}_TOO_LONG`);
  }

  return result;
}

function parseIntSafe(value: unknown, fallback: number, min: number, max: number) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

async function audit(
  adminId: string,
  action: string,
  targetUserId?: string,
  details: Json = {},
) {
  const { error } = await adminClient.from("admin_audit_logs").insert({
    admin_id: adminId,
    action,
    target_user_id: targetUserId ?? null,
    details,
  });

  if (error) {
    // Audit logging must not make an otherwise successful admin operation fail.
    console.error("Audit log failed:", error);
  }
}

/**
 * PUBLIC endpoint:
 *   GET/POST action=get_maintenance
 *
 * This intentionally does NOT require authentication so index.html/login.html
 * can display maintenance mode to visitors who are not logged in.
 *
 * All writes to site_settings remain admin-only.
 */
async function getMaintenance() {
  const { data, error } = await adminClient
    .from("site_settings")
    .select("id, maintenance, maintenance_until, updated_at")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.error("Maintenance read failed:", error);
    return errorResponse("Unable to read maintenance status", 500);
  }

  if (!data) {
    return response({
      ok: true,
      maintenance: false,
      maintenance_until: null,
      updated_at: null,
    });
  }

  const until = data.maintenance_until
    ? new Date(data.maintenance_until)
    : null;

  // If the timer has expired, treat maintenance as off.
  const active =
    Boolean(data.maintenance) &&
    (!until || until.getTime() > Date.now());

  return response({
    ok: true,
    maintenance: active,
    maintenance_until: data.maintenance_until,
    updated_at: data.updated_at,
  });
}

async function listUsers(adminId: string, body: Json) {
  const page = parseIntSafe(body.page, 1, 1, 100000);
  const perPage = parseIntSafe(body.perPage, 25, 1, 100);

  const { data, error } = await adminClient.auth.admin.listUsers({
    page,
    perPage,
  });

  if (error) {
    console.error("List users failed:", error);
    return errorResponse("Unable to list users", 500);
  }

  const ids = data.users.map((u) => u.id);

  let roles: Array<{ user_id: string; role: string }> = [];
  if (ids.length) {
    const result = await adminClient
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", ids);

    if (result.error) {
      console.error("Role list failed:", result.error);
      return errorResponse("Unable to load user roles", 500);
    }

    roles = result.data ?? [];
  }

  const roleMap = new Map(roles.map((r) => [r.user_id, r.role]));

  await audit(adminId, "list_users", undefined, { page, perPage });

  return response({
    ok: true,
    users: data.users.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      phone: u.phone ?? null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      confirmed_at: u.confirmed_at ?? null,
      role: roleMap.get(u.id) ?? "user",
      app_metadata: u.app_metadata ?? {},
      user_metadata: u.user_metadata ?? {},
    })),
    page,
    perPage,
  });
}

async function listPhotos(adminId: string, body: Json) {
  const limit = parseIntSafe(body.limit, 50, 1, 200);
  const offset = parseIntSafe(body.offset, 0, 0, 1000000);

  const { data, error, count } = await adminClient
    .from("photos")
    .select(
      "id, user_id, name, path, size, mime_type, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("List photos failed:", error);
    return errorResponse("Unable to list photos", 500);
  }

  await audit(adminId, "list_photos", undefined, { limit, offset });

  return response({
    ok: true,
    photos: data ?? [],
    count: count ?? 0,
    limit,
    offset,
  });
}

async function getStats(adminId: string) {
  const [users, photos, shares, notifications] = await Promise.all([
    adminClient.auth.admin.listUsers({ page: 1, perPage: 1 }),
    adminClient.from("photos").select("id", { count: "exact", head: true }),
    adminClient.from("shares").select("id", { count: "exact", head: true }),
    adminClient
      .from("notifications")
      .select("id", { count: "exact", head: true }),
  ]);

  if (users.error || photos.error || shares.error || notifications.error) {
    console.error("Stats failed:", {
      users: users.error,
      photos: photos.error,
      shares: shares.error,
      notifications: notifications.error,
    });
    return errorResponse("Unable to load statistics", 500);
  }

  await audit(adminId, "get_stats");

  return response({
    ok: true,
    stats: {
      users: users.data.total ?? 0,
      photos: photos.count ?? 0,
      shares: shares.count ?? 0,
      notifications: notifications.count ?? 0,
    },
  });
}

async function setMaintenance(adminId: string, body: Json) {
  const enabled = body.enabled === true;
  let until: string | null = null;

  if (body.until !== null && body.until !== undefined && body.until !== "") {
    const date = new Date(String(body.until));
    if (Number.isNaN(date.getTime())) {
      return errorResponse("Invalid maintenance timer", 400);
    }
    until = date.toISOString();

    if (date.getTime() <= Date.now() && enabled) {
      return errorResponse("Maintenance timer must be in the future", 400);
    }
  }

  if (!enabled) until = null;

  const { data, error } = await adminClient
    .from("site_settings")
    .upsert(
      {
        id: 1,
        maintenance: enabled,
        maintenance_until: until,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    .select("id, maintenance, maintenance_until, updated_at")
    .single();

  if (error) {
    console.error("Set maintenance failed:", error);
    return errorResponse("Unable to update maintenance", 500);
  }

  await audit(adminId, enabled ? "maintenance_on" : "maintenance_off", undefined, {
    maintenance_until: until,
  });

  return response({
    ok: true,
    maintenance: enabled,
    maintenance_until: until,
    settings: data,
  });
}

async function setUserRole(adminId: string, body: Json) {
  const targetUserId = requireUuid(body.user_id, "user_id");
  const role = requireString(body.role, "role", 20).toLowerCase();

  if (role !== "user" && role !== "admin") {
    return errorResponse("Role must be user or admin", 400);
  }

  if (targetUserId === adminId && role !== "admin") {
    return errorResponse("You cannot remove your own admin role", 400);
  }

  const { data, error } = await adminClient
    .from("user_roles")
    .upsert(
      {
        user_id: targetUserId,
        role,
        created_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select("user_id, role, created_at")
    .single();

  if (error) {
    console.error("Set role failed:", error);
    return errorResponse("Unable to update user role", 500);
  }

  await audit(adminId, "set_user_role", targetUserId, { role });

  return response({
    ok: true,
    user_role: data,
  });
}

async function deletePhoto(adminId: string, body: Json) {
  const photoId = requireUuid(body.photo_id, "photo_id");

  const { data: photo, error: readError } = await adminClient
    .from("photos")
    .select("id, user_id, path, name")
    .eq("id", photoId)
    .maybeSingle();

  if (readError) {
    console.error("Photo lookup failed:", readError);
    return errorResponse("Unable to find photo", 500);
  }

  if (!photo) {
    return errorResponse("Photo not found", 404);
  }

  if (photo.path) {
    const { error: storageError } = await adminClient.storage
      .from("photos")
      .remove([photo.path]);

    if (storageError) {
      // Keep going so a stale/missing object cannot block database cleanup.
      console.error("Storage delete failed:", storageError);
    }
  }

  const { error: deleteError } = await adminClient
    .from("photos")
    .delete()
    .eq("id", photoId);

  if (deleteError) {
    console.error("Photo row delete failed:", deleteError);
    return errorResponse("Unable to delete photo", 500);
  }

  await audit(adminId, "delete_photo", photo.user_id ?? undefined, {
    photo_id: photoId,
    path: photo.path ?? null,
  });

  return response({ ok: true });
}

async function deleteUser(adminId: string, body: Json) {
  const targetUserId = requireUuid(body.user_id, "user_id");

  if (targetUserId === adminId) {
    return errorResponse("You cannot delete your own admin account here", 400);
  }

  // Remove files owned by the user first.
  const { data: photos, error: photoError } = await adminClient
    .from("photos")
    .select("id, path")
    .eq("user_id", targetUserId);

  if (photoError) {
    console.error("User photo lookup failed:", photoError);
    return errorResponse("Unable to prepare user deletion", 500);
  }

  const paths = (photos ?? [])
    .map((p) => p.path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);

  if (paths.length) {
    const { error: storageError } = await adminClient.storage
      .from("photos")
      .remove(paths);

    if (storageError) {
      console.error("User storage cleanup failed:", storageError);
    }
  }

  // Auth deletion cascades through tables that reference auth.users.
  const { error } = await adminClient.auth.admin.deleteUser(targetUserId);

  if (error) {
    console.error("Auth user deletion failed:", error);
    return errorResponse("Unable to delete user", 500);
  }

  await audit(adminId, "delete_user", targetUserId);

  return response({ ok: true });
}

async function sendNotification(adminId: string, body: Json) {
  const targetUserId = requireUuid(body.user_id, "user_id");
  const title = requireString(body.title, "title", 120);
  const message = requireString(body.message, "message", 2000);

  const type =
    typeof body.type === "string" && body.type.trim()
      ? body.type.trim().slice(0, 50)
      : "admin";

  const metadata =
    body.metadata && typeof body.metadata === "object"
      ? body.metadata
      : {};

  const { data, error } = await adminClient
    .from("notifications")
    .insert({
      user_id: targetUserId,
      sender_id: adminId,
      type,
      title,
      message,
      metadata,
    })
    .select(
      "id, user_id, sender_id, type, title, message, metadata, read_at, created_at",
    )
    .single();

  if (error) {
    console.error("Notification insert failed:", error);
    return errorResponse("Unable to send notification", 500);
  }

  await audit(adminId, "send_notification", targetUserId, {
    notification_id: data.id,
    type,
  });

  return response({
    ok: true,
    notification: data,
  });
}

async function listAuditLogs(adminId: string, body: Json) {
  const limit = parseIntSafe(body.limit, 50, 1, 200);
  const offset = parseIntSafe(body.offset, 0, 0, 1000000);

  const { data, error, count } = await adminClient
    .from("admin_audit_logs")
    .select(
      "id, admin_id, action, target_user_id, details, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Audit list failed:", error);
    return errorResponse("Unable to load audit logs", 500);
  }

  await audit(adminId, "list_audit_logs", undefined, { limit, offset });

  return response({
    ok: true,
    logs: data ?? [],
    count: count ?? 0,
    limit,
    offset,
  });
}

async function getSystemStatus(adminId: string) {
  const maintenanceResult = await adminClient
    .from("site_settings")
    .select("maintenance, maintenance_until, updated_at")
    .eq("id", 1)
    .maybeSingle();

  if (maintenanceResult.error) {
    console.error("System status failed:", maintenanceResult.error);
    return errorResponse("Unable to load system status", 500);
  }

  const maintenance = maintenanceResult.data;
  const until = maintenance?.maintenance_until
    ? new Date(maintenance.maintenance_until)
    : null;

  const active =
    Boolean(maintenance?.maintenance) &&
    (!until || until.getTime() > Date.now());

  await audit(adminId, "get_system_status");

  return response({
    ok: true,
    status: {
      maintenance: active,
      maintenance_until: maintenance?.maintenance_until ?? null,
      updated_at: maintenance?.updated_at ?? null,
      now: new Date().toISOString(),
    },
  });
}

async function handleAdminAction(adminId: string, body: Json) {
  const action = requireString(body.action, "action", 80).toLowerCase();

  switch (action) {
    case "list_users":
      return await listUsers(adminId, body);

    case "list_photos":
      return await listPhotos(adminId, body);

    case "get_stats":
    case "stats":
      return await getStats(adminId);

    case "set_maintenance":
    case "maintenance":
      return await setMaintenance(adminId, body);

    case "set_user_role":
    case "update_role":
      return await setUserRole(adminId, body);

    case "delete_photo":
      return await deletePhoto(adminId, body);

    case "delete_user":
      return await deleteUser(adminId, body);

    case "send_notification":
    case "create_notification":
      return await sendNotification(adminId, body);

    case "list_audit_logs":
    case "audit_logs":
      return await listAuditLogs(adminId, body);

    case "get_system_status":
      return await getSystemStatus(adminId);

    case "health":
      return response({
        ok: true,
        service: "fotovault-admin-api",
        time: new Date().toISOString(),
      });

    default:
      return errorResponse(`Unknown admin action: ${action}`, 404);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const actionFromUrl = url.searchParams.get("action");

    // Public maintenance status endpoint.
    if (
      req.method === "GET" &&
      (actionFromUrl === "get_maintenance" || url.pathname.endsWith("/maintenance"))
    ) {
      return await getMaintenance();
    }

    if (req.method !== "POST" && req.method !== "GET") {
      return errorResponse("Method not allowed", 405);
    }

    let body: Json = {};

    if (req.method === "POST") {
      const contentType = req.headers.get("content-type") ?? "";

      if (contentType.includes("application/json")) {
        try {
          body = await req.json();
        } catch {
          return errorResponse("Invalid JSON body", 400);
        }
      } else {
        return errorResponse("Content-Type must be application/json", 415);
      }
    } else {
      body = Object.fromEntries(url.searchParams.entries());
    }

    if (
      body.action === "get_maintenance" ||
      actionFromUrl === "get_maintenance"
    ) {
      return await getMaintenance();
    }

    const admin = await requireAdmin(req);
    return await handleAdminAction(admin.id, body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message === "UNAUTHENTICATED") {
      return errorResponse("Authentication required", 401);
    }

    if (message === "FORBIDDEN") {
      return errorResponse("Administrator access required", 403);
    }

    if (message === "ROLE_LOOKUP_FAILED") {
      return errorResponse("Unable to verify administrator role", 500);
    }

    if (message.startsWith("INVALID_") || message.endsWith("_TOO_LONG")) {
      return errorResponse(message, 400);
    }

    console.error("Unhandled admin-api error:", err);
    return errorResponse("Internal server error", 500);
  }
});
