import { afterEach, describe, expect, it } from "vitest";
import en from "./en";
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

describe("translations", () => {
  afterEach(() => setLang("en"));
  const english = leaves(en as unknown as Node);
  const malayalam = leaves(ml as unknown as Node);

  it("has no Malayalam phrase without an English one", () => {
    expect([...malayalam.keys()].filter((k) => !english.has(k))).toEqual([]);
  });

  it("keeps the same {placeholders} and plural forms", () => {
    for (const [k, v] of malayalam) {
      expect(placeholders(v), k).toBe(placeholders(english.get(k)!));
      expect(typeof v, k).toBe(typeof english.get(k));
    }
  });

  it("has no em or en dashes", () => {
    for (const [k, v] of [...english, ...malayalam]) expect(JSON.stringify(v), k).not.toMatch(/[–—]/);
  });

  it("translates, fills in values and counts", () => {
    setLang("ml");
    expect(t("nav.newBill")).toBe("പുതിയ ബിൽ");
    expect(t("dashboard.greeting", { name: "Anu" })).toBe("നമസ്കാരം, Anu");
    expect(tn("dashboard.billCount", 1)).toBe("1 ബിൽ");
    expect(tn("dashboard.billCount", 3)).toBe("3 ബില്ലുകൾ");
    setLang("en");
    expect(tn("dashboard.billCount", 1)).toBe("1 bill");
    expect(tn("dashboard.billCount", 1200)).toBe("1,200 bills");
  });

  it("falls back to English for a phrase not translated yet", () => {
    setLang("hi");
    expect(t("nav.newBill")).toBe("New bill");
  });
});
