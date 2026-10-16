// Platform-admin login management for any workshop: reset passwords, disable
// and re-enable logins, and remove staff logins. Used by the /admin panel.
// Runs server-side so the service-role key never reaches the browser.
// Every call re-checks that the caller is a platform admin (public.platform_admins)
// and records the action in public.admin_audit_log.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const MIN_PASSWORD = 8;
// Supabase Auth bans for a duration; 100 years is "until re-enabled".
const DISABLED_FOR = "876000h";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Please sign in again." }, 401);

  // Verify the caller with their own token, then check the admin list.
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await caller.auth.getUser(token);
  if (userError || !userData.user) return json({ error: "Please sign in again." }, 401);
  const { data: isAdmin, error: roleError } = await caller.rpc("is_platform_admin");
  if (roleError || isAdmin !== true) return json({ error: "Only Pitshop Plus admins can do this." }, 403);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const userId = String(body.user_id ?? "");
  if (!userId) return json({ error: "Missing user." }, 400);

  // Only workshop logins can be managed here (not other admins).
  const { data: target } = await admin
    .from("staff")
    .select("user_id, shop_id, username, full_name, role")
    .eq("user_id", userId)
    .maybeSingle();
  if (!target) return json({ error: "Login not found." }, 404);
  const label = `${target.full_name || target.username} (${target.username})`;

  async function log(action: string, details: Record<string, unknown> = {}) {
    const { error } = await admin.from("admin_audit_log").insert({
      admin_id: userData.user!.id,
      admin_email: userData.user!.email ?? "",
      action,
      shop_id: target!.shop_id,
      target_user: userId,
      target_label: label,
      details,
    });
    if (error) console.error("audit log", error);
  }

  try {
    switch (body.action) {
      case "reset_password": {
        const password = String(body.password ?? "");
        if (password.length < MIN_PASSWORD)
          return json({ error: `Password must be at least ${MIN_PASSWORD} characters.` }, 400);
        const { error } = await admin.auth.admin.updateUserById(userId, { password });
        if (error) return json({ error: error.message }, 400);
        await log("reset_password");
        return json({ ok: true });
      }

      case "disable":
      case "enable": {
        const disable = body.action === "disable";
        const { error } = await admin.auth.admin.updateUserById(userId, {
          ban_duration: disable ? DISABLED_FOR : "none",
        });
        // A disabled login can't sign in or renew its sign-in; one already open stops within the hour.
        if (error) return json({ error: error.message }, 400);
        await log(disable ? "disable_login" : "enable_login");
        return json({ ok: true });
      }

      case "remove": {
        if (target.role === "owner")
          return json({ error: "The owner's login can't be removed. Suspend the workshop instead." }, 400);
        // Bills they created are kept (created_by becomes empty).
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error && !/not found/i.test(error.message)) return json({ error: error.message }, 400);
        await admin.from("staff").delete().eq("user_id", userId);
        await log("remove_login");
        return json({ ok: true });
      }

      default:
        return json({ error: "Unknown action." }, 400);
    }
  } catch (err) {
    console.error(err);
    return json({ error: "Unexpected server error." }, 500);
  }
});
