import { useState } from "react";
import { GlassCard } from "../components/ui/glass-card";
import { GlassToggleGroup, GlassToggleItem } from "../components/ui/glass-toggle-group";
import ProfileLayout, { type MembershipTier } from "./ProfileLayout";

/**
 * DEV-ONLY visual sandbox for the redesigned profile layout.
 *
 * Renders `ProfileLayout` with realistic mock data so the responsive
 * behaviour can be reviewed across phone / tablet / desktop without any
 * Firebase auth or Firestore. Reachable at `#/dev/profile-preview`.
 *
 * It is intentionally wiring-free: no Header / BottomNav / contexts, so
 * resizing the browser window is the only thing needed to see every
 * breakpoint. The toolbar at the top lets you flip between the free and
 * subscriber states.
 */

type Scenario = "free" | "premium" | "expired";

const PREMIUM_AT = Date.now() + 18 * 86400000;
const EXPIRED_AT = Date.now() - 4 * 86400000;

const TIERS: Record<Scenario, MembershipTier> = {
  free: "normal",
  premium: "premium",
  expired: "premium",
};

export default function ProfilePreview() {
  const [scenario, setScenario] = useState<Scenario>("premium");
  const tier = TIERS[scenario];
  const subscriber = scenario !== "free";
  const active = scenario === "premium";
  const plan = subscriber ? { status: "active", expiresAt: active ? PREMIUM_AT : EXPIRED_AT, cycle: active ? "yearly" : "monthly", planId: "premium", reminderOptOut: false } : null;

  // Mock slots to represent the account cards that live in the real app.
  const mockMyDayCard = (
    <GlassCard>
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30">☀️</span>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300">My Day</p>
          <h3 className="mt-0.5 text-base font-black text-white">3 free creations left today</h3>
          <p className="mt-0.5 text-xs font-medium text-white/55">Resets at midnight.</p>
        </div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full border border-white/15">
        <div className="h-full w-1/4 rounded-full bg-emerald-600" />
      </div>
    </GlassCard>
  );

  const mockAiQuotaCard = subscriber ? (
    <GlassCard>
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet-500/15 text-violet-300 ring-1 ring-violet-400/30">🤖</span>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-300">AI quota</p>
          <h3 className="mt-0.5 text-base font-black text-white">9 AI questions remaining</h3>
          <p className="mt-0.5 text-xs font-medium text-white/55">Resets weekly.</p>
        </div>
      </div>
    </GlassCard>
  ) : null;

  const tierLabel = tier === "normal" ? "Free learner" : tier === "premium" ? "Premium" : "Premium";
  const planLabel = tier === "normal" ? "Free plan" : "Premium Plan";

  return (
    <div data-profile-page className="min-h-screen text-white">
      {/* Dev toolbar */}
      <div className="sticky top-0 z-40 border-b border-white/10 px-4 py-3">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-white/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">Dev preview</span>
            <span className="text-xs font-semibold text-white/55">Profile layout · no data</span>
          </div>
          <GlassToggleGroup className="dc-segment" value={scenario} onValueChange={(next) => setScenario(next as Scenario)} aria-label="Preview scenario">
            {(["free", "premium", "expired"] as Scenario[]).map((s) => (
              <GlassToggleItem key={s} value={s} className="px-3 py-1.5 text-xs font-black capitalize">
                {s}
              </GlassToggleItem>
            ))}
          </GlassToggleGroup>
        </div>
      </div>

      <div data-app-frame className="relative mx-auto flex min-h-screen w-full max-w-md flex-col sm:min-h-screen sm:overflow-hidden sm:rounded-none sm:border-0 lg:max-w-full lg:rounded-none lg:border-0">
        <main data-profile-content className="relative z-[1] flex-1 overflow-y-auto px-4 pt-6 pb-10 md:px-6 lg:px-6 xl:px-8">
          <ProfileLayout
            name="Aarav Sharma"
            email="aarav.sharma@eduvora.app"
            bio="Product engineer and lifelong learner. Building calm tools for curious minds."
            initials="AS"
            memberSince="March 2024"
            onEdit={() => undefined}
            membership={{
              tier,
              subscriber,
              active,
              expired: subscriber && !active,
              tierLabel,
              planLabel,
              subscription: plan,
            }}
            membershipBadge={subscriber && plan ? (
              <span
                data-profile-membership-status={active ? "active" : "expired"}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${active ? "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30" : "bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30"}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-rose-500"}`} />
                {active ? "Active" : "Expired"}
              </span>
            ) : null}
            onOpenPlans={() => undefined}
            onOpenSubscriberExperience={() => undefined}
            stats={{
              ownedCount: 7,
              favoriteCount: 12,
              cartCount: 2,
              onOpenPurchases: () => undefined,
              onOpenFavorites: () => undefined,
              onOpenCart: () => undefined,
            }}
            referral={{
              code: "AARAV24",
              used: false,
              appName: "Eduvora",
              onCopy: () => undefined,
            }}
            renewal={subscriber && plan ? { tier, subscription: plan, now: Date.now(), onRenew: () => undefined, onToggleReminders: () => undefined } : null}
            myDayCard={mockMyDayCard}
            aiQuotaCard={mockAiQuotaCard}
            library={{
              items: [
                { id: "1", title: "Mastering React in 2026", image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=240&h=180&fit=crop" },
                { id: "2", title: "The Product Designer's Toolkit", image: "https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?w=240&h=180&fit=crop" },
                { id: "3", title: "Data Structures, Simply Explained", image: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=240&h=180&fit=crop" },
              ],
              ownedCount: 7,
              onOpenCourse: () => undefined,
              onOpenPurchases: () => undefined,
            }}
            onOpenSettings={() => undefined}
            saving={false}
            onLogout={() => undefined}
            isAdmin
            onOpenDashboard={() => undefined}
          />
        </main>
      </div>
    </div>
  );
}
