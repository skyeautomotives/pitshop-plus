import { useState, type ChangeEvent } from "react";
import { useT } from "../i18n";
import { updateShopBranding } from "../lib/api";
import { pictureFromFile } from "../lib/pictures";
import { useShopSettings } from "../lib/shopSettings";
import { errorMessage } from "../lib/supabase";
import SignaturePad from "./SignaturePad";

type Which = "logo" | "signature";
const SIZE: Record<Which, [number, number]> = { logo: [480, 240], signature: [500, 160] };

/** Owner settings: the workshop logo and signature printed on bills and job cards. */
export default function BrandingSection() {
  const { settings, reload } = useShopSettings();
  const { t } = useT();
  const [busy, setBusy] = useState<Which | null>(null);
  const [status, setStatus] = useState<{ kind: "saved" } | { kind: "error"; message: string } | null>(null);
  const [drawing, setDrawing] = useState(false);

  async function save(which: Which, value: string | null) {
    setBusy(which);
    setStatus(null);
    try {
      await updateShopBranding(which === "logo" ? { logo: value } : { signature: value });
      await reload();
      setStatus({ kind: "saved" });
    } catch (err) {
      setStatus({ kind: "error", message: t("settings.brandingFailed", { message: errorMessage(err) }) });
    } finally {
      setBusy(null);
    }
  }

  async function onFile(which: Which, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    let picture: string;
    try {
      picture = await pictureFromFile(file, ...SIZE[which]);
    } catch {
      setStatus({ kind: "error", message: t("settings.imageInvalid") });
      return;
    }
    await save(which, picture);
  }

  if (!settings) return <p className="page-status">{t("settings.loadingSettings")}</p>;

  return (
    <section className="card branding">
      <h2>{t("settings.branding")}</h2>
      {status?.kind === "saved" && (
        <div className="alert alert-success" role="status">
          {t("settings.brandingSaved")}
        </div>
      )}
      {status?.kind === "error" && (
        <div className="alert alert-error" role="alert">
          {status.message}
        </div>
      )}

      <div className="branding-item">
        <h3>{t("settings.logo")}</h3>
        <p className="hint">{t("settings.logoHint")}</p>
        <div className="branding-preview">
          {settings.logo ? <img src={settings.logo} alt={t("settings.logo")} /> : <span className="muted">{t("settings.noLogo")}</span>}
        </div>
        <div className="branding-actions">
          <label className="btn btn-outline">
            {busy === "logo" ? t("settings.savingPicture") : settings.logo ? t("settings.changeLogo") : t("settings.uploadLogo")}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy !== null} onChange={(e) => void onFile("logo", e)} />
          </label>
          {settings.logo && (
            <button type="button" className="btn btn-outline" disabled={busy !== null} onClick={() => void save("logo", null)}>
              {t("settings.removePicture")}
            </button>
          )}
        </div>
      </div>

      <div className="branding-item">
        <h3>{t("settings.signature")}</h3>
        <p className="hint">{t("settings.signatureHint")}</p>
        {drawing ? (
          <SignaturePad
            onCancel={() => setDrawing(false)}
            onDone={(picture) => {
              setDrawing(false);
              void save("signature", picture);
            }}
          />
        ) : (
          <>
            <div className="branding-preview">
              {settings.signature ? (
                <img src={settings.signature} alt={t("settings.signature")} />
              ) : (
                <span className="muted">{t("settings.noSignature")}</span>
              )}
            </div>
            <div className="branding-actions">
              <button type="button" className="btn btn-outline" disabled={busy !== null} onClick={() => setDrawing(true)}>
                {t("settings.drawSignature")}
              </button>
              <label className="btn btn-outline">
                {busy === "signature" ? t("settings.savingPicture") : t("settings.uploadSignature")}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy !== null} onChange={(e) => void onFile("signature", e)} />
              </label>
              {settings.signature && (
                <button type="button" className="btn btn-outline" disabled={busy !== null} onClick={() => void save("signature", null)}>
                  {t("settings.removePicture")}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
