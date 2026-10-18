import { Navigate, NavLink, Outlet } from "react-router";
import { useT } from "../i18n";
import { usePlatformAdmin } from "../lib/admin/access";
import { useShopSettings } from "../lib/shopSettings";
import { useMe } from "../lib/staff";
import { signOut as signOutAndClear } from "../lib/auth";
import Logo from "./Logo";
import SyncStatus from "./SyncStatus";
import UpdateBanner from "./UpdateBanner";
import SubscriptionReminder from "./SubscriptionReminder";
import BackupReminder from "./BackupReminder";
import WorkshopTypePrompt from "./WorkshopTypePrompt";
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
  const { t } = useT();
  if (s.ready) return null;
  return (
    <div className="alert first-sync no-print" role="status">
      {s.phase === "offline" ? t("layout.firstSyncOffline") : t("layout.firstSyncBusy")}
    </div>
  );
}

/** Not on any workshop's staff list: platform admins go to the admin panel. */
function NotStaff() {
  const check = usePlatformAdmin();
  const { t } = useT();
  if (check.status === "loading") return <p className="page-status">{t("common.loading")}</p>;
  if (check.status === "ok" && check.isAdmin) return <Navigate to="/admin" replace />;
  return <p>{t("layout.notStaff")}</p>;
}

export default function Layout() {
  const { settings, error } = useShopSettings();
  const me = useMe();
  const signOut = () => void signOutAndClear();
  const { t } = useT();

  if (me.status === "loading") return <p className="page-status">{t("common.loading")}</p>;
  if (me.status !== "ok") {
    return (
      <main className="login">
        <div className="card login-card">
          <div className="login-brand">
            <img src={`${import.meta.env.BASE_URL}pitshop-plus.svg`} alt="Pitshop Plus" className="login-logo" />
          </div>
          {me.status === "not-staff" ? (
            <NotStaff />
          ) : me.status === "suspended" ? (
            <div className="alert alert-error" role="alert">
              <span>
                <strong>{t("layout.suspendedTitle")}</strong> {me.reason && `${t("layout.suspendedReason", { reason: me.reason })} `}
                {t("layout.suspendedBody")}
              </span>
            </div>
          ) : (
            <div className="alert alert-error" role="alert">
              {t("layout.loginCheckFailed", { message: me.message })}
            </div>
          )}
          <button type="button" className="btn btn-outline btn-block" onClick={signOut}>
            {t("common.signOut")}
          </button>
        </div>
      </main>
    );
  }

  const isOwner = me.me.role === "owner";
  const shopName = settings?.shop_name || t("common.yourWorkshop");

  return (
    <div className="app">
      {/* Wide screens (Windows app, PC browser): sidebar. */}
      <aside className="sidebar no-print">
        <NavLink to="/dashboard" className="sidebar-logo" aria-label={t("nav.dashboard")}>
          <img src={`${import.meta.env.BASE_URL}pitshop-plus-dark.svg`} alt="Pitshop Plus" />
        </NavLink>
        <div className="sidebar-shop" title={shopName}>
          {shopName}
        </div>
        <NavLink to="/bills/new" className="sidebar-new">
          <Icon name="plus" /> {t("nav.newBill")}
        </NavLink>
        <nav className="sidebar-nav">
          <NavLink to="/dashboard" end>
            <Icon name="dashboard" /> {t("nav.dashboard")}
          </NavLink>
          <NavLink to="/bills" end>
            <Icon name="bills" /> {t("nav.bills")}
          </NavLink>
          <NavLink to="/complaints" end>
            <Icon name="complaints" /> {t("nav.complaints")}
          </NavLink>
          <NavLink to="/complaints/new">
            <Icon name="newComplaint" /> {t("nav.newComplaint")}
          </NavLink>
          {isOwner && (
            <NavLink to="/reports">
              <Icon name="reports" /> {t("nav.reports")}
            </NavLink>
          )}
          <NavLink to="/settings">
            <Icon name="settings" /> {t("nav.settings")}
          </NavLink>
        </nav>
        <SyncStatus />
        <p className="sidebar-version">Pitshop Plus {APP_VERSION}</p>
        <div className="sidebar-user">
          <div className="sidebar-avatar" aria-hidden="true">
            {(me.me.full_name || me.me.username || "?").trim().charAt(0).toUpperCase()}
          </div>
          <div className="sidebar-who">
            <strong>{me.me.full_name || me.me.username}</strong>
            <span>{isOwner ? t("common.owner") : t("common.staff")}</span>
          </div>
          <button type="button" className="sidebar-signout" onClick={signOut} title={t("common.signOut")} aria-label={t("common.signOut")}>
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
              {t("nav.dashboard")}
            </NavLink>
            <NavLink to="/complaints/new">{t("nav.newComplaint")}</NavLink>
            <NavLink to="/bills/new">{t("nav.newBill")}</NavLink>
            <NavLink to="/complaints" end>
              {t("nav.complaints")}
            </NavLink>
            <NavLink to="/bills" end>
              {t("nav.findBills")}
            </NavLink>
            {isOwner && <NavLink to="/reports">{t("nav.reports")}</NavLink>}
            <NavLink to="/settings">{t("nav.settings")}</NavLink>
            <button type="button" className="link-button" onClick={signOut}>
              {t("common.signOut")}
            </button>
          </nav>
        </div>
      </header>
      <main className="container">
        {error && (
          <div className="alert alert-error no-print" role="alert">
            {t("layout.settingsLoadFailed", { message: error })}
          </div>
        )}
        <FirstSyncNotice />
        <UpdateBanner />
        {isOwner && <SubscriptionReminder />}
        {isOwner && <BackupReminder />}
        {isOwner && <WorkshopTypePrompt />}
        <Outlet />
      </main>
    </div>
  );
}
