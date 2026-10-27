import { useEffect, useState, type FormEvent } from "react";
import { useT, type Key } from "../i18n";
import { Navigate, NavLink, useParams } from "react-router";
import { Field, fieldProps } from "../components/fields";
import BackupSection from "../components/BackupSection";
import BrandingSection from "../components/BrandingSection";
import DisplaySection from "../components/DisplaySection";
import StaffSection from "../components/StaffSection";
import VehicleTypeChoice from "../components/VehicleTypeChoice";
import { updateShopSettings } from "../lib/api";
import { useShopSettings } from "../lib/shopSettings";
import { useIsOwner, useMe } from "../lib/staff";
import { errorMessage } from "../lib/supabase";
import type { ShopSettings } from "../lib/types";
import { cleanGstin, isGstin } from "../lib/gst";

/** Settings are grouped; each sub-group is its own page at /settings/<id>. */
const GROUPS = [
  {
    label: "settings.groupWorkshop",
    items: [
      { id: "shop", label: "settings.shopDetails", hint: "settings.shopDetailsHint" },
      { id: "billing", label: "settings.billingRules", hint: "settings.billingRulesHint" },
      { id: "branding", label: "settings.branding", hint: "settings.brandingHint" },
    ],
  },
  {
    label: "settings.groupStaff",
    items: [
      { id: "staff", label: "settings.staffLogins", hint: "settings.staffLoginsHint" },
      { id: "add-staff", label: "settings.addLogin", hint: "settings.addLoginHint" },
    ],
  },
  {
    label: "settings.groupData",
    items: [{ id: "backup", label: "settings.backup", hint: "settings.backupHint" }],
  },
  {
    label: "settings.groupDevice",
    items: [{ id: "display", label: "settings.display", hint: "settings.displayHint" }],
  },
] as const satisfies readonly { label: Key; items: readonly { id: string; label: Key; hint: Key }[] }[];

type SectionId = (typeof GROUPS)[number]["items"][number]["id"];

export default function Settings() {
  const me = useMe();
  const isOwner = useIsOwner();
  const { section } = useParams();
  const { t } = useT();

  if (me.status === "loading") return <p className="page-status">{t("common.loading")}</p>;
  // Staff can change how the app looks on their device; everything else is for the owner.
  const groups = isOwner ? GROUPS : GROUPS.filter((g) => g.label === "settings.groupDevice");
  const allowed = groups.flatMap((g) => g.items.map((i) => i.id)) as SectionId[];
  if (!section || !allowed.includes(section as SectionId)) return <Navigate to={isOwner ? "/settings/shop" : "/settings/display"} replace />;
  const current = section as SectionId;

  return (
    <div>
      <h1>{t("settings.title")}</h1>
      <div className="settings-layout">
        <nav className="settings-nav card" aria-label={t("settings.sections")}>
          {groups.map((g) => (
            <div key={g.label} className="settings-group">
              <p className="settings-group-label">{t(g.label)}</p>
              <ul>
                {g.items.map((item) => (
                  <li key={item.id}>
                    <NavLink to={`/settings/${item.id}`} className="settings-link">
                      <span>{t(item.label)}</span>
                      <small>{t(item.hint)}</small>
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
          {current === "branding" && <BrandingSection />}
          {current === "staff" && <StaffSection show="list" />}
          {current === "add-staff" && <StaffSection show="add" />}
          {current === "backup" && <BackupSection />}
          {current === "display" && <DisplaySection />}
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
  const [gstinError, setGstinError] = useState<string | undefined>();
  const [status, setStatus] = useState<{ kind: "saved" } | { kind: "error"; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const { t } = useT();

  useEffect(() => {
    if (settings && !form) setForm(settings);
  }, [settings, form]);

  if (!form) return <p className="page-status">{t("settings.loadingSettings")}</p>;

  const update = (patch: Partial<ShopSettings>) => {
    setForm({ ...form, ...patch });
    setStatus(null);
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const shopName = form.shop_name.trim();
    if (!shopName) {
      setNameError(t("settings.nameMissing"));
      document.getElementById("f-shopName")?.focus();
      return;
    }
    setNameError(undefined);
    const gstin = form.gstin ? cleanGstin(form.gstin) : "";
    if (form.gst_enabled && !gstin) {
      setGstinError(t("gst.gstinMissing"));
      document.getElementById("f-gstin")?.focus();
      return;
    }
    if (gstin && !isGstin(gstin)) {
      setGstinError(t("gst.gstinInvalid"));
      document.getElementById("f-gstin")?.focus();
      return;
    }
    setGstinError(undefined);
    setSaving(true);
    try {
      await updateShopSettings({
        shop_name: shopName,
        address: form.address?.trim() || null,
        phone: form.phone?.trim() || null,
        allow_zero_labour: form.allow_zero_labour,
        vehicle_type: form.vehicle_type,
        gst_enabled: form.gst_enabled,
        gstin: gstin || null,
        gst_inclusive: form.gst_inclusive,
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
        <div className="shop-details">
        <section className="card">
          <h2>{t("settings.shopDetails")}</h2>
          <p className="hint">{t("settings.shopHint")}</p>
          <div className="field">
            <span className="label-like">{t("settings.workshopType")}</span>
            <VehicleTypeChoice value={form.vehicle_type} onChange={(v) => update({ vehicle_type: v })} />
            <p className="hint">{t("settings.workshopTypeHint")}</p>
          </div>
          <Field fieldKey="shopName" label={t("settings.workshopName")} required error={nameError}>
            <input
              {...fieldProps("shopName", nameError)}
              type="text"
              value={form.shop_name}
              onChange={(e) => update({ shop_name: e.target.value })}
            />
          </Field>
          <Field fieldKey="shopAddress" label={t("settings.address")}>
            <textarea
              id="f-shopAddress"
              rows={2}
              value={form.address ?? ""}
              onChange={(e) => update({ address: e.target.value })}
            />
          </Field>
          <Field fieldKey="shopPhone" label={t("settings.phone")}>
            <input id="f-shopPhone" type="tel" value={form.phone ?? ""} onChange={(e) => update({ phone: e.target.value })} />
          </Field>
          <SaveRow saving={saving} status={status} />
        </section>
        <aside className="card bill-preview" aria-label={t("settings.previewAria")}>
          <p className="bill-preview-label">{t("settings.previewLabel")}</p>
          <div className="bill-preview-paper">
            <div className="bill-preview-head">
              <div>
                <strong>{form.shop_name.trim() || t("settings.yourName")}</strong>
                <span>{form.address?.trim() || t("settings.yourAddress")}</span>
                <span>
                  {form.phone?.trim()
                    ? t("doc.phoneLine", { phone: form.phone.trim() }, "en")
                    : t("settings.yourPhone")}
                </span>
              </div>
              <em>{t("doc.invoice", undefined, "en").toUpperCase()}</em>
            </div>
            <div className="bill-preview-lines" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </div>
        </aside>
        </div>
      ) : (
        <section className="card">
          <h2>{t("settings.billingRules")}</h2>
          <label className="check">
            <input
              type="checkbox"
              checked={form.allow_zero_labour}
              onChange={(e) => update({ allow_zero_labour: e.target.checked })}
            />
            {t("settings.allowZero")}
          </label>
          <p className="hint">{t("settings.allowZeroHint")}</p>

          <h3 className="settings-subhead">{t("gst.title")}</h3>
          <label className="check">
            <input type="checkbox" checked={form.gst_enabled} onChange={(e) => update({ gst_enabled: e.target.checked })} />
            {t("gst.registered")}
          </label>
          <p className="hint">{t("gst.registeredHint")}</p>
          {form.gst_enabled && (
            <>
              <Field fieldKey="gstin" label={t("gst.gstin")} required error={gstinError} hint={t("gst.gstinHint")}>
                <input
                  {...fieldProps("gstin", gstinError)}
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  maxLength={15}
                  className="gstin-input"
                  value={form.gstin ?? ""}
                  onChange={(e) => update({ gstin: e.target.value.toUpperCase() })}
                />
              </Field>
              <div className="field">
                <span className="label-like">{t("gst.pricesTyped")}</span>
                <div className="segmented" role="group" aria-label={t("gst.pricesTyped")}>
                  <button type="button" aria-pressed={!form.gst_inclusive} onClick={() => update({ gst_inclusive: false })}>
                    {t("gst.beforeGst")}
                  </button>
                  <button type="button" aria-pressed={form.gst_inclusive} onClick={() => update({ gst_inclusive: true })}>
                    {t("gst.includingGst")}
                  </button>
                </div>
                <p className="hint">{t("gst.pricesHint")}</p>
              </div>
            </>
          )}
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
  const { t } = useT();
  return (
    <div className="settings-save">
      {status?.kind === "saved" && (
        <div className="alert alert-success" role="status">
          {t("settings.saved")}
        </div>
      )}
      {status?.kind === "error" && (
        <div className="alert alert-error" role="alert">
          {t("settings.saveFailed", { message: status.message })}
        </div>
      )}
      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? t("common.saving") : t("common.save")}
      </button>
    </div>
  );
}
