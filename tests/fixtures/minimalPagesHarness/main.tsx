import React from "react";
import { createRoot } from "react-dom/client";
import "../../../src/index.css";
import "../../../src/glass-theme.css";
import "../../../src/glass.css";
import "../../../src/store-glass.css";
import "../../../src/profile-glass.css";
import "../../../src/subscription/subscription.css";
import "../../../src/subscription/subscription-minimal.css";
import UsageLimitsPage from "../../../src/usage/UsageLimitsPage";
import ProductDetail from "../../../src/PdpApp";
import MembershipManagement from "../../../src/profile/MembershipManagement";
import { products } from "../collectionCardsHarness/products";
const record = (action: string) => { document.querySelector("output")!.textContent = action; };
const product = { ...products[1], reviews: 1240, classLevel: "Class 12", description: "A focused course with practical examples and lessons you can revisit at your own pace.", features: ["Guided lessons", "Downloadable study resources"], canonicalModules: [{ id: "motion", title: "Motion and energy", resources: [{ id: "lesson", name: "Understanding motion", type: "video" }], modules: [] }], images: [products[1].image, products[0].image] } as any;
const page = new URLSearchParams(location.search).get("page") || "usage";
createRoot(document.getElementById("root")!).render(<div style={{ background: "#111827", minHeight: "100vh" }}>
  <output style={{ position: "fixed", bottom: 0, zIndex: 100, color: "white" }} />
  {page === "usage" && <UsageLimitsPage />}
  {page === "pdp" && <ProductDetail product={product} products={[product, { ...products[0], classLevel: "Class 12" } as any]} onBack={() => record("back")} onCheckout={() => record("checkout")} onAddToCart={() => record("cart")} onToggleFavorite={() => record("favorite")} />}
  {page === "member" && <main data-subscription-page><div data-subscription-shell><section data-subscription-member-view data-important-membership className="rounded-2xl border border-white/10 bg-white/[0.02] p-6"><MembershipManagement cycle="yearly" testBankLabel="Unlimited" renewalView={null} expiresAtLabel="7 Oct 2027" reminderOptOut={false} features={[{ id: "my-day", name: "My Day" }, { id: "ai", name: "School AI" }]} courses={["Motion and energy"]} onRenew={() => record("renew")} onChangePlan={() => record("change")} onToggleReminders={() => record("reminders")} onOpenFeature={() => record("feature")} /></section></div></main>}
</div>);
