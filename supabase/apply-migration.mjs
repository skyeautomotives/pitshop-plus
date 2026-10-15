// Runs one SQL migration file on the Pitstop Plus database through the Supabase
// Management API (HTTPS), for networks that block the database port.
// Usage (PowerShell):
//   $env:SUPABASE_ACCESS_TOKEN="sbp_..."; node supabase/apply-migration.mjs supabase/migrations/0013_offline_sync.sql
import { readFileSync } from "node:fs";

const ref = "kbglqaagegmsmukaeldv";
const file = process.argv[2];
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!file) {
  console.error("Give the migration file, e.g. node supabase/apply-migration.mjs supabase/migrations/0013_offline_sync.sql");
  process.exit(1);
}
if (!token) {
  console.error('Set SUPABASE_ACCESS_TOKEN first:  $env:SUPABASE_ACCESS_TOKEN="sbp_..."');
  process.exit(1);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: readFileSync(file, "utf8") }),
});
const text = await res.text();
if (!res.ok) {
  console.error(`Failed (HTTP ${res.status}): ${text}`);
  process.exit(1);
}
console.log(`Done: ${file} applied.`);
