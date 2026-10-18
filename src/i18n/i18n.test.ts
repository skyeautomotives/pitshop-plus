import { afterEach, describe, expect, it } from "vitest";
import en from "./en";
import gu from "./gu";
import ta from "./ta";
import te from "./te";
import mr from "./mr";
import bn from "./bn";
import hi from "./hi";
import ml from "./ml";
import { setLang, t, tn } from ".";

type Node = string | { [k: string]: Node };

function leaves(node: Node, prefix = ""): Map<string, Node> {
  const out = new Map<string, Node>();
  if (typeof node === "string") return out.set(prefix, node);
  const isPlural = "one" in node && "other" in node && typeof node.one === "string";
  if (isPlural) return out.set(prefix, node);
  for (const [k, v] of Object.entries(node)) for (const [p, x] of leaves(v, prefix ? `${prefix}.${k}` : k)) out.set(p, x);
  return out;
}

const placeholders = (n: Node) => [...JSON.stringify(n).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
const dashes = new RegExp("[\\u2013\\u2014]");
const english = leaves(en as unknown as Node);

describe.each([
  ["Malayalam", ml],
  ["Hindi", hi],
  ["Bengali", bn],
  ["Marathi", mr],
  ["Telugu", te],
  ["Tamil", ta],
  ["Gujarati", gu],
])("%s", (_name, bundle) => {
  const translated = leaves(bundle as unknown as Node);

  it("translates every phrase, and nothing extra", () => {
    expect([...english.keys()].filter((k) => !translated.has(k))).toEqual([]);
    expect([...translated.keys()].filter((k) => !english.has(k))).toEqual([]);
  });

  it("keeps the same {placeholders} and plural forms", () => {
    for (const [k, v] of translated) {
      expect(placeholders(v), k).toBe(placeholders(english.get(k)!));
      expect(typeof v, k).toBe(typeof english.get(k));
    }
  });

  it("has no em or en dashes", () => {
    for (const [k, v] of translated) expect(JSON.stringify(v), k).not.toMatch(dashes);
  });
});

describe("t and tn", () => {
  afterEach(() => setLang("en"));

  it("has no em or en dashes in English", () => {
    for (const [k, v] of english) expect(JSON.stringify(v), k).not.toMatch(dashes);
  });

  it("translates, fills in values and counts", () => {
    setLang("ml");
    expect(t("nav.newBill")).toBe("പുതിയ ബിൽ");
    expect(t("dashboard.greeting", { name: "Anu" })).toBe("നമസ്കാരം, Anu");
    expect(tn("dashboard.billCount", 1)).toBe("1 ബിൽ");
    expect(tn("dashboard.billCount", 3)).toBe("3 ബില്ലുകൾ");
    setLang("hi");
    expect(t("nav.newBill")).toBe("नया बिल");
    expect(tn("lists.complaintCount", 1)).toBe("1 शिकायत");
    expect(tn("lists.complaintCount", 4)).toBe("4 शिकायतें");
    setLang("en");
    expect(tn("dashboard.billCount", 1)).toBe("1 bill");
    expect(tn("dashboard.billCount", 1200)).toBe("1,200 bills");
  });

  it("can use another language for one phrase (customer documents)", () => {
    setLang("ml");
    expect(t("doc.invoice", undefined, "hi")).toBe("इनवॉइस");
    expect(t("doc.invoice", undefined, "en")).toBe("Invoice");
  });
});
