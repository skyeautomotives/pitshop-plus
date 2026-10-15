import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configError =
  !url || !anonKey || url.includes("your-project-ref")
    ? "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Fill in .env with your project's public values, then restart the dev server."
    : null;

// "Remember me": the sign-in is kept in localStorage (survives closing the
// browser) when ticked, otherwise in sessionStorage (ends with the browser session).
const REMEMBER_KEY = "workshop-billing:remember";
const EMAIL_KEY = "workshop-billing:email";

export function isRemembered(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) !== "0";
  } catch {
    return true;
  }
}

/** Call before signing in. Also saves or forgets the email used to sign in. */
export function setRememberMe(remember: boolean, email: string) {
  try {
    localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
    if (remember) localStorage.setItem(EMAIL_KEY, email);
    else localStorage.removeItem(EMAIL_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function rememberedEmail(): string {
  try {
    return localStorage.getItem(EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

export const sessionStore = {
  getItem(key: string) {
    try {
      return localStorage.getItem(key) ?? sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string) {
    try {
      const [keep, drop] = isRemembered() ? [localStorage, sessionStorage] : [sessionStorage, localStorage];
      keep.setItem(key, value);
      drop.removeItem(key);
    } catch {
      /* storage unavailable */
    }
  },
  removeItem(key: string) {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {
      /* storage unavailable */
    }
  },
};

// Only the public (anon / publishable) key is used in the browser.
// All authorization is enforced by Row Level Security.
// Development only: `window.__pitstopOffline = true` makes every request fail like a lost
// connection, to try offline mode without unplugging. Not included in released builds.
const devFetch: typeof fetch | undefined = import.meta.env.DEV
  ? (input, init) =>
      (window as unknown as { __pitstopOffline?: boolean }).__pitstopOffline
        ? Promise.reject(new TypeError("Failed to fetch"))
        : fetch(input, init)
  : undefined;

export const supabase = createClient(url ?? "http://localhost", anonKey ?? "missing", {
  auth: { persistSession: true, autoRefreshToken: true, storage: sessionStore },
  ...(devFetch ? { global: { fetch: devFetch } } : {}),
});

/** Turns Supabase/Postgres errors into short, readable messages. */
export function errorMessage(err: unknown): string {
  if (!err) return "Something went wrong.";
  const e = err as { message?: string; code?: string };
  if (e.message?.includes("Failed to fetch")) return "Network error. Check your internet connection and try again.";
  if (e.message === "Invalid login credentials") return "Wrong username or password.";
  // Messages raised by save_bill() are already written for staff.
  if (e.code === "22023" || e.code === "P0002" || e.code === "42501") return e.message || "Something went wrong.";
  if (e.code === "23514") return "Some details are not valid. Check the highlighted fields and try again.";
  if (e.code === "PGRST202" || e.code === "PGRST205")
    return "The database isn't set up yet. Run the SQL in supabase/migrations (see README).";
  return e.message || "Something went wrong.";
}
