// src/usage/UsageLimitsPage.tsx
//
// Personal usage dashboard (`#/usage-limits`). My Day and School AI allowances
// have one destination so their account-backed balances and reset details are
// easy to find without mixing usage into Profile or Revision Profile.

import { ArrowUpRight, Gauge, Sparkles } from "lucide-react";
import AiQuotaCard from "../components/AiQuotaCard";
import BottomNav, { type TabKey } from "../components/BottomNav";
import Header from "../components/Header";
import MyDayAllowanceCard from "../components/MyDayAllowanceCard";
import { GlassSurface } from "../components/ui/glass";
import { useAuth } from "../context/AuthContext";
import { useCatalog } from "../context/CatalogContext";
import { useCommerce } from "../context/CommerceContext";

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
    else if (tab === "sanctuary") window.location.hash = "#/nature-studio";
  };

  if (!user) return null;

  return (
    <div data-usage-limits-page className="min-h-screen text-white">
      <div data-app-frame className="relative mx-auto flex min-h-screen w-full max-w-md flex-col sm:min-h-screen sm:overflow-hidden sm:rounded-none sm:border-0 lg:max-w-full">
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

        <main data-usage-limits-content className="relative z-[1] flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-8 md:px-6 lg:px-8">
          <div
            data-usage-limits-layout
            className="mx-auto flex w-full max-w-6xl flex-col gap-5 md:gap-6"
          >
            <GlassSurface
              data-usage-limits-intro
              radius={28}
              tint={0.24}
              blur={0}
              className="dc-scene-plate relative overflow-hidden text-white"
              contentClassName="relative p-5 sm:p-6 xl:p-7"
            >
              <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-indigo-500/15 blur-3xl" />
              <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-indigo-500/15 text-indigo-200 ring-1 ring-indigo-400/30">
                    <Gauge className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.17em] text-indigo-200/80">
                      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Personal usage
                    </p>
                    <h2 className="mt-1 text-xl font-black tracking-tight text-white sm:text-2xl">Know where you stand</h2>
                    <p className="mt-1 max-w-xl text-xs leading-5 text-white/65 sm:text-sm">
                      Check your My Day allowance and School AI usage in one place. Your balances are tied to your account.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { window.location.hash = "#/subscription"; }}
                  className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 self-start rounded-full bg-indigo-600 px-4 text-xs font-bold text-white shadow-lg shadow-indigo-950/25 transition hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 sm:self-center"
                >
                  Compare plans <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </GlassSurface>

            <div
              data-usage-limits-grid
              data-school-ai-visible="true"
              className="mx-auto grid w-full min-w-0 max-w-6xl grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] xl:gap-6"
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
            </div>
          </div>
        </main>

        <BottomNav active="profile" onChange={handleFooterChange} purchasesBadge={purchasedIds.size} />
      </div>
    </div>
  );
}
