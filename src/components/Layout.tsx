import { Navigate, NavLink, Outlet } from "react-router";
import { usePlatformAdmin } from "../lib/admin/access";
import { useShopSettings } from "../lib/shopSettings";
import { useMe } from "../lib/staff";
import { signOut as signOutAndClear } from "../lib/auth";
import Logo from "./Logo";
import SyncStatus from "./SyncStatus";
import UpdateBanner from "./UpdateBanner";
import SubscriptionReminder from "./SubscriptionReminder";
import BackupReminder from "./BackupReminder";
import { APP_VERSION } from "../lib/updates";
import { useSyncState } from "../lib/sync";

/** Line icons for the sidebar (24 x 24, stroke = currentColor). */
const ICON: Record<string, string> = {
  dashboard: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  bills: "M7 3h10a1 1 0 0 1 1 1v17l-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1zM9 8h6M9 12h6M9 16h3",
  complaints: "M9 4h6v3H9zM7 5H5v16h14V5h-2M8 11h8M8 15h5",
  newComplaint: "M9 4h6v3H9zM7 5H5v16h14V5h-2M12 10v6M9 13h6",
  reports: "M4 20h16M7 16v-5M12 16V7M17 16v-8",
  settings:
    "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  signOut: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
  plus: "M12 5v14M5 12h14",
};

function Icon({ name }: { name: keyof typeof ICON }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON[name]} />
    </svg>
  );
}

/** Shown on a new device until the workshop's data has been downloaded once. */
function FirstSyncNotice() {
  const s = useSyncState();
  if (s.ready) return null;
  return (
    <div className="alert first-sync no-print" role="status">
      {s.phase === "offline"
        ? "This device hasn't downloaded your workshop's data yet. Connect to the internet once to download it; after that it works offline."
        : "Downloading your workshop's data to this device so it also works offline…"}
    </div>
  );
}

/** Not on any workshop's staff list: platform admins go to the admin panel. */
function NotStaff() {
  const check = usePlatformAdmin();
  if (check.status === "loading") return <p className="page-status">Loading…</p>;
  if (check.status === "ok" && check.isAdmin) return <Navigate to="/admin" replace />;
  return <p>Your login isn't on the workshop's staff list yet. Ask the owner to add you in Settings.</p>;
}

export default function Layout() {
  const { settings, error } = useShopSettings();
  const me = useMe();
  const signOut = () => void signOutAndClear();

  if (me.status === "loading") return <p className="page-status">Loading…</p>;
  if (me.status !== "ok") {
    return (
      <main className="login">
        <div className="card login-card">
          <div className="login-brand">
            <img src={`${import.meta.env.BASE_URL}pitstop-plus.svg`} alt="Pitstop Plus" className="login-logo" />
          </div>
          {me.status === "not-staff" ? (
            <NotStaff />
          ) : me.status === "suspended" ? (
            <div className="alert alert-error" role="alert">
              <span>
                <strong>This workshop is suspended.</strong> {me.reason && `Reason: ${me.reason}. `}Contact Pitstop Plus support (Skye Automotives) to restore
                access. Your bills and complaints are kept.
              </span>
            </div>
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

  const isOwner = me.me.role === "owner";
  const shopName = settings?.shop_name || "Your workshop";

  return (
    <div className="app">
      {/* Wide screens (Windows app, PC browser): sidebar. */}
      <aside className="sidebar no-print">
        <NavLink to="/dashboard" className="sidebar-logo" aria-label="Dashboard">
          <img src={`${import.meta.env.BASE_URL}pitstop-plus-dark.svg`} alt="Pitstop Plus" />
        </NavLink>
        <div className="sidebar-shop" title={shopName}>
          {shopName}
        </div>
        <NavLink to="/bills/new" className="sidebar-new">
          <Icon name="plus" /> New bill
        </NavLink>
        <nav className="sidebar-nav">
          <NavLink to="/dashboard" end>
            <Icon name="dashboard" /> Dashboard
          </NavLink>
          <NavLink to="/bills" end>
            <Icon name="bills" /> Bills
          </NavLink>
          <NavLink to="/complaints" end>
            <Icon name="complaints" /> Complaints
          </NavLink>
          <NavLink to="/complaints/new">
            <Icon name="newComplaint" /> New complaint
          </NavLink>
          {isOwner && (
            <NavLink to="/reports">
              <Icon name="reports" /> Reports
            </NavLink>
          )}
          {isOwner && (
            <NavLink to="/settings">
              <Icon name="settings" /> Settings
            </NavLink>
          )}
        </nav>
        <SyncStatus />
        <p className="sidebar-version">Pitstop Plus {APP_VERSION}</p>
        <div className="sidebar-user">
          <div className="sidebar-avatar" aria-hidden="true">
            {(me.me.full_name || me.me.username || "?").trim().charAt(0).toUpperCase()}
          </div>
          <div className="sidebar-who">
            <strong>{me.me.full_name || me.me.username}</strong>
            <span>{isOwner ? "Owner" : "Staff"}</span>
          </div>
          <button type="button" className="sidebar-signout" onClick={signOut} title="Sign out" aria-label="Sign out">
            <Icon name="signOut" />
          </button>
        </div>
      </aside>

      {/* Phones and narrow windows: top bar. */}
      <header className="topbar no-print">
        <div className="topbar-inner">
          <div className="topbar-brand-row">
            <NavLink to="/dashboard" className="brand">
              <Logo size={30} />
              <span>{shopName}</span>
            </NavLink>
            <SyncStatus compact />
          </div>
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
            {isOwner && <NavLink to="/reports">Reports</NavLink>}
            {isOwner && <NavLink to="/settings">Settings</NavLink>}
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
        <FirstSyncNotice />
        <UpdateBanner />
        {isOwner && <SubscriptionReminder />}
        {isOwner && <BackupReminder />}
        <Outlet />
      </main>
    </div>
  );
}
