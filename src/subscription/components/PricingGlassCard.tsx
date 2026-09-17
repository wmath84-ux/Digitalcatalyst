import { Check, X } from "lucide-react";

// P1-2: Alag card design — below existing Summary Card, not replacing it.
// Sab kuch exactly vahi color from mobile_pricing_page.html
// Glass: rgba(255,255,255,0.1) blur16 radius28 border rgba(255,255,255,0.3)
// Badge: rgba(255,255,255,0.2) blur12, etc. — copied verbatim.
//
// Now accepts props from SubscriptionPage so the card reflects the
// CURRENT plan, billing cycle and features — everything updates live.

export interface PricingGlassCardProps {
  /** Plan name, e.g. "Basic", "Premium", "Pro". Falls back to "Plan". */
  planName?: string | null;
  /** Optional badge text, e.g. "POPULAR". */
  planBadge?: string | null;
  /** Plan description. */
  planDescription?: string | null;
  /** Plan monthly price in paise. */
  monthlyPricePaise?: number;
  /** Plan yearly price in paise. */
  yearlyPricePaise?: number;
  /** Active billing cycle. */
  cycle?: "monthly" | "yearly";
  /**
   * Features to show on the card. Each entry has a name and whether it
   * is included (free) with the selected plan or not.
   */
  features?: Array<{ name: string; included: boolean }>;
}

const rupees = (paise: number) =>
  `₹${Math.max(0, Math.round(paise / 100)).toLocaleString("en-IN")}`;

export default function PricingGlassCard({
  planName,
  planBadge = null,
  planDescription,
  monthlyPricePaise = 0,
  yearlyPricePaise = 0,
  cycle = "yearly",
  features,
}: PricingGlassCardProps) {
  const displayName = planName || "Plan";
  const isYearly = cycle === "yearly";

  // Price for the active cycle, in rupees.
  const activePricePaise = isYearly ? yearlyPricePaise : monthlyPricePaise;
  const activePriceRupees = Math.max(0, Math.round(activePricePaise / 100));

  // "Original" price = the other cycle's per-month equivalent for a
  // strikethrough comparison, or a simple 15% markup hint when only one
  // price is set.
  const otherCyclePaise = isYearly ? monthlyPricePaise : yearlyPricePaise;
  const otherCycleRupees = Math.max(0, Math.round(otherCyclePaise / 100));

  const yearlyTotalRupees = Math.round(yearlyPricePaise / 100);

  // Show a strikethrough "original" only when there is a meaningful difference.
  const showStrikethrough = otherCycleRupees > 0 && otherCycleRupees !== activePriceRupees;

  // Build the feature list. When props provide features we show them;
  // otherwise fall back to the original placeholder list.
  const hasPropsFeatures = Array.isArray(features) && features.length > 0;
  const displayFeatures: Array<{ label: string; included: boolean }> = hasPropsFeatures
    ? features!.map((f) => ({ label: f.name, included: f.included }))
    : [
        { label: "Access to core HR features", included: true },
        { label: "Employee record management", included: true },
        { label: "Basic reporting tools", included: true },
        { label: "Manage up to 10 team members", included: true },
        { label: "Track employee attendance", included: true },
        { label: "Assign and monitor tasks", included: true },
        { label: "Email support", included: false },
        { label: "Simple onboarding process", included: false },
        { label: "Designed user-focused interfaces", included: false },
      ];

  return (
    <div
      className="relative mt-4"
      style={{
        background: "rgba(255, 255, 255, 0.1)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderRadius: 28,
        border: "1px solid rgba(255, 255, 255, 0.3)",
        padding: "28px 24px",
        boxShadow:
          "0 4px 24px -1px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255,255,255,0.4)",
      }}
      data-pricing-glass-card
      data-plan={displayName}
      data-cycle={cycle}
    >
      {/* Badge — plan badge or default "15% off" for yearly */}
      <div
        style={{
          background: "rgba(255, 255, 255, 0.2)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(255, 255, 255, 0.4)",
          borderTop: "none",
          borderRight: "none",
          borderBottomLeftRadius: 20,
          borderTopRightRadius: 26,
          padding: "8px 16px",
          position: "absolute",
          top: 0,
          right: 0,
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          fontWeight: 500,
          color: "white",
          zIndex: 10,
        }}
      >
        {planBadge || (isYearly ? "15% off" : null) || "Best value"}
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: 9999,
            background: "white",
            marginLeft: 4,
          }}
        />
      </div>

      <div className="relative z-10 flex flex-col">
        {/* Plan name — dynamic, replaces old "Talent Pro" */}
        <h2 className="mb-6 text-2xl font-medium text-white/90">
          {displayName}
        </h2>

        <div className="mb-4 flex items-baseline gap-3">
          {showStrikethrough ? (
            <span className="text-4xl font-light text-white/50 line-through decoration-1">
              ₹{otherCycleRupees}
            </span>
          ) : null}
          <span className="text-6xl font-bold tracking-tighter text-white">
            ₹{activePriceRupees}
          </span>
          <div className="ml-1 flex flex-col text-sm">
            <span className="font-medium text-white">
              {isYearly ? "/ month (INR)" : "/ month (INR)"}
            </span>
            {isYearly && yearlyTotalRupees > 0 ? (
              <span className="mt-1 text-xs text-white/70">
                ₹{yearlyTotalRupees} billed yearly
              </span>
            ) : (
              <span className="mt-1 text-xs text-white/70">
                Billed monthly
              </span>
            )}
          </div>
        </div>

        <p className="mb-6 pr-8 text-sm font-light leading-relaxed text-white/80">
          {planDescription ||
            "A comprehensive solution for growing teams, offering enhanced features to streamline HR processes"}
        </p>

        <div
          style={{
            borderTop: "1.5px dashed rgba(255, 255, 255, 0.25)",
            margin: "24px 0",
            width: "100%",
          }}
        />

        <ul className="mb-8 flex-grow space-y-4">
          {displayFeatures.map(({ label, included }) =>
            included ? (
              <li key={label} className="flex items-start gap-4">
                <div
                  style={{
                    backgroundColor: "rgba(255, 255, 255, 0.15)",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    borderRadius: "50%",
                    width: 22,
                    height: 22,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  <Check
                    style={{ color: "rgba(255, 255, 255, 0.9)" }}
                    size={10}
                    strokeWidth={3}
                  />
                </div>
                <span className="pt-0.5 text-[15px] font-light leading-snug text-white/95">
                  {label}
                </span>
              </li>
            ) : (
              <li key={label} className="flex items-start gap-4 pt-0">
                <div
                  style={{
                    backgroundColor: "rgba(255, 255, 255, 0.15)",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    borderRadius: "50%",
                    width: 22,
                    height: 22,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  <X
                    style={{ color: "rgba(255, 255, 255, 0.4)" }}
                    size={10}
                    strokeWidth={3}
                  />
                </div>
                <span className="pt-0.5 text-[15px] font-light leading-snug text-white/50">
                  {label}
                </span>
              </li>
            ),
          )}
        </ul>

        <button
          type="button"
          style={{
            width: "100%",
            background: "rgba(255, 255, 255, 0.2)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(255, 255, 255, 0.4)",
            color: "white",
            padding: "16px 0",
            borderRadius: 20,
            fontSize: 18,
            fontWeight: 500,
          }}
          className="transition-all duration-300 hover:bg-white/30"
        >
          Subscribe
        </button>
      </div>
    </div>
  );
}
