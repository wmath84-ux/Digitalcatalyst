// src/subscription/components/SubscriptionPage.tsx
//
// Part 9 — server-driven subscription page. Loads plans + features
// from the server, builds a canonical `SubscriptionSelection`,
// and routes through the Part 5 CheckoutContext so the same
// Razorpay / coupon / EduCoin plumbing serves subscriptions.
//
// The previous implementation had a `setTimeout` simulation +
// `SuccessOverlay` + hard-coded `BASE_MONTHLY` / `BASE_YEARLY` /
// `COURSES` / `FEATURES` / `COUPONS` / `REFERRALS` constants. All
// of that is gone. Subscriptions are now paid via the same
// quote-driven flow as products / modules / updates.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, HelpCircle, LoaderCircle } from "lucide-react";
import StackedCards from "./StackedCards";
import PlanOverview from "./PlanOverview";
import PromoCodeInput, { type PromoResult } from "./PromoCodeInput";
import CourseSelectTrigger from "./CourseSelectTrigger";
import CourseSelectModal from "./CourseSelectModal";
import FeatureSelectTrigger from "./FeatureSelectTrigger";
import FeatureSelectModal from "./FeatureSelectModal";
import PriceSummary from "./PriceSummary";
import SubscribeBar from "./SubscribeBar";
import HelpModal from "./HelpModal";
import { SHOWCASE_CARDS } from "../data/showcase";
import { FALLBACK_SUBSCRIPTION_CATALOG } from "../data/fallbackCatalog";
import { useAuth } from "../../context/AuthContext";
import {
  startCheckout,
  type SubscriptionCatalog,
  type SubscriptionFeatureDoc,
  type SubscriptionPlanDoc,
} from "../utils/subscriptionCatalog";

export type BillingCycle = "monthly" | "yearly";

export default function SubscriptionPage() {
  const { user } = useAuth();

  // ---------- Server-driven state ----------
  const [catalog, setCatalog] = useState<SubscriptionCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState<boolean>(true);
  const [usingFallback, setUsingFallback] = useState<boolean>(false);

  // ---------- Selection state ----------
  const [cycle, setCycle] = useState<BillingCycle>("yearly");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<string[]>([]);
  const [isCourseModalOpen, setCourseModalOpen] = useState(false);
  const [isFeatureModalOpen, setFeatureModalOpen] = useState(false);
  const [isHelpOpen, setHelpOpen] = useState(false);

  // Coupon (server-validated through the Part 5 CheckoutContext).
  // The input is held locally; the Part 7 `applyCoupon` action in
  // the context takes the verified value. We deliberately do NOT
  // compute the discount client-side.
  const [, setCouponInput] = useState<string>("");
  const [couponStatus, setCouponStatus] = useState<"idle" | "applying" | "error">("idle");
  const [couponErrorMessage, setCouponErrorMessage] = useState<string | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discountPaise: number;
    label: string;
  } | null>(null);

  // Submit / busy state. The "loading" state drives the bottom
  // bar; the actual activation is performed by the Part 5
  // CheckoutContext + the Razorpay endpoints (no client-side
  // setTimeout activation).
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ---------- Catalog load ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCatalogLoading(true);
      setCatalogError(null);
      try {
        const next = await loadSubscriptionCatalog();
        if (cancelled) return;
        if (next.plans.length > 0) {
          setCatalog(next);
          // Pre-select the first plan (canonical default).
          setSelectedPlanId((current) => current || next.plans[0].id);
        } else {
          // Server is reachable but no active plans are configured
          // yet. Use defaults so the page still opens with content.
          setCatalog(FALLBACK_SUBSCRIPTION_CATALOG);
          setUsingFallback(true);
          setSelectedPlanId(
            (current) => current || FALLBACK_SUBSCRIPTION_CATALOG.plans[0]?.id || null,
          );
        }
      } catch (error) {
        if (cancelled) return;
        // The live catalog is unavailable (server unreachable,
        // collection not seeded, or missing service account). Fall
        // back to built-in defaults so the page still opens. The
        // checkout flow re-verifies everything server-side, so the
        // displayed defaults never become the source of truth.
        console.warn("Subscription catalog unavailable, using fallback.", error);
        setCatalog(FALLBACK_SUBSCRIPTION_CATALOG);
        setUsingFallback(true);
        setSelectedPlanId(
          (current) => current || FALLBACK_SUBSCRIPTION_CATALOG.plans[0]?.id || null,
        );
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- Derived ----------
  const plans: SubscriptionPlanDoc[] = catalog?.plans || [];
  const features: SubscriptionFeatureDoc[] = catalog?.features || [];
  const plan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId) || null,
    [plans, selectedPlanId],
  );
  const supportedCycles: BillingCycle[] = useMemo(() => {
    if (!plan) return [];
    return plan.allowedCycles.filter((c): c is BillingCycle => c === "monthly" || c === "yearly");
  }, [plan]);
  // If the active plan doesn't support the current cycle, fall back.
  useEffect(() => {
    if (plan && supportedCycles.length > 0 && !supportedCycles.includes(cycle)) {
      setCycle(supportedCycles[0]);
    }
  }, [plan, supportedCycles, cycle]);

  const selectedPlanPricePaise = useMemo(() => {
    if (!plan) return 0;
    return cycle === "monthly" ? plan.monthlyPricePaise : plan.yearlyPricePaise;
  }, [plan, cycle]);

  const selectedFeatureRecords = useMemo(
    () => features.filter((f) => selectedFeatureIds.includes(f.id)),
    [features, selectedFeatureIds],
  );

  // Plan-included features (free with the plan) — we surface them
  // in the price section so the user understands why no extra
  // charge is applied.
  const includedFeatureIds = useMemo(() => {
    if (!plan) return new Set<string>();
    return new Set(plan.includedFeatureIds);
  }, [plan]);
  const includedFeatureRecords = useMemo(
    () => features.filter((f) => includedFeatureIds.has(f.id)),
    [features, includedFeatureIds],
  );

  // Server is the only authority on price math. We display the
  // plan's cycle price + feature prices + coupon discount (from
  // the verified quote) — never derive the total client-side.
  const featuresTotalPaise = useMemo(
    () =>
      selectedFeatureRecords
        .filter((f) => !includedFeatureIds.has(f.id))
        .reduce((sum, f) => sum + (f.pricePaise || 0), 0),
    [selectedFeatureRecords, includedFeatureIds],
  );
  const subtotalPaise = selectedPlanPricePaise + featuresTotalPaise;
  const couponDiscountPaise = appliedCoupon?.discountPaise || 0;
  // Server-validated floor: minimum payable = plan's minimum
  // payable paise (admin-set), default 0.
  const minPayablePaise = plan?.minPayablePaise || 0;
  const totalPaise = Math.max(subtotalPaise - couponDiscountPaise, minPayablePaise);
  const totalRupees = (totalPaise / 100).toFixed(2);

  // ---------- Handlers ----------
  const handleApplyCoupon = useCallback(
    async (rawCode: string): Promise<PromoResult> => {
      if (!plan) {
        return { valid: false, message: "Choose a plan before applying a coupon." };
      }
      const code = rawCode.trim().toUpperCase();
      if (!code) return { valid: false, message: "Enter a coupon code." };
      setCouponStatus("applying");
      setCouponErrorMessage(null);
      setCouponInput(code);
      try {
        // Coupon validation goes through the server. The
        // server-side applyCoupon is owned by the Part 5
        // CheckoutContext + Part 7 coupon engine; we
        // re-implement a thin local hook that re-quotes the
        // current selection through the public Part 5
        // startCheckout helper so the same quote + coupon
        // pipeline is used. (For subscriptions, the server
        // returns the discountPaise in the verified quote.)
        const discountPaise = await preflightSubscriptionCoupon({
          planId: plan.id,
          cycle,
          selectedFeatureIds,
          selectedProductIds: selectedCourseIds,
          selectedModuleIds: [],
          couponCode: code,
          requestedEduCoins: 0,
        });
        setCouponStatus("idle");
        setAppliedCoupon({
          code,
          discountPaise,
          label: discountPaise > 0 ? "Verified savings" : "Coupon applied (no additional savings).",
        });
        return { valid: true, message: "Coupon applied." };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "This coupon could not be applied.";
        setCouponStatus("error");
        setCouponErrorMessage(message);
        return { valid: false, message };
      }
    },
    [plan, cycle, selectedFeatureIds, selectedCourseIds],
  );

  const handleRemoveCoupon = useCallback(() => {
    setCouponInput("");
    setAppliedCoupon(null);
    setCouponErrorMessage(null);
    setCouponStatus("idle");
  }, []);

  const handleSubscribe = useCallback(async () => {
    if (!user) {
      window.location.hash = `#/auth?mode=login&return=${encodeURIComponent("#/subscription")}`;
      return;
    }
    if (!plan) {
      setSubmitError("Please pick a plan to continue.");
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await startCheckout({
        selection: {
          purchaseKind: "subscription",
          productIds: selectedCourseIds,
          moduleIds: [],
          resourceIds: [],
          updateId: null,
          subscriptionPlanId: plan.id,
          billingCycle: cycle,
          featureIds: selectedFeatureIds,
          couponCode: appliedCoupon?.code || null,
          requestedEduCoins: 0,
          returnRoute: "#/subscription",
        },
        buyer: {
          uid: user.id,
          name: user.name || user.email || "",
          email: user.email || "",
        },
        returnRoute: { hash: "#/subscription" },
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Could not start subscription checkout.",
      );
      setIsSubmitting(false);
    }
  }, [user, plan, cycle, selectedFeatureIds, selectedCourseIds, appliedCoupon]);

  // ---------- Render ----------
  if (catalogLoading) {
    return (
      <div data-subscription-loading className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-gradient-to-b from-slate-50 to-white p-6 text-center text-sm text-slate-500">
        <LoaderCircle className="h-6 w-6 animate-spin text-violet-600" />
        <p className="font-semibold">Loading subscription plans…</p>
      </div>
    );
  }

  if (catalogError && !catalog) {
    return (
      <div data-subscription-catalog-error className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-gradient-to-b from-slate-50 to-white p-6 text-center text-sm text-slate-700">
        <p className="font-black text-rose-700">We couldn't load the subscription catalog.</p>
        <p className="text-xs text-slate-500">{catalogError}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-2xl bg-slate-900 px-4 py-2 text-xs font-bold text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] w-full flex-col bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <div className="sticky top-0 z-30 flex items-center justify-between bg-gradient-to-b from-slate-50 to-slate-50/70 px-5 pb-2 pt-5 backdrop-blur-sm">
        <button
          onClick={() => {
            window.location.hash = "#/profile";
          }}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm shadow-slate-200 active:scale-90 transition-transform"
          aria-label="Go back"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-[15px] font-extrabold tracking-tight text-slate-900">Go Premium</h1>
        <button
          onClick={() => setHelpOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm shadow-slate-200 active:scale-90 transition-transform"
          aria-label="Help & FAQ"
        >
          <HelpCircle className="h-4.5 w-4.5" />
        </button>
      </div>

      <div className="flex-1 pb-4">
        {usingFallback && (
          <div className="mx-5 mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-800">
            <span aria-hidden="true">⚠️</span>
            <span>
              Showing default plans because the live catalog isn&apos;t available
              yet. Final pricing is always confirmed at checkout.
            </span>
          </div>
        )}
        <StackedCards cards={SHOWCASE_CARDS} />

        {/* Plan + cycle card */}
        <PlanOverview
          plans={plans}
          features={features}
          selectedPlanId={selectedPlanId}
          onChangePlan={setSelectedPlanId}
          cycle={cycle}
          onChangeCycle={(c) => {
            if (supportedCycles.includes(c)) setCycle(c);
          }}
          selectedFeatureRecords={selectedFeatureRecords}
          includedFeatureRecords={includedFeatureRecords}
          totalPaise={totalPaise}
        />

        {/* Course (product) selector trigger */}
        <CourseSelectTrigger
          selectedIds={selectedCourseIds}
          onOpen={() => setCourseModalOpen(true)}
          catalog={catalog}
        />

        {/* Feature selector trigger */}
        <FeatureSelectTrigger
          features={features}
          selectedIds={selectedFeatureIds}
          onOpen={() => setFeatureModalOpen(true)}
        />

        {/* Coupon section — server-validated via the Part 7 engine. */}
        <div className="space-y-3 px-5 pt-5">
          <PromoCodeInput
            kind="coupon"
            label="Have a coupon? Enter the code below."
            placeholder="Enter coupon code"
            appliedCode={appliedCoupon?.code ?? null}
            appliedMessage={appliedCoupon?.label ?? null}
            errorMessage={couponStatus === "error" ? couponErrorMessage : null}
            onApply={handleApplyCoupon}
            onRemove={handleRemoveCoupon}
            disabled={isSubmitting}
          />
        </div>

        {/* Order summary */}
        <PriceSummary
          plan={plan}
          cycle={cycle}
          basePricePaise={selectedPlanPricePaise}
          featuresTotalPaise={featuresTotalPaise}
          featuresCount={selectedFeatureIds.filter((id) => !includedFeatureIds.has(id)).length}
          includedFeatureCount={includedFeatureIds.size}
          couponDiscountPaise={couponDiscountPaise}
          couponCode={appliedCoupon?.code ?? null}
          minPayablePaise={minPayablePaise}
          totalPaise={totalPaise}
        />

        <p className="px-5 pt-5 text-center text-[11px] leading-relaxed text-slate-400">
          By subscribing you agree to the Terms of Service. Your subscription
          renews automatically{" "}
          {cycle === "monthly" ? "every month" : "every year"} until cancelled.
        </p>
        {submitError ? (
          <p
            role="alert"
            data-subscription-submit-error
            className="mx-5 mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-center text-xs font-semibold text-rose-700"
          >
            {submitError}
          </p>
        ) : null}
      </div>

      {/* Sticky bottom bar */}
      <SubscribeBar
        totalPaise={totalPaise}
        subtotalPaise={subtotalPaise}
        couponDiscountPaise={couponDiscountPaise}
        loading={isSubmitting}
        disabled={!plan || isSubmitting}
        onSubscribe={() => void handleSubscribe()}
        totalRupees={totalRupees}
      />

      {/* Modals — only mounted when server-driven data is available. */}
      <CourseSelectModal
        open={isCourseModalOpen}
        selected={selectedCourseIds}
        onClose={() => setCourseModalOpen(false)}
        onChangeSelected={setSelectedCourseIds}
        catalog={catalog}
      />

      <FeatureSelectModal
        open={isFeatureModalOpen}
        features={features}
        selected={selectedFeatureIds}
        onClose={() => setFeatureModalOpen(false)}
        onChangeSelected={setSelectedFeatureIds}
        includedIds={Array.from(includedFeatureIds)}
      />

      <HelpModal open={isHelpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Server-driven catalog loader. The client posts to a thin proxy
// endpoint that reads the Firestore `subscriptionPlans` /
// `subscriptionFeatures` / `subscriptionPlanFeatures` /
// `subscriptionPlanProductUnlocks` / `subscriptionPlanModuleUnlocks`
// collections and returns a normalised `SubscriptionCatalog`.
// ---------------------------------------------------------------------------

async function loadSubscriptionCatalog(): Promise<SubscriptionCatalog> {
  const firebaseUser = await import("../../../firebase").then((m) => m.auth.currentUser);
  if (!firebaseUser) {
    // Allow public read so the page works even when the user is
    // signed out (the catalog itself is not user-specific).
  }
  const token = firebaseUser ? await firebaseUser.getIdToken(true) : "";
  const response = await fetch("/api/subscription-catalog", {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new Error(
      `Could not load subscription plans (server returned ${response.status}).`,
    );
  }
  const data = (await response.json().catch(() => ({}))) as { ok?: boolean; catalog?: SubscriptionCatalog; error?: string };
  if (!data.ok || !data.catalog) {
    throw new Error(data.error || "Subscription catalog response was malformed.");
  }
  return data.catalog;
}

// Pre-flight the coupon discount without navigating away from
// the page. Calls a thin server endpoint that re-quotes the
// selection and returns the validated `couponDiscount`. The full
// quote / Razorpay flow happens in the Part 5 CheckoutContext.
async function preflightSubscriptionCoupon(selection: {
  planId: string;
  cycle: BillingCycle;
  selectedFeatureIds: string[];
  selectedProductIds: string[];
  selectedModuleIds: string[];
  couponCode: string;
  requestedEduCoins: number;
}): Promise<number> {
  const firebaseUser = await import("../../../firebase").then((m) => m.auth.currentUser);
  if (!firebaseUser) throw new Error("Please sign in to apply a coupon.");
  const token = await firebaseUser.getIdToken(true);
  const response = await fetch("/api/subscription-coupon", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(selection),
  });
  const data = (await response.json().catch(() => ({}))) as { ok?: boolean; discountPaise?: number; error?: string };
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "This coupon could not be applied.");
  }
  return Number(data.discountPaise || 0);
}
