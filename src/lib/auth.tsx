import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { deleteLocalDb, localDb, localUserId } from "./local/db";
import { forgetMe } from "./staff";
import { supabase } from "./supabase";
import { isNetworkError, startSync, stopSync } from "./sync";

interface AuthState {
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ session: null, loading: true });

/**
 * The sign-in saved on this device. Used when the app opens offline after the hourly
 * sign-in renewal couldn't reach the server; it is renewed once the connection is back.
 */
function savedSession(): Session | null {
  for (const store of [localStorage, sessionStorage]) {
    try {
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (!key || !/^sb-.+-auth-token$/.test(key)) continue;
        const value = JSON.parse(store.getItem(key) ?? "null");
        if (value?.user?.id && value?.access_token) return value as Session;
      }
    } catch {
      /* storage unavailable */
    }
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true });

  useEffect(() => {
    // Open this login's data on the device and start syncing before any page reads it.
    const apply = (session: Session | null) => {
      if (session) startSync(session.user.id);
      else stopSync();
      setState({ session, loading: false });
    };
    supabase.auth.getSession().then(({ data, error }) => {
      // Offline with an expired sign-in: keep working with the saved one.
      if (!data.session && error && isNetworkError(error)) apply(savedSession());
      else apply(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session && event === "INITIAL_SESSION" && !navigator.onLine) apply(savedSession());
      else apply(session);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

/**
 * Signs out and removes this login's data from the device. If changes made offline
 * haven't been sent yet, asks first, because signing out would lose them.
 */
export async function signOut(): Promise<void> {
  const userId = localUserId();
  if (userId) {
    const waiting = await localDb().outbox.count();
    if (
      waiting > 0 &&
      !window.confirm(
        `${waiting} ${waiting === 1 ? "change hasn't" : "changes haven't"} been sent to the server yet. ` +
          "If you sign out now they will be lost. Connect to the internet first to send them.\n\nSign out anyway?",
      )
    )
      return;
    stopSync();
    await deleteLocalDb();
    forgetMe(userId);
  }
  await supabase.auth.signOut(navigator.onLine ? undefined : { scope: "local" });
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/** Renders children only for signed-in staff; everyone else goes to the login page. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p className="page-status">Loading…</p>;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}
