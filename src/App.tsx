import { createBrowserRouter, createHashRouter, Link, Navigate, RouterProvider } from "react-router";
import Layout from "./components/Layout";
import { AuthProvider, RequireAuth } from "./lib/auth";
import { ShopSettingsProvider } from "./lib/shopSettings";
import { MeProvider } from "./lib/staff";
import { isNativeApp } from "./lib/platform";
import { configError } from "./lib/supabase";
import BillSearch from "./pages/BillSearch";
import Dashboard from "./pages/Dashboard";
import BillView from "./pages/BillView";
import { ComplaintView, EditComplaint, NewComplaint } from "./pages/ComplaintPages";
import Complaints from "./pages/Complaints";
import EditBill from "./pages/EditBill";
import Login from "./pages/Login";
import Download from "./pages/marketing/Download";
import Home from "./pages/marketing/Home";
import NewBill from "./pages/NewBill";
import Register from "./pages/Register";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import VehicleHistory from "./pages/VehicleHistory";
import SyncPage from "./pages/SyncPage";
import { RequirePlatformAdmin } from "./lib/admin/access";
import { adminDemo } from "./lib/admin/api";
import AdminActivity from "./pages/admin/AdminActivity";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminOverview from "./pages/admin/AdminOverview";
import { AdminBill, AdminComplaint } from "./pages/admin/AdminRecords";
import AdminWorkshop from "./pages/admin/AdminWorkshop";
import AdminWorkshops from "./pages/admin/AdminWorkshops";

function NotFound() {
  return (
    <main className="container empty">
      <h1>Page not found</h1>
      <Link to="/dashboard" className="btn btn-primary">
        Go to the dashboard
      </Link>
    </main>
  );
}

// A data router is needed for useBlocker (the unsaved-bill warning).
// The apps load index.html from disk, so they keep the page in the #hash instead of the path.
const createRouter = isNativeApp ? createHashRouter : createBrowserRouter;
const router = createRouter(
  [
    { path: "/", element: <Home /> },
    { path: "/download", element: <Download /> },
    { path: "/login", element: <Login /> },
    { path: "/register", element: <Register /> },
    {
      element: (
        <RequireAuth>
          <MeProvider>
            <ShopSettingsProvider>
              <Layout />
            </ShopSettingsProvider>
          </MeProvider>
        </RequireAuth>
      ),
      children: [
        { path: "dashboard", element: <Dashboard /> },
        { path: "bills/new", element: <NewBill /> },
        { path: "bills", element: <BillSearch /> },
        { path: "bills/:id", element: <BillView /> },
        { path: "bills/:id/edit", element: <EditBill /> },
        { path: "complaints", element: <Complaints /> },
        { path: "complaints/new", element: <NewComplaint /> },
        { path: "complaints/:id", element: <ComplaintView /> },
        { path: "complaints/:id/edit", element: <EditComplaint /> },
        { path: "vehicles/:key", element: <VehicleHistory /> },
        { path: "reports", element: <Reports /> },
        { path: "reports/:section", element: <Reports /> },
        { path: "sales", element: <Navigate to="/reports" replace /> },
        { path: "settings", element: <Settings /> },
        { path: "settings/:section", element: <Settings /> },
        { path: "sync", element: <SyncPage /> },
      ],
    },
    // Platform admin panel (Skye Automotives): every workshop. See 0014_platform_admin.sql.
    {
      path: "admin",
      element: (
        <RequirePlatformAdmin>
          <AdminLayout />
        </RequirePlatformAdmin>
      ),
      children: [
        { index: true, element: <AdminOverview /> },
        { path: "workshops", element: <AdminWorkshops /> },
        { path: "workshops/:id", element: <AdminWorkshop /> },
        { path: "bills/:id", element: <AdminBill /> },
        { path: "complaints/:id", element: <AdminComplaint /> },
        { path: "activity", element: <AdminActivity /> },
      ],
    },
    { path: "*", element: <NotFound /> },
  ],
  isNativeApp ? {} : { basename: import.meta.env.BASE_URL.replace(/\/$/, "") || "/" },
);

export default function App() {
  // The admin demo (npm run dev:admin-demo) runs on sample data without a Supabase project.
  if (configError && !adminDemo) {
    return (
      <main className="container">
        <div className="alert alert-error" role="alert">
          <strong>Setup needed.</strong> {configError}
        </div>
      </main>
    );
  }
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
