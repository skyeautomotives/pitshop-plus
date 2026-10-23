// Applies the migrations in supabase/migrations/ that the live database doesn't have yet,
// in order, each in one transaction, and records them in public.schema_migrations.
// Runs in the deploy (needs SUPABASE_ACCESS_TOKEN). Safe to run again: nothing to do.
//   node supabase/migrate.mjs            apply what is missing
//   node supabase/migrate.mjs --check    only list what is missing
import { readdirSync, readFileSync } from "node:fs";

const ref = process.env.SUPABASE_PROJECT_REF || "kbglqaagegmsmukaeldv";
const token = process.env.SUPABASE_ACCESS_TOKEN;
const api = process.env.SUPABASE_API_URL || "https://api.supabase.com";
const checkOnly = process.argv.includes("--check");
// Everything up to this file was applied by hand before this script existed.
const BASELINE = "0029_optional_phone.sql";
const dir = new URL("./migrations/", import.meta.url);

async function query(sql) {
  const res = await fetch(`${api}/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : [];
}

const quote = (s) => `'${s.replace(/'/g, "''")}'`;

async function main() {
  if (!token) {
    console.error("SUPABASE_ACCESS_TOKEN is not set. Add it as a repository secret (see CLAUDE.md).");
    return 1;
  }
  const files = readdirSync(dir)
    .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
    .sort();

  // First run: create the list and record the migrations that are already on the database.
  const [{ exists }] = await query("select to_regclass('public.schema_migrations') is not null as exists");
  const baseline = files.filter((f) => f <= BASELINE);
  if (!exists && checkOnly) {
    console.log(`No list of applied migrations yet; ${baseline.length} would be recorded as already applied.`);
  } else if (!exists) {
    await query(`begin;
create table public.schema_migrations (name text primary key, applied_at timestamptz not null default now());
grant all on public.schema_migrations to anon, authenticated, service_role;
alter table public.schema_migrations enable row level security;
insert into public.schema_migrations (name) values ${baseline.map((f) => `(${quote(f)})`).join(", ")};
commit;`);
    console.log(`Started the list of applied migrations with ${baseline.length} already applied.`);
  }

  const applied = new Set(
    !exists && checkOnly ? baseline : (await query("select name from public.schema_migrations")).map((r) => r.name),
  );
  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) {
    console.log("Database is up to date.");
    return 0;
  }
  if (checkOnly) {
    console.log(`Missing on the database: ${pending.join(", ")}`);
    return 0;
  }

  for (const f of pending) {
    const sql = readFileSync(new URL(f, dir), "utf8");
    try {
      await query(`begin;\n${sql}\n;\ninsert into public.schema_migrations (name) values (${quote(f)});\ncommit;`);
    } catch (err) {
      console.error(`Failed to apply ${f}. Nothing from it was kept.\n${err.message}`);
      return 1;
    }
    console.log(`Applied ${f}`);
  }

  // Let the API see new columns and functions straight away.
  await query("notify pgrst, 'reload schema';");
  console.log(`Done: ${pending.length} migration(s) applied.`);
  return 0;
}

// Ends by setting the exit code (not process.exit), so open connections close cleanly.
main().then(
  (code) => (process.exitCode = code),
  (err) => {
    console.error(err.message);
    process.exitCode = 1;
  },
);
