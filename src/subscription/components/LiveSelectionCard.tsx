// src/subscription/components/LiveSelectionCard.tsx
//
// The card the owner asked for: one surface that always states the CURRENT
// selection — plan, billing duration, chosen features, chosen courses and the
// resulting price — and re-renders the instant any of those change.
//
// It is a pure presentational component: every value is passed in from
// `SubscriptionPage`, which already derives them from the live catalog with the
// same helpers the server uses to charge. That is deliberate — the card can
// never disagree with checkout, because it does no maths of its own beyond
// formatting.
//
// It is rendered twice, from the same props:
//   1. inline on the page, as the anchor of the "Your selection" section, and
//   2. inside the AI Canvas Glass Modal (`GlassModal`) as the confirmation
//      body, so the review screen and the page can never show different things.

import { CalendarClock, Layers, Package, Sparkles, Tag } from "lucide-react";
import type { BillingCycle } from "../utils/subscriptionCatalog";

export interface LiveSelectionCardProps {
  planName: string | null;
  planBadge?: string | null;
  cycle: BillingCycle;
  /** Plan price for the active cycle, in paise. 0 when carried over. */
  planPricePaise: number;
  /** True when the plan is already owned and is NOT being charged again. */
  planAlreadyOwned?: boolean;
  featureNames: string[];
  includedFeatureNames: string[];
  featuresTotalPaise: number;
  courseNames: string[];
  coursesTotalPaise: number;
  discountPaise: number;
  discountLabel?: string | null;
  subtotalPaise: number;
  totalPaise: number;
  /** Renders the tighter variant used inside the modal. */
  compact?: boolean;
}

const rupees = (paise: number) => `₹${Math.max(0, Math.round(paise / 100)).toLocaleString("en-IN")}`;

function Row({
  icon: Icon,
  label,
  value,
  detail,
  tone = "default",
}: {
  icon: typeof Layers;
  label: string;
  value: string;
  detail?: string | null;
  tone?: "default" | "free" | "muted";
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <span className="flex min-w-0 items-start gap-2">
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-300" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block text-[11.5px] font-bold dc-ink-2">{label}</span>
          {detail ? <span className="mt-0.5 block text-[10.5px] leading-snug dc-ink-3">{detail}</span> : null}
        </span>
      </span>
      <span
        className={`shrink-0 text-[12px] font-extrabold tabular-nums ${
          tone === "free" ? "text-emerald-300" : tone === "muted" ? "dc-ink-3" : "dc-ink-1"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export default function LiveSelectionCard({
  planName,
  planBadge = null,
  cycle,
  planPricePaise,
  planAlreadyOwned = false,
  featureNames,
  includedFeatureNames,
  featuresTotalPaise,
  courseNames,
  coursesTotalPaise,
  discountPaise,
  discountLabel = "Discount",
  subtotalPaise,
  totalPaise,
  compact = false,
}: LiveSelectionCardProps) {
  const cycleLabel = cycle === "yearly" ? "Yearly · 12 months" : "Monthly · 1 month";
  const savedPaise = Math.max(0, subtotalPaise - totalPaise);

  return (
    <div
      data-subscription-live-card
      data-subscription-live-cycle={cycle}
      data-subscription-live-plan={planName || ""}
      className={`w-full rounded-2xl border border-white/12 bg-white/[0.05] ${compact ? "p-3.5" : "p-4"}`}
      style={{ boxShadow: "var(--dc-elev-2)" }}
    >
      {/* Header — plan + duration, the two things that drive everything else. */}
      <div className="flex items-start justify-between gap-3 pb-2">
        <div className="min-w-0">
          <span className="dc-section-label">Your selection</span>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[15px] font-black leading-tight dc-ink-1">
            {planName || "No plan chosen"}
            {planBadge ? (
              <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-200">
                {planBadge}
              </span>
            ) : null}
          </p>
          <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-bold dc-ink-3">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            {cycleLabel}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className="block text-[10px] font-black uppercase tracking-wide dc-ink-3">Total</span>
          <span className={`block text-xl ${totalPaise <= 0 ? "font-extrabold text-emerald-300" : "dc-hero-price"}`}>
            {totalPaise <= 0 ? "FREE" : rupees(totalPaise)}
          </span>
        </div>
      </div>

      <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
        <Row
          icon={Layers}
          label={planName ? `${planName} plan` : "Plan"}
          detail={planAlreadyOwned ? "Already active — not charged again" : cycleLabel}
          value={planAlreadyOwned ? "Owned" : planPricePaise <= 0 ? "Free" : rupees(planPricePaise)}
          tone={planAlreadyOwned ? "muted" : planPricePaise <= 0 ? "free" : "default"}
        />

        <Row
          icon={Sparkles}
          label={`Features (${featureNames.length + includedFeatureNames.length})`}
          detail={
            [
              featureNames.length ? featureNames.join(", ") : null,
              includedFeatureNames.length ? `Included with plan: ${includedFeatureNames.join(", ")}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "None selected yet"
          }
          value={featuresTotalPaise <= 0 ? (featureNames.length || includedFeatureNames.length ? "Free" : "—") : rupees(featuresTotalPaise)}
          tone={featuresTotalPaise <= 0 && (featureNames.length || includedFeatureNames.length) ? "free" : featuresTotalPaise <= 0 ? "muted" : "default"}
        />

        <Row
          icon={Package}
          label={`Courses (${courseNames.length})`}
          detail={courseNames.length ? courseNames.join(", ") : "None selected yet"}
          value={courseNames.length === 0 ? "—" : coursesTotalPaise <= 0 ? "Free" : rupees(coursesTotalPaise)}
          tone={courseNames.length === 0 ? "muted" : coursesTotalPaise <= 0 ? "free" : "default"}
        />

        {discountPaise > 0 ? (
          <Row
            icon={Tag}
            label={discountLabel || "Discount"}
            detail="Verified by the server before payment"
            value={`− ${rupees(discountPaise)}`}
            tone="free"
          />
        ) : null}
      </div>

      {/* Anchoring: the pre-discount subtotal is the quiet reference, the
          payable figure is the loud one, and the saving is stated in rupees. */}
      <div className="flex items-end justify-between gap-3 pt-3">
        <div className="flex flex-col">
          <span className="dc-section-label">You pay {cycle === "yearly" ? "for 12 months" : "for 1 month"}</span>
          {savedPaise > 0 ? (
            <span className="mt-1 flex items-baseline gap-2">
              <span className="text-[11px] dc-anchor-price">{rupees(subtotalPaise)}</span>
              <span className="dc-save-pill">Save {rupees(savedPaise)}</span>
            </span>
          ) : null}
        </div>
        <span className={`text-2xl ${totalPaise <= 0 ? "font-extrabold text-emerald-300" : "dc-hero-price"}`}>
          {totalPaise <= 0 ? "FREE" : rupees(totalPaise)}
        </span>
      </div>
    </div>
  );
}
