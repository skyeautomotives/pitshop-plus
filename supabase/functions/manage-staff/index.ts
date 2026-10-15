// Owner-only login management: add, remove, change usernames and reset passwords.
// Staff sign in with a username; Supabase Auth needs an email, so each login's
// email is <username>@pitstop.invalid (".invalid" can never receive mail).
// Runs server-side so the service-role key never reaches the browser.
// Every call re-checks that the caller is the workshop owner, and only touches
// logins of the caller's own workshop.
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

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;
const LOGIN_DOMAIN = "pitstop.invalid";
const MIN_PASSWORD = 8;
const USERNAME_ERROR =
  "Usernames are 3-30 characters: lowercase letters, numbers, dots, dashes or underscores, starting with a letter or number.";

const loginEmail = (username: string) => `${username}@${LOGIN_DOMAIN}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Please sign in again." }, 401);

  // Verify the caller with their own token, then check the owner role under RLS.
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await caller.auth.getUser(token);
  if (userError || !userData.user) return json({ error: "Please sign in again." }, 401);
  const { data: isOwner, error: roleError } = await caller.rpc("is_owner");
  if (roleError || isOwner !== true) return json({ error: "Only the owner can manage logins." }, 403);
  const { data: shopId, error: shopError } = await caller.rpc("my_shop_id");
  if (shopError || !shopId) return json({ error: "Your login is not set up for a workshop." }, 403);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  /** True when the login belongs to the caller's workshop. */
  async function inMyShop(userId: string): Promise<boolean> {
    const { data } = await admin.from("staff").select("shop_id").eq("user_id", userId).maybeSingle();
    return data?.shop_id === shopId;
  }

  try {
    if (body.action !== "create" && !(await inMyShop(String(body.user_id ?? ""))))
      return json({ error: "Staff member not found." }, 404);

    switch (body.action) {
      case "create": {
        const username = String(body.username ?? "").trim().toLowerCase();
        const email = loginEmail(username);
        const password = String(body.password ?? "");
        const fullName = String(body.full_name ?? "").trim().slice(0, 100);
        const role = body.role === "owner" ? "owner" : "staff";

        if (!fullName) return json({ error: "Enter the person's name." }, 400);
        if (!USERNAME_RE.test(username)) return json({ error: USERNAME_ERROR }, 400);
        if (password.length < MIN_PASSWORD)
          return json({ error: `Password must be at least ${MIN_PASSWORD} characters.` }, 400);
        const { data: taken } = await admin.from("staff").select("user_id").eq("username", username).maybeSingle();
        if (taken) return json({ error: "That username is already taken." }, 409);

        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });
        if (createError || !created.user) {
          const msg = createError?.message ?? "Could not create the login.";
          if (/already|registered|exists/i.test(msg))
            return json({ error: "That username is already taken." }, 409);
          return json({ error: msg }, 400);
        }

        const { error: staffError } = await admin
          .from("staff")
          .upsert({ user_id: created.user.id, shop_id: shopId, email, username, full_name: fullName, role });
        if (staffError) {
          // Don't leave a login that can't use the app.
          await admin.auth.admin.deleteUser(created.user.id);
          return json({ error: `Could not add the login: ${staffError.message}` }, 500);
        }
        return json({ user_id: created.user.id });
      }

      case "remove": {
        const userId = String(body.user_id ?? "");
        if (!userId) return json({ error: "Missing user." }, 400);
        if (userId === userData.user.id) return json({ error: "You can't remove your own login." }, 400);
        // Bills they created are kept (created_by becomes empty).
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error && !/not found/i.test(error.message)) return json({ error: error.message }, 400);
        await admin.from("staff").delete().eq("user_id", userId);
        return json({ ok: true });
      }

      case "set_username": {
        const userId = String(body.user_id ?? "");
        const username = String(body.username ?? "").trim().toLowerCase();
        if (!userId) return json({ error: "Missing user." }, 400);
        if (!USERNAME_RE.test(username)) return json({ error: USERNAME_ERROR }, 400);
        const { data: taken } = await admin.from("staff").select("user_id").eq("username", username).maybeSingle();
        if (taken && taken.user_id !== userId) return json({ error: "That username is already taken." }, 409);
        const { error } = await admin.auth.admin.updateUserById(userId, { email: loginEmail(username), email_confirm: true });
        if (error) return json({ error: error.message }, 400);
        const { error: staffError } = await admin.from("staff").update({ username }).eq("user_id", userId);
        if (staffError) return json({ error: staffError.message }, 500);
        return json({ ok: true });
      }

      case "reset_password": {
        const userId = String(body.user_id ?? "");
        const password = String(body.password ?? "");
        if (!userId) return json({ error: "Missing user." }, 400);
        if (password.length < MIN_PASSWORD)
          return json({ error: `Password must be at least ${MIN_PASSWORD} characters.` }, 400);
        const { error } = await admin.auth.admin.updateUserById(userId, { password });
        if (error) return json({ error: error.message }, 400);
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
