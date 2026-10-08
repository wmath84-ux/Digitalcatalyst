import { useState } from "react";
import { GlassToggleGroup, GlassToggleItem } from "../components/ui/glass-toggle-group";
import ProfileLayout, { type MembershipTier } from "./ProfileLayout";

/**
 * DEV-ONLY visual sandbox for the redesigned profile layout.
 *
 * Renders `ProfileLayout` with realistic mock data so the responsive
 * behaviour can be reviewed across phone / tablet / desktop without any
 * Firebase auth or Firestore. Reachable at `#/dev/profile-preview`.
 *
 * It stays isolated from auth and Firestore; the shared background context
 * lets its Profile switch preview the same app-wide preference as the real
 * page. Resizing the browser window is enough to see every breakpoint. The
 * toolbar at the top lets you flip between free and subscriber states.
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
  const plan = subscriber ? {
    status: "active",
    expiresAt: active ? PREMIUM_AT : EXPIRED_AT,
    cycle: active ? "yearly" : "monthly",
    planId: "premium",
    reminderOptOut: false,
    features: ["my-day", "revision"],
    includedProductIds: ["1", "2"],
  } : null;

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

      <div data-app-frame className="relative mx-auto flex min-h-screen w-full max-w-md flex-col sm:min-h-screen sm:max-w-none sm:overflow-hidden sm:rounded-none sm:border-0">
        <main data-profile-content className="relative z-[1] flex-1 overflow-y-auto px-3.5 sm:px-6 md:px-8 lg:px-10 pt-4 pb-32 sm:pb-36 md:pb-12">
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
              planDescription: subscriber ? "A balanced plan for focused study and cloud tools." : "",
              revisionTestBankLimit: subscriber ? 50 : null,
              features: subscriber ? [
                { id: "my-day", name: "My Day cloud saving", description: "Tasks, schedules and notes synced securely." },
                { id: "revision", name: "Roman AI Pro", description: "Daily tests and smart revision." },
              ] : [],
              includedCourses: subscriber ? [
                { id: "1", title: "Mastering React in 2026", image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=240&h=180&fit=crop" },
                { id: "2", title: "The Product Designer's Toolkit", image: "https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?w=240&h=180&fit=crop" },
              ] : [],
              subscription: plan,
            }}
            onOpenPlans={() => undefined}
            onOpenFeature={() => undefined}
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
              onCopy: () => undefined,
            }}
            renewal={subscriber && plan ? { tier, subscription: plan, now: Date.now(), onRenew: () => undefined, onToggleReminders: () => undefined } : null}
            onOpenUsageLimits={() => undefined}
            onOpenStudyLibrary={() => undefined}
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
