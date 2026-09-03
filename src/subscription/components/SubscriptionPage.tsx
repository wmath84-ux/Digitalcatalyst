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
import { doc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { auth, db } from "../../../firebase";
import { LoaderCircle } from "lucide-react";
import Header from "../../components/Header";
import BottomNav, { type TabKey } from "../../components/BottomNav";
import StackedCards from "./StackedCards";
import PlanOverview from "./PlanOverview";
import PromoCodeInput, { type PromoResult } from "./PromoCodeInput";
import CourseSelectTrigger from "./CourseSelectTrigger";
import CourseSelectModal from "./CourseSelectModal";
import FeatureSelectTrigger from "./FeatureSelectTrigger";
import FeatureSelectModal from "./FeatureSelectModal";
import PriceSummary from "./PriceSummary";
import { GlassButton } from "../../components/ui/glass-button";
import SubscribeBar from "./SubscribeBar";
import HelpModal from "./HelpModal";
import SubscriberActiveBadge from "../../components/subscription/SubscriberActiveBadge";
import SubscriberOnlyPriceBadge from "../../components/subscription/SubscriberOnlyPriceBadge";
import { SHOWCASE_CARDS } from "../data/showcase";
import { FALLBACK_SUBSCRIPTION_CATALOG } from "../data/fallbackCatalog";
import { useAuth } from "../../context/AuthContext";
import { useCatalog } from "../../context/CatalogContext";
import { useSubscriptionGateLogic } from "../../hooks/useSubscriptionGateLogic";
import { apiFetch } from "../../utils/apiBase";
import { isPlanVisibleForAudience, resolveSubscriberOnlyPrice } from "../../utils/subscriptionPricing";
import { playSfxError, playSfxSuccess } from "../../utils/sfx";
import { shouldShowCouponInput } from "../../../utils/couponVisibility";
import {
  groupFeaturesByPriceTier,
  resolveFeaturePrice,
  resolveFeaturesForPlan,
  sumSelectedFeaturePaise,
} from "../../../utils/featurePricing";
import FeaturePricingTiers from "./FeaturePricingTiers";
import PlanComparisonTable from "./PlanComparisonTable";
import LiveSelectionCard from "./LiveSelectionCard";
import GlassModal from "../../components/ui/glass-modal";
import ActiveMemberView from "./ActiveMemberView";
import OwnedPlanCard from "./OwnedPlanCard";
import {
  buildOwnedPlanSummary,
  evaluatePlanChange,
  evaluateSubscriptionSelection,
} from "../../../utils/subscriptionOwnership";
import { getRenewalReminder } from "../../../utils/subscriptionRenewal";
import {
  buildRenewalView,
  formatExpiryDate,
  toMillis as renewalToMillis,
} from "../../../utils/renewalPresentation";
import {
  startCheckout,
  type SubscriptionCatalog,
  type SubscriptionFeatureDoc,
  type SubscriptionPlanDoc,
} from "../utils/subscriptionCatalog";

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

const productHasId = (
  product: { id: string; documentId?: string },
  ids: ReadonlySet<string>,
) => ids.has(String(product.id)) || Boolean(product.documentId && ids.has(String(product.documentId)));

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

  // The buyer's live subscription record (null when never subscribed).
  const [activeSubscription, setActiveSubscription] = useState<SubscriptionRecordLike | null>(null);
  // When true the member deliberately opened the buy flow (renew or
  // change plan) and we show the full purchase UI again.
  const [manageMode, setManageMode] = useState<boolean>(
    () => typeof window !== "undefined" && /[?&]renew=1/.test(window.location.hash),
  );
  // When true the member explicitly wants to ADD features / courses to their
  // current plan (an add-on upgrade) — the pickers stay visible even though
  // the selected plan + cycle is the one they already own.
  const [addOnIntent, setAddOnIntent] = useState<boolean>(false);

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
  // Final confirmation, rendered in the AI Canvas Glass Modal. The modal body
  // is the SAME LiveSelectionCard the page shows, so review and page can never
  // disagree about what is being bought.
  const [isConfirmOpen, setConfirmOpen] = useState(false);

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
  const [appliedReferral, setAppliedReferral] = useState<{ code: string; discountPaise: number; label: string } | null>(null);
  const [referralError, setReferralError] = useState<string | null>(null);

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

  // Live subscription record. Drives the member view: an active
  // subscriber must never be shown the buy flow again by default.
  useEffect(() => {
    if (!user) { setActiveSubscription(null); return undefined; }
    return onSnapshot(doc(db, "users", user.id, "subscription", "current"), (snapshot) => {
      setActiveSubscription(snapshot.exists() ? (snapshot.data() as SubscriptionRecordLike) : null);
    }, () => setActiveSubscription(null));
  }, [user]);

  // Self-heal purchases made before product ids became first-class quote
  // metadata. A verified intent can be safely replayed by its owner; the server
  // merges any missing product ids without extending the membership period.
  useEffect(() => {
    const orderId = String(activeSubscription?.orderId || "").trim();
    if (!user || activeSubscription?.status !== "active" || !orderId || repairedOrderIdsRef.current.has(orderId)) return;
    const firebaseUser = auth.currentUser;
    if (!firebaseUser || firebaseUser.uid !== user.id) return;
    repairedOrderIdsRef.current.add(orderId);
    void firebaseUser.getIdToken().then((token: string) => apiFetch("/api/razorpay/verify-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ orderId }),
    })).then((response: Response) => {
      if (!response.ok) repairedOrderIdsRef.current.delete(orderId);
    }).catch(() => repairedOrderIdsRef.current.delete(orderId));
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
      if (catalog.plans.some((plan) => plan.id === String(data.planId || ""))) setSelectedPlanId(String(data.planId));
      if (data.cycle === "monthly" || data.cycle === "yearly") setCycle(data.cycle);
      const activeFeatureIds = new Set(catalog.features.map((feature) => feature.id));
      setSelectedFeatureIds((Array.isArray(data.features) ? data.features.map(String) : []).filter((id) => activeFeatureIds.has(id)));
      const storedProductIds = new Set(Array.isArray(data.includedProductIds) ? data.includedProductIds.map(String) : []);
      setSelectedCourseIds(
        availableProducts
          .filter((product) => productHasId(product, storedProductIds))
          .map((product) => String(product.documentId || product.id)),
      );
    });
  }, [availableProducts, catalog, user]);

  // ---------- Derived ----------
  const plans: SubscriptionPlanDoc[] = catalog?.plans || [];
  const rawFeatures: SubscriptionFeatureDoc[] = catalog?.features || [];
  const rawSubscriptionProducts: any[] = catalog?.subscriptionProducts || [];
  // Default-select the core paid features (My Day + Revision Studio) whenever
  // they exist in the catalog and the buyer has not made an explicit choice.
  // Removing a feature from the catalog drops it from the default set too.
  useEffect(() => {
    const defaultFeatureIds = ["my-day", "revision"];
    if (rawFeatures.some((feature) => defaultFeatureIds.includes(feature.id))) {
      setSelectedFeatureIds((current) =>
        current.length === 0
          ? defaultFeatureIds.filter((id) => rawFeatures.some((feature) => feature.id === id))
          : current,
      );
    }
  }, [rawFeatures]);
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

  // The plan's admin-configured cycle price is part of the payable total.
  // Checkout resolves the same field server-side, so this display cannot be
  // used to tamper with the amount.
  const selectedPlanPricePaise = plan
    ? (cycle === "yearly" ? plan.yearlyPricePaise : plan.monthlyPricePaise)
    : 0;

  // Feature prices are plan-aware AND cycle-aware: the same feature can
  // cost ₹99 on Basic, ₹49 on Premium and be free on Pro, with separate
  // yearly rates. `resolveFeaturesForPlan` projects the catalog onto the
  // active plan + cycle so every price the buyer sees below already
  // reflects those overrides. The server re-resolves with the identical
  // helper, so display and charge can never drift apart.
  const features = useMemo(
    () => resolveFeaturesForPlan<SubscriptionFeatureDoc>(rawFeatures, selectedPlanId, cycle),
    [rawFeatures, selectedPlanId, cycle],
  );

  const selectedFeatureRecords = useMemo(
    () => features.filter((f) => selectedFeatureIds.includes(f.id)),
    [features, selectedFeatureIds],
  );

  // Ascending price tiers for the "what you get at each price" strip.
  const featureTiers = useMemo(
    () => groupFeaturesByPriceTier(rawFeatures, selectedPlanId, cycle),
    [rawFeatures, selectedPlanId, cycle],
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
    [features, includedFeatureIds],
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
    [plans],
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
    [activeSubscription, selectedPlanId, cycle, ownedPlanOrder, planOrderOf],
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
  }, [activeSubscription, selectedPlanId, cycle, selectedFeatureIds, selectedCourseIds, planChangeState]);
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
      Array.isArray(activeSubscription?.features) ? activeSubscription.features.map(String) : [],
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
    [membershipOwnedFeatureIds],
  );
  const membershipOwnedProductIds = useMemo(() => {
    if (!ownershipState.active) return [];
    return Array.from(new Set(
      Array.isArray(activeSubscription?.includedProductIds)
        ? activeSubscription.includedProductIds.map(String)
        : [],
    ));
  }, [ownershipState.active, activeSubscription]);
  const membershipOwnedProductIdSet = useMemo(
    () => new Set(membershipOwnedProductIds),
    [membershipOwnedProductIds],
  );

  // Server is the only authority on price math. We display the
  // plan's cycle price + feature prices + coupon discount (from
  // the verified quote) — never derive the total client-side.
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
        : (isAddOnUpgrade ? ownershipState.newFeatureIds : selectedFeatureIds),
    [ownershipState.active, isAddOnUpgrade, ownershipState.newFeatureIds, selectedFeatureIds, membershipOwnedFeatureIdSet],
  );
  const chargeableCourseIds = useMemo(
    () =>
      ownershipState.active
        ? selectedCourseIds.filter((id) => !membershipOwnedProductIdSet.has(id))
        : (isAddOnUpgrade ? ownershipState.newProductIds : selectedCourseIds),
    [ownershipState.active, isAddOnUpgrade, ownershipState.newProductIds, selectedCourseIds, membershipOwnedProductIdSet],
  );
  // Items the buyer already owns but still selected — shown in the summary as
  // "Already purchased · ₹0" so it is impossible to miss that nothing is
  // charged for them twice.
  const carriedOverFeatureRecords = useMemo(
    () =>
      features.filter(
        (feature) =>
          selectedFeatureIds.includes(feature.id) &&
          membershipOwnedFeatureIdSet.has(feature.id),
      ),
    [features, selectedFeatureIds, membershipOwnedFeatureIdSet],
  );
  const carriedOverProductRecords = useMemo(() => {
    if (!ownershipState.active) return [];
    const carried = new Set(
      selectedCourseIds.filter((id) => membershipOwnedProductIdSet.has(id)),
    );
    return availableProducts.filter((product) => productHasId(product, carried));
  }, [ownershipState.active, selectedCourseIds, membershipOwnedProductIdSet, availableProducts]);
  const hasOwnedCarryOver =
    carriedOverFeatureRecords.length > 0 || carriedOverProductRecords.length > 0;
  const featuresTotalPaise = useMemo(
    () => sumSelectedFeaturePaise(rawFeatures, chargeableFeatureIds, selectedPlanId, cycle),
    [rawFeatures, chargeableFeatureIds, selectedPlanId, cycle],
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
          chargeableFeatureIds.includes(feature.id) && !includedFeatureIds.has(feature.id),
      ),
    [features, chargeableFeatureIds, includedFeatureIds],
  );

  // Resolve subscriptionProducts (new per-plan / duration priced add-ons) into selectable records
  // These can be used to override prices of catalog products when selected via subscription.
  const resolvedSubscriptionProducts = useMemo(() => {
    return rawSubscriptionProducts.map((sp) => {
      const resolved = resolveFeaturePrice({
        id: sp.productId || sp.id,
        included: sp.included,
        pricePaise: sp.pricePaise || 0,
        monthlyPricePaise: sp.monthlyPricePaise,
        yearlyPricePaise: sp.yearlyPricePaise,
        planPricing: sp.planPricing || {},
      }, selectedPlanId, cycle);
      return {
        ...sp,
        resolvedPrice: resolved.pricePaise / 100,
        resolvedIncluded: resolved.included,
        checkoutId: sp.productId || sp.id,
      };
    });
  }, [rawSubscriptionProducts, selectedPlanId, cycle]);
  const subscriptionDisplayProducts = useMemo(() => availableProducts.map((product) => {
    const pricing = resolvedSubscriptionProducts.find((entry) =>
      String(entry.productId || entry.id) === String(product.id) ||
      String(entry.productId || entry.id) === String(product.documentId || ""),
    );
    return pricing
      ? { ...product, price: Math.max(0, Number(pricing.resolvedPrice || 0)) }
      : product;
  }), [availableProducts, resolvedSubscriptionProducts]);
  const productsTotalPaise = useMemo(() => chargeableProductRecords.reduce((sum, product) => {
    const pricing = resolvedSubscriptionProducts.find((entry) =>
      String(entry.productId || entry.id) === String(product.id) ||
      String(entry.productId || entry.id) === String(product.documentId || ""),
    );
    return sum + (pricing
      ? Math.max(0, Math.round(Number(pricing.resolvedPrice || 0) * 100))
      : Math.max(0, Math.round(product.price * 100)));
  }, 0), [chargeableProductRecords, resolvedSubscriptionProducts]);
  // The plan's cycle price is NOT charged again for an add-on upgrade —
  // the plan was already paid when the membership started.
  const planPricePaise = isAddOnUpgrade ? 0 : selectedPlanPricePaise;
  const subtotalPaise = planPricePaise + featuresTotalPaise + productsTotalPaise;
  const couponDiscountPaise = appliedReferral?.discountPaise || appliedCoupon?.discountPaise || 0;
  // Server-validated floor: minimum payable = plan's minimum
  // payable paise (admin-set), default 0. Add-on upgrades only charge the
  // new items, so the plan's floor must not inflate them.
  const minPayablePaise = isAddOnUpgrade ? 0 : plan?.minPayablePaise || 0;
  const totalPaise = Math.max(subtotalPaise - couponDiscountPaise, minPayablePaise);
  const totalRupees = (totalPaise / 100).toFixed(2);

  // ---------------------------------------------------------------------------
  // The single source of truth the live card + confirmation modal both render.
  // Every field is derived from the same values the payable total is built
  // from, so changing the plan, the billing duration or any add-on updates the
  // card in the same render — there is no second copy of this state to drift.
  // ---------------------------------------------------------------------------
  const liveSelection = useMemo(
    () => ({
      planName: plan?.name ?? null,
      planBadge: plan?.badge ?? null,
      cycle,
      planPricePaise,
      planAlreadyOwned: isAddOnUpgrade,
      featureNames: chargeableFeatureRecords.map((feature) => feature.name),
      includedFeatureNames: includedFeatureRecords.map((feature) => feature.name),
      featuresTotalPaise,
      courseNames: chargeableProductRecords.map((product) => String(product.title || "")),
      coursesTotalPaise: productsTotalPaise,
      discountPaise: couponDiscountPaise,
      discountLabel: appliedReferral ? "Referral discount" : appliedCoupon ? "Coupon discount" : null,
      subtotalPaise,
      totalPaise,
    }),
    [
      plan,
      cycle,
      planPricePaise,
      isAddOnUpgrade,
      chargeableFeatureRecords,
      includedFeatureRecords,
      featuresTotalPaise,
      chargeableProductRecords,
      productsTotalPaise,
      couponDiscountPaise,
      appliedReferral,
      appliedCoupon,
      subtotalPaise,
      totalPaise,
    ],
  );

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

  // ---------- Membership state ----------
  // An active subscriber sees the member dashboard, never the buy flow,
  // unless they explicitly chose to renew or change their plan.
  const subscriptionExpiresAtMs = renewalToMillis(activeSubscription?.expiresAt);
  const isActiveMember =
    activeSubscription?.status === "active" && subscriptionExpiresAtMs > Date.now();
  const showMemberView = isActiveMember && !manageMode;

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
      }),
    );
    if (!isActiveMember || ownedPlanOrder === null) return audienceVisible;
    return audienceVisible.filter((candidate) => {
      const order = Number(candidate.sortOrder);
      if (!Number.isFinite(order)) return true; // never hide unranked custom plans
      return order >= ownedPlanOrder;
    });
  }, [plans, isActiveMember, ownedPlanOrder, ownedPlanId, gateSettings.planVisibility]);

  // Higher plans only — the plans a member can actually switch TO.
  const upgradePlans = useMemo(
    () => pickerPlans.filter((candidate) => candidate.active && candidate.id !== ownedPlanId),
    [pickerPlans, ownedPlanId],
  );

  // If the selection falls outside the ladder (e.g. the catalog loaded after
  // the default pre-select picked the lowest plan for a Premium member), snap
  // it back to the member's own plan — or the first plan still purchasable.
  useEffect(() => {
    if (pickerPlans.length === 0) return;
    if (selectedPlanId && pickerPlans.some((candidate) => candidate.id === selectedPlanId)) return;
    const ownedVisible = ownedPlanId && pickerPlans.some((candidate) => candidate.id === ownedPlanId);
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

  const memberRenewalView = useMemo(() => {
    if (!activeSubscription) return null;
    const memberPlanName =
      plans.find((p) => p.id === String(activeSubscription.planId || ""))?.name ||
      String(activeSubscription.planId || "Subscription");
    return buildRenewalView(getRenewalReminder(activeSubscription), { planName: memberPlanName });
  }, [activeSubscription, plans]);

  const memberFeatureIds = useMemo(
    () => (Array.isArray(activeSubscription?.features) ? activeSubscription.features.map(String) : []),
    [activeSubscription],
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
  const memberFeatures = useMemo(
    () => rawFeatures.filter((feature) => memberFeatureIds.includes(feature.id)),
    [rawFeatures, memberFeatureIds],
  );
  const memberProductTitles = useMemo(() => {
    const ids = new Set(
      Array.isArray(activeSubscription?.includedProductIds)
        ? activeSubscription.includedProductIds.map(String)
        : [],
    );
    return availableProducts.filter((product) => productHasId(product, ids)).map((product) => product.title);
  }, [activeSubscription, availableProducts]);

  // ---------- Owned-plan summary card ----------
  // The shared ownership verdict (computed in the pricing block above) drives
  // this card: when the buyer lands on the exact plan + cycle they already
  // own, the buy flow is replaced by a statement of what is active — except
  // while the member is browsing add-ons for that plan (`addOnIntent`), when
  // the pickers reopen and only the new items are ever charged.
  const ownedPlanSummary = useMemo(() => {
    // The owned card is replaced by the pickers while the member is browsing
    // add-ons for their current plan.
    if (!isSelectionOwned || addOnIntent) return null;
    return buildOwnedPlanSummary<SubscriptionFeatureDoc>({
      record: activeSubscription,
      planName:
        plans.find((p) => p.id === String(activeSubscription?.planId || ""))?.name ||
        String(activeSubscription?.planId || "Your plan"),
      features: memberFeatures,
      productTitles: memberProductTitles,
    });
  }, [activeSubscription, isSelectionOwned, addOnIntent, memberFeatures, memberProductTitles, plans]);

  // Plans the member could still switch to — used for the "want something
  // different?" hint on the owned card. Only HIGHER plans are offered: a
  // downgrade is never purchasable, so it is never advertised either.
  const purchasablePlanNames = useMemo(() => upgradePlans.map((p) => p.name), [upgradePlans]);

  // Course picker owned ids: store-purchased products (already in the
  // catalog) UNION products unlocked by the active subscription — neither
  // can ever be re-selected, so they are never charged a second time.
  const subscriptionProductOwnedIds = useMemo(
    () => new Set<string>([...purchasedIds, ...membershipOwnedProductIds]),
    [purchasedIds, membershipOwnedProductIds],
  );

  // Phase-2: subscriber-only override price for the currently selected
  // plan + cycle. Resolved via the admin's `settings/subscriptionGate`
  // document — non-subscribers always see the public price.
  const subscriberPriceRupees = useMemo(() => {
    if (!isActiveMember) return null;
    const activePlan = plans.find((p) => p.id === selectedPlanId);
    if (!activePlan) return null;
    const baseRupees = cycle === "yearly"
      ? (activePlan.yearlyPricePaise / 100)
      : (activePlan.monthlyPricePaise / 100);
    if (!Number.isFinite(baseRupees) || baseRupees <= 0) return null;
    const resolved = resolveSubscriberOnlyPrice(
      activePlan.id,
      cycle,
      baseRupees,
      true,
      gateSettings.subscriberPricing,
    );
    return Math.round(resolved);
  }, [isActiveMember, plans, selectedPlanId, cycle, gateSettings.subscriberPricing]);

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
        });
        setCouponStatus("idle");
        setAppliedReferral(null);
        setReferralError(null);
        playSfxSuccess();
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
        playSfxError();
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

  // If the selection drops to ₹0 while a coupon was applied, discard
  // the code so nothing stale is carried into checkout.
  useEffect(() => {
    if (!canShowCouponInput && appliedCoupon) {
      setCouponInput("");
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

  const handleApplyReferral = useCallback(async (rawCode: string): Promise<PromoResult> => {
    const code = rawCode.trim().toUpperCase();
    if (!code) return { valid: false, message: "Enter a referral code." };
    setReferralError(null);
    try {
      const firebaseUser = await import("../../../firebase").then((module) => module.auth.currentUser);
      if (!firebaseUser) throw new Error("Please sign in to apply a referral code.");
      const token = await firebaseUser.getIdToken(true);
      const response = await apiFetch("/api/subscription-referral", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ referralCode: code }),
      });
      const data = await response.json().catch(() => ({})) as { ok?: boolean; code?: string; discountPaise?: number; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Referral code is invalid.");
      const discountPaise = Math.max(0, Number(data.discountPaise || 0));
      setAppliedCoupon(null);
      playSfxSuccess();
      setAppliedReferral({ code: data.code || code, discountPaise, label: `₹${Math.round(discountPaise / 100)} referral discount` });
      return { valid: true, message: "Referral code applied." };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Referral code is invalid.";
      setReferralError(message);
      playSfxError();
      return { valid: false, message };
    }
  }, []);

  const handleRemoveReferral = useCallback(() => {
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
          couponCode: appliedReferral?.code || appliedCoupon?.code || null,
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
  }, [user, plan, cycle, selectedFeatureIds, selectedCourseIds, appliedCoupon, appliedReferral, ownershipState]);

  // ---------- Render ----------
  return (
    <div className="min-h-screen sm:py-6">
      <div data-app-frame className="relative mx-auto flex min-h-screen w-full max-w-md flex-col sm:min-h-[calc(100vh-3rem)] sm:supports-[height:100dvh]:min-h-[calc(100dvh-3rem)] sm:overflow-hidden sm:rounded-[2rem] md:max-w-none md:rounded-none">
        <Header
          cartCount={cartCount}
          notifCount={0}
          onNavigateToSubscription={onNavigateToSubscription}
          onNavigateToCart={onNavigateToCart}
          onNavigateToNotifications={onNavigateToNotifications}
          onHelpClick={() => setHelpOpen(true)}
        />

        <main className="flex-1 overflow-y-auto">
          <div className="flex min-h-full w-full flex-col">
            {catalogLoading ? (
              <div data-subscription-loading className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-white/55">
                <LoaderCircle className="h-6 w-6 animate-spin text-violet-300" />
                <p className="font-semibold">Loading subscription plans…</p>
              </div>
            ) : catalogError && !catalog ? (
              <div data-subscription-catalog-error className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-white/85">
                <p className="font-black text-rose-200">We couldn't load the subscription catalog.</p>
                <p className="text-xs text-white/55">{catalogError}</p>
                <GlassButton
                  variant="capsule"
                  type="button"
                  onClick={() => window.location.reload()}
                  className="[&>span>div]:h-9 [&>span>div]:px-4 [&>span>div]:text-xs [&>span>div]:font-bold"
                >
                  Retry
                </GlassButton>
              </div>
            ) : (
              <>
      {/* The page formerly rendered a second sticky title bar here ("Manage
          plan" / "My membership" / "Go Premium") with its own back button and
          the help (?) icon. That extra header is removed; the help icon now
          lives on the main app Header above (onHelpClick) so it is visible on
          every subscription page state. */}

      {/* An active member gets the membership dashboard, not the buy flow. */}
      {showMemberView ? (
        <div className="flex-1">
          <div className="mx-5 mt-4">
            <SubscriberActiveBadge
              planLabel={plans.find((p) => p.id === String(activeSubscription?.planId || ""))?.name || null}
              expiresAtLabel={formatExpiryDate(subscriptionExpiresAtMs)}
            />
          </div>
          <ActiveMemberView
            planName={plans.find((p) => p.id === String(activeSubscription?.planId || ""))?.name || String(activeSubscription?.planId || "Your plan")}
            plan={plans.find((p) => p.id === String(activeSubscription?.planId || "")) || null}
            cycle={activeSubscription?.cycle === "yearly" ? "yearly" : "monthly"}
            unlockedFeatures={memberFeatures}
            unlockedProductTitles={memberProductTitles}
            expiresAtLabel={formatExpiryDate(subscriptionExpiresAtMs)}
            renewalView={memberRenewalView}
            reminderOptOut={Boolean(activeSubscription?.renewalReminderOptOut)}
            onRenew={() => setManageMode(true)}
            onChangePlan={() => {
              // Open directly on the next HIGHER plan so an existing
              // subscriber can immediately upgrade. Lower plans are never
              // offered — a membership can only move up while it is active.
              const nextPlan = upgradePlans[0] || null;
              if (nextPlan) setSelectedPlanId(nextPlan.id);
              setManageMode(true);
            }}
            onToggleReminders={(next) => {
              if (!user) return;
              void updateDoc(doc(db, "users", user.id, "subscription", "current"), {
                renewalReminderOptOut: next,
              }).catch(() => undefined);
            }}
            onOpenFeature={(featureId) => {
              if (featureId === "my-day") window.location.hash = "#/my-day";
              if (featureId === "revision") window.location.hash = "#/revision";
            }}
          />
          <HelpModal open={isHelpOpen} onClose={() => setHelpOpen(false)} />
          {/* BOTTOM-most action: a clear "Upgrade" button for existing
              subscribers who want a HIGHER plan. Lives at the very end
              of the member dashboard so the user always sees the path
              to upgrade. Tapping it opens the buy flow on the next
              higher plan. */}
          {upgradePlans.length > 0 ? (
            <div className="mx-5 mt-5 mb-4 flex flex-col items-stretch gap-2">
              <button
                type="button"
                data-subscription-upgrade-button
                onClick={() => {
                  const next = upgradePlans[0];
                  if (!next) return;
                  setSelectedPlanId(next.id);
                  setManageMode(true);
                }}
                className="w-full rounded-full bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                Upgrade — view higher plans
              </button>
              <span className="text-center text-[11px] font-medium text-white/55">
                Move to a higher plan anytime. Your current membership stays active until the cycle ends.
              </span>
            </div>
          ) : null}
        </div>
      ) : (
      <>
      <div className="flex-1 pb-4">
        {/* Returning member who chose to renew / change plan / add items.
            The old info banner ("You already have an active membership…")
            was removed on request; only the Cancel control remains so the
            member can exit the buy flow back to their membership dashboard. */}
        {isActiveMember && manageMode ? (
          <div className="mx-5 mt-4 space-y-2">
            <div className="flex items-center justify-end gap-3">
              <GlassButton
                variant="capsule"
                type="button"
                onClick={() => {
                  setManageMode(false);
                  setAddOnIntent(false);
                }}
                className="shrink-0 [&>span>div]:h-8 [&>span>div]:px-3 [&>span>div]:text-[11px] [&>span>div]:font-black [&>span>div]:text-violet-200"
              >
                Cancel
              </GlassButton>
            </div>
            {isAddOnUpgrade ? (
              <div
                data-subscription-addon-upgrade-note
                className="flex items-start gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-3 py-2.5 text-[11px] leading-relaxed text-emerald-200"
              >
                <span aria-hidden="true">⬆️</span>
                <span>
                  <strong>Add-on upgrade:</strong> you&apos;ll only be charged for
                  the <strong>{ownershipState.newFeatureIds.length + ownershipState.newProductIds.length} new item{ownershipState.newFeatureIds.length + ownershipState.newProductIds.length === 1 ? "" : "s"}</strong> you
                  added. Your current plan, cycle and expiry date stay exactly
                  as they are — no plan price is charged again.
                </span>
              </div>
            ) : null}
            {!isAddOnUpgrade && hasOwnedCarryOver ? (
              <div
                data-subscription-carryover-note
                className="flex items-start gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-3 py-2.5 text-[11px] leading-relaxed text-emerald-200"
              >
                <span aria-hidden="true">✅</span>
                <span>
                  <strong>Already purchased — carried over:</strong>{" "}
                  {carriedOverFeatureRecords.length} feature
                  {carriedOverFeatureRecords.length === 1 ? "" : "s"}
                  {carriedOverProductRecords.length > 0
                    ? ` and ${carriedOverProductRecords.length} course${carriedOverProductRecords.length === 1 ? "" : "s"}`
                    : ""}{" "}
                  you already paid for are included with the new plan. They
                  are <strong>not charged again</strong> — you only pay for
                  the new plan and any new items.
                </span>
              </div>
            ) : null}
            {!isAddOnUpgrade && isSelectionOwned ? (
              <div className="flex items-start gap-2 rounded-2xl border border-violet-400/30 bg-violet-500/15 px-3 py-2.5 text-[11px] leading-relaxed text-violet-200">
                <span aria-hidden="true">💡</span>
                <span>
                  This is your current plan + cycle. Add a new feature or
                  course below to upgrade it, or pick another plan. Renewal of
                  this exact package opens in the last 7 days before expiry.
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
        {usingFallback && (
          <div className="mx-5 mt-4 flex items-start gap-2 rounded-2xl border border-amber-400/30 bg-amber-500/15 px-3 py-2.5 text-[11px] leading-relaxed text-amber-200">
            <span aria-hidden="true">⚠️</span>
            <span>
              Showing default plans because the live catalog isn&apos;t available
              yet. Final pricing is always confirmed at checkout.
            </span>
          </div>
        )}
        <StackedCards cards={SHOWCASE_CARDS} />

        {/* ── STEP 1 — plan + billing duration ─────────────────────────────
            Everything downstream (feature prices, course prices, the live
            card, the total) is resolved from these two values, so they are
            the first and most prominent decision on the page. */}
        <Step
          index={1}
          title="Choose your plan and duration"
          hint="Compare what each plan includes, then pick monthly or yearly. Prices below update instantly."
          done={Boolean(plan)}
        >
        {/* Plan + cycle card. Members only see their own plan + HIGHER plans
            (pickerPlans) — lower plans are hidden, not merely disabled, so a
            downgrade can never even be selected. */}
        <PlanOverview
          plans={pickerPlans}
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
          ownedPlanId={isActiveMember ? ownedPlanId || null : null}
          ownedCycle={isActiveMember ? ownedCycle : null}
          isSubscriber={isActiveMember}
          subscriberPriceRupees={subscriberPriceRupees}
        />

        {/* The comparison table — the single answer to "what is actually
            different between these plans?". Columns are the selection target,
            rows are the features, cells state the real outcome (Included /
            exact add-on price / not offered) for the active cycle. */}
        <PlanComparisonTable
          plans={pickerPlans}
          features={rawFeatures}
          cycle={cycle}
          selectedPlanId={selectedPlanId}
          ownedPlanId={isActiveMember ? ownedPlanId || null : null}
          onSelectPlan={setSelectedPlanId}
        />
        </Step>

        {/* Already-owned selection: the entire buy flow below is replaced by
            a single statement of what is active. Nothing purchasable is
            rendered, so the same subscription type cannot be bought twice —
            EXCEPT through the explicit add-on path ("Add features / courses"),
            which reopens the pickers and only ever charges the new items. */}
        {isSelectionOwned && ownedPlanSummary ? (
          <OwnedPlanCard
            summary={ownedPlanSummary}
            expiresAtLabel={formatExpiryDate(subscriptionExpiresAtMs)}
            renewalOpensAtLabel={formatExpiryDate(ownedPlanSummary.renewalOpensAt)}
            otherPlanNames={purchasablePlanNames}
            onSeeOtherPlans={() => {
              // Only HIGHER plans are ever offered (no-downgrade rule).
              const firstUpgrade = upgradePlans[0] || null;
              if (firstUpgrade) setSelectedPlanId(firstUpgrade.id);
            }}
            onAddMore={() => setAddOnIntent(true)}
          />
        ) : (
        <>
        {/* ── STEP 2 — optional add-ons ───────────────────────────────────
            Clearly framed as optional so the buyer knows the plan alone is a
            complete purchase; every price here is already resolved for the
            plan + cycle chosen in step 1. */}
        <Step
          index={2}
          title="Add courses and features"
          hint="Optional. Anything included with your plan is marked and never charged twice."
          done={selectedCourseIds.length > 0 || selectedFeatureIds.length > 0}
        >
        {/* Course (product) selector trigger */}
        <CourseSelectTrigger
          selectedIds={selectedCourseIds}
          onOpen={() => setCourseModalOpen(true)}
          products={availableProducts}
        />

        {/* Feature selector trigger */}
        <FeatureSelectTrigger
          features={features}
          selectedIds={selectedFeatureIds}
          onOpen={() => setFeatureModalOpen(true)}
          purchasedIds={isActiveMember ? ownedFeatureIds : Array.from(includedFeatureIds)}
        />

        {/* Price-tier strip — features grouped by their resolved price
            for the active plan + cycle. */}
        <FeaturePricingTiers
          tiers={featureTiers}
          cycle={cycle}
          selectedIds={selectedFeatureIds}
          purchasedIds={isActiveMember ? ownedFeatureIds : Array.from(includedFeatureIds)}
          onToggleTier={(ids, allSelected) => {
            setSelectedFeatureIds((current) => {
              const next = new Set(current);
              if (allSelected) ids.forEach((id) => next.delete(id));
              else ids.forEach((id) => next.add(id));
              return Array.from(next);
            });
          }}
        />

        </Step>

        {/* ── STEP 3 — discounts ──────────────────────────────────────────── */}
        <Step
          index={3}
          title="Apply a code"
          hint="Optional. Coupons and referral codes are verified by the server before payment."
          done={Boolean(appliedCoupon || appliedReferral)}
        >
        {/* Coupon section — server-validated via the Part 7 engine.
            The coupon field is hidden when nothing is payable. */}
        <div className="space-y-3 px-5">
          {canShowCouponInput ? (
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
          ) : null}
          {!isFreeSelection ? (
            <PromoCodeInput
              kind="referral"
              label="Have a referral code? Get ₹250 off the final price."
              placeholder="Enter referral code"
              appliedCode={appliedReferral?.code ?? null}
              appliedMessage={appliedReferral?.label ?? null}
              errorMessage={referralError}
              onApply={handleApplyReferral}
              onRemove={handleRemoveReferral}
              disabled={isSubmitting}
            />
          ) : (
            <div
              data-subscription-free-note
              className="flex items-start gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-3 py-2.5 text-[11px] leading-relaxed text-emerald-200"
            >
              <span aria-hidden="true">🎉</span>
              <span>
                This subscription is <strong>free</strong> — no payment is
                needed. Tap the button below to activate it instantly.
              </span>
            </div>
          )}
        </div>

        </Step>

        {/* ── STEP 4 — review ─────────────────────────────────────────────
            The live card restates plan + duration + every selection and the
            money in one surface. It is the same component the confirmation
            modal renders, driven by the same props, so the two can never
            disagree. */}
        <Step
          index={4}
          title="Review what you're buying"
          hint="This card updates the moment you change the plan, the duration or any add-on."
          done={Boolean(plan)}
        >
        <div className="px-5">
          <LiveSelectionCard {...liveSelection} />
        </div>

        {/* Full itemised breakdown stays available underneath for buyers who
            want every line rather than the summary. */}
        <div className="pt-3">
        <PriceSummary
          plan={plan}
          cycle={cycle}
          basePricePaise={planPricePaise}
          planAlreadyIncluded={isAddOnUpgrade}
          featuresTotalPaise={featuresTotalPaise}
          featuresCount={chargeableFeatureIds.filter((id) => !includedFeatureIds.has(id)).length}
          includedFeatureCount={includedFeatureIds.size}
          productsCount={chargeableProductRecords.length}
          productsTotalPaise={productsTotalPaise}
          featureTitles={chargeableFeatureRecords.map((feature) => feature.name)}
          includedFeatureTitles={includedFeatureRecords.map((feature) => feature.name)}
          alreadyOwnedFeatureTitles={carriedOverFeatureRecords.map((feature) => feature.name)}
          alreadyOwnedProductTitles={carriedOverProductRecords.map((product) => String(product.title || ""))}
          products={chargeableProductRecords.map((product) => ({
            id: String(product.documentId || product.id),
            title: String(product.title || ""),
          }))}
          couponDiscountPaise={couponDiscountPaise}
          couponCode={appliedReferral?.code ?? appliedCoupon?.code ?? null}
          discountLabel={appliedReferral ? "Referral discount" : "Coupon discount"}
          minPayablePaise={minPayablePaise}
          totalPaise={totalPaise}
        />
        </div>
        </Step>

        <p className="px-5 pt-5 text-center text-[11px] leading-relaxed dc-ink-3">
          By subscribing you agree to the{" "}
          <a href="/terms-of-service.html" className="font-semibold text-violet-300 underline underline-offset-2 hover:text-violet-200">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="/privacy-policy.html" className="font-semibold text-violet-300 underline underline-offset-2 hover:text-violet-200">
            Privacy Policy
          </a>
          . Access lasts for the selected {cycle === "monthly" ? "monthly" : "yearly"} period. We send limited renewal reminders; every renewal requires your confirmation.
        </p>
        </>
        )}
        {submitError ? (
          <p
            role="alert"
            data-subscription-submit-error
            className="mx-5 mt-3 rounded-2xl border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-center text-xs font-semibold text-rose-200"
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
        onSubscribe={() => setConfirmOpen(true)}
        totalRupees={totalRupees}
        ownershipState={ownershipState}
      />

      {/* Modals — only mounted when server-driven data is available. */}
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

      {/* AI Canvas Glass Modal — the final confirmation. Its body is the same
          LiveSelectionCard the page renders, so the modal always reflects the
          current plan, duration and selection at the moment it opens. */}
      <GlassModal
        open={isConfirmOpen}
        onClose={() => setConfirmOpen(false)}
        data-testid="subscription-confirm-modal"
        accent="#8B7CF6"
        widthClassName="w-[380px] max-w-[calc(100vw-2rem)]"
        title={plan ? `Confirm ${plan.name}` : "Confirm your subscription"}
        description={
          isFreeSelection
            ? "Nothing to pay — this selection activates instantly."
            : `You're paying ${totalPaise <= 0 ? "nothing" : `₹${Math.round(totalPaise / 100).toLocaleString("en-IN")}`} for the ${cycle === "yearly" ? "yearly" : "monthly"} cycle.`
        }
        features={[
          isFreeSelection ? "No payment required" : "One payment for this cycle — no silent auto-charges",
          "Reminder before the cycle ends, never after",
          "Cancel anytime from Profile — access stays till the last day",
        ]}
        primaryLabel={isSubmitting ? "Processing…" : isFreeSelection ? "Activate now" : "Confirm and pay"}
        primaryDisabled={isSubmitting || !plan}
        onPrimary={() => {
          setConfirmOpen(false);
          void handleSubscribe();
        }}
        secondaryLabel="Keep editing"
      >
        <LiveSelectionCard {...liveSelection} compact />
      </GlassModal>

      <HelpModal open={isHelpOpen} onClose={() => setHelpOpen(false)} />
      </>
      )}
      </>
      )}
          </div>
        </main>

        <BottomNav active={null} onChange={onNavigateFooter} purchasesBadge={purchasesBadge} />
      </div>
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
  const response = await apiFetch("/api/subscription-catalog", {
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
}): Promise<number> {
  const firebaseUser = await import("../../../firebase").then((m) => m.auth.currentUser);
  if (!firebaseUser) throw new Error("Please sign in to apply a coupon.");
  const token = await firebaseUser.getIdToken(true);
  const response = await apiFetch("/api/subscription-coupon", {
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

// ---------------------------------------------------------------------------
// Section shell. The page previously ran as one undifferentiated column of
// cards, banners and pickers, so a buyer had no idea how many decisions were
// left or which one they were on. Every purchase step is now a numbered
// section with a title and a one-line purpose, which is the cheapest possible
// form of progress feedback (goal-gradient effect) and makes the page
// scannable instead of scattered.
// ---------------------------------------------------------------------------
function Step({
  index,
  title,
  hint,
  done = false,
  children,
}: {
  index: number;
  title: string;
  hint?: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section data-subscription-step={index} className="pt-6">
      <div className="mb-2 flex items-start gap-2.5 px-5">
        <span
          className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-black ${
            done ? "bg-emerald-500/25 text-emerald-200" : "bg-indigo-500/25 text-indigo-200"
          }`}
          aria-hidden="true"
        >
          {done ? "\u2713" : index}
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-black leading-tight dc-ink-1">{title}</h2>
          {hint ? <p className="mt-0.5 text-[11.5px] leading-snug dc-ink-3">{hint}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}
