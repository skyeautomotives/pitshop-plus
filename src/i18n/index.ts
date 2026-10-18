// App languages. English (en.ts) is the master list; other languages may leave
// phrases out while they are being translated, and those show in English.
import { createContext, createElement, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import en from "./en";
import hi from "./hi";
import ml from "./ml";

export type Lang = "en" | "ml" | "hi";

export const LANGUAGES: { id: Lang; native: string; english: string; ready: boolean }[] = [
  { id: "en", native: "English", english: "English", ready: true },
  { id: "ml", native: "മലയാളം", english: "Malayalam", ready: true },
  { id: "hi", native: "हिन्दी", english: "Hindi", ready: true },
];

/** A phrase that changes with a count, e.g. "1 bill" / "3 bills". */
export interface Plural {
  one: string;
  other: string;
}

type Tree = { [key: string]: string | Plural | Tree };
type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? string : T[K] extends Plural ? Plural : DeepPartial<T[K]> };
export type Messages = typeof en;
export type Translation = DeepPartial<Messages>;

type Keys<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : T[K] extends Plural ? never : Keys<T[K], `${P}${K}.`>;
}[keyof T & string];
type PluralKeys<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? never : T[K] extends Plural ? `${P}${K}` : PluralKeys<T[K], `${P}${K}.`>;
}[keyof T & string];
export type Key = Keys<Messages>;
export type PluralKey = PluralKeys<Messages>;

const BUNDLES: Partial<Record<Lang, Tree>> = { en: en as unknown as Tree, ml: ml as unknown as Tree, hi: hi as unknown as Tree };
const LOCALES: Record<Lang, string> = { en: "en-IN", ml: "ml-IN", hi: "hi-IN" };
const STORE_KEY = "pitstop:lang";

function lookup(tree: Tree | undefined, key: string): string | Plural | undefined {
  let node: string | Plural | Tree | undefined = tree;
  for (const part of key.split(".")) {
    if (!node || typeof node === "string") return undefined;
    node = (node as Tree)[part];
  }
  return node as string | Plural | undefined;
}

function fill(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORE_KEY) as Lang | null;
    if (saved && LANGUAGES.some((l) => l.id === saved && l.ready)) return saved;
  } catch {
    /* storage unavailable */
  }
  return "en";
}

let current: Lang = initialLang();
const listeners = new Set<(l: Lang) => void>();

export function getLang(): Lang {
  return current;
}

/** The locale for dates in the current language, e.g. "ml-IN". */
export function locale(lang: Lang = current): string {
  return LOCALES[lang];
}

/** Translates a phrase. `{name}` placeholders are filled from `vars`. */
export function t(key: Key, vars?: Record<string, string | number>, lang: Lang = current): string {
  const found = lookup(BUNDLES[lang], key) ?? lookup(BUNDLES.en, key);
  return fill(typeof found === "string" ? found : key, vars);
}

/** A phrase with a count: tn("bills.count", 3) -> "3 bills". `{n}` is the count. */
export function tn(key: PluralKey, n: number, vars?: Record<string, string | number>, lang: Lang = current): string {
  const found = (lookup(BUNDLES[lang], key) ?? lookup(BUNDLES.en, key)) as Plural | undefined;
  if (!found || typeof found === "string") return String(n);
  const rule = new Intl.PluralRules(LOCALES[lang]).select(n) === "one" ? found.one : found.other;
  return fill(rule, { n: n.toLocaleString("en-IN"), ...vars });
}

export function setLang(lang: Lang) {
  current = lang;
  try {
    localStorage.setItem(STORE_KEY, lang);
  } catch {
    /* storage unavailable */
  }
  if (typeof document !== "undefined") document.documentElement.lang = lang;
  listeners.forEach((fn) => fn(lang));
}

const LangContext = createContext<Lang>(current);

/** Re-renders the app when the language changes. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setState] = useState(current);
  useEffect(() => {
    document.documentElement.lang = current;
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return createElement(LangContext.Provider, { value: lang }, children);
}

/** The current language, and re-render when it changes. Use in components that show text. */
export function useLang(): [Lang, (l: Lang) => void] {
  const lang = useContext(LangContext);
  const change = useCallback((l: Lang) => setLang(l), []);
  return [lang, change];
}

/** `t` for components: re-renders them when the language changes. */
export function useT() {
  useContext(LangContext);
  return { t, tn };
}
