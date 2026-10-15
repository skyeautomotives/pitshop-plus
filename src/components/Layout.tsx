import { NavLink, Outlet } from "react-router";
import { useShopSettings } from "../lib/shopSettings";
import { useMe } from "../lib/staff";
import { supabase } from "../lib/supabase";
import Logo from "./Logo";

export default function Layout() {
  const { settings, error } = useShopSettings();
  const me = useMe();
  const signOut = () => void supabase.auth.signOut();

  if (me.status === "loading") return <p className="page-status">Loading…</p>;
  if (me.status !== "ok") {
    return (
      <main className="login">
        <div className="card login-card">
          <div className="login-brand">
            <img src={`${import.meta.env.BASE_URL}pitstop-plus.svg`} alt="Pitstop Plus" className="login-logo" />
          </div>
          {me.status === "not-staff" ? (
            <p>Your login isn't on the workshop's staff list yet. Ask the owner to add you in Settings.</p>
          ) : (
            <div className="alert alert-error" role="alert">
              Couldn't check your login. {me.message}
            </div>
          )}
          <button type="button" className="btn btn-outline btn-block" onClick={signOut}>
            Sign out
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="app">
      <header className="topbar no-print">
        <div className="topbar-inner">
          <NavLink to="/dashboard" className="brand">
            <Logo size={30} />
            <span>{settings?.shop_name || "Workshop Billing"}</span>
          </NavLink>
          <nav className="nav">
            <NavLink to="/dashboard" end>
              Dashboard
            </NavLink>
            <NavLink to="/complaints/new">New complaint</NavLink>
            <NavLink to="/bills/new">New bill</NavLink>
            <NavLink to="/complaints" end>
              Complaints
            </NavLink>
            <NavLink to="/bills" end>
              Find bills
            </NavLink>
            {me.me.role === "owner" && <NavLink to="/reports">Reports</NavLink>}
            {me.me.role === "owner" && <NavLink to="/settings">Settings</NavLink>}
            <button type="button" className="link-button" onClick={signOut}>
              Sign out
            </button>
          </nav>
        </div>
      </header>
      <main className="container">
        {error && (
          <div className="alert alert-error no-print" role="alert">
            Couldn't load shop settings: {error}
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
