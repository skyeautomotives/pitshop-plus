import { useEffect, useRef, useState } from "react";
import { LANGUAGES, useLang, useT } from "../i18n";

/** Globe button with the current language; opens the list of languages (like Google's sign-in page). */
export default function LanguageMenu({ className = "" }: { className?: string }) {
  const [lang, setLang] = useLang();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = LANGUAGES.find((l) => l.id === lang) ?? LANGUAGES[0];
  const languages = LANGUAGES.filter((l) => l.ready);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`lang-menu ${className}`} ref={box}>
      <button
        type="button"
        className="lang-menu-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${t("login.language")}: ${current.native}`}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
        </svg>
        <span lang={current.id}>{current.native}</span>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul className="lang-menu-list" role="listbox" aria-label={t("login.language")}>
          {languages.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                role="option"
                aria-selected={l.id === lang}
                className={l.id === lang ? "selected" : ""}
                onClick={() => {
                  setLang(l.id);
                  setOpen(false);
                }}
              >
                <span lang={l.id}>{l.native}</span>
                {l.id !== "en" && <small>{l.english}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
