// Registers a new workshop: creates the owner's login and the shop in one go.
// Called from the Register page by visitors who aren't signed in yet.
// Logins sign in with a username; Supabase Auth needs an email, so each
// login's email is <username>@pitstop.invalid (".invalid" can never receive mail).
// Runs server-side so the service-role key never reaches the browser, and
// public sign-ups can stay turned off in Supabase.
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

const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const shopName = text(body.shop_name, 100);
  const fullName = text(body.full_name, 100);
  const phone = text(body.phone, 20);
  const address = text(body.address, 300);
  const username = text(body.username, 30).toLowerCase();
  const password = String(body.password ?? "");

  if (!shopName) return json({ error: "Enter the workshop name." }, 400);
  if (!fullName) return json({ error: "Enter your name." }, 400);
  if (phone && !/^\d{10,13}$/.test(phone.replace(/\D/g, "")))
    return json({ error: "Enter a 10-digit phone number." }, 400);
  if (!USERNAME_RE.test(username)) return json({ error: USERNAME_ERROR }, 400);
  if (password.length < MIN_PASSWORD)
    return json({ error: `Password must be at least ${MIN_PASSWORD} characters.` }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  try {
    const { data: taken } = await admin.from("staff").select("user_id").eq("username", username).maybeSingle();
    if (taken) return json({ error: "That username is already taken. Try another." }, 409);

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: `${username}@${LOGIN_DOMAIN}`,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createError || !created.user) {
      const msg = createError?.message ?? "Could not create the login.";
      if (/already|registered|exists/i.test(msg))
        return json({ error: "That username is already taken. Try another." }, 409);
      return json({ error: msg }, 400);
    }

    const { data: shopId, error: shopError } = await admin.rpc("create_shop", {
      p_user: created.user.id,
      p_username: username,
      p_full_name: fullName,
      p_shop_name: shopName,
      p_phone: phone || null,
      p_address: address || null,
    });
    if (shopError) {
      // Don't leave a login without a workshop.
      await admin.auth.admin.deleteUser(created.user.id);
      if (/staff_username_key|duplicate/i.test(shopError.message))
        return json({ error: "That username is already taken. Try another." }, 409);
      return json({ error: shopError.message }, 400);
    }
    return json({ shop_id: shopId });
  } catch (err) {
    console.error(err);
    return json({ error: "Unexpected server error." }, 500);
  }
});
