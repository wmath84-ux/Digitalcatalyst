// src/usage/UsageLimitsPage.tsx
//
// Personal usage & quota telemetry dashboard (`#/usage-limits`).

import {
  ArrowLeft,
  ArrowUpRight,
  Clock,
  Cpu,
  Gauge,
  KeyRound,
  Shield,
  Sparkles,
  Zap,
} from "lucide-react";
import AiQuotaCard from "../components/AiQuotaCard";
import BottomNav, { type TabKey } from "../components/BottomNav";
import Header from "../components/Header";
import MyDayAllowanceCard from "../components/MyDayAllowanceCard";
import { GlassButton } from "../components/ui/glass-button";
import { useAuth } from "../context/AuthContext";
import { useCatalog } from "../context/CatalogContext";
import { useCommerce } from "../context/CommerceContext";
import { ProfileCard } from "../profile/ProfileCard";

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
            className="mx-auto flex w-full max-w-6xl flex-col gap-5 md:gap-6"
          >
            {/* ── Top Workspace Breadcrumb & Quick Actions Bar ── */}
            <header className="flex flex-wrap items-center justify-between gap-3 px-0.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => { window.location.hash = "#/profile"; }}
                  className="dc-profile-tile inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white/90"
                  aria-label="Back to Profile"
                >
                  <ArrowLeft className="h-3.5 w-3.5 text-indigo-300" />
                  <span>Profile</span>
                </button>
                <span aria-hidden="true" className="text-white/35">/</span>
                <span className="dc-scene-ink dc-profile-title truncate font-bold text-white">
                  Usage Limits
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-200 ring-1 ring-emerald-400/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Live Telemetry</span>
                </span>
              </div>
            </header>

            {/* ── Executive Telemetry Hero Banner (ProfileCard Glass Surface) ── */}
            <ProfileCard
              data-usage-limits-intro
              className="relative overflow-hidden"
              contentClassName="p-4 sm:p-5 lg:p-6"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3.5">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/35">
                    <Gauge className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="dc-profile-card-accent inline-flex items-center gap-1 rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-indigo-400/30">
                        <Sparkles className="h-3 w-3" aria-hidden="true" />
                        <span>Quota Center</span>
                      </span>
                      <span className="dc-profile-card-meta hidden sm:inline">
                        Server-verified account balances
                      </span>
                    </div>
                    <h1 className="mt-1.5 text-lg font-bold tracking-tight text-white sm:text-xl lg:text-2xl">
                      Resource Usage &amp; Daily Allowances
                    </h1>
                    <p className="dc-profile-card-meta mt-1 max-w-2xl">
                      Monitor your daily My Day creation capacity and School AI token budget in real time. All counters sync directly with your account ledger.
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
                  <GlassButton
                    variant="capsule"
                    onClick={() => { window.location.hash = "#/subscription"; }}
                    className="[&>span>div]:h-10 [&>span>div]:px-4 [&_span]:text-xs [&_span]:font-semibold"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span>Compare plans</span>
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                  </GlassButton>
                </div>
              </div>

              {/* 4-Tile Bento Telemetry Strip */}
              <div className="mt-5 grid grid-cols-2 gap-2.5 border-t border-white/[0.08] pt-4 sm:grid-cols-4 sm:gap-3">
                <div className="dc-profile-subpanel p-3">
                  <span className="dc-profile-card-meta flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-indigo-300" />
                    <span>Reset Schedule</span>
                  </span>
                  <span className="dc-profile-card-title mt-1 block truncate">Daily at 00:00</span>
                </div>

                <div className="dc-profile-subpanel p-3">
                  <span className="dc-profile-card-meta flex items-center gap-1.5">
                    <Cpu className="h-3.5 w-3.5 text-emerald-300" />
                    <span>Sync Engine</span>
                  </span>
                  <span className="dc-profile-card-title mt-1 flex items-center gap-1.5 truncate text-emerald-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    <span>Live Cloud</span>
                  </span>
                </div>

                <div className="dc-profile-subpanel p-3">
                  <span className="dc-profile-card-meta flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-violet-300" />
                    <span>Error Policy</span>
                  </span>
                  <span className="dc-profile-card-title mt-1 block truncate">Zero penalty</span>
                </div>

                <div className="dc-profile-subpanel p-3">
                  <span className="dc-profile-card-meta flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5 text-amber-300" />
                    <span>Custom API Key</span>
                  </span>
                  <span className="dc-profile-card-title mt-1 block truncate">Bypasses cap</span>
                </div>
              </div>
            </ProfileCard>

            {/* ── Main 2-Column Responsive Allowance Cards Grid ── */}
            <div
              data-usage-limits-grid
              data-school-ai-visible="true"
              className="mx-auto grid w-full min-w-0 max-w-6xl grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] xl:gap-6"
            >
              <section aria-label="My Day usage and allowance" className="min-w-0 h-full">
                <MyDayAllowanceCard
                  onOpenMyDay={() => { window.location.hash = "#/my-day"; }}
                  onSubscribe={() => { window.location.hash = "#/subscription"; }}
                />
              </section>

              <section aria-label="School AI usage and allowance" className="min-w-0 h-full">
                <AiQuotaCard uid={user.id} material="home" />
              </section>
            </div>

            {/* ── Quota Architecture & Fair-Use Guarantee Cards ── */}
            <section aria-label="How usage limits work" className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <ProfileCard contentClassName="p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/35">
                    <Clock className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="dc-profile-card-title">Automatic Midnight Reset</h2>
                    <p className="dc-profile-card-meta mt-1">
                      Daily creation allowances and AI token budgets replenish automatically every 24 hours at local midnight.
                    </p>
                  </div>
                </div>
              </ProfileCard>

              <ProfileCard contentClassName="p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/35">
                    <Shield className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="dc-profile-card-title">Fair-Use Protection</h2>
                    <p className="dc-profile-card-meta mt-1">
                      Incomplete AI outputs, network interruptions, and existing notes or tasks you read never consume your quota.
                    </p>
                  </div>
                </div>
              </ProfileCard>

              <ProfileCard contentClassName="p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-violet-500/20 text-violet-200 ring-1 ring-violet-400/35">
                    <Zap className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="dc-profile-card-title">Scale Your Capacity</h2>
                    <p className="dc-profile-card-meta mt-1">
                      Upgrade your membership for unlimited My Day creation and higher AI token budgets, or bring your own API key.
                    </p>
                  </div>
                </div>
              </ProfileCard>
            </section>
          </div>
        </main>

        <BottomNav active="profile" onChange={handleFooterChange} purchasesBadge={purchasedIds.size} />
      </div>
    </div>
  );
}
