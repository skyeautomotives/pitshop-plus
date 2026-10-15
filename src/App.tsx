import { createBrowserRouter, Link, Navigate, RouterProvider } from "react-router";
import Layout from "./components/Layout";
import { AuthProvider, RequireAuth } from "./lib/auth";
import { ShopSettingsProvider } from "./lib/shopSettings";
import { MeProvider } from "./lib/staff";
import { configError } from "./lib/supabase";
import BillSearch from "./pages/BillSearch";
import Dashboard from "./pages/Dashboard";
import BillView from "./pages/BillView";
import { ComplaintView, EditComplaint, NewComplaint } from "./pages/ComplaintPages";
import Complaints from "./pages/Complaints";
import EditBill from "./pages/EditBill";
import Login from "./pages/Login";
import NewBill from "./pages/NewBill";
import Register from "./pages/Register";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import VehicleHistory from "./pages/VehicleHistory";

function NotFound() {
  return (
    <main className="container empty">
      <h1>Page not found</h1>
      <Link to="/" className="btn btn-primary">
        Go to the dashboard
      </Link>
    </main>
  );
}

// A data router is needed for useBlocker (the unsaved-bill warning).
const router = createBrowserRouter(
  [
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
        { index: true, element: <Dashboard /> },
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
      ],
    },
    { path: "*", element: <NotFound /> },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, "") || "/" },
);

export default function App() {
  if (configError) {
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
