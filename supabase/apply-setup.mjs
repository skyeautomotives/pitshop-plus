// Runs supabase-setup.sql on the Pitshop Plus project through the Supabase
// Management API (HTTPS), for networks that block the database port.
// Usage (PowerShell):  $env:SUPABASE_ACCESS_TOKEN="sbp_..."; node supabase/apply-setup.mjs
import { readFileSync } from "node:fs";

const ref = "kbglqaagegmsmukaeldv";
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('Set SUPABASE_ACCESS_TOKEN first:  $env:SUPABASE_ACCESS_TOKEN="sbp_..."');
  process.exit(1);
}

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body}`);
  return JSON.parse(body);
}

const existing = await query("select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name = 'shops'");
if (existing[0]?.n > 0) {
  console.log("The database is already set up (the shops table exists). Nothing to do.");
  process.exit(0);
}

console.log("Setting up the database…");
await query(readFileSync(new URL("../supabase-setup.sql", import.meta.url), "utf8"));
const tables = await query("select table_name from information_schema.tables where table_schema = 'public' order by 1");
console.log("Done. Tables:", tables.map((t) => t.table_name).join(", "));
