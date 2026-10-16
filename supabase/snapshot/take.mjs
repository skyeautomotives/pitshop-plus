// Writes an encrypted snapshot.  node take.mjs <out.psnap>   or   node take.mjs --check
import { writeFileSync } from "node:fs";
import { encrypt } from "./crypto.mjs";

const ref = "kbglqaagegmsmukaeldv";
const check = process.argv[2] === "--check";
const out = check ? null : (process.argv[2] ?? "snapshot.psnap");
const token = process.env.SUPABASE_ACCESS_TOKEN;
const passphrase = process.env.SNAPSHOT_PASSPHRASE;
if (!token) {
  console.error("Set SUPABASE_ACCESS_TOKEN first.");
  process.exit(1);
}
if (!check && !passphrase) {
  console.error("Set SNAPSHOT_PASSPHRASE first.");
  process.exit(1);
}

async function sql(query, attempt = 1) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    if (attempt < 4 && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, attempt * 5000));
      return sql(query, attempt + 1);
    }
    throw new Error(`Database query failed (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

const PAGE = 5000;
async function readTable(from, columns = "*") {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const [{ rows: page }] = await sql(
      `select coalesce(json_agg(t), '[]'::json) as rows from (select ${columns} from ${from} order by ctid offset ${offset} limit ${PAGE}) t`,
    );
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

const tables = (
  await sql("select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1")
).map((r) => r.table_name);
const quoted = (t) => `public."${t.replace(/"/g, '""')}"`;
const USERS = "id, email, phone, created_at, email_confirmed_at, last_sign_in_at, banned_until, raw_user_meta_data";

if (check) {
  for (const t of tables) {
    const [{ n }] = await sql(`select count(*)::int as n from ${quoted(t)}`);
    console.log(`${t}: ${n}`);
  }
  const [{ n }] = await sql("select count(*)::int as n from auth.users");
  console.log(`auth.users: ${n}`);
  process.exit(0);
}

const snapshot = { format: "pitstop-plus-snapshot", made_at: new Date().toISOString(), project: ref, tables: {} };
for (const t of tables) snapshot.tables[t] = await readTable(quoted(t));
snapshot.tables["auth.users"] = await readTable("auth.users", USERS);

const file = encrypt(JSON.stringify(snapshot), passphrase);
writeFileSync(out, file);
console.log(`Snapshot written: ${(file.length / 1024 / 1024).toFixed(2)} MB, ${tables.length + 1} tables.`);
