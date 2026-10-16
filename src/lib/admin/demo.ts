// Sample data for `npm run dev:admin-demo`: a few made-up workshops with logins,
// bills and complaints, kept in memory so the admin panel can be tried (and its
// actions clicked) without a Supabase project. Never part of a build.
import type { AdminApi } from "./api";
import { PAGE_SIZE } from "./api";
import type {
  AdminBillDetail,
  AdminComplaintDetail,
  AdminLogin,
  AdminOverview,
  AdminShop,
  AuditAction,
  AuditEntry,
  MonthStats,
  Page,
} from "./types";

/** Small seeded random generator, so the sample data is the same on every reload. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString();
const day = (t: number) => iso(t).slice(0, 10);
const regKey = (reg: string) => reg.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
const pause = () => new Promise((r) => setTimeout(r, 120));

const SHOPS = [
  { name: "Ravi Motors", owner: "Ravi Kumar", email: "ravi.motors@gmail.com", phone: "98470 12345", address: "MG Road, Kochi", months: 11, staff: ["Anil", "Biju", "Shaji"], volume: 1.6 },
  { name: "Sree Durga Auto Works", owner: "Suresh Nair", email: "sreedurgaauto@gmail.com", phone: "94471 55210", address: "Thampanoor, Thiruvananthapuram", months: 10, staff: ["Manoj", "Vinod"], volume: 1.2 },
  { name: "Highway Car Care", owner: "Joseph Mathew", email: "highwaycarcare@yahoo.com", phone: "90370 88812", address: "NH 66, Kollam", months: 8, staff: ["Rajesh"], volume: 1 },
  { name: "AS Automobiles", owner: "Abdul Salam", email: "as123automobiles@gmail.com", phone: "97450 33011", address: "Palayam, Kozhikode", months: 7, staff: ["Faisal", "Nizar", "Sameer", "Jabir"], volume: 1.4 },
  { name: "Green Garage", owner: "Thomas Varghese", email: "greengarage.tvla@gmail.com", phone: "81130 40022", address: "Thiruvalla", months: 5, staff: [], volume: 0.7 },
  { name: "Speedline Two Wheelers", owner: "Pradeep P", email: "speedline2w@gmail.com", phone: "99610 77345", address: "Thrissur", months: 3, staff: ["Akhil"], volume: 0.9 },
  { name: "Metro Auto Electricals", owner: "Hari Krishnan", email: "metroautoelec@gmail.com", phone: "70120 66001", address: "Kottayam", months: 1, staff: [], volume: 0.3 },
  { name: "New Kerala Service Centre", owner: "Bindu S", email: "nkservicecentre@gmail.com", phone: "62380 11290", address: "Alappuzha", months: 0, staff: [], volume: 0 },
];

const CUSTOMERS = ["Arun Das", "Meera Pillai", "Sajan Thomas", "Fathima Beevi", "George Kurian", "Lakshmi Menon", "Vishnu Prasad", "Nisha Joseph", "Rahul R", "Anwar Hussain", "Deepa K", "Jithin Jose", "Sreeja Nair", "Kiran Babu", "Ashraf M"];
const PARTS = ["Engine oil change", "Brake pads (front)", "Clutch plate", "Air filter", "Battery replacement", "Wheel alignment", "Coolant top-up", "Spark plugs", "Headlamp bulb", "AC gas refill", "Chain sprocket kit", "Tyre puncture repair", "Wiper blades", "Suspension bush"];
const PROBLEMS = ["Engine making knocking noise", "Brakes squeaking when stopping", "AC not cooling", "Vehicle pulling to the left", "Battery drains overnight", "Gear shift is hard", "Check engine light on", "Oil leak under the engine", "Starting problem in the morning", "Headlight not working"];

interface DemoBill extends AdminBillDetail {
  complaint_ids: string[];
}

interface DemoState {
  shops: (Omit<AdminShop, "logins" | "bills" | "complaints" | "total_billed" | "last_activity" | "owner_name" | "owner_email" | "owner_confirmed" | "owner_user_id">)[];
  logins: (AdminLogin & { shop_id: string })[];
  bills: DemoBill[];
  complaints: (Omit<AdminComplaintDetail, "bills">)[];
  audit: AuditEntry[];
}

function build(): DemoState {
  const r = rng(20261016);
  const now = Date.now();
  const pick = <T,>(list: T[]) => list[Math.floor(r() * list.length)];
  const state: DemoState = { shops: [], logins: [], bills: [], complaints: [], audit: [] };
  let uid = 0;
  const id = (p: string) => `${p}-${(++uid).toString(16).padStart(8, "0")}`;

  SHOPS.forEach((s, si) => {
    const shopId = id("shop");
    const created = now - s.months * 30 * DAY - Math.floor(r() * 20) * DAY;
    state.shops.push({
      id: shopId,
      shop_name: s.name,
      phone: s.phone,
      address: s.address,
      created_at: iso(created),
      suspended_at: si === 2 ? iso(now - 4 * DAY) : null,
      suspended_reason: si === 2 ? "Subscription payment overdue" : null,
    });

    const username = s.email.split("@")[0].replace(/[^a-z0-9._-]/g, "");
    state.logins.push({
      shop_id: shopId,
      user_id: id("user"),
      username,
      email: s.email,
      full_name: s.owner,
      role: "owner",
      created_at: iso(created),
      last_sign_in_at: s.volume > 0 ? iso(now - Math.floor(r() * 3 * DAY)) : null,
      email_confirmed_at: si === SHOPS.length - 1 ? null : iso(created + 600_000),
      banned_until: null,
    });
    s.staff.forEach((name, i) => {
      const u = `${name.toLowerCase()}.${username.slice(0, 6)}`;
      state.logins.push({
        shop_id: shopId,
        user_id: id("user"),
        username: u,
        email: `${u}@pitstop.invalid`,
        full_name: name,
        role: "staff",
        created_at: iso(created + (i + 1) * 5 * DAY),
        last_sign_in_at: iso(now - Math.floor(r() * 10 * DAY)),
        email_confirmed_at: iso(created + (i + 1) * 5 * DAY),
        banned_until: si === 3 && i === 3 ? iso(now + 36500 * DAY) : null,
      });
    });

    // Bills and complaints from signup until today (or until suspended).
    const until = si === 2 ? now - 4 * DAY : now;
    let billNo = 0;
    let complaintNo = 0;
    for (let t = created + DAY; t < until; t += DAY) {
      const perDay = s.volume * (0.6 + r() * 1.4);
      const count = Math.floor(perDay) + (r() < perDay % 1 ? 1 : 0);
      for (let k = 0; k < count; k++) {
        const customer = pick(CUSTOMERS);
        const phone = `9${Math.floor(r() * 1e9).toString().padStart(9, "0")}`;
        const reg = `KL ${String(1 + Math.floor(r() * 70)).padStart(2, "0")} ${"ABCDEFGHJK"[Math.floor(r() * 10)]}${"ABCDEFGHJK"[Math.floor(r() * 10)]} ${1000 + Math.floor(r() * 9000)}`;
        const attended = pick(state.logins.filter((l) => l.shop_id === shopId));
        const complaintIds: string[] = [];
        if (r() < 0.55) {
          const cid = id("complaint");
          const open = t > now - 6 * DAY && r() < 0.6;
          state.complaints.push({
            id: cid,
            shop_id: shopId,
            shop_name: s.name,
            complaint_number: ++complaintNo,
            customer_name: customer,
            address: null,
            phone,
            vehicle_reg: reg,
            vehicle_reg_key: regKey(reg),
            description: pick(PROBLEMS),
            reported_on: day(t),
            attended_by: attended.full_name,
            attended_by_user: attended.user_id,
            notes: null,
            status: open ? "open" : "resolved",
            created_at: iso(t),
            updated_at: iso(t),
          });
          if (open) continue;
          complaintIds.push(cid);
        }
        const items = Array.from({ length: 1 + Math.floor(r() * 3) }, (_, p) => {
          const price = 150 + Math.floor(r() * 30) * 50;
          const quantity = r() < 0.8 ? 1 : 2;
          return { id: id("item"), bill_id: "", position: p, description: pick(PARTS), quantity, price, line_total: price * quantity };
        });
        const subtotal = items.reduce((a, i) => a + i.line_total, 0);
        const labour = 200 + Math.floor(r() * 16) * 50;
        const washing = r() < 0.3 ? 150 : null;
        const gross = subtotal + labour + (washing ?? 0);
        const discount = r() < 0.15 ? 100 : 0;
        const billId = id("bill");
        items.forEach((i) => (i.bill_id = billId));
        state.bills.push({
          id: billId,
          shop_id: shopId,
          shop_name: s.name,
          created_by_name: attended.full_name,
          bill_number: ++billNo,
          customer_name: customer,
          address: null,
          phone,
          vehicle_reg: reg,
          vehicle_reg_key: regKey(reg),
          date_received: day(t),
          expected_pickup: null,
          delivered_on: day(t + (r() < 0.5 ? DAY : 0)),
          labour_charge: labour,
          painting_charge: null,
          washing_charge: washing,
          items_subtotal: subtotal,
          discount,
          discount_percent: null,
          grand_total: gross - discount,
          created_at: iso(t),
          updated_at: iso(t),
          bill_items: items,
          complaints: [],
          complaint_ids: complaintIds,
        });
      }
    }
  });

  const audit = (action: AuditAction, shopIndex: number, daysAgo: number, target: string, details: Record<string, unknown> = {}) =>
    state.audit.push({
      id: state.audit.length + 1,
      created_at: iso(now - daysAgo * DAY),
      admin_email: "skyeautomotives@gmail.com",
      action,
      shop_id: state.shops[shopIndex].id,
      shop_name: state.shops[shopIndex].shop_name,
      target_label: target,
      details,
    });
  audit("reset_password", 0, 20, "Biju (biju.ravimo)");
  audit("disable_login", 3, 9, "Jabir (jabir.as123a)");
  audit("suspend_shop", 2, 4, "Highway Car Care", { reason: "Subscription payment overdue" });
  state.audit.reverse();
  return state;
}

function summary(state: DemoState, shop: DemoState["shops"][number]): AdminShop {
  const logins = state.logins.filter((l) => l.shop_id === shop.id);
  const owner = logins.find((l) => l.role === "owner");
  const bills = state.bills.filter((b) => b.shop_id === shop.id);
  const complaints = state.complaints.filter((c) => c.shop_id === shop.id);
  const times = [...bills.map((b) => b.updated_at), ...complaints.map((c) => c.updated_at), ...logins.map((l) => l.last_sign_in_at ?? "")].filter(Boolean);
  return {
    ...shop,
    owner_user_id: owner?.user_id ?? null,
    owner_name: owner?.full_name ?? "",
    owner_email: owner?.email ?? "",
    owner_confirmed: !!owner?.email_confirmed_at,
    logins: logins.length,
    bills: bills.length,
    complaints: complaints.length,
    total_billed: bills.reduce((a, b) => a + b.grand_total, 0),
    last_activity: times.length ? times.sort().at(-1)! : null,
  };
}

function page<T>(rows: T[], n: number): Page<T> {
  return { rows: rows.slice(n * PAGE_SIZE, (n + 1) * PAGE_SIZE), total: rows.length };
}

function matches(search: string, row: { customer_name: string; phone: string; vehicle_reg_key: string }): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  const key = regKey(search);
  const digits = search.replace(/\D/g, "");
  return (
    row.customer_name.toLowerCase().includes(q) ||
    (key !== "" && row.vehicle_reg_key.includes(key)) ||
    (digits.length >= 3 && row.phone.replace(/\D/g, "").includes(digits))
  );
}

const byNewest = <T extends { created_at: string }>(a: T, b: T) => b.created_at.localeCompare(a.created_at);

export function createDemoApi(): AdminApi {
  const state = build();
  const monthOf = (isoDate: string) => isoDate.slice(0, 7);

  const log = (action: AuditAction, shopId: string, target: string, details: Record<string, unknown> = {}) => {
    const shop = state.shops.find((s) => s.id === shopId);
    state.audit.unshift({
      id: state.audit.length + 1,
      created_at: new Date().toISOString(),
      admin_email: "demo-admin@skyeautomotives.in",
      action,
      shop_id: shopId,
      shop_name: shop?.shop_name ?? "",
      target_label: target,
      details,
    });
  };

  return {
    async isPlatformAdmin() {
      return true;
    },

    async overview(): Promise<AdminOverview> {
      await pause();
      const now = Date.now();
      const since = iso(now - 30 * DAY);
      const active = new Set(
        [...state.bills, ...state.complaints].filter((x) => x.updated_at >= since).map((x) => x.shop_id),
      );
      const by_month: MonthStats[] = [];
      const d = new Date();
      for (let i = 11; i >= 0; i--) {
        const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
        const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`;
        const bills = state.bills.filter((b) => monthOf(b.date_received) === key);
        by_month.push({
          month: key,
          signups: state.shops.filter((s) => monthOf(s.created_at) === key).length,
          bills: bills.length,
          billed: bills.reduce((a, b) => a + b.grand_total, 0),
        });
      }
      const since30 = day(now - 29 * DAY);
      return {
        workshops: state.shops.length,
        suspended: state.shops.filter((s) => s.suspended_at).length,
        active_30d: active.size,
        new_30d: state.shops.filter((s) => s.created_at >= since).length,
        logins: state.logins.length,
        bills: state.bills.length,
        complaints: state.complaints.length,
        open_complaints: state.complaints.filter((c) => c.status === "open").length,
        total_billed: state.bills.reduce((a, b) => a + b.grand_total, 0),
        billed_30d: state.bills.filter((b) => b.date_received >= since30).reduce((a, b) => a + b.grand_total, 0),
        by_month,
      };
    },

    async shops(search) {
      await pause();
      const q = (search ?? "").trim().toLowerCase();
      const digits = (search ?? "").replace(/\D/g, "");
      return state.shops
        .map((s) => summary(state, s))
        .filter(
          (s) =>
            !q ||
            s.shop_name.toLowerCase().includes(q) ||
            s.owner_name.toLowerCase().includes(q) ||
            s.owner_email.toLowerCase().includes(q) ||
            (digits.length >= 3 && (s.phone ?? "").replace(/\D/g, "").includes(digits)),
        )
        .sort(byNewest);
    },

    async shop(id) {
      await pause();
      const s = state.shops.find((x) => x.id === id);
      return s ? summary(state, s) : null;
    },

    async logins(shopId) {
      await pause();
      return state.logins
        .filter((l) => l.shop_id === shopId)
        .sort((a, b) => (a.role === b.role ? a.created_at.localeCompare(b.created_at) : a.role === "owner" ? -1 : 1))
        .map(({ shop_id: _s, ...l }) => l);
    },

    async bills(shopId, search, n) {
      await pause();
      const rows = state.bills
        .filter((b) => b.shop_id === shopId && matches(search, b))
        .sort((a, b) => b.date_received.localeCompare(a.date_received) || b.bill_number! - a.bill_number!)
        .map((b) => ({
          id: b.id,
          bill_number: b.bill_number!,
          customer_name: b.customer_name,
          phone: b.phone,
          vehicle_reg: b.vehicle_reg,
          date_received: b.date_received,
          delivered_on: b.delivered_on,
          grand_total: b.grand_total,
          created_at: b.created_at,
        }));
      return page(rows, n);
    },

    async bill(id) {
      await pause();
      const b = state.bills.find((x) => x.id === id);
      if (!b) return null;
      const { complaint_ids, ...rest } = b;
      return {
        ...rest,
        complaints: state.complaints
          .filter((c) => complaint_ids.includes(c.id))
          .map((c) => ({ id: c.id, complaint_number: c.complaint_number, description: c.description, status: c.status, attended_by: c.attended_by, reported_on: c.reported_on })),
      };
    },

    async complaints(shopId, search, status, n) {
      await pause();
      const rows = state.complaints
        .filter((c) => c.shop_id === shopId && (!status || c.status === status) && matches(search, c))
        .sort((a, b) => b.reported_on.localeCompare(a.reported_on) || b.complaint_number! - a.complaint_number!)
        .map((c) => ({
          id: c.id,
          complaint_number: c.complaint_number!,
          customer_name: c.customer_name,
          phone: c.phone,
          vehicle_reg: c.vehicle_reg,
          description: c.description,
          reported_on: c.reported_on,
          attended_by: c.attended_by,
          status: c.status,
          bills: state.bills.filter((b) => b.complaint_ids.includes(c.id)).length,
        }));
      return page(rows, n);
    },

    async complaint(id) {
      await pause();
      const c = state.complaints.find((x) => x.id === id);
      if (!c) return null;
      return {
        ...c,
        bills: state.bills
          .filter((b) => b.complaint_ids.includes(c.id))
          .map((b) => ({ id: b.id, bill_number: b.bill_number, date_received: b.date_received, grand_total: b.grand_total })),
      };
    },

    async audit(shopId, n) {
      await pause();
      return page(state.audit.filter((a) => !shopId || a.shop_id === shopId), n);
    },

    async setSuspended(shopId, suspend, reason) {
      await pause();
      const shop = state.shops.find((s) => s.id === shopId);
      if (!shop) throw new Error("Workshop not found.");
      const why = (reason ?? "").trim();
      if (suspend && !why) throw new Error("Enter a reason for suspending the workshop.");
      shop.suspended_at = suspend ? (shop.suspended_at ?? new Date().toISOString()) : null;
      shop.suspended_reason = suspend ? why : null;
      log(suspend ? "suspend_shop" : "reactivate_shop", shopId, shop.shop_name, suspend ? { reason: why } : {});
    },

    async loginAction(userId, action, password) {
      await pause();
      const login = state.logins.find((l) => l.user_id === userId);
      if (!login) throw new Error("Login not found.");
      const label = `${login.full_name || login.username} (${login.username})`;
      switch (action) {
        case "reset_password":
          if ((password ?? "").length < 8) throw new Error("Password must be at least 8 characters.");
          log("reset_password", login.shop_id, label);
          return;
        case "disable":
          login.banned_until = new Date(Date.now() + 36500 * DAY).toISOString();
          log("disable_login", login.shop_id, label);
          return;
        case "enable":
          login.banned_until = null;
          log("enable_login", login.shop_id, label);
          return;
        case "remove":
          if (login.role === "owner") throw new Error("The owner's login can't be removed. Suspend the workshop instead.");
          state.logins.splice(state.logins.indexOf(login), 1);
          log("remove_login", login.shop_id, label);
          return;
      }
    },
  };
}
