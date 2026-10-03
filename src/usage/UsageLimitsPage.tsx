// src/usage/UsageLimitsPage.tsx
//
// Personal usage dashboard (`#/usage-limits`). My Day and School AI allowances
// have one destination so their account-backed balances and reset details are
// easy to find without mixing usage into Profile or Revision Profile.

import { ArrowUpRight, Clock, Gauge, Shield, Sparkles, Zap } from "lucide-react";
import AiQuotaCard from "../components/AiQuotaCard";
import BottomNav, { type TabKey } from "../components/BottomNav";
import Header from "../components/Header";
import MyDayAllowanceCard from "../components/MyDayAllowanceCard";
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
          className="relative z-[1] flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-28 md:px-6 md:pb-32 lg:px-8 lg:pb-16"
        >
          <div
            data-usage-limits-layout
            className="mx-auto flex w-full max-w-6xl flex-col gap-5 md:gap-6"
          >
            {/* Top Summary Banner: Solid slate base with subtle borders and ambient glow */}
            <section
              data-usage-limits-intro
              className="relative overflow-hidden rounded-2xl border border-white/[0.12] bg-[#0c111e]/90 p-5 shadow-xl backdrop-blur-xl sm:p-6 lg:rounded-3xl lg:p-7"
            >
              {/* Subtle ambient light */}
              <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-500/15 blur-3xl" />
              <div aria-hidden="true" className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl" />

              <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3.5">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-400/30">
                    <Gauge className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/25 bg-indigo-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                        <Sparkles className="h-3 w-3" aria-hidden="true" /> Allowances
                      </span>
                      <span className="hidden text-xs text-white/40 sm:inline">·</span>
                      <span className="hidden text-xs font-semibold text-white/60 sm:inline">Daily Quotas</span>
                    </div>
                    <h1 className="mt-1 text-xl font-extrabold tracking-tight text-white sm:text-2xl">
                      Resource Usage &amp; Limits
                    </h1>
                    <p className="mt-1 text-xs text-white/60 sm:text-sm">
                      Monitor your daily creation allowances and AI generation quotas in real time.
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2.5 self-start sm:self-center">
                  <button
                    type="button"
                    onClick={() => { window.location.hash = "#/subscription"; }}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 transition hover:bg-indigo-500 active:scale-[0.98]"
                  >
                    <span>Compare plans</span>
                    <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* Quick Micro-Metrics strip */}
              <div className="mt-5 grid grid-cols-2 gap-2.5 border-t border-white/[0.08] pt-4 sm:grid-cols-3">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-2.5 sm:p-3">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-white/45">Reset Schedule</span>
                  <span className="mt-0.5 block text-xs font-bold text-white sm:text-sm">Daily at 00:00</span>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-2.5 sm:p-3">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-white/45">Sync Status</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs font-bold text-emerald-300 sm:text-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live Cloud
                  </span>
                </div>
                <div className="col-span-2 rounded-xl border border-white/[0.06] bg-white/[0.03] p-2.5 sm:col-span-1 sm:p-3">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-white/45">Account Tier</span>
                  <span className="mt-0.5 block text-xs font-bold text-indigo-300 sm:text-sm">Verified Learner</span>
                </div>
              </div>
            </section>

            {/* Main 2-Column Responsive Cards Grid */}
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

            {/* Helpful Information Row - 3 subtle classic cards eliminating desktop empty space */}
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4 pt-1">
              <div className="flex items-start gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 backdrop-blur-md transition hover:border-white/15 hover:bg-white/[0.05]">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-400/25">
                  <Clock className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-xs font-bold text-white">Automatic Reset</h3>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-white/55">
                    Daily quotas replenish automatically every 24 hours at midnight.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 backdrop-blur-md transition hover:border-white/15 hover:bg-white/[0.05]">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/25">
                  <Shield className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-xs font-bold text-white">Private &amp; Secure</h3>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-white/55">
                    All usage records are cryptographically verified against your user ID.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 backdrop-blur-md transition hover:border-white/15 hover:bg-white/[0.05]">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-300 ring-1 ring-violet-400/25">
                  <Zap className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-xs font-bold text-white">Higher Capacity</h3>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-white/55">
                    Upgrade your membership to unlock unlimited tasks and increased AI tokens.
                  </p>
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
