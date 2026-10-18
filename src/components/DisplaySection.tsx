import { DENSITIES, TEXT_SIZES, useDisplay } from "../lib/display";
import { LANGUAGES, useLang } from "../i18n";

/** Settings > Display: text size and spacing for this device. */
export default function DisplaySection() {
  const [prefs, setPrefs] = useDisplay();
  const [lang, setLang] = useLang();
  return (
    <section className="card">
      <h2>Display</h2>
      <p className="hint">These choices are saved on this device only. Each phone or computer can have its own.</p>

      <div className="field">
        <span className="label-like" id="language-label">
          Language / ഭാഷ / भाषा
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
        {lang !== "en" && <p className="hint">Some screens are still in English while they are being translated.</p>}
      </div>

      <div className="field">
        <span className="label-like" id="text-size-label">
          Text size
        </span>
        <div className="display-options" role="radiogroup" aria-labelledby="text-size-label">
          {TEXT_SIZES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={prefs.textSize === t.id}
              className={`chip${prefs.textSize === t.id ? " chip-active" : ""}`}
              onClick={() => setPrefs({ ...prefs, textSize: t.id })}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="label-like" id="density-label">
          Spacing
        </span>
        <div className="display-options" role="radiogroup" aria-labelledby="density-label">
          {DENSITIES.map((d) => (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={prefs.density === d.id}
              title={d.hint}
              className={`chip${prefs.density === d.id ? " chip-active" : ""}`}
              onClick={() => setPrefs({ ...prefs, density: d.id })}
            >
              {d.label}
            </button>
          ))}
        </div>
        <p className="hint">{DENSITIES.find((d) => d.id === prefs.density)!.hint}.</p>
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
          Back to normal
        </button>
      )}
    </section>
  );
}
