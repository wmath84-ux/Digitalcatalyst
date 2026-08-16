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
import { ChevronLeft, HelpCircle, LoaderCircle } from "lucide-react";
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
import SubscribeBar from "./SubscribeBar";
import HelpModal from "./HelpModal";
import { SHOWCASE_CARDS } from "../data/showcase";
import { FALLBACK_SUBSCRIPTION_CATALOG } from "../data/fallbackCatalog";
import { useAuth } from "../../context/AuthContext";
import { useCatalog } from "../../context/CatalogContext";
import { playSfxError, playSfxSuccess } from "../../utils/sfx";
import { shouldShowCouponInput } from "../../../utils/couponVisibility";
import {
  groupFeaturesByPriceTier,
  resolveFeaturePrice,
  resolveFeaturesForPlan,
  sumSelectedFeaturePaise,
} from "../../../utils/featurePricing";
import FeaturePricingTiers from "./FeaturePricingTiers";
import ActiveMemberView from "./ActiveMemberView";
import OwnedPlanCard from "./OwnedPlanCard";
import {
  buildOwnedPlanSummary,
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
    void firebaseUser.getIdToken().then((token) => fetch("/api/razorpay/verify-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ orderId }),
    })).then((response) => {
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
  useEffect(() => {
    if (rawFeatures.some((feature) => feature.id === "my-day")) {
      setSelectedFeatureIds((current) => current.length === 0 ? ["my-day"] : current);
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
  const ownershipState = useMemo(
    () =>
      evaluateSubscriptionSelection({
        record: activeSubscription,
        planId: selectedPlanId,
        cycle,
        featureIds: selectedFeatureIds,
        productIds: selectedCourseIds,
      }),
    [activeSubscription, selectedPlanId, cycle, selectedFeatureIds, selectedCourseIds],
  );
  const isSelectionOwned = ownershipState.owned;
  // An add-on upgrade: the member keeps their current plan + cycle but adds at
  // least one feature / product they don't have yet. Only the NEW items are
  // charged (the server enforces the same rule when it builds the quote).
  const isAddOnUpgrade = Boolean(ownershipState.addOnPurchase && !ownershipState.blocked);

  // Server is the only authority on price math. We display the
  // plan's cycle price + feature prices + coupon discount (from
  // the verified quote) — never derive the total client-side.
  //
  // Add-on upgrades charge ONLY the new items: the plan line (already paid)
  // and every already-owned feature / product are excluded from the payable
  // total shown here, exactly like the server filters the quote line items.
  const chargeableFeatureIds = useMemo(
    () => (isAddOnUpgrade ? ownershipState.newFeatureIds : selectedFeatureIds),
    [isAddOnUpgrade, ownershipState.newFeatureIds, selectedFeatureIds],
  );
  const chargeableCourseIds = useMemo(
    () => (isAddOnUpgrade ? ownershipState.newProductIds : selectedCourseIds),
    [isAddOnUpgrade, ownershipState.newProductIds, selectedCourseIds],
  );
  const featuresTotalPaise = useMemo(
    () => sumSelectedFeaturePaise(rawFeatures, chargeableFeatureIds, selectedPlanId, cycle),
    [rawFeatures, chargeableFeatureIds, selectedPlanId, cycle],
  );
  const chargeableProductRecords = useMemo(() => {
    const chargeable = new Set(chargeableCourseIds);
    return availableProducts.filter((product) => productHasId(product, chargeable));
  }, [availableProducts, chargeableCourseIds]);

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

  // Plans the buyer could still switch to — used for the "want something
  // different?" hint on the owned card.
  const purchasablePlanNames = useMemo(
    () =>
      plans
        .filter((p) => p.active && p.id !== String(activeSubscription?.planId || ""))
        .map((p) => p.name),
    [plans, activeSubscription],
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
      const response = await fetch("/api/subscription-referral", {
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
    <div className="min-h-screen bg-slate-100 sm:py-6">
      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col bg-white shadow-xl shadow-slate-200 sm:min-h-[calc(100vh-3rem)] sm:overflow-hidden sm:rounded-[2rem] sm:border sm:border-slate-200">
        <Header
          cartCount={cartCount}
          notifCount={0}
          onNavigateToSubscription={onNavigateToSubscription}
          onNavigateToCart={onNavigateToCart}
          onNavigateToNotifications={onNavigateToNotifications}
        />

        <main className="flex-1 overflow-y-auto">
          <div className="flex min-h-full w-full flex-col bg-gradient-to-b from-slate-50 to-white">
            {catalogLoading ? (
              <div data-subscription-loading className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-500">
                <LoaderCircle className="h-6 w-6 animate-spin text-violet-600" />
                <p className="font-semibold">Loading subscription plans…</p>
              </div>
            ) : catalogError && !catalog ? (
              <div data-subscription-catalog-error className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-700">
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
            ) : (
              <>
      {/* Page title bar */}
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
        <h1 className="text-[15px] font-extrabold tracking-tight text-slate-900">
          {showMemberView ? "My membership" : manageMode && isActiveMember ? "Manage plan" : "Go Premium"}
        </h1>
        <button
          onClick={() => setHelpOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm shadow-slate-200 active:scale-90 transition-transform"
          aria-label="Help & FAQ"
        >
          <HelpCircle className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* An active member gets the membership dashboard, not the buy flow. */}
      {showMemberView ? (
        <div className="flex-1">
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
              // Open directly on another active plan so an existing subscriber
              // can immediately upgrade/downgrade to any catalog plan.
              const currentPlanId = String(activeSubscription?.planId || "");
              const nextPlan = plans.find((candidate) => candidate.active && candidate.id !== currentPlanId);
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
            }}
          />
          <HelpModal open={isHelpOpen} onClose={() => setHelpOpen(false)} />
        </div>
      ) : (
      <>
      <div className="flex-1 pb-4">
        {/* Returning member who chose to renew / change plan / add items. */}
        {isActiveMember && manageMode ? (
          <div className="mx-5 mt-4 space-y-2">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2.5">
              <p className="text-[11px] font-semibold leading-relaxed text-violet-900">
                You already have an active membership. Choose any active plan, feature, or product below. Plan changes activate after verified payment.
              </p>
              <button
                type="button"
                onClick={() => {
                  setManageMode(false);
                  setAddOnIntent(false);
                }}
                className="shrink-0 rounded-xl bg-white px-2.5 py-1.5 text-[11px] font-black text-violet-700 ring-1 ring-violet-200"
              >
                Cancel
              </button>
            </div>
            {isAddOnUpgrade ? (
              <div
                data-subscription-addon-upgrade-note
                className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11px] leading-relaxed text-emerald-800"
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
            {!isAddOnUpgrade && isSelectionOwned ? (
              <div className="flex items-start gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-[11px] leading-relaxed text-violet-800">
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
          ownedPlanId={isActiveMember ? String(activeSubscription?.planId || "") || null : null}
          ownedCycle={
            isActiveMember ? (activeSubscription?.cycle === "yearly" ? "yearly" : "monthly") : null
          }
        />

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
              const firstOther = plans.find(
                (p) => p.active && p.id !== String(activeSubscription?.planId || ""),
              );
              if (firstOther) setSelectedPlanId(firstOther.id);
            }}
            onAddMore={() => setAddOnIntent(true)}
          />
        ) : (
        <>
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
        />

        {/* Price-tier strip — features grouped by their resolved price
            for the active plan + cycle. */}
        <FeaturePricingTiers
          tiers={featureTiers}
          cycle={cycle}
          selectedIds={selectedFeatureIds}
          onToggleTier={(ids, allSelected) => {
            setSelectedFeatureIds((current) => {
              const next = new Set(current);
              if (allSelected) ids.forEach((id) => next.delete(id));
              else ids.forEach((id) => next.add(id));
              return Array.from(next);
            });
          }}
        />

        {/* Coupon section — server-validated via the Part 7 engine.
            The coupon field is hidden when nothing is payable. */}
        <div className="space-y-3 px-5 pt-5">
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
              className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11px] leading-relaxed text-emerald-800"
            >
              <span aria-hidden="true">🎉</span>
              <span>
                This subscription is <strong>free</strong> — no payment is
                needed. Tap the button below to activate it instantly.
              </span>
            </div>
          )}
        </div>

        {/* Order summary */}
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
          couponDiscountPaise={couponDiscountPaise}
          couponCode={appliedReferral?.code ?? appliedCoupon?.code ?? null}
          discountLabel={appliedReferral ? "Referral discount" : "Coupon discount"}
          minPayablePaise={minPayablePaise}
          totalPaise={totalPaise}
        />

        <p className="px-5 pt-5 text-center text-[11px] leading-relaxed text-slate-400">
          By subscribing you agree to the{" "}
          <a href="/terms-of-service.html" className="font-semibold text-violet-600 underline underline-offset-2 hover:text-violet-700">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="/privacy-policy.html" className="font-semibold text-violet-600 underline underline-offset-2 hover:text-violet-700">
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
        ownershipState={ownershipState}
      />

      {/* Modals — only mounted when server-driven data is available. */}
      <CourseSelectModal
        open={isCourseModalOpen}
        selected={selectedCourseIds}
        onClose={() => setCourseModalOpen(false)}
        onChangeSelected={setSelectedCourseIds}
        products={subscriptionDisplayProducts}
        purchasedIds={purchasedIds}
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
