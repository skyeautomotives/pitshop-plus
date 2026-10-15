// One-time update for email signup, through the Supabase Management API (HTTPS):
//   1. runs migrations/0012_email_signup.sql (if not applied yet);
//   2. turns on sign-ups with email confirmation, sets where email links go,
//      and installs the branded "Confirm signup" email.
// SMTP (the sending mailbox) is set in the dashboard: Authentication -> Emails -> SMTP Settings.
//
// Usage (PowerShell):  $env:SUPABASE_ACCESS_TOKEN="sbp_..."; node supabase/apply-email-signup.mjs
import { readFileSync } from "node:fs";

const ref = "kbglqaagegmsmukaeldv";
const SITE = "https://skyeautomotives.github.io/pitshop-plus/";
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('Set SUPABASE_ACCESS_TOKEN first:  $env:SUPABASE_ACCESS_TOKEN="sbp_..."');
  process.exit(1);
}

async function api(method, path, body) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> HTTP ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}
const query = (sql) => api("POST", "/database/query", { query: sql });
const file = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

// 1. Database
const done = await query("select count(*)::int as n from pg_proc where proname = 'handle_new_signup'");
if (done[0]?.n > 0) {
  console.log("Database: email signup already set up.");
} else {
  await query(file("./migrations/0012_email_signup.sql"));
  console.log("Database: email signup set up.");
}

// 2. Auth settings and the confirmation email
await api("PATCH", "/config/auth", {
  site_url: SITE,
  uri_allow_list: [
    `${SITE}**`,
    "http://127.0.0.1:5181/**",
    "http://localhost:5181/**",
    "http://localhost:5173/**",
  ].join(","),
  disable_signup: false,
  mailer_autoconfirm: false,
  mailer_subjects_confirmation: "Confirm your email | Pitstop Plus",
  mailer_templates_confirmation_content: file("./templates/confirm-signup.html"),
});

const cfg = await api("GET", "/config/auth");
console.log("Auth settings:");
console.log("  sign-ups allowed:      ", !cfg.disable_signup);
console.log("  email confirmation on: ", !cfg.mailer_autoconfirm);
console.log("  email links go to:     ", cfg.site_url);
console.log("  confirmation subject:  ", cfg.mailer_subjects_confirmation);
console.log("  custom SMTP host:      ", cfg.smtp_host || "(not set - using Supabase's test mailer, a few emails per hour)");
console.log("Done.");
