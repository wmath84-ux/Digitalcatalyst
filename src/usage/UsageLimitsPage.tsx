// src/usage/UsageLimitsPage.tsx
//
// Personal usage & quota telemetry dashboard (`#/usage-limits`).

import {
  ArrowLeft,
  ArrowUpRight,
  Clock,
  Gauge,
  Shield,
  Zap,
} from "lucide-react";
import AiQuotaCard from "../components/AiQuotaCard";
import BottomNav, { type TabKey } from "../components/BottomNav";
import Header from "../components/Header";
import MyDayAllowanceCard from "../components/MyDayAllowanceCard";
import WebClipperCard from "../components/WebClipperCard";
import { GlassButton } from "../components/ui/glass-button";
import { useAuth } from "../context/AuthContext";
import { useCatalog } from "../context/CatalogContext";
import { useCommerce } from "../context/CommerceContext";
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
          title="Usage Limits"
          subtitle="Your personal allowances"
          icon={Gauge}
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
              <div className="flex flex-wrap items-start justify-between gap-4" data-usage-limits-intro>
                <div className="min-w-0">
                  <h1>Usage Limits</h1>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-white/65">
                    Your My Day and School AI allowances, verified from your account. Check what is used, what remains and when it resets.
                  </p>
                </div>
                <GlassButton variant="capsule" onClick={() => { window.location.hash = "#/subscription"; }}>
                  <span className="inline-flex items-center gap-2 text-xs">Compare plans <ArrowUpRight className="h-4 w-4" /></span>
                </GlassButton>
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
                  onOpenMyDay={() => { window.location.hash = "#/my-day"; }}
                  onSubscribe={() => { window.location.hash = "#/subscription"; }}
                />
              </section>

              <section aria-label="School AI usage and allowance" className="min-w-0">
                <AiQuotaCard uid={user.id} material="home" />
              </section>

              {/* The Web Clipper's pairing surface. It lives HERE, not inside
                  `#/my-day`: that route is the Joplin workspace and its chrome
                  belongs to Joplin — a Digitalcatalyst card over it would be the
                  exact "custom toolbar on top of Joplin's UI" the brief forbids. */}
              <section aria-label="Web Clipper" className="min-w-0 xl:col-span-2">
                <WebClipperCard />
              </section>
            </div>

            <section aria-label="How usage limits work" className="dc-usage-guidance">
              <h2>How limits work</h2>
              <div className="mt-4 grid gap-5 md:grid-cols-3">
                <div>
                  <h3 className="flex items-center gap-2"><Clock className="h-4 w-4 text-white/60" /> Daily resets</h3>
                  <p>Daily allowances replenish automatically. Each allowance shows its server-verified reset time.</p>
                </div>
                <div>
                  <h3 className="flex items-center gap-2"><Shield className="h-4 w-4 text-white/60" /> Reading stays open</h3>
                  <p>Opening existing notes and tasks does not use your creation allowance.</p>
                </div>
                <div>
                  <h3 className="flex items-center gap-2"><Zap className="h-4 w-4 text-white/60" /> Need more capacity?</h3>
                  <p>Compare membership plans for higher allowances. Your current limits remain visible above.</p>
                </div>
              </div>
            </section>
          </div>
        </main>

        <BottomNav active="profile" onChange={handleFooterChange} purchasesBadge={purchasedIds.size} />
      </div>
    </div>
  );
}
