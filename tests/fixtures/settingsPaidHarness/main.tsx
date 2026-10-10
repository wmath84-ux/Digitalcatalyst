import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "../../../src/index.css";
import "../../../src/glass-theme.css";
import "../../../src/glass.css";
import "../../../src/store-glass.css";
import "../../../src/pdp-minimal.css";
import AppShell from "../../../src/components/AppShell";
import Header from "../../../src/components/Header";
import BottomNav from "../../../src/components/BottomNav";
import SettingsPage from "../../../src/settings/SettingsPage";
import PublicProfilePage from "../../../src/settings/PublicProfilePage";
import ProductDetail from "../../../src/PdpApp";
import { useCourseAccess, useOwnedProducts } from "../../../src/hooks/useCourseAccess";
import { useUserPreferences } from "../../../src/settings/useUserPreferences";
import { CatalogProvider, useCatalog as useActualCatalog } from "../../../src/context/CatalogContext.tsx?real-provider";
import { useAuth } from "../../../src/context/AuthContext";
import { product } from "./data";
import { state } from "./io";
const params = new URLSearchParams(location.search);
const target = params.get("page") || "settings";
history.replaceState(null, "", `${location.pathname}${location.search}${target === "public" ? "#/learner/learner-a" : target === "pdp" ? "#/product/foundations" : "#/settings"}`);
const record = (value: unknown) => { document.querySelector("output")!.textContent = typeof value === "string" ? value : JSON.stringify(value); };
function AccessProbe() {
  const { user } = useAuth();
  const access = useCourseAccess({ product });
  const library = useOwnedProducts();
  const preferences = useUserPreferences(user?.id);
  useEffect(() => { (window as any).probe = { access, library, preferences }; });
  return <div data-access-probe hidden>{JSON.stringify({ loading: access.loading, error: access.error, subscription: access.hasActiveSubscription, full: access.resolution.hasFullProductAccess, libraryLoading: library.loading, libraryError: library.error })}</div>;
}
function CatalogProbe() {
  const catalog = useActualCatalog();
  return <p data-catalog-probe>{JSON.stringify({ ids: [...catalog.purchasedIds].sort(), products: catalog.products.length, loading: catalog.loading })}</p>;
}
function Fixture() {
  const { user } = useAuth();
  const page = target === "catalog" ? <CatalogProvider><CatalogProbe /></CatalogProvider> : target === "pdp" ? <div data-app-frame className="fixture-page"><Header cartCount={0} notifCount={0} /><main><ProductDetail product={product} products={[product]} purchasedIds={new Set()} onBack={() => record("back")} onCheckout={(payable, code) => record({ payable, code })} onCheckoutSelection={(selection, payable) => record({ selection, payable })} onOpenCourse={() => record("library")} onToggleFavorite={() => record("saved")} /></main><BottomNav active="store" onChange={(tab) => record(tab)} /></div>
    : target === "public" ? <PublicProfilePage /> : <SettingsPage />;
  return <><output /><AccessProbe />{params.has("preview") ? <div className="fixture-preview-label">Preview data · No real account or payment changes<a href="?page=settings&preview&shell">Settings</a><a href="?page=pdp&preview&shell&base&partial">Paid content</a></div> : null}
    {params.has("shell") ? <AppShell pageTitle={target === "pdp" ? "Product" : "Settings"} pageSubtitle="Learning preferences" activeTab={target === "pdp" ? "store" : "profile"} onNavigate={() => {}} cartCount={0} purchasesBadge={0} onNavigateToCart={() => {}} onNavigateToSubscription={() => {}} onNavigateToNotifications={() => {}}>{page}</AppShell> : page}
    <span hidden data-fixture-account>{user?.id || "guest"}</span></>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
(window as any).fixtureReady = true;
