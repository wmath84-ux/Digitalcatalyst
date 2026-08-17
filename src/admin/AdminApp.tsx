import { useEffect } from "react";
import { AdminProviders } from "@/components/admin/AdminProviders";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAuth } from "@/context/AuthContext";
import { APPROVED_ADMIN_EMAIL, clearAdminSession, hasAdminSession } from "@/utils/adminSession";
import DashboardPage from "./pages/DashboardPage";
import ProductsPage from "./pages/ProductsPage";
import NewProductPage from "./pages/NewProductPage";
import ProductDetailPage from "./pages/ProductDetailPage";
import OrdersPage from "./pages/OrdersPage";
import OrderDetailPage from "./pages/OrderDetailPage";
import CustomersPage from "./pages/CustomersPage";
import CustomerDetailPage from "./pages/CustomerDetailPage";
import SubscriptionsPage from "./pages/SubscriptionsPage";
import CouponsPage from "./pages/CouponsPage";
import ReviewsPage from "./pages/ReviewsPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import RevisionPage from "./pages/RevisionPage";
import ContentPage from "./pages/ContentPage";
import SessionPage from "./pages/SessionPage";

const adminPath = () => (window.location.hash.slice(1).split("?")[0] || "/admin").replace(/\/$/, "") || "/admin";

function AdminRoutes() {
  const path = adminPath();
  if (path === "/admin") return <DashboardPage />;
  if (path === "/admin/products") return <ProductsPage />;
  if (path === "/admin/products/new") return <NewProductPage />;
  if (path.startsWith("/admin/products/")) return <ProductDetailPage id={decodeURIComponent(path.slice("/admin/products/".length))} />;
  if (path === "/admin/orders") return <OrdersPage />;
  if (path.startsWith("/admin/orders/")) return <OrderDetailPage id={decodeURIComponent(path.slice("/admin/orders/".length))} />;
  if (path === "/admin/customers") return <CustomersPage />;
  if (path.startsWith("/admin/customers/")) return <CustomerDetailPage uid={decodeURIComponent(path.slice("/admin/customers/".length))} />;
  if (path === "/admin/subscriptions") return <SubscriptionsPage />;
  if (path === "/admin/coupons") return <CouponsPage />;
  if (path === "/admin/reviews") return <ReviewsPage />;
  if (path === "/admin/analytics") return <AnalyticsPage />;
  if (path === "/admin/revision") return <RevisionPage />;
  if (path === "/admin/content") return <ContentPage />;
  if (path === "/admin/session") return <SessionPage />;
  return <DashboardPage />;
}

export default function AdminApp() {
  const { user, logout } = useAuth();
  const valid = Boolean(user && user.email === APPROVED_ADMIN_EMAIL && user.role === "admin" && hasAdminSession(user.id, user.email, user.role));
  useEffect(() => {
    if (valid) return;
    clearAdminSession();
    void logout().finally(() => { window.location.hash = "#/admin-login"; });
  }, [valid, logout]);
  if (!valid || !user) return null;
  return <AdminProviders><AdminShell email={user.email} role={user.role}><AdminRoutes /></AdminShell></AdminProviders>;
}
