import { beforeEach, describe, expect, it, vi } from "vitest";

/** Minimal in-memory Web Storage for tests. */
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("sessionStorage", memoryStorage());
});

const load = () => import("./supabase");

describe("remember me", () => {
  it("is on by default and keeps the sign-in after the browser closes", async () => {
    const { isRemembered, sessionStore } = await load();
    expect(isRemembered()).toBe(true);
    sessionStore.setItem("token", "abc");
    expect(localStorage.getItem("token")).toBe("abc");
    expect(sessionStorage.getItem("token")).toBeNull();
  });

  it("when off, keeps the sign-in only for this browser session and forgets the email", async () => {
    const { isRemembered, rememberedEmail, sessionStore, setRememberMe } = await load();
    setRememberMe(true, "staff@example.com");
    sessionStore.setItem("token", "old");
    setRememberMe(false, "staff@example.com");

    sessionStore.setItem("token", "abc");
    expect(isRemembered()).toBe(false);
    expect(sessionStorage.getItem("token")).toBe("abc");
    expect(localStorage.getItem("token")).toBeNull();
    expect(sessionStore.getItem("token")).toBe("abc");
    expect(rememberedEmail()).toBe("");
  });

  it("remembers the email when on", async () => {
    const { rememberedEmail, setRememberMe } = await load();
    setRememberMe(true, "staff@example.com");
    expect(rememberedEmail()).toBe("staff@example.com");
  });

  it("still finds a sign-in saved before this feature existed (no forced sign-out)", async () => {
    localStorage.setItem("sb-ref-auth-token", "existing-session");
    const { sessionStore } = await load();
    expect(sessionStore.getItem("sb-ref-auth-token")).toBe("existing-session");
  });

  it("signing out clears both places", async () => {
    const { sessionStore } = await load();
    localStorage.setItem("token", "a");
    sessionStorage.setItem("token", "b");
    sessionStore.removeItem("token");
    expect(localStorage.getItem("token")).toBeNull();
    expect(sessionStorage.getItem("token")).toBeNull();
  });
});
