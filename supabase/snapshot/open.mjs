// Opens a snapshot.  node open.mjs <file.psnap> [shop id | --all out.json]
import { readFileSync, writeFileSync } from "node:fs";
import { decrypt } from "./crypto.mjs";

const [file, shopId, outArg] = process.argv.slice(2);
const passphrase = process.env.SNAPSHOT_PASSPHRASE;
if (!file || !passphrase) {
  console.error("Usage: set SNAPSHOT_PASSPHRASE, then node supabase/snapshot/open.mjs <file.psnap> [shop id | --all out.json]");
  process.exit(1);
}

let snap;
try {
  snap = JSON.parse(decrypt(readFileSync(file), passphrase));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
const t = snap.tables;

if (!shopId) {
  console.log(`Snapshot made ${snap.made_at}\n`);
  for (const s of t.shop_settings ?? []) {
    const bills = (t.bills ?? []).filter((b) => b.shop_id === s.shop_id).length;
    const complaints = (t.complaints ?? []).filter((c) => c.shop_id === s.shop_id).length;
    console.log(`${s.shop_id}  ${s.shop_name || "(no name)"}: ${bills} bills, ${complaints} complaints`);
  }
  process.exit(0);
}

if (shopId === "--all") {
  const out = outArg ?? file.replace(/\.psnap$/, ".json");
  writeFileSync(out, JSON.stringify(snap, null, 1));
  console.log(`Written: ${out}`);
  process.exit(0);
}

// One workshop, in the app's backup file format (see src/lib/backup.ts).
const settings = (t.shop_settings ?? []).find((s) => s.shop_id === shopId) ?? null;
if (!settings) {
  console.error("No workshop with that id in this snapshot. Run without a shop id to list them.");
  process.exit(1);
}
const bills = (t.bills ?? []).filter((b) => b.shop_id === shopId);
const ids = new Set(bills.map((b) => b.id));
const group = (rows, key, pick = (r) => r) => {
  const m = new Map();
  for (const r of rows) if (ids.has(r[key])) (m.get(r[key]) ?? m.set(r[key], []).get(r[key])).push(pick(r));
  return m;
};
const items = group(t.bill_items ?? [], "bill_id");
const links = group(t.bill_complaints ?? [], "bill_id", (l) => l.complaint_id);
const drop = (row, keys) => Object.fromEntries(Object.entries(row).filter(([k]) => !keys.includes(k)));

const backup = {
  format: "pitstop-plus-backup",
  version: 1,
  made_at: snap.made_at,
  source: "server",
  workshop: settings.shop_name ?? "",
  settings: { shop_name: settings.shop_name, address: settings.address, phone: settings.phone },
  bills: bills
    .sort((a, b) => Number(a.bill_number) - Number(b.bill_number))
    .map((b) => ({
      ...drop(b, ["shop_id", "phone_digits", "vehicle_reg_key"]),
      bill_items: (items.get(b.id) ?? []).sort((x, y) => x.position - y.position),
      complaint_ids: links.get(b.id) ?? [],
    })),
  complaints: (t.complaints ?? [])
    .filter((c) => c.shop_id === shopId)
    .sort((a, b) => Number(a.complaint_number) - Number(b.complaint_number))
    .map((c) => drop(c, ["shop_id", "phone_digits", "vehicle_reg_key"])),
};
const name = (backup.workshop || shopId).replace(/[^A-Za-z0-9 ]+/g, "").trim();
const out = outArg ?? `Pitstop Plus backup - ${name} - ${snap.made_at.slice(0, 10)}.json`;
writeFileSync(out, JSON.stringify(backup, null, 1));
console.log(`${out}: ${backup.bills.length} bills, ${backup.complaints.length} complaints`);
