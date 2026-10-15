import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./auth";
import { errorMessage, supabase } from "./supabase";
import type { StaffMember } from "./types";

type MeState =
  | { status: "loading" }
  | { status: "error"; message: string }
  /** Signed in, but not on the workshop's staff list. */
  | { status: "not-staff" }
  | { status: "ok"; me: StaffMember };

const MeContext = createContext<MeState>({ status: "loading" });

const meKey = (userId: string) => `pitstop:me:${userId}`;

/** The signed-in person's staff row as last loaded on this device (lets the app open offline). */
export function cachedMe(userId: string): StaffMember | null {
  try {
    const raw = localStorage.getItem(meKey(userId));
    return raw ? (JSON.parse(raw) as StaffMember) : null;
  } catch {
    return null;
  }
}

function saveMe(userId: string, me: StaffMember | null) {
  try {
    if (me) localStorage.setItem(meKey(userId), JSON.stringify(me));
    else localStorage.removeItem(meKey(userId));
  } catch {
    /* storage unavailable */
  }
}

/** Forgets the saved staff row (on sign-out). */
export function forgetMe(userId: string) {
  saveMe(userId, null);
}

/** Loads the signed-in person's staff row (role and name). */
export function MeProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [state, setState] = useState<MeState>({ status: "loading" });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase
      .from("staff")
      .select("user_id, email, username, full_name, role, created_at")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          // Offline: carry on with the copy saved last time.
          const saved = cachedMe(userId);
          setState(saved ? { status: "ok", me: saved } : { status: "error", message: errorMessage(error) });
        } else {
          saveMe(userId, (data as StaffMember | null) ?? null);
          setState(data ? { status: "ok", me: data as StaffMember } : { status: "not-staff" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return <MeContext.Provider value={state}>{children}</MeContext.Provider>;
}

export function useMe(): MeState {
  return useContext(MeContext);
}

export function useIsOwner(): boolean {
  const me = useMe();
  return me.status === "ok" && me.me.role === "owner";
}
