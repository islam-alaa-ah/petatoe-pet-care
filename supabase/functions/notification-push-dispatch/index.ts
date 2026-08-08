import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const vapidPublicKey = Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY") ?? "";
  const vapidPrivateKey = Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY") ?? "";
  const vapidSubject = Deno.env.get("WEB_PUSH_VAPID_SUBJECT") ?? "mailto:admin@example.com";

  if (!url || !anonKey || !serviceKey) return json({ error: "Supabase environment is incomplete" }, 500);

  const authHeader = request.headers.get("Authorization") ?? "";
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData.user) return json({ error: "Authentication required" }, 401);

  let body: { action?: string } = {};
  try { body = await request.json(); } catch (_) { body = {}; }
  const action = body.action ?? "dispatch";

  if (action === "config") {
    return json({ publicKey: vapidPublicKey || null, configured: !!(vapidPublicKey && vapidPrivateKey) });
  }

  if (!vapidPublicKey || !vapidPrivateKey) return json({ error: "Web Push VAPID secrets are not configured" }, 503);
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: outbox, error: outboxError } = await admin
    .from("notification_push_outbox")
    .select("id,notification_id,user_id,attempts")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(50);

  if (outboxError) return json({ error: outboxError.message }, 500);
  if (!outbox?.length) return json({ processed: 0, sent: 0, failed: 0 });

  let sent = 0, failed = 0, processed = 0;
  for (const item of outbox) {
    processed += 1;
    const [{ data: notification, error: notificationError }, { data: subscriptions, error: subscriptionsError }] = await Promise.all([
      admin.from("notifications").select("id,title,body,target_view,request_id,visit_id,event_key,metadata").eq("id", item.notification_id).maybeSingle(),
      admin.from("notification_push_subscriptions").select("id,endpoint,p256dh,auth_key").eq("user_id", item.user_id).eq("is_active", true),
    ]);

    if (notificationError || subscriptionsError || !notification) {
      const message = notificationError?.message || subscriptionsError?.message || "Notification not found";
      const attempts = Number(item.attempts || 0) + 1;
      await admin.from("notification_push_outbox").update({
        attempts,
        status: attempts >= 5 ? "failed" : "pending",
        last_error: message,
        next_attempt_at: new Date(Date.now() + Math.min(30, attempts * 5) * 60_000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", item.id);
      failed += 1;
      continue;
    }

    if (!subscriptions?.length) {
      await admin.from("notification_push_outbox").update({
        status: "no_subscription",
        attempts: Number(item.attempts || 0) + 1,
        last_error: "No active push subscription",
        updated_at: new Date().toISOString(),
      }).eq("id", item.id);
      continue;
    }

    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      icon: "./assets/images/android-chrome-192x192.png",
      badge: "./assets/images/favicon-48x48.png",
      tag: `petatoe-${notification.id}`,
      data: {
        notificationId: notification.id,
        targetView: notification.target_view || "",
        requestId: notification.request_id || "",
        visitId: notification.visit_id || "",
        eventKey: notification.event_key,
      },
    });

    let delivered = false;
    let lastError = "";
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth_key },
        }, payload, { TTL: 60 * 60 * 12 });
        delivered = true;
        await admin.from("notification_push_subscriptions").update({ last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", sub.id);
      } catch (error) {
        const statusCode = Number((error as { statusCode?: number })?.statusCode || 0);
        lastError = String((error as Error)?.message || error);
        if (statusCode === 404 || statusCode === 410) {
          await admin.from("notification_push_subscriptions").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", sub.id);
        }
      }
    }

    if (delivered) {
      await admin.from("notification_push_outbox").update({
        status: "sent", sent_at: new Date().toISOString(), attempts: Number(item.attempts || 0) + 1,
        last_error: null, updated_at: new Date().toISOString(),
      }).eq("id", item.id);
      sent += 1;
    } else {
      const attempts = Number(item.attempts || 0) + 1;
      await admin.from("notification_push_outbox").update({
        status: attempts >= 5 ? "failed" : "pending",
        attempts,
        last_error: lastError || "Push delivery failed",
        next_attempt_at: new Date(Date.now() + Math.min(30, attempts * 5) * 60_000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", item.id);
      failed += 1;
    }
  }

  return json({ processed, sent, failed });
});
