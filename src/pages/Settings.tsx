import { useEffect, useState, type FormEvent } from "react";
import { Navigate, NavLink, useParams } from "react-router";
import { Field, fieldProps } from "../components/fields";
import StaffSection from "../components/StaffSection";
import { updateShopSettings } from "../lib/api";
import { useShopSettings } from "../lib/shopSettings";
import { useIsOwner, useMe } from "../lib/staff";
import { errorMessage } from "../lib/supabase";
import type { ShopSettings } from "../lib/types";

/** Settings are grouped; each sub-group is its own page at /settings/<id>. */
const GROUPS = [
  {
    label: "Workshop",
    items: [
      { id: "shop", label: "Shop details", hint: "Name, address and phone on bills" },
      { id: "billing", label: "Billing rules", hint: "Labour charge rules" },
    ],
  },
  {
    label: "Staff",
    items: [
      { id: "staff", label: "Staff logins", hint: "Names, usernames, passwords" },
      { id: "add-staff", label: "Add a login", hint: "Give someone access" },
    ],
  },
] as const;

type SectionId = (typeof GROUPS)[number]["items"][number]["id"];
const SECTION_IDS = GROUPS.flatMap((g) => g.items.map((i) => i.id)) as SectionId[];

export default function Settings() {
  const me = useMe();
  const isOwner = useIsOwner();
  const { section } = useParams();

  if (me.status === "loading") return <p className="page-status">Loading…</p>;
  if (!isOwner)
    return (
      <div className="empty">
        <h1>Settings</h1>
        <p>Only the workshop owner can change settings and manage logins.</p>
      </div>
    );
  if (!section || !SECTION_IDS.includes(section as SectionId)) return <Navigate to="/settings/shop" replace />;
  const current = section as SectionId;

  return (
    <div>
      <h1>Settings</h1>
      <div className="settings-layout">
        <nav className="settings-nav card" aria-label="Settings sections">
          {GROUPS.map((g) => (
            <div key={g.label} className="settings-group">
              <p className="settings-group-label">{g.label}</p>
              <ul>
                {g.items.map((item) => (
                  <li key={item.id}>
                    <NavLink to={`/settings/${item.id}`} className="settings-link">
                      <span>{item.label}</span>
                      <small>{item.hint}</small>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="settings-content">
          {current === "shop" && <ShopSettingsForm part="shop" />}
          {current === "billing" && <ShopSettingsForm part="billing" />}
          {current === "staff" && <StaffSection show="list" />}
          {current === "add-staff" && <StaffSection show="add" />}
        </div>
      </div>
    </div>
  );
}

/** Shop details or billing rules: the same settings row, edited one part at a time. */
function ShopSettingsForm({ part }: { part: "shop" | "billing" }) {
  const { settings, reload } = useShopSettings();
  const [form, setForm] = useState<ShopSettings | null>(settings);
  const [nameError, setNameError] = useState<string | undefined>();
  const [status, setStatus] = useState<{ kind: "saved" } | { kind: "error"; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings && !form) setForm(settings);
  }, [settings, form]);

  if (!form) return <p className="page-status">Loading settings…</p>;

  const update = (patch: Partial<ShopSettings>) => {
    setForm({ ...form, ...patch });
    setStatus(null);
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const shopName = form.shop_name.trim();
    if (!shopName) {
      setNameError("Enter the workshop name.");
      document.getElementById("f-shopName")?.focus();
      return;
    }
    setNameError(undefined);
    setSaving(true);
    try {
      await updateShopSettings({
        shop_name: shopName,
        address: form.address?.trim() || null,
        phone: form.phone?.trim() || null,
        allow_zero_labour: form.allow_zero_labour,
      });
      await reload();
      setStatus({ kind: "saved" });
    } catch (err) {
      setStatus({ kind: "error", message: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {part === "shop" ? (
        <section className="card">
          <h2>Shop details</h2>
          <p className="hint">Printed at the top of every bill and included in WhatsApp messages.</p>
          <Field fieldKey="shopName" label="Workshop name" required error={nameError}>
            <input
              {...fieldProps("shopName", nameError)}
              type="text"
              value={form.shop_name}
              onChange={(e) => update({ shop_name: e.target.value })}
            />
          </Field>
          <Field fieldKey="shopAddress" label="Address">
            <textarea
              id="f-shopAddress"
              rows={2}
              value={form.address ?? ""}
              onChange={(e) => update({ address: e.target.value })}
            />
          </Field>
          <Field fieldKey="shopPhone" label="Phone">
            <input id="f-shopPhone" type="tel" value={form.phone ?? ""} onChange={(e) => update({ phone: e.target.value })} />
          </Field>
          <SaveRow saving={saving} status={status} />
        </section>
      ) : (
        <section className="card">
          <h2>Billing rules</h2>
          <label className="check">
            <input
              type="checkbox"
              checked={form.allow_zero_labour}
              onChange={(e) => update({ allow_zero_labour: e.target.checked })}
            />
            Allow bills with a labour charge of ₹0
          </label>
          <p className="hint">When this is off, every bill needs a labour charge above ₹0.</p>
          <SaveRow saving={saving} status={status} />
        </section>
      )}
    </form>
  );
}

function SaveRow({
  saving,
  status,
}: {
  saving: boolean;
  status: { kind: "saved" } | { kind: "error"; message: string } | null;
}) {
  return (
    <div className="settings-save">
      {status?.kind === "saved" && (
        <div className="alert alert-success" role="status">
          Saved.
        </div>
      )}
      {status?.kind === "error" && (
        <div className="alert alert-error" role="alert">
          Couldn't save. {status.message}
        </div>
      )}
      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
