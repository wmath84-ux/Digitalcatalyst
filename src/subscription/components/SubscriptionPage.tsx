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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../../../firebase";
import { LoaderCircle } from "lucide-react";
import Header from "../../components/Header";
import BottomNav, { type TabKey } from "../../components/BottomNav";
import PromoCodeInput, { type PromoResult } from "./PromoCodeInput";
import CourseSelectModal from "./CourseSelectModal";
import FeatureSelectModal from "./FeatureSelectModal";
import PriceSummary, { formatSubscriptionMoney } from "./PriceSummary";
import MinimalPlanPicker from "./MinimalPlanPicker";
import { includedSubscriptionModules, subscriptionUnlockName } from "../utils/unlockPresentation";
import SubscribeBar from "./SubscribeBar";
import HelpModal from "./HelpModal";
import { FALLBACK_SUBSCRIPTION_CATALOG } from "../data/fallbackCatalog";
import { useAuth } from "../../context/AuthContext";
import { useCatalog } from "../../context/CatalogContext";
import { useSubscriptionGateLogic } from "../../hooks/useSubscriptionGateLogic";
import { apiFetch } from "../../utils/apiBase";
import {
  isPlanVisibleForAudience,
  resolveEffectiveSubscriberPrice,
} from "../../utils/subscriptionPricing";
import { playSfxError, playSfxSuccess } from "../../utils/sfx";
import { shouldShowCouponInput } from "../../../utils/couponVisibility";
import {
  groupFeaturesByPriceTier,
  resolveFeaturePrice,
  resolveFeaturesForPlan,
  sumSelectedFeaturePaise,
} from "../../../utils/featurePricing";
import { featuresForPlanCycle, planVisibleCycles } from "../../../utils/subscriptionVisibility";
import PlanComparisonTable from "./PlanComparisonTable";
import FeaturePricingTiers from "./FeaturePricingTiers";
import "../subscription-minimal.css";
import {
  evaluatePlanChange,
  evaluateSubscriptionSelection,
} from "../../../utils/subscriptionOwnership";
import { toMillis as renewalToMillis } from "../../../utils/renewalPresentation";
import { OverlayBoundsProvider } from "../../components/ui/overlayBounds";
import {
  startCheckout,
  type SubscriptionCatalog,
  type SubscriptionFeatureDoc,
  type SubscriptionPlanDoc,
} from "../utils/subscriptionCatalog";
import { loadSubscriptionCatalog } from "../utils/loadSubscriptionCatalog";

export type BillingCycle = "monthly" | "yearly";

/** Shape of `users/{uid}/subscription/current` that this page reads. */
type SubscriptionRecordLike = {
  status?: string;
  planId?: string;
  cycle?: string;
  features?: unknown;
  includedProductIds?: unknown;
  expiresAt?: unknown;
  orderId?: unknown;
  renewalReminderOptOut?: boolean;
};

const productHasId = (product: { id: string; documentId?: string }, ids: ReadonlySet<string>) =>
  ids.has(String(product.id)) || Boolean(product.documentId && ids.has(String(product.documentId)));

type SubscriptionPageProps = {
  cartCount: number;
  purchasesBadge: number;
  onNavigateToCart: () => void;
  onNavigateToSubscription: () => void;
  onNavigateToNotifications: () => void;
  onNavigateFooter: (tab: TabKey) => void;
};

export default function SubscriptionPage({
  cartCount,
  purchasesBadge,
  onNavigateToCart,
  onNavigateToSubscription,
  onNavigateToNotifications,
  onNavigateFooter,
}: SubscriptionPageProps) {
  const { user } = useAuth();
  const { products: availableProducts, purchasedIds } = useCatalog();
  const { settings: gateSettings } = useSubscriptionGateLogic();
  const renewalLoadedRef = useRef(false);
  const repairedOrderIdsRef = useRef<Set<string>>(new Set());
  // The page's content column (the scrollable <main> under the header). Every
  // picker overlay opened from this page (CourseSelectModal / FeatureSelectModal
  // / HelpModal / the confirm GlassModal) clamps itself to this column's
  // on-screen rectangle on tablet + desktop widths via OverlayBoundsProvider —
  // the same reuse My Day already built for its create/edit overlays — so a
  // picker visually belongs to the Subscription page instead of covering the
  // whole browser window. Phones keep the full-window bottom sheet.
  const contentColumnRef = useRef<HTMLElement>(null);

  // The buyer's live subscription record (null when never subscribed).
  const [activeSubscription, setActiveSubscription] = useState<SubscriptionRecordLike | null>(null);
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
  const [couponStatus, setCouponStatus] = useState<"idle" | "applying" | "error">("idle");
  const [couponErrorMessage, setCouponErrorMessage] = useState<string | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discountPaise: number;
    label: string;
    selectionKey: string;
  } | null>(null);
  const [appliedReferral, setAppliedReferral] = useState<{
    code: string;
    discountPaise: number;
    label: string;
    selectionKey: string;
  } | null>(null);
  const [referralError, setReferralError] = useState<string | null>(null);
  // A verified code belongs to one buyer and one exact selection. Never show
  // an old discount, or revive a slow response, after either has changed.
  const discountSelectionKey = JSON.stringify([
    user?.id || "",
    selectedPlanId,
    cycle,
    [...selectedFeatureIds].sort(),
    [...selectedCourseIds].sort(),
  ]);
  const discountScopeRef = useRef(discountSelectionKey);
  discountScopeRef.current = discountSelectionKey;
  const discountRequestRef = useRef(0);
  const activeCoupon = appliedCoupon?.selectionKey === discountSelectionKey ? appliedCoupon : null;
  const activeReferral =
    appliedReferral?.selectionKey === discountSelectionKey ? appliedReferral : null;
  useEffect(() => {
    discountRequestRef.current += 1;
    setAppliedCoupon(null);
    setAppliedReferral(null);
    setCouponStatus("idle");
    setCouponErrorMessage(null);
    setReferralError(null);
  }, [discountSelectionKey]);

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
            (current) => current || FALLBACK_SUBSCRIPTION_CATALOG.plans[0]?.id || null
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
          (current) => current || FALLBACK_SUBSCRIPTION_CATALOG.plans[0]?.id || null
        );
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Live subscription record. It drives plan ownership and checkout guards;
  // the membership summary and reminder controls now live in Profile.
  useEffect(() => {
    if (!user) {
      setActiveSubscription(null);
      return undefined;
    }
    return onSnapshot(
      doc(db, "users", user.id, "subscription", "current"),
      (snapshot) => {
        setActiveSubscription(
          snapshot.exists() ? (snapshot.data() as SubscriptionRecordLike) : null
        );
      },
      () => setActiveSubscription(null)
    );
  }, [user]);

  // Self-heal purchases made before product ids became first-class quote
  // metadata. A verified intent can be safely replayed by its owner; the server
  // merges any missing product ids without extending the membership period.
  useEffect(() => {
    const orderId = String(activeSubscription?.orderId || "").trim();
    if (
      !user ||
      activeSubscription?.status !== "active" ||
      !orderId ||
      repairedOrderIdsRef.current.has(orderId)
    )
      return;
    const firebaseUser = auth.currentUser;
    if (!firebaseUser || firebaseUser.uid !== user.id) return;
    repairedOrderIdsRef.current.add(orderId);
    void firebaseUser
      .getIdToken()
      .then((token: string) =>
        apiFetch("/api/razorpay/verify-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ orderId }),
        })
      )
      .then((response: Response) => {
        if (!response.ok) repairedOrderIdsRef.current.delete(orderId);
      })
      .catch(() => repairedOrderIdsRef.current.delete(orderId));
  }, [activeSubscription, user]);

  // Renewal / change-plan checkout restores the user's current plan, cycle,
  // features and bonus products so they review the exact package before
  // paying again.
  useEffect(() => {
    if (!user || !catalog || renewalLoadedRef.current) return;
    renewalLoadedRef.current = true;
    void getDoc(doc(db, "users", user.id, "subscription", "current")).then((snapshot) => {
      const data = snapshot.data() || {};
      if (!snapshot.exists()) return;
      if (catalog.plans.some((plan) => plan.id === String(data.planId || "")))
        setSelectedPlanId(String(data.planId));
      if (data.cycle === "monthly" || data.cycle === "yearly") setCycle(data.cycle);
      const activeFeatureIds = new Set(catalog.features.map((feature) => feature.id));
      setSelectedFeatureIds(
        (Array.isArray(data.features) ? data.features.map(String) : []).filter((id) =>
          activeFeatureIds.has(id)
        )
      );
      const storedProductIds = new Set(
        Array.isArray(data.includedProductIds) ? data.includedProductIds.map(String) : []
      );
      setSelectedCourseIds(
        availableProducts
          .filter((product) => productHasId(product, storedProductIds))
          .map((product) => String(product.documentId || product.id))
      );
    });
  }, [availableProducts, catalog, user]);

  // ---------- Derived ----------
  const plans: SubscriptionPlanDoc[] = catalog?.plans || [];
  const rawFeatures: SubscriptionFeatureDoc[] = catalog?.features || [];
  const rawSubscriptionProducts: any[] = catalog?.subscriptionProducts || [];
  // Default-select the core paid features (My Day + Roman AI Pro) whenever
  // they exist in the catalog and the buyer has not made an explicit choice.
  // Removing a feature from the catalog drops it from the default set too.
  useEffect(() => {
    const defaultFeatureIds = ["my-day", "revision"];
    if (rawFeatures.some((feature) => defaultFeatureIds.includes(feature.id))) {
      setSelectedFeatureIds((current) =>
        current.length === 0
          ? defaultFeatureIds.filter((id) => rawFeatures.some((feature) => feature.id === id))
          : current
      );
    }
  }, [rawFeatures]);
  const plan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId) || null,
    [plans, selectedPlanId]
  );
  // Membership state — declared here (not further down) because the per-cycle
  // visibility rules below need to know whether this buyer is already a member:
  // a member keeps every cycle and every feature they pay for.
  const subscriptionExpiresAtMs = renewalToMillis(activeSubscription?.expiresAt);
  const isActiveMember =
    activeSubscription?.status === "active" && subscriptionExpiresAtMs > Date.now();

  // Which cycles this buyer may pick for the selected plan: the plan's own
  // `allowedCycles` (hard rule, also enforced by the quote) narrowed by the
  // admin's per-cycle visibility for NON-subscribers. Members keep both.
  const supportedCycles: BillingCycle[] = useMemo(() => {
    if (!plan) return [];
    return planVisibleCycles(plan, {
      isSubscriber: isActiveMember,
      gateRows: gateSettings.planVisibility,
    });
  }, [plan, isActiveMember, gateSettings.planVisibility]);
  // If the active plan doesn't support the current cycle, fall back.
  useEffect(() => {
    if (plan && supportedCycles.length > 0 && !supportedCycles.includes(cycle)) {
      setCycle(supportedCycles[0]);
    }
  }, [plan, supportedCycles, cycle]);

  // The plan's admin-configured cycle price is part of the payable total.
  // Checkout resolves the same field server-side, so this display cannot be
  // used to tamper with the amount.
  const publicPlanPricePaise = plan
    ? cycle === "yearly"
      ? plan.yearlyPricePaise
      : plan.monthlyPricePaise
    : 0;
  const selectedPlanPricePaise =
    plan && isActiveMember && publicPlanPricePaise > 0
      ? Math.round(
          resolveEffectiveSubscriberPrice(
            plan.id,
            cycle,
            publicPlanPricePaise / 100,
            true,
            plan.subscriberPricingOverride ?? null,
            gateSettings.subscriberPricing
          ) * 100
        )
      : publicPlanPricePaise;

  // ── Per-cycle visibility (admin → catalog → page) ─────────────────────────
  // The admin decides, per feature, which cycles a NON-subscriber may be
  // offered it on (`visibleCycles`), which plans it is removed from outright
  // (`hiddenPlanIds`), and can stage the same thing in the
  // `settings/subscriptionGate` matrix (`durations`). The shared pure helper
  // resolves all three, so the table/list below genuinely changes when the
  // Monthly ↔ Yearly toggle moves — and the server refuses anything hidden
  // here, using the same function.
  const cycleVisibilityOptions = useMemo(
    () => ({ isSubscriber: isActiveMember, gateRows: gateSettings.features }),
    [gateSettings.features, isActiveMember]
  );
  /** Features offered on the selected plan + cycle (this is what the page lists). */
  const offeredFeatures = useMemo(
    () => featuresForPlanCycle(rawFeatures, selectedPlanId, cycle, cycleVisibilityOptions),
    [cycleVisibilityOptions, rawFeatures, selectedPlanId, cycle]
  );
  /** Price tiers for the offered features, re-priced for the active plan + cycle. */
  const featurePriceTiers = useMemo(
    () => groupFeaturesByPriceTier(offeredFeatures, selectedPlanId, cycle),
    [offeredFeatures, selectedPlanId, cycle]
  );
  const offeredFeatureIdSet = useMemo(
    () => new Set(offeredFeatures.map((feature) => String(feature.id))),
    [offeredFeatures]
  );

  // A selection can only ever contain what is being offered: switching to a
  // cycle where the admin hid a feature drops it from the order (the server
  // applies the identical rule, so the page can never promise a hidden item).
  useEffect(() => {
    setSelectedFeatureIds((current) => {
      const next = current.filter((id) => offeredFeatureIdSet.has(id));
      return next.length === current.length ? current : next;
    });
  }, [offeredFeatureIdSet]);

  // Feature prices are plan-aware AND cycle-aware: the same feature can
  // cost ₹99 on Basic, ₹49 on Premium and be free on Pro, with separate
  // yearly rates. `resolveFeaturesForPlan` projects the catalog onto the
  // active plan + cycle so every price the buyer sees below already
  // reflects those overrides. The server re-resolves with the identical
  // helper, so display and charge can never drift apart.
  const features = useMemo(
    () => resolveFeaturesForPlan<SubscriptionFeatureDoc>(offeredFeatures, selectedPlanId, cycle),
    [offeredFeatures, selectedPlanId, cycle]
  );

  // Plan-included features (free with the plan) — we surface them
  // in the price section so the user understands why no extra
  // charge is applied. A feature is also treated as included when the
  // plan override resolved it to free.
  const includedFeatureIds = useMemo(() => {
    const ids = new Set<string>(plan ? plan.includedFeatureIds : []);
    for (const feature of features) {
      if (feature.resolvedIncluded) ids.add(feature.id);
    }
    return ids;
  }, [plan, features]);
  const includedFeatureRecords = useMemo(
    () => features.filter((f) => includedFeatureIds.has(f.id)),
    [features, includedFeatureIds]
  );

  // ---------------------------------------------------------------------------
  // Ownership + add-on upgrade verdict. `activeSubscription` is a live
  // snapshot, so this re-evaluates whenever the membership changes as well as
  // when the selection changes. Passed to the pricing block below so an
  // add-on upgrade charges ONLY the new items.
  // ---------------------------------------------------------------------------
  const ownedPlanId = String(activeSubscription?.planId || "").trim();
  const ownedCycle: BillingCycle | null =
    activeSubscription?.cycle === "yearly"
      ? "yearly"
      : activeSubscription?.cycle === "monthly"
      ? "monthly"
      : null;
  // Plans rank by their catalog `sortOrder` (Basic 1 < Premium 2 < Pro 3 …).
  // A null rank means "cannot rank" — the no-downgrade rule then refuses to
  // guess and never blocks.
  const planOrderOf = useCallback(
    (planId: string | null | undefined): number | null => {
      const found = plans.find((entry) => entry.id === String(planId || ""));
      const order = Number(found?.sortOrder);
      return found && Number.isFinite(order) ? order : null;
    },
    [plans]
  );
  const ownedPlanOrder = planOrderOf(ownedPlanId);

  // NO-DOWNGRADE verdict: while the membership is active a lower plan — or
  // the monthly cycle of a yearly-held plan — can never be purchased. The
  // pure helper is shared with the quote endpoint, so the server refuses the
  // same order even if the page state is tampered with.
  const planChangeState = useMemo(
    () =>
      evaluatePlanChange({
        record: activeSubscription,
        planId: selectedPlanId,
        cycle,
        ownedPlanOrder,
        selectedPlanOrder: planOrderOf(selectedPlanId),
      }),
    [activeSubscription, selectedPlanId, cycle, ownedPlanOrder, planOrderOf]
  );

  const ownershipState = useMemo(() => {
    const base = evaluateSubscriptionSelection({
      record: activeSubscription,
      planId: selectedPlanId,
      cycle,
      featureIds: selectedFeatureIds,
      productIds: selectedCourseIds,
    });
    if (!planChangeState.blocked) return base;
    return {
      ...base,
      blocked: true,
      downgrade: true,
      code: planChangeState.code,
      reason: planChangeState.reason,
    };
  }, [
    activeSubscription,
    selectedPlanId,
    cycle,
    selectedFeatureIds,
    selectedCourseIds,
    planChangeState,
  ]);
  const isSelectionOwned = ownershipState.owned;
  // An add-on upgrade: the member keeps their current plan + cycle but adds at
  // least one feature / product they don't have yet. Only the NEW items are
  // charged (the server enforces the same rule when it builds the quote).
  const isAddOnUpgrade = Boolean(ownershipState.addOnPurchase && !ownershipState.blocked);

  // -------------------------------------------------------------------------
  // ALREADY-PAID CARRY-OVER. While a membership is active, every feature /
  // product the member already unlocked (bought with the current
  // subscription, or free on the owned plan/cycle) is ALREADY PAID. Those
  // items must never be added to another plan's order summary — on a renewal,
  // an in-plan add-on, or a switch to a higher plan. They are carried over
  // (still granted on the new plan) but contribute ₹0, exactly as the server
  // quote filters them.
  // -------------------------------------------------------------------------
  const membershipOwnedFeatureIds = useMemo(() => {
    if (!ownershipState.active) return [];
    const owned = new Set<string>(
      Array.isArray(activeSubscription?.features) ? activeSubscription.features.map(String) : []
    );
    const recordPlanId = String(activeSubscription?.planId || "").trim();
    const recordCycle: BillingCycle | null =
      activeSubscription?.cycle === "yearly"
        ? "yearly"
        : activeSubscription?.cycle === "monthly"
        ? "monthly"
        : null;
    if (recordPlanId && recordCycle) {
      for (const feature of rawFeatures) {
        const resolved = resolveFeaturePrice(feature as never, recordPlanId, recordCycle);
        if (feature.included || resolved.included) owned.add(String(feature.id));
      }
    }
    return Array.from(owned);
  }, [ownershipState.active, activeSubscription, rawFeatures]);
  const membershipOwnedFeatureIdSet = useMemo(
    () => new Set(membershipOwnedFeatureIds),
    [membershipOwnedFeatureIds]
  );
  const membershipOwnedProductIds = useMemo(() => {
    if (!ownershipState.active) return [];
    return Array.from(
      new Set(
        Array.isArray(activeSubscription?.includedProductIds)
          ? activeSubscription.includedProductIds.map(String)
          : []
      )
    );
  }, [ownershipState.active, activeSubscription]);
  const membershipOwnedProductIdSet = useMemo(
    () => new Set(membershipOwnedProductIds),
    [membershipOwnedProductIds]
  );

  // Catalog-based estimate only. Code reductions are preflight-validated;
  // checkout computes and verifies the final price server-side.
  //
  // Already-owned carry-over: whenever the buyer has an active membership,
  // ONLY the items not already unlocked are payable. The plan line stays
  // (a renewal / plan change buys the new cycle; only the same-plan add-on
  // skips it), but every paid feature / product is excluded from the total
  // shown here — exactly like the server filters the quote line items.
  const chargeableFeatureIds = useMemo(
    () =>
      ownershipState.active
        ? selectedFeatureIds.filter((id) => !membershipOwnedFeatureIdSet.has(id))
        : isAddOnUpgrade
        ? ownershipState.newFeatureIds
        : selectedFeatureIds,
    [
      ownershipState.active,
      isAddOnUpgrade,
      ownershipState.newFeatureIds,
      selectedFeatureIds,
      membershipOwnedFeatureIdSet,
    ]
  );
  const chargeableCourseIds = useMemo(
    () =>
      ownershipState.active
        ? selectedCourseIds.filter((id) => !membershipOwnedProductIdSet.has(id))
        : isAddOnUpgrade
        ? ownershipState.newProductIds
        : selectedCourseIds,
    [
      ownershipState.active,
      isAddOnUpgrade,
      ownershipState.newProductIds,
      selectedCourseIds,
      membershipOwnedProductIdSet,
    ]
  );
  // Items the buyer already owns but still selected — shown in the summary as
  // "Already purchased · ₹0" so it is impossible to miss that nothing is
  // charged for them twice.
  const carriedOverFeatureRecords = useMemo(
    () =>
      features.filter(
        (feature) =>
          selectedFeatureIds.includes(feature.id) && membershipOwnedFeatureIdSet.has(feature.id)
      ),
    [features, selectedFeatureIds, membershipOwnedFeatureIdSet]
  );
  const carriedOverProductRecords = useMemo(() => {
    if (!ownershipState.active) return [];
    const carried = new Set(selectedCourseIds.filter((id) => membershipOwnedProductIdSet.has(id)));
    return availableProducts.filter((product) => productHasId(product, carried));
  }, [ownershipState.active, selectedCourseIds, membershipOwnedProductIdSet, availableProducts]);
  const hasOwnedCarryOver =
    carriedOverFeatureRecords.length > 0 || carriedOverProductRecords.length > 0;
  const featuresTotalPaise = useMemo(
    () => sumSelectedFeaturePaise(offeredFeatures, chargeableFeatureIds, selectedPlanId, cycle),
    [offeredFeatures, chargeableFeatureIds, selectedPlanId, cycle]
  );
  const chargeableProductRecords = useMemo(() => {
    const chargeable = new Set(chargeableCourseIds);
    return availableProducts.filter((product) => productHasId(product, chargeable));
  }, [availableProducts, chargeableCourseIds]);

  // Names for the order summary: paid features (excluding plan-included ones)
  // and the selected bonus products, so the summary lists exactly what the
  // buyer picked — not just aggregate counts.
  const chargeableFeatureRecords = useMemo(
    () =>
      features.filter(
        (feature) =>
          chargeableFeatureIds.includes(feature.id) && !includedFeatureIds.has(feature.id)
      ),
    [features, chargeableFeatureIds, includedFeatureIds]
  );

  // Resolve subscriptionProducts (new per-plan / duration priced add-ons) into selectable records
  // These can be used to override prices of catalog products when selected via subscription.
  const resolvedSubscriptionProducts = useMemo(() => {
    return rawSubscriptionProducts.map((sp) => {
      const resolved = resolveFeaturePrice(
        {
          id: sp.productId || sp.id,
          included: sp.included,
          pricePaise: sp.pricePaise || 0,
          monthlyPricePaise: sp.monthlyPricePaise,
          yearlyPricePaise: sp.yearlyPricePaise,
          planPricing: sp.planPricing || {},
        },
        selectedPlanId,
        cycle
      );
      return {
        ...sp,
        resolvedPrice: resolved.pricePaise / 100,
        resolvedIncluded: resolved.included,
        checkoutId: sp.productId || sp.id,
      };
    });
  }, [rawSubscriptionProducts, selectedPlanId, cycle]);
  const subscriptionDisplayProducts = useMemo(
    () =>
      availableProducts.map((product) => {
        const pricing = resolvedSubscriptionProducts.find(
          (entry) =>
            String(entry.productId || entry.id) === String(product.id) ||
            String(entry.productId || entry.id) === String(product.documentId || "")
        );
        return pricing
          ? {
              ...product,
              price: Math.max(0, Number(pricing.resolvedPrice || 0)),
              originalPrice: Math.max(0, Number(pricing.resolvedPrice || 0)),
            }
          : product;
      }),
    [availableProducts, resolvedSubscriptionProducts]
  );
  const productsTotalPaise = useMemo(
    () =>
      chargeableProductRecords.reduce((sum, product) => {
        const pricing = resolvedSubscriptionProducts.find(
          (entry) =>
            String(entry.productId || entry.id) === String(product.id) ||
            String(entry.productId || entry.id) === String(product.documentId || "")
        );
        return (
          sum +
          (pricing
            ? Math.max(0, Math.round(Number(pricing.resolvedPrice || 0) * 100))
            : Math.max(0, Math.round(product.price * 100)))
        );
      }, 0),
    [chargeableProductRecords, resolvedSubscriptionProducts]
  );
  // The plan's cycle price is NOT charged again for an add-on upgrade —
  // the plan was already paid when the membership started.
  const planPricePaise = isAddOnUpgrade ? 0 : selectedPlanPricePaise;
  const subtotalPaise = planPricePaise + featuresTotalPaise + productsTotalPaise;
  const couponDiscountPaise = activeReferral?.discountPaise || activeCoupon?.discountPaise || 0;
  // Server-validated floor: minimum payable = plan's minimum
  // payable paise (admin-set), default 0. Add-on upgrades only charge the
  // new items, so the plan's floor must not inflate them.
  const minPayablePaise = isAddOnUpgrade ? 0 : plan?.minPayablePaise || 0;
  const totalPaise = Math.max(subtotalPaise - couponDiscountPaise, minPayablePaise);

  // "Zero means free": when the admin priced the plan (and every selected
  // add-on) at ₹0 and no minimum-payable floor applies, this selection is a
  // free subscription. Checkout still goes through the same server-verified
  // quote — the server independently computes ₹0 and takes the free-order
  // path (no Razorpay), so this flag is display/UX only and can't be abused.
  const isFreeSelection = Math.max(subtotalPaise, minPayablePaise) <= 0;

  // A coupon can only reduce money that is actually charged. When the
  // selection is free (no paid features / products and no minimum
  // payable), the coupon field is not rendered at all.
  const canShowCouponInput = shouldShowCouponInput({
    purchaseKind: "subscription",
    payablePaise: Math.max(subtotalPaise, minPayablePaise),
  });

  // Active and free accounts both land on this same plan-selection page.
  // Membership management lives in Profile; the existing ownership guards
  // below still prevent repeat purchases and enforce the no-downgrade rules.

  // ---------------------------------------------------------------------------
  // NO-DOWNGRADE plan ladder. An active member never sees the plans BELOW
  // their own: the picker shows only their current plan (for renewal +
  // add-ons) and every HIGHER plan. Guests and expired members see the full
  // catalog. If the member's plan no longer ranks (deactivated), nothing is
  // hidden — the server re-checks the same rule at checkout anyway.
  // ---------------------------------------------------------------------------
  const pickerPlans = useMemo(() => {
    const audienceVisible = plans.filter((candidate) =>
      isPlanVisibleForAudience(candidate.id, isActiveMember, gateSettings.planVisibility, {
        ownedPlanId: isActiveMember ? ownedPlanId : null,
      })
    );
    if (!isActiveMember || ownedPlanOrder === null) return audienceVisible;
    return audienceVisible.filter((candidate) => {
      const order = Number(candidate.sortOrder);
      if (!Number.isFinite(order)) return true; // never hide unranked custom plans
      return order >= ownedPlanOrder;
    });
  }, [plans, isActiveMember, ownedPlanOrder, ownedPlanId, gateSettings.planVisibility]);

  // If the selection falls outside the ladder (e.g. the catalog loaded after
  // the default pre-select picked the lowest plan for a Premium member), snap
  // it back to the member's own plan — or the first plan still purchasable.
  useEffect(() => {
    if (pickerPlans.length === 0) return;
    if (selectedPlanId && pickerPlans.some((candidate) => candidate.id === selectedPlanId)) return;
    const ownedVisible =
      ownedPlanId && pickerPlans.some((candidate) => candidate.id === ownedPlanId);
    setSelectedPlanId(ownedVisible ? ownedPlanId : pickerPlans[0].id);
  }, [pickerPlans, selectedPlanId, ownedPlanId]);

  // A yearly member can never slip into the monthly cycle of their own plan
  // while the yearly membership is active. The toggle is also disabled in
  // PlanOverview; this is the state-level guard so the two never disagree.
  useEffect(() => {
    if (
      isActiveMember &&
      ownedCycle === "yearly" &&
      selectedPlanId &&
      selectedPlanId === ownedPlanId &&
      cycle === "monthly"
    ) {
      setCycle("yearly");
    }
  }, [isActiveMember, ownedCycle, selectedPlanId, ownedPlanId, cycle]);

  const memberFeatureIds = useMemo(
    () =>
      Array.isArray(activeSubscription?.features) ? activeSubscription.features.map(String) : [],
    [activeSubscription]
  );
  // Features the buyer already owns as far as the subscription page is
  // concerned: the ids stored on their active membership PLUS every feature
  // that is free on the plan + cycle they are currently looking at (globally
  // included or a plan override). Such features carry no price, so they must
  // show as "Purchased"/Included and never be treated as chargeable add-ons —
  // this keeps the pickers, tiers and totals in sync with what the grant
  // actually writes after payment.
  const ownedFeatureIds = useMemo(() => {
    const owned = new Set<string>(memberFeatureIds);
    for (const feature of features) {
      const resolved = resolveFeaturePrice(feature as never, selectedPlanId || "", cycle);
      if (feature.included || resolved.included) owned.add(feature.id);
    }
    return Array.from(owned);
  }, [features, memberFeatureIds, selectedPlanId, cycle]);
  // Course picker owned ids: store-purchased products (already in the
  // catalog) UNION products unlocked by the active subscription — neither
  // can ever be re-selected, so they are never charged a second time.
  const subscriptionProductOwnedIds = useMemo(
    () => new Set<string>([...purchasedIds, ...membershipOwnedProductIds]),
    [purchasedIds, membershipOwnedProductIds]
  );

  // Never leave a stale coupon / referral attached to a selection the buyer
  // cannot purchase. Add-on upgrades ARE purchasable, so their coupon state
  // is kept.
  useEffect(() => {
    if (!isSelectionOwned || isAddOnUpgrade) return;
    setAppliedCoupon(null);
    setAppliedReferral(null);
    setCouponErrorMessage(null);
    setReferralError(null);
    setCouponStatus("idle");
    setSubmitError(null);
  }, [isSelectionOwned, isAddOnUpgrade]);

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
      const selectionKey = discountSelectionKey;
      const request = ++discountRequestRef.current;
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
        });
        if (discountScopeRef.current !== selectionKey || discountRequestRef.current !== request)
          return { valid: false, message: "Selection changed. Apply the code again." };
        setCouponStatus("idle");
        setAppliedReferral(null);
        setReferralError(null);
        playSfxSuccess();
        setAppliedCoupon({
          code,
          selectionKey,
          discountPaise,
          label: discountPaise > 0 ? "Verified savings" : "Coupon applied (no additional savings).",
        });
        return { valid: true, message: "Coupon applied." };
      } catch (error) {
        if (discountScopeRef.current !== selectionKey || discountRequestRef.current !== request)
          return { valid: false, message: "Selection changed. Apply the code again." };
        const message =
          error instanceof Error ? error.message : "This coupon could not be applied.";
        setCouponStatus("error");
        setCouponErrorMessage(message);
        playSfxError();
        return { valid: false, message };
      }
    },
    [plan, cycle, selectedFeatureIds, selectedCourseIds, discountSelectionKey]
  );

  const handleRemoveCoupon = useCallback(() => {
    discountRequestRef.current += 1;
    setAppliedCoupon(null);
    setCouponErrorMessage(null);
    setCouponStatus("idle");
  }, []);

  // If the selection drops to ₹0 while a coupon was applied, discard
  // the code so nothing stale is carried into checkout.
  useEffect(() => {
    if (!canShowCouponInput && appliedCoupon) {
      setAppliedCoupon(null);
      setCouponErrorMessage(null);
      setCouponStatus("idle");
    }
  }, [canShowCouponInput, appliedCoupon]);

  // Same rule for referral codes: there is nothing to discount on a free
  // selection, so never carry a stale referral into a ₹0 checkout.
  useEffect(() => {
    if (isFreeSelection && appliedReferral) {
      setAppliedReferral(null);
      setReferralError(null);
    }
  }, [isFreeSelection, appliedReferral]);

  const handleApplyReferral = useCallback(
    async (rawCode: string): Promise<PromoResult> => {
      const code = rawCode.trim().toUpperCase();
      if (!code) return { valid: false, message: "Enter a referral code." };
      setReferralError(null);
      const selectionKey = discountSelectionKey;
      const request = ++discountRequestRef.current;
      try {
        const firebaseUser = await import("../../../firebase").then(
          (module) => module.auth.currentUser
        );
        if (!firebaseUser) throw new Error("Please sign in to apply a referral code.");
        const token = await firebaseUser.getIdToken(true);
        const response = await apiFetch("/api/subscription-referral", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ referralCode: code }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          code?: string;
          discountPaise?: number;
          error?: string;
        };
        if (!response.ok || !data.ok) throw new Error(data.error || "Referral code is invalid.");
        const discountPaise = Math.max(0, Number(data.discountPaise || 0));
        if (discountScopeRef.current !== selectionKey || discountRequestRef.current !== request)
          return { valid: false, message: "Selection changed. Apply the code again." };
        setAppliedCoupon(null);
        playSfxSuccess();
        setAppliedReferral({
          code: data.code || code,
          discountPaise,
          selectionKey,
          label: `${formatSubscriptionMoney(
            discountPaise
          )} referral discount, subject to the minimum payable.`,
        });
        return { valid: true, message: "Referral code applied." };
      } catch (error) {
        if (discountScopeRef.current !== selectionKey || discountRequestRef.current !== request)
          return { valid: false, message: "Selection changed. Apply the code again." };
        const message = error instanceof Error ? error.message : "Referral code is invalid.";
        setReferralError(message);
        playSfxError();
        return { valid: false, message };
      }
    },
    [discountSelectionKey]
  );

  const handleRemoveReferral = useCallback(() => {
    discountRequestRef.current += 1;
    setAppliedReferral(null);
    setReferralError(null);
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
    // Hard stop: the buyer already owns this exact plan + cycle and is not in
    // the renewal window. The server refuses the quote too — this is the
    // friendly, immediate half of the same rule.
    if (ownershipState.blocked) {
      setSubmitError(ownershipState.reason || "You already have this plan active.");
      playSfxError();
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
          couponCode: activeReferral?.code || activeCoupon?.code || null,
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
        error instanceof Error ? error.message : "Could not start subscription checkout."
      );
      setIsSubmitting(false);
    }
  }, [
    user,
    plan,
    cycle,
    selectedFeatureIds,
    selectedCourseIds,
    activeCoupon,
    activeReferral,
    ownershipState,
  ]);

  // ---------- Render ----------
  return (
    <OverlayBoundsProvider value={contentColumnRef}>
      <div className="min-h-screen overflow-x-hidden">
        <div
          data-app-frame
          className="relative mx-auto flex min-h-screen w-full flex-col overflow-x-hidden"
        >
          <Header
            cartCount={cartCount}
            notifCount={0}
            onNavigateToSubscription={onNavigateToSubscription}
            onNavigateToCart={onNavigateToCart}
            onNavigateToNotifications={onNavigateToNotifications}
            onHelpClick={() => setHelpOpen(true)}
          />
          <main ref={contentColumnRef} data-subscription-page className="flex-1 overflow-y-auto">
            <div data-subscription-shell className="dc-subscription-shell">
              <header data-subscription-hero>
                <h1>Subscription</h1>
                <p className="dc-subscription-note">
                  Choose a plan, duration and optional add-ons.
                </p>
              </header>
              {catalogLoading ? (
                <div data-subscription-loading role="status" className="dc-subscription-state">
                  <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin" />
                  <p>Loading subscription plans…</p>
                </div>
              ) : catalogError && !catalog ? (
                <div data-subscription-catalog-error role="alert" className="dc-subscription-state">
                  <h2>Subscription plans couldn't load</h2>
                  <p className="dc-subscription-error">{catalogError}</p>
                  <button
                    type="button"
                    className="dc-subscription-text-action"
                    onClick={() => window.location.reload()}
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <>
                  {usingFallback ? (
                    <p
                      data-subscription-fallback-note
                      role="status"
                      className="dc-subscription-note"
                    >
                      The live catalog is unavailable. The built-in plans below are estimates;
                      checkout checks current availability and prices before payment.
                    </p>
                  ) : null}
                  <div data-subscription-layout data-subscription-workspace>
                    <div data-subscription-main>
                      {pickerPlans.length ? (
                        <MinimalPlanPicker
                          plans={pickerPlans}
                          selectedPlanId={selectedPlanId}
                          onChangePlan={setSelectedPlanId}
                          cycle={cycle}
                          onChangeCycle={(next) => {
                            if (supportedCycles.includes(next)) setCycle(next);
                          }}
                          supportedCycles={supportedCycles}
                          subscriber={isActiveMember}
                          ownedPlanId={isActiveMember ? ownedPlanId : null}
                          ownedCycle={ownedCycle}
                          subscriberPricing={gateSettings.subscriberPricing}
                          planVisibility={{
                            isSubscriber: isActiveMember,
                            gateRows: gateSettings.planVisibility,
                          }}
                        />
                      ) : (
                        <p className="dc-subscription-note">
                          No plans are currently available for this account.
                        </p>
                      )}
                      <PlanComparisonTable
                        plans={pickerPlans}
                        features={rawFeatures}
                        cycle={cycle}
                        selectedPlanId={selectedPlanId}
                        planVisibility={{
                          isSubscriber: isActiveMember,
                          gateRows: gateSettings.planVisibility,
                        }}
                        featureVisibility={cycleVisibilityOptions}
                        subscriberPricing={gateSettings.subscriberPricing}
                      />
                      <section className="dc-subscription-section" data-subscription-addons>
                        <h2>Optional add-ons</h2>
                        <p className="dc-subscription-note">
                          Included and already-purchased items are not charged again.
                        </p>
                        <div className="dc-subscription-addon-actions">
                          <button
                            type="button"
                            data-subscription-course-trigger
                            className="dc-subscription-text-action"
                            onClick={() => setCourseModalOpen(true)}
                          >
                            Choose courses<span>{selectedCourseIds.length} selected</span>
                          </button>
                          <button
                            type="button"
                            data-subscription-feature-trigger
                            className="dc-subscription-text-action"
                            onClick={() => setFeatureModalOpen(true)}
                          >
                            Choose features<span>{selectedFeatureIds.length} selected</span>
                          </button>
                        </div>
                      </section>
                      {featurePriceTiers.length > 0 ? (
                        <section className="dc-subscription-section" data-subscription-price-tiers>
                          <FeaturePricingTiers
                            tiers={featurePriceTiers}
                            cycle={cycle}
                            selectedIds={selectedFeatureIds}
                            purchasedIds={isActiveMember ? ownedFeatureIds : Array.from(includedFeatureIds)}
                            onToggleTier={(featureIds, allSelected) =>
                              setSelectedFeatureIds((current) =>
                                allSelected
                                  ? current.filter((id) => !featureIds.includes(id))
                                  : Array.from(new Set([...current, ...featureIds]))
                              )
                            }
                          />
                        </section>
                      ) : null}
                      {canShowCouponInput || !isFreeSelection ? (
                        <section className="dc-subscription-section" data-subscription-discounts>
                          <h2>Discount code</h2>
                          <p className="dc-subscription-note">
                            Optional. Use one coupon or referral code. Reapply it if you change your
                            selection.
                          </p>
                          {canShowCouponInput ? (
                            <PromoCodeInput
                              minimal
                              key={`${discountSelectionKey}:coupon`}
                              kind="coupon"
                              label="Coupon code"
                              placeholder="Enter coupon code"
                              appliedCode={activeCoupon?.code ?? null}
                              appliedMessage={activeCoupon?.label ?? null}
                              errorMessage={couponStatus === "error" ? couponErrorMessage : null}
                              onApply={handleApplyCoupon}
                              onRemove={handleRemoveCoupon}
                              disabled={isSubmitting}
                            />
                          ) : null}
                          {!isFreeSelection ? (
                            <PromoCodeInput
                              minimal
                              key={`${discountSelectionKey}:referral`}
                              kind="referral"
                              label="Referral code"
                              placeholder="Enter referral code"
                              appliedCode={activeReferral?.code ?? null}
                              appliedMessage={activeReferral?.label ?? null}
                              errorMessage={referralError}
                              onApply={handleApplyReferral}
                              onRemove={handleRemoveReferral}
                              disabled={isSubmitting}
                            />
                          ) : null}
                        </section>
                      ) : null}
                      <div className="dc-subscription-rules">
                        {isAddOnUpgrade ? (
                          <p data-subscription-addon-upgrade-note className="dc-subscription-note">
                            <strong>Add-on upgrade:</strong> only the{" "}
                            {ownershipState.newFeatureIds.length +
                              ownershipState.newProductIds.length}{" "}
                            new item(s) are charged. Your plan, cycle and expiry stay unchanged; the
                            plan price is not charged again.
                          </p>
                        ) : null}
                        {!isAddOnUpgrade && hasOwnedCarryOver ? (
                          <p data-subscription-carryover-note className="dc-subscription-note">
                            <strong>Already purchased — carried over:</strong> the named items in
                            the summary cost ₹0. You only pay for the new plan and new items.
                          </p>
                        ) : null}
                        {!isAddOnUpgrade && isSelectionOwned ? (
                          <p className="dc-subscription-note">
                            This is your current plan and duration. Add new courses or features to
                            upgrade, or choose a higher plan. Renewal of this package opens in the
                            last 7 days before expiry.
                          </p>
                        ) : null}
                        {isFreeSelection ? (
                          <p data-subscription-free-note className="dc-subscription-note">
                            Nothing to pay. Checkout verifies ₹0 before activating access; no
                            payment gateway is required.
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <aside data-subscription-rail>
                      <PriceSummary
                        plan={plan}
                        cycle={cycle}
                        basePricePaise={planPricePaise}
                        planAlreadyIncluded={isAddOnUpgrade}
                        featuresTotalPaise={featuresTotalPaise}
                        productsTotalPaise={productsTotalPaise}
                        features={chargeableFeatureRecords.map((feature) => ({
                          id: feature.id,
                          name: feature.name,
                          pricePaise: resolveFeaturePrice(
                            feature as never,
                            selectedPlanId || "",
                            cycle
                          ).pricePaise,
                        }))}
                        includedFeatureTitles={includedFeatureRecords.map(
                          (feature) => feature.name
                        )}
                        includedProductTitles={Array.from(
                          new Set([
                            ...(plan?.includedProductIds || []),
                            ...(catalog?.productUnlocks || [])
                              .filter((unlock) => unlock.active && unlock.planId === selectedPlanId)
                              .map((unlock) => unlock.productId),
                          ])
                        ).map((id) => subscriptionUnlockName(availableProducts, id))}
                        includedModules={includedSubscriptionModules(
                          catalog,
                          plan,
                          availableProducts
                        )}
                        alreadyOwnedFeatureTitles={carriedOverFeatureRecords.map(
                          (feature) => feature.name
                        )}
                        alreadyOwnedProductTitles={carriedOverProductRecords.map((product) =>
                          String(product.title || "")
                        )}
                        products={chargeableProductRecords.map((product) => ({
                          id: String(product.documentId || product.id),
                          title: String(product.title || ""),
                          pricePaise: Math.max(
                            0,
                            Math.round(
                              (subscriptionDisplayProducts.find(
                                (candidate) => candidate.id === product.id
                              )?.price ?? product.price) * 100
                            )
                          ),
                          originalPricePaise: Math.max(
                            0,
                            Math.round(
                              (subscriptionDisplayProducts.find(
                                (candidate) => candidate.id === product.id
                              )?.originalPrice ??
                                product.originalPrice ??
                                0) * 100
                            )
                          ),
                        }))}
                        couponDiscountPaise={couponDiscountPaise}
                        couponCode={activeReferral?.code ?? activeCoupon?.code ?? null}
                        discountLabel={activeReferral ? "Referral discount" : "Coupon discount"}
                        minPayablePaise={minPayablePaise}
                        totalPaise={totalPaise}
                      />
                      <SubscribeBar
                        totalPaise={totalPaise}
                        loading={isSubmitting}
                        disabled={!plan || isSubmitting || supportedCycles.length === 0}
                        onSubscribe={() => void handleSubscribe()}
                        ownershipState={ownershipState}
                      />
                      <p className="dc-subscription-note">
                        {isAddOnUpgrade
                          ? "New add-ons expire with your current membership."
                          : `Access lasts for the selected ${
                              cycle === "monthly" ? "monthly" : "yearly"
                            } period.`}{" "}
                        Renewals are manual and require your confirmation.
                      </p>
                      <p className="dc-subscription-terms">
                        By continuing, you agree to the{" "}
                        <a href="/terms-of-service.html">Terms of Service</a> and{" "}
                        <a href="/privacy-policy.html">Privacy Policy</a>.
                      </p>
                      {submitError ? (
                        <p
                          role="alert"
                          data-subscription-submit-error
                          className="dc-subscription-error"
                        >
                          {submitError}
                        </p>
                      ) : null}
                    </aside>
                  </div>
                  <CourseSelectModal
                    open={isCourseModalOpen}
                    selected={selectedCourseIds}
                    onClose={() => setCourseModalOpen(false)}
                    onChangeSelected={setSelectedCourseIds}
                    products={subscriptionDisplayProducts}
                    purchasedIds={subscriptionProductOwnedIds}
                  />
                  <FeatureSelectModal
                    open={isFeatureModalOpen}
                    features={features}
                    selected={selectedFeatureIds}
                    onClose={() => setFeatureModalOpen(false)}
                    onChangeSelected={setSelectedFeatureIds}
                    includedIds={Array.from(includedFeatureIds)}
                    purchasedIds={isActiveMember ? ownedFeatureIds : Array.from(includedFeatureIds)}
                  />
                  <HelpModal open={isHelpOpen} onClose={() => setHelpOpen(false)} />
                </>
              )}
            </div>
          </main>
          <BottomNav active={null} onChange={onNavigateFooter} purchasesBadge={purchasesBadge} />
        </div>
      </div>
    </OverlayBoundsProvider>
  );
}

// ---------------------------------------------------------------------------
// Subscription catalogue loading is shared with the Profile membership
// summary so both screens show the same server-normalized plan and feature
// names.
// ---------------------------------------------------------------------------

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
}): Promise<number> {
  const firebaseUser = await import("../../../firebase").then((m) => m.auth.currentUser);
  if (!firebaseUser) throw new Error("Please sign in to apply a coupon.");
  const token = await firebaseUser.getIdToken(true);
  const response = await apiFetch("/api/subscription-coupon", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(selection),
  });
  const data = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    discountPaise?: number;
    error?: string;
  };
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "This coupon could not be applied.");
  }
  return Number(data.discountPaise || 0);
}
