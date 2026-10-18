import { LANGUAGES, useLang, useT } from "../i18n";

/** "English | മലയാളം": pick the app language (saved on this device). */
export default function LanguageSwitch() {
  const [lang, setLang] = useLang();
  const { t } = useT();
  return (
    <div className="lang-switch" role="radiogroup" aria-label={t("login.language")}>
      {LANGUAGES.filter((l) => l.ready).map((l) => (
        <button
          key={l.id}
          type="button"
          role="radio"
          lang={l.id}
          aria-checked={lang === l.id}
          className={lang === l.id ? "active" : ""}
          onClick={() => setLang(l.id)}
        >
          {l.native}
        </button>
      ))}
    </div>
  );
}
