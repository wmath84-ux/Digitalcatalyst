// src/usage/UsageLimitsPage.tsx
//
// Personal usage & quota telemetry dashboard (`#/usage-limits`).

import { ArrowLeft } from "lucide-react";
import AiQuotaCard from "../components/AiQuotaCard";
import BottomNav, { type TabKey } from "../components/BottomNav";
import Header from "../components/Header";
import MyDayAllowanceCard from "../components/MyDayAllowanceCard";
import WebClipperCard from "../components/WebClipperCard";
import { useAuth } from "../context/AuthContext";
import { useCatalog } from "../context/CatalogContext";
import { useCommerce } from "../context/CommerceContext";
import "../profile/profile-minimal.css";
import "./usage-minimal.css";

export default function UsageLimitsPage() {
  const { user } = useAuth();
  const { cartIds } = useCommerce();
  const { purchasedIds } = useCatalog();

  const handleFooterChange = (tab: TabKey) => {
    if (tab === "home") window.location.hash = "#/home";
    else if (tab === "myday") window.location.hash = "#/my-day";
    else if (tab === "store") window.location.hash = "#/store";
    else if (tab === "purchases") window.location.hash = "#/store/purchases";
    else if (tab === "profile") window.location.hash = "#/profile";
    else if (tab === "study-library") window.location.hash = "#/study-library";
    else if (tab === "revision") window.location.hash = "#/revision";
    else if (tab === "flowpath") window.location.hash = "#/flowpath";
  };

  if (!user) return null;

  return (
    <div data-usage-limits-page className="min-h-screen text-white">
      <div data-app-frame className="relative mx-auto flex min-h-screen w-full flex-col">
        <Header
          cartCount={cartIds.size}
          notifCount={0}
          onNavigateToSubscription={() => { window.location.hash = "#/subscription"; }}
          onNavigateToCart={() => { window.location.hash = "#/cart"; }}
          onNavigateToNotifications={() => { window.location.hash = "#/notifications"; }}
        />

        <main
          data-usage-limits-content
          className="relative z-[1] flex-1 overflow-y-auto overscroll-contain px-3.5 pt-4 pb-28 sm:px-6 md:px-8 md:pb-32 lg:px-10 lg:pb-16"
        >
          <div
            data-usage-limits-layout
            className="mx-auto flex w-full max-w-4xl flex-col gap-6"
          >
            <header className="dc-usage-header">
              <button type="button" onClick={() => { window.location.hash = "#/profile"; }}
                className="inline-flex min-h-11 items-center gap-1.5 text-xs text-white/70 hover:text-white" aria-label="Back to Profile">
                <ArrowLeft className="h-4 w-4" /> Profile
              </button>
              <div className="dc-account-header" data-usage-limits-intro>
                <div><h1>Usage Limits</h1><p className="dc-account-note">Your used, remaining and reset information.</p></div>
                <button type="button" onClick={() => { window.location.hash = "#/subscription"; }} className="dc-account-text-action">Compare plans</button>
              </div>
            </header>

            {/* ── Main 2-Column Responsive Allowance Cards Grid ── */}
            <div
              data-usage-limits-grid
              data-school-ai-visible="true"
              className="mx-auto grid w-full min-w-0 max-w-4xl grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] xl:gap-6"
            >
              <section aria-label="My Day usage and allowance" className="min-w-0">
                <MyDayAllowanceCard
                  minimal
                  onOpenMyDay={() => { window.location.hash = "#/my-day"; }}
                  onSubscribe={() => { window.location.hash = "#/subscription"; }}
                />
              </section>

              <section aria-label="School AI usage and allowance" className="min-w-0">
                <AiQuotaCard uid={user.id} material="home" minimal />
              </section>

            </div>

            <details className="dc-account-disclosure" data-usage-rules><summary>How limits work</summary><ul className="dc-usage-rules-list"><li>Creation uses your My Day allowance; reading existing items does not.</li><li>AI usage follows your effective plan's token, request and model-budget limits.</li><li>Reset times and quota values come from your account. Unverified counters are not shown as real usage.</li></ul></details>
            <details className="dc-account-disclosure" data-usage-clipper><summary>Web Clipper · browser connections</summary><WebClipperCard minimal /></details>
          </div>
        </main>

        <BottomNav active="profile" onChange={handleFooterChange} purchasesBadge={purchasedIds.size} />
      </div>
    </div>
  );
}
