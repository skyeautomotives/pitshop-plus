import { DENSITIES, TEXT_SIZES, useDisplay } from "../lib/display";
import { useT } from "../i18n";
import { LANGUAGES, useLang } from "../i18n";

/** Settings > Display: text size and spacing for this device. */
export default function DisplaySection() {
  const [prefs, setPrefs] = useDisplay();
  const [lang, setLang] = useLang();
  const { t } = useT();
  return (
    <section className="card">
      <h2>{t("display.title")}</h2>
      <p className="hint">{t("display.hint")}</p>

      <div className="field">
        <span className="label-like" id="language-label">
          {lang === "en" ? "Language / ഭാഷ / भाषा" : `${t("display.language")} / Language`}
        </span>
        <div className="display-options" role="radiogroup" aria-labelledby="language-label">
          {LANGUAGES.filter((l) => l.ready).map((l) => (
            <button
              key={l.id}
              type="button"
              role="radio"
              lang={l.id}
              aria-checked={lang === l.id}
              className={`chip${lang === l.id ? " chip-active" : ""}`}
              onClick={() => setLang(l.id)}
            >
              {l.native}
            </button>
          ))}
        </div>
        {lang !== "en" && <p className="hint">{t("display.partial")}</p>}
      </div>

      <div className="field">
        <span className="label-like" id="text-size-label">
          {t("display.textSize")}
        </span>
        <div className="display-options" role="radiogroup" aria-labelledby="text-size-label">
          {TEXT_SIZES.map((x) => (
            <button
              key={x.id}
              type="button"
              role="radio"
              aria-checked={prefs.textSize === x.id}
              className={`chip${prefs.textSize === x.id ? " chip-active" : ""}`}
              onClick={() => setPrefs({ ...prefs, textSize: x.id })}
            >
              {t(x.label)}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="label-like" id="density-label">
          {t("display.spacing")}
        </span>
        <div className="display-options" role="radiogroup" aria-labelledby="density-label">
          {DENSITIES.map((d) => (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={prefs.density === d.id}
              title={t(d.hint)}
              className={`chip${prefs.density === d.id ? " chip-active" : ""}`}
              onClick={() => setPrefs({ ...prefs, density: d.id })}
            >
              {t(d.label)}
            </button>
          ))}
        </div>
        <p className="hint">{t(DENSITIES.find((d) => d.id === prefs.density)!.hint)}</p>
      </div>

      <div className="display-preview" aria-hidden="true">
        <strong>Bill #128 · Ravi Kumar</strong>
        <br />
        KL 39 W 0890 · Engine oil, brake pads · ₹2,318
      </div>

      {(prefs.textSize !== "normal" || prefs.density !== "comfortable") && (
        <button
          type="button"
          className="link-button display-reset"
          onClick={() => setPrefs({ textSize: "normal", density: "comfortable" })}
        >
          {t("display.reset")}
        </button>
      )}
    </section>
  );
}
