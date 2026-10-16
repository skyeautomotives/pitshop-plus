import { NavLink, Outlet } from "react-router";
import { signOut, useAuth } from "../../lib/auth";
import { adminDemo } from "../../lib/admin/api";

const ICON = {
  overview: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  workshops: "M3 10l9-6 9 6M5 9v11h14V9M9 20v-6h6v6",
  activity: "M4 6h16M4 12h10M4 18h7M18 15v6M15 18h6",
  billing: "M3 7h18v10H3zM3 10h18M7 14h4",
  signOut: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
};

function Icon({ name }: { name: keyof typeof ICON }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON[name]} />
    </svg>
  );
}

/** Frame of the platform admin panel: its own sidebar (wide screens) and top bar (phones). */
export default function AdminLayout() {
  const { session } = useAuth();
  const email = adminDemo ? "demo-admin@skyeautomotives.in" : (session?.user.email ?? "");

  return (
    <div className="app admin-app">
      <aside className="sidebar no-print">
        <NavLink to="/admin" className="sidebar-logo" aria-label="Admin overview">
          <img src={`${import.meta.env.BASE_URL}pitstop-plus-dark.svg`} alt="Pitstop Plus" />
        </NavLink>
        <div className="sidebar-shop admin-badge">Platform admin</div>
        <nav className="sidebar-nav">
          <NavLink to="/admin" end>
            <Icon name="overview" /> Overview
          </NavLink>
          <NavLink to="/admin/workshops">
            <Icon name="workshops" /> Workshops
          </NavLink>
          <NavLink to="/admin/billing">
            <Icon name="billing" /> Billing
          </NavLink>
          <NavLink to="/admin/activity">
            <Icon name="activity" /> Activity log
          </NavLink>
        </nav>
        {adminDemo && <p className="sidebar-version admin-demo-note">Demo mode · sample data</p>}
        <div className="sidebar-user">
          <div className="sidebar-avatar" aria-hidden="true">
            {(email || "?").charAt(0).toUpperCase()}
          </div>
          <div className="sidebar-who">
            <strong title={email}>{email}</strong>
            <span>Admin</span>
          </div>
          {!adminDemo && (
            <button type="button" className="sidebar-signout" onClick={() => void signOut()} title="Sign out" aria-label="Sign out">
              <Icon name="signOut" />
            </button>
          )}
        </div>
      </aside>

      <header className="topbar no-print">
        <div className="topbar-inner">
          <div className="topbar-brand-row">
            <NavLink to="/admin" className="brand">
              <img src={`${import.meta.env.BASE_URL}app-icon.svg`} alt="" width={30} height={30} />
              <span>Pitstop Plus admin</span>
            </NavLink>
          </div>
          <nav className="nav">
            <NavLink to="/admin" end>
              Overview
            </NavLink>
            <NavLink to="/admin/workshops">Workshops</NavLink>
            <NavLink to="/admin/billing">Billing</NavLink>
            <NavLink to="/admin/activity">Activity log</NavLink>
            {!adminDemo && (
              <button type="button" className="link-button" onClick={() => void signOut()}>
                Sign out
              </button>
            )}
          </nav>
        </div>
      </header>
      <main className="container">
        {adminDemo && (
          <div className="alert alert-info admin-demo-banner" role="status">
            Demo mode: sample workshops and bills. Nothing is sent to Supabase, and changes are reset when you reload the page.
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
