import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { RequireAuth, signOut, useAuth } from "../auth";
import { errorMessage } from "../supabase";
import { admin, adminDemo } from "./api";

type AdminCheck = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; isAdmin: boolean };

/** Whether the signed-in login is a Pitstop Plus platform admin. */
export function usePlatformAdmin(): AdminCheck {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [state, setState] = useState<AdminCheck>({ status: "loading" });

  useEffect(() => {
    if (adminDemo) {
      setState({ status: "ok", isAdmin: true });
      return;
    }
    if (!userId) return;
    let cancelled = false;
    setState({ status: "loading" });
    admin((api) => api.isPlatformAdmin())
      .then((isAdmin) => !cancelled && setState({ status: "ok", isAdmin }))
      .catch((err) => !cancelled && setState({ status: "error", message: errorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return state;
}

function AdminCheckGate({ children }: { children: ReactNode }) {
  const check = usePlatformAdmin();
  if (check.status === "loading") return <p className="page-status">Loading…</p>;
  if (check.status === "ok" && check.isAdmin) return <>{children}</>;
  return (
    <main className="login">
      <div className="card login-card">
        <div className="login-brand">
          <img src={`${import.meta.env.BASE_URL}pitstop-plus.svg`} alt="Pitstop Plus" className="login-logo" />
        </div>
        {check.status === "error" ? (
          <div className="alert alert-error" role="alert">
            Couldn't check your access. {check.message}
          </div>
        ) : (
          <p>This area is only for Pitstop Plus admins. Your login doesn't have admin access.</p>
        )}
        <Link to="/dashboard" className="btn btn-primary btn-block">
          Go to the workshop app
        </Link>
        <button type="button" className="btn btn-outline btn-block" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </main>
  );
}

/** Renders children only for signed-in platform admins (anyone in demo mode). */
export function RequirePlatformAdmin({ children }: { children: ReactNode }) {
  if (adminDemo) return <>{children}</>;
  return (
    <RequireAuth>
      <AdminCheckGate>{children}</AdminCheckGate>
    </RequireAuth>
  );
}
