// api/_lib/subscriptions.ts
//
// Part 9 — server-side subscription plumbing. The pure engine
// lives in `utils/subscriptions.js`; this file wraps it with the
// Firestore + transactional glue the API endpoints need.
//
// Responsibilities:
//   1. Load active subscription plans + features from
//      Firestore.
//   2. Load the per-plan product / module unlock mappings.
//   3. Expose `loadSubscriptionSelectionContext` so the Part 4
//      `handleCreateQuote` can build a fully-resolved quote
//      for a `subscription` / `subscription_features`
//      selection.
//   4. Expose `writeSubscriptionAfterPayment` so the Part 6
//      `grantEntitlementsFromQuote` writer can stamp the
//      user's subscription record after a successful
//      Razorpay capture.

import { Timestamp, type Firestore, type QueryDocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { adminDb, parseProductPricePaise } from "./firebaseAdmin.js";
import { getRenewalBaseTime } from "../../utils/subscriptionRenewal.js";
import {
  ALREADY_ACTIVE_CODE,
  evaluateSubscriptionSelection,
} from "../../utils/subscriptionOwnership.js";
import {
  buildSubscriptionLineItems,
  computeCycleExpiresAt,
  formatBillingCycle,
  fromPaise,
  getCycleDurationDays,
  getPlanCyclePricePaise,
  isFeatureIdAllowed,
  isPlanActive,
  isPlanCycleAllowed,
  isSubscriptionActive,
  normaliseFeatureDoc,
  normalisePlanDoc,
  toPaise,
  validateSubscriptionSelection,
  type BillingCycle,
  type BuildSubscriptionLineItemsInput,
  type SubscriptionCouponContext,
  type SubscriptionFeatureDoc,
  type SubscriptionPlanDoc,
  type SubscriptionPlanModuleUnlock,
  type SubscriptionPlanProductUnlock,
  type SubscriptionRecord,
  type ValidateSubscriptionInput,
  type ValidateSubscriptionResult,
} from "../../utils/subscriptions.js";

const PLANS_COLLECTION = "subscriptionPlans";
const FEATURES_COLLECTION = "subscriptionFeatures";
const SUBSCRIPTION_PRODUCTS_COLLECTION = "subscriptionPlanProducts";
const PRODUCT_UNLOCKS_COLLECTION = "subscriptionPlanProductUnlocks";
const MODULE_UNLOCKS_COLLECTION = "subscriptionPlanModuleUnlocks";
const USER_SUBS_COLLECTION = "users";
const USER_SUBS_DOC = "subscription";

/** Merge verified access into a stored same-order subscription without time math. */
const mergeSubscriptionAccess = (
  previousData: Record<string, unknown>,
  plan: SubscriptionPlanDoc,
  selectedFeatureIds: string[],
) => ({
  features: Array.from(new Set([
    ...(Array.isArray(previousData.features) ? previousData.features.map(String) : []),
    ...selectedFeatureIds,
  ])),
  includedProductIds: Array.from(new Set([
    ...(Array.isArray(previousData.includedProductIds) ? previousData.includedProductIds.map(String) : []),
    ...plan.includedProductIds,
  ])),
  includedModuleKeys: Array.from(new Set([
    ...(Array.isArray(previousData.includedModuleKeys) ? previousData.includedModuleKeys.map(String) : []),
    ...plan.includedModuleKeys,
  ])),
});

/**
 * Built-in default plans, seeded when no active plan exists yet. Their ids
 * ("basic" / "premium" / "pro") match the client fallback catalog
 * (`src/subscription/data/fallbackCatalog.ts`) so that a freshly deployed
 * project still completes checkout instead of failing with
 * "This plan is no longer available".
 *
 * Plan base price is not charged (see `buildSubscriptionLineItems`); these
 * rupee values only drive the displayed cycle price. The payable total is
 * always the selected features + bonus products.
 */
const DEFAULT_SUBSCRIPTION_PLANS: Array<Record<string, unknown>> = [
  { id: "basic", name: "Basic", description: "Flexible subscription access with optional My Day cloud saving.", monthlyPrice: 199, yearlyPrice: 1990, allowedCycles: ["monthly", "yearly"], active: true, badge: null, sortOrder: 0 },
  { id: "premium", name: "Premium", description: "Premium subscription access with selectable My Day cloud saving.", monthlyPrice: 499, yearlyPrice: 4990, allowedCycles: ["monthly", "yearly"], active: true, badge: "POPULAR", sortOrder: 1 },
  { id: "pro", name: "Pro", description: "Pro subscription access with selectable products and My Day cloud saving.", monthlyPrice: 999, yearlyPrice: 9990, allowedCycles: ["monthly", "yearly"], active: true, badge: null, sortOrder: 2 },
];

/**
 * Idempotently seed the default plan catalog when no active plan is
 * configured. This makes the subscription flow self-healing: a project that
 * was never seeded (or where every plan was left inactive) still resolves the
 * client's fallback plan ids instead of refusing the quote.
 */
export const ensureDefaultSubscriptionPlans = async (db: Firestore): Promise<void> => {
  try {
    const active = await db.collection(PLANS_COLLECTION).where("active", "==", true).limit(1).get();
    if (!active.empty) return;
    await Promise.all(
      DEFAULT_SUBSCRIPTION_PLANS.map((plan) =>
        db.collection(PLANS_COLLECTION).doc(String(plan.id)).set(
          { ...plan, updatedAt: Timestamp.now() },
          { merge: true },
        ),
      ),
    );
  } catch (error) {
    // Seeding is best-effort — never let a seed failure break a catalog read.
    console.warn("[subscriptions] default plan seeding skipped", error);
  }
};

/**
 * Read the buyer's live subscription record. Returns `null` when they have
 * never subscribed. Used by the duplicate-purchase guard below.
 */
export const loadCurrentSubscription = async (
  uid: string,
  options: { db?: Firestore } = {},
): Promise<Record<string, unknown> | null> => {
  if (!uid) return null;
  const db = options.db ?? adminDb();
  const snap = await db
    .collection(USER_SUBS_COLLECTION)
    .doc(uid)
    .collection(USER_SUBS_DOC)
    .doc("current")
    .get();
  return snap.exists ? ((snap.data() || {}) as Record<string, unknown>) : null;
};

/**
 * Refuse a quote for a subscription type the buyer already holds.
 *
 * The client hides the buy flow for an owned plan + cycle, but the client is
 * never the authority: this re-runs the identical pure rule against the stored
 * record so a crafted request cannot buy the same membership twice. Renewals
 * inside the renewal window are still allowed.
 */
export const assertSubscriptionPurchasable = async (
  uid: string,
  selection: { subscriptionPlanId?: string | null; billingCycle?: BillingCycle | null },
  options: { db?: Firestore; now?: number } = {},
): Promise<{ ok: true } | { ok: false; status: number; code: string; error: string }> => {
  const record = await loadCurrentSubscription(uid, options);
  if (!record) return { ok: true };
  const verdict = evaluateSubscriptionSelection({
    record,
    planId: String(selection.subscriptionPlanId || ""),
    cycle: selection.billingCycle === "yearly" ? "yearly" : "monthly",
    now: options.now ?? Date.now(),
  });
  if (!verdict.blocked) return { ok: true };
  return {
    ok: false,
    status: 409,
    code: verdict.code || ALREADY_ACTIVE_CODE,
    error: verdict.reason || "You already have this subscription active.",
  };
};

/** Load a single plan by id (returns null when missing / inactive). */
export const loadPlanById = async (
  planId: string,
  options: { db?: Firestore } = {},
): Promise<SubscriptionPlanDoc | null> => {
  if (!planId) return null;
  const db = options.db ?? adminDb();
  let snap = await db.collection(PLANS_COLLECTION).doc(planId).get();
  // Self-heal: when the requested plan is missing, seed the defaults so the
  // client fallback ids ("basic" / "premium" / "pro") resolve instead of
  // rejecting the quote with "This plan is no longer available".
  if (!snap.exists) {
    await ensureDefaultSubscriptionPlans(db);
    snap = await db.collection(PLANS_COLLECTION).doc(planId).get();
  }
  if (!snap.exists) return null;
  const plan = normalisePlanDoc(snap.data() || {}, snap.id);
  if (!plan) return null;
  return { ...plan, includedFeatureIds: [] };
};

/** Load all active plans (for the catalog endpoint). */
export const loadActivePlans = async (
  options: { db?: Firestore } = {},
): Promise<SubscriptionPlanDoc[]> => {
  const db = options.db ?? adminDb();
  await ensureDefaultSubscriptionPlans(db);
  const snap = await db.collection(PLANS_COLLECTION).where("active", "==", true).get();
  const plans: SubscriptionPlanDoc[] = [];
  for (const doc of snap.docs) {
    const plan = normalisePlanDoc(doc.data() || {}, doc.id);
    if (plan && plan.active) plans.push({ ...plan, includedFeatureIds: [] });
  }
  plans.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  return plans;
};

/** Load all active features. */
export const loadActiveFeatures = async (
  options: { db?: Firestore } = {},
): Promise<SubscriptionFeatureDoc[]> => {
  const db = options.db ?? adminDb();
  // Read the complete collection instead of querying only active rows. This
  // distinction matters: deleting/deactivating a feature in Admin must remove
  // its subscription gate, not silently recreate the old My Day feature.
  const snap = await db.collection(FEATURES_COLLECTION).get();
  const features: SubscriptionFeatureDoc[] = [];
  for (const doc of snap.docs) {
    const feature = normaliseFeatureDoc(doc.data() || {}, doc.id);
    // The admin catalog is the source of truth: expose every active feature.
    // The legacy my-day rule is now evaluated from this same catalog entry
    // (feature.id === "my-day"); it is no longer forced into the response.
    if (feature && feature.active) features.push(feature);
  }
  features.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  return features;
};

/** Load subscription products (priced add-on products for subscriptions). */
export const loadSubscriptionProducts = async (
  options: { db?: Firestore } = {},
): Promise<any[]> => {
  const db = options.db ?? adminDb();
  const snap = await db.collection(SUBSCRIPTION_PRODUCTS_COLLECTION).get();
  const products: any[] = [];
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if (data.active === false) continue;
    products.push({
      id: doc.id,
      productId: String(data.productId || doc.id),
      name: String(data.name || "Product"),
      pricePaise: Number(data.price || 0) * 100,
      monthlyPricePaise: data.monthlyPrice != null ? Number(data.monthlyPrice) * 100 : null,
      yearlyPricePaise: data.yearlyPrice != null ? Number(data.yearlyPrice) * 100 : null,
      planPricing: data.planPricing && typeof data.planPricing === "object" ? data.planPricing : {},
      included: !!data.included,
      sortOrder: Number(data.sortOrder || 0),
      active: data.active !== false,
    });
  }
  products.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  return products;
};

/** Load all product unlocks for a plan. */
export const loadPlanProductUnlocks = async (
  planId: string,
  options: { db?: Firestore } = {},
): Promise<SubscriptionPlanProductUnlock[]> => {
  if (!planId) return [];
  const db = options.db ?? adminDb();
  const snap = await db
    .collection(PRODUCT_UNLOCKS_COLLECTION)
    .where("planId", "==", planId)
    .get();
  return snap.docs
    .map((doc) => {
      const data = doc.data() || {};
      return {
        planId: String(data.planId || planId),
        productId: String(data.productId || ""),
        active: data.active !== false,
      };
    })
    .filter((u) => u.productId);
};

/** Load all module unlocks for a plan. */
export const loadPlanModuleUnlocks = async (
  planId: string,
  options: { db?: Firestore } = {},
): Promise<SubscriptionPlanModuleUnlock[]> => {
  if (!planId) return [];
  const db = options.db ?? adminDb();
  const snap = await db
    .collection(MODULE_UNLOCKS_COLLECTION)
    .where("planId", "==", planId)
    .get();
  return snap.docs
    .map((doc: QueryDocumentSnapshot) => {
      const data = doc.data() || {};
      return {
        planId: String(data.planId || planId),
        productId: String(data.productId || ""),
        moduleId: String(data.moduleId || ""),
        active: data.active !== false,
      };
    })
    .filter((u) => u.productId && u.moduleId);
};

/**
 * Resolve either the Firestore document id or the public `siteProducts.id`.
 * CatalogContext deliberately exposes both identities, and older products can
 * have different values. Subscription checkout must therefore mirror the
 * normal product quote loader instead of assuming the public id is a doc id.
 */
const loadSubscriptionProductByAnyId = async (
  db: Firestore,
  requestedId: string,
): Promise<{ documentId: string; data: Record<string, unknown> } | null> => {
  const direct = await db.collection("siteProducts").doc(requestedId).get();
  if (direct.exists) {
    return { documentId: direct.id, data: (direct.data() || {}) as Record<string, unknown> };
  }

  const candidates: Array<string | number> = [requestedId];
  if (/^\d+$/.test(requestedId)) candidates.push(Number(requestedId));
  for (const candidate of candidates) {
    const byPublicId = await db.collection("siteProducts").where("id", "==", candidate).limit(1).get();
    const match = byPublicId.docs[0];
    if (match) return { documentId: match.id, data: (match.data() || {}) as Record<string, unknown> };
  }
  return null;
};

/**
 * Resolve the Part 9 selection to a fully-loaded context the
 * Part 4 engine can consume. Returns either
 * `{ ok: true, plan, features, lineItems, expiresAt }` or
 * `{ ok: false, status, error }`.
 */
export const loadSubscriptionSelectionContext = async (
  selection: { subscriptionPlanId?: string | null; billingCycle?: BillingCycle | null; featureIds?: string[]; productIds?: string[]; moduleIds?: string[] },
  options: { db?: Firestore; now?: number } = {},
): Promise<
  | {
      ok: true;
      plan: SubscriptionPlanDoc;
      features: SubscriptionFeatureDoc[];
      lineItems: ReturnType<typeof buildSubscriptionLineItems>;
      productUnlocks: SubscriptionPlanProductUnlock[];
      moduleUnlocks: SubscriptionPlanModuleUnlock[];
      /** Public/document aliases that must unlock after payment. */
      selectedProductIds: string[];
      expiresAt: number;
      cycle: BillingCycle;
    }
  | { ok: false; status: number; error: string; code: string }
> => {
  const now = options.now ?? Date.now();
  const db = options.db ?? adminDb();
  const planId = String(selection.subscriptionPlanId || "").trim();
  if (!planId) {
    return { ok: false, status: 400, code: "SUBSCRIPTION_PLAN_REQUIRED", error: "Plan id is required." };
  }
  const plan = await loadPlanById(planId, options);
  if (!plan || !isPlanActive(plan)) {
    return { ok: false, status: 404, code: "SUBSCRIPTION_PLAN_INACTIVE", error: "This plan is no longer available." };
  }
  const cycle = selection.billingCycle === "yearly" ? "yearly" : "monthly";
  if (!isPlanCycleAllowed(plan, cycle)) {
    return { ok: false, status: 400, code: "SUBSCRIPTION_CYCLE_NOT_ALLOWED", error: `This plan does not support the ${cycle} billing cycle.` };
  }
  // Load the selected features + the unlock mappings.
  const allFeatures = await loadActiveFeatures(options);
  const featureIndex = new Map(allFeatures.map((f) => [String(f.id), f]));
  const selectedFeatureIds = Array.isArray(selection.featureIds) ? selection.featureIds.map(String) : [];
  const features: SubscriptionFeatureDoc[] = [];
  for (const id of selectedFeatureIds) {
    const f = featureIndex.get(id);
    if (!f) {
      return { ok: false, status: 400, code: "SUBSCRIPTION_FEATURE_NOT_FOUND", error: `Feature ${id} is not available.` };
    }
    if (!f.active) {
      return { ok: false, status: 400, code: "SUBSCRIPTION_FEATURE_INACTIVE", error: `${f.name} is no longer available.` };
    }
    features.push(f);
  }
  const productUnlocks = await loadPlanProductUnlocks(planId, options);
  const moduleUnlocks = await loadPlanModuleUnlocks(planId, options);
  const validation = validateSubscriptionSelection({
    plan,
    cycle,
    selectedFeatureIds,
    featureRecords: allFeatures,
  });
  if (!validation.ok) {
    return { ok: false, status: 400, code: validation.code, error: validation.reason };
  }
  const lineItems = buildSubscriptionLineItems({
    plan,
    cycle,
    selectedFeatureIds,
    featureRecords: allFeatures,
    productUnlocks,
    moduleUnlocks,
  });
  // Buyer-selected bonus products are loaded from the live server catalog.
  // Their IDs and prices are never trusted from the client. Keep both the
  // public id and Firestore document id as access aliases: CatalogContext and
  // legacy course routes do not always use the same identity.
  const requestedProductIds = Array.from(new Set((selection.productIds || []).map(String).filter(Boolean)));
  const selectedProductIds = new Set<string>();
  const loadedDocumentIds = new Set<string>();

  // Load subscription product pricing rules so we can apply per-plan / per-cycle / free overrides
  const subProducts = await loadSubscriptionProducts(options);

  for (const requestedProductId of requestedProductIds) {
    const product = await loadSubscriptionProductByAnyId(db, requestedProductId);
    const data = product?.data || {};
    if (!product || data.isVisible === false || data.inStock === false) {
      return { ok: false, status: 404, code: "SUBSCRIPTION_PRODUCT_UNAVAILABLE", error: "A selected bonus product is no longer available." };
    }

    // Selecting the same product through two aliases must never charge twice.
    if (loadedDocumentIds.has(product.documentId)) continue;
    loadedDocumentIds.add(product.documentId);

    const publicProductId = String(data.id ?? product.documentId).trim() || product.documentId;
    selectedProductIds.add(publicProductId);
    selectedProductIds.add(product.documentId);
    selectedProductIds.add(requestedProductId);

    // Resolve pricing from subscriptionPlanProducts if present (new customisation)
    let effectivePrice = parseProductPricePaise(data);
    const regularPrice = parseProductPricePaise({ ...data, salePrice: null });

    // Find matching subscription product pricing rule
    const match = subProducts.find((sp: any) =>
      String(sp.productId) === String(publicProductId) ||
      String(sp.id) === String(publicProductId) ||
      String(sp.productId) === String(requestedProductId)
    );

    if (match) {
      const resolved = resolveFeaturePrice({
        id: match.productId || match.id,
        included: match.included,
        pricePaise: match.pricePaise || 0,
        monthlyPricePaise: match.monthlyPricePaise,
        yearlyPricePaise: match.yearlyPricePaise,
        planPricing: match.planPricing || {},
      }, plan.id, cycle);

      if (resolved.included || resolved.pricePaise === 0) {
        effectivePrice = 0;
      } else {
        effectivePrice = resolved.pricePaise;
      }
    }

    lineItems.push({
      id: `subscription_product:${plan.id}:${publicProductId}`,
      kind: "subscription_features",
      productId: publicProductId,
      moduleId: null,
      resourceId: null,
      updateId: null,
      subscriptionPlanId: plan.id,
      featureId: null,
      title: String(data.title || "Bonus product"),
      parentTitle: plan.name,
      regularPrice,
      salePrice: effectivePrice < regularPrice ? effectivePrice : null,
      effectivePrice,
      quantity: 1,
      alreadyOwned: false,
      entitlementId: `subscription_product_unlock:${plan.id}:${publicProductId}`,
    });
  }
  const expiresAt = computeCycleExpiresAt(plan, cycle, now);
  return {
    ok: true,
    plan,
    features,
    lineItems,
    productUnlocks,
    moduleUnlocks,
    selectedProductIds: Array.from(selectedProductIds),
    expiresAt,
    cycle,
  };
};

/**
 * Persist the subscription record on a successful payment. Runs
 * inside the `grantEntitlementsFromQuote` transaction. Writes
 * `subscriptions/{uid}/current` (the canonical record) AND
 * mirrors the high-value fields on the legacy `users/{uid}`
 * doc so existing readers (profile, admin) keep working.
 */
export const writeSubscriptionAfterPayment = async (
  tx: Transaction,
  args: {
    uid: string;
    plan: SubscriptionPlanDoc;
    cycle: BillingCycle;
    selectedFeatureIds: string[];
    orderId: string;
    paymentId: string | null;
    amountPaise: number;
    source: "razorpay" | "free" | "admin";
    couponCode: string | null;
    requestedEduCoins: number;
    now: number;
    existingSubscription?: { exists: boolean; data: Record<string, unknown> };
  },
): Promise<SubscriptionRecord> => {
  const nowTs = Timestamp.fromMillis(args.now);
  const subRef = adminDb()
    .collection(USER_SUBS_COLLECTION)
    .doc(args.uid)
    .collection(USER_SUBS_DOC)
    .doc("current");
  const previous = args.existingSubscription || (() => { throw new Error("Existing subscription snapshot is required before transaction writes."); })();
  const previousData = previous.data || {};

  // Replay guard. The verify endpoint may legitimately run twice for
  // the same order (page refresh, webhook retry, a resumed grant after
  // a partial failure). Re-running the write would treat the existing
  // record as a *renewal* and extend the expiry by another full cycle,
  // silently gifting free time. If this exact order already activated
  // the subscription, return the stored record untouched.
  if (previous.exists && String(previousData.orderId || "") === args.orderId) {
    const storedExpiry = previousData.expiresAt;
    const expiresAtMs =
      storedExpiry && typeof (storedExpiry as { toMillis?: () => number }).toMillis === "function"
        ? (storedExpiry as { toMillis: () => number }).toMillis()
        : Number(storedExpiry || 0);
    const storedActivated = previousData.activatedAt;
    const activatedAtMs =
      storedActivated && typeof (storedActivated as { toMillis?: () => number }).toMillis === "function"
        ? (storedActivated as { toMillis: () => number }).toMillis()
        : Number(storedActivated || args.now);

    // Repair access from the verified quote, but preserve the stored dates.
    const access = mergeSubscriptionAccess(previousData, args.plan, args.selectedFeatureIds);
    tx.set(subRef, access, { merge: true });
    tx.set(adminDb().collection(USER_SUBS_COLLECTION).doc(args.uid), {
      subscriptionFeatures: access.features,
      subscriptionExpiresAt: Timestamp.fromMillis(expiresAtMs),
      updatedAt: nowTs,
    }, { merge: true });
    return {
      uid: args.uid,
      planId: String(previousData.planId || args.plan.id),
      cycle: (previousData.cycle === "yearly" ? "yearly" : "monthly") as BillingCycle,
      features: access.features,
      includedProductIds: access.includedProductIds,
      includedModuleKeys: access.includedModuleKeys,
      status: "active",
      activatedAt: activatedAtMs,
      expiresAt: expiresAtMs,
      autoRenew: false,
      orderId: args.orderId,
      paymentId: args.paymentId,
      amountPaise: Math.max(0, Math.round(Number(previousData.amountPaise ?? args.amountPaise ?? 0))),
      source: args.source,
      couponCode: args.couponCode || null,
      requestedEduCoins: Math.max(0, Math.floor(Number(args.requestedEduCoins || 0))),
    };
  }

  const renewalBase = getRenewalBaseTime(previousData.expiresAt, args.now);
  // Trials apply only to first activation, never to a renewal.
  const renewalPlan = previous.exists ? { ...args.plan, trialDays: 0 } : args.plan;
  const expiresAt = computeCycleExpiresAt(renewalPlan, args.cycle, renewalBase);
  const renewalCount = Math.max(0, Number(previousData.renewalCount || 0)) + (previous.exists ? 1 : 0);
  const record: SubscriptionRecord = {
    uid: args.uid,
    planId: args.plan.id,
    cycle: args.cycle,
    features: args.selectedFeatureIds.slice(),
    includedProductIds: args.plan.includedProductIds.slice(),
    includedModuleKeys: args.plan.includedModuleKeys.slice(),
    status: "active",
    activatedAt: args.now,
    expiresAt,
    // Razorpay is currently an order flow, not a recurring mandate. Renewal
    // is explicit and user-confirmed; reminders never imply an auto-charge.
    autoRenew: false,
    orderId: args.orderId,
    paymentId: args.paymentId,
    amountPaise: Math.max(0, Math.round(Number(args.amountPaise || 0))),
    source: args.source,
    couponCode: args.couponCode || null,
    requestedEduCoins: Math.max(0, Math.floor(Number(args.requestedEduCoins || 0))),
  };
  tx.set(subRef, { ...record, activatedAt: nowTs, renewedAt: previous.exists ? nowTs : null, renewalCount, expiresAt: Timestamp.fromMillis(expiresAt), renewalReminderOptOut: Boolean(previousData.renewalReminderOptOut) }, { merge: false });

  // Mirror the high-value fields on the user doc for legacy readers.
  const userRef = adminDb().collection(USER_SUBS_COLLECTION).doc(args.uid);
  tx.set(
    userRef,
    {
      subscriptionPlanId: args.plan.id,
      subscriptionCycle: args.cycle,
      subscriptionTier: args.plan.id,
      subscriptionFeatures: args.selectedFeatureIds.slice(),
      subscriptionExpiresAt: Timestamp.fromMillis(expiresAt),
      subscriptionAutoRenew: false,
      subscriptionRenewalCount: renewalCount,
      subscriptionActivatedAt: nowTs,
      updatedAt: nowTs,
    },
    { merge: true },
  );
  return record;
};

/** Pure helper: a list of entitlement ids the subscription grants
 *  to the user. The Part 6 entitlement writer uses this when the
 *  purchase kind is a subscription. */
const collectSubscriptionEntitlementIds = (args: {
  plan: SubscriptionPlanDoc;
  cycle: BillingCycle;
  selectedFeatureIds: string[];
  productUnlocks: SubscriptionPlanProductUnlock[];
  moduleUnlocks: SubscriptionPlanModuleUnlock[];
}): string[] => {
  const ids: string[] = [`subscription:${args.plan.id}`];
  for (const f of args.selectedFeatureIds) {
    ids.push(`subscription_feature:${args.plan.id}:${f}`);
  }
  for (const u of args.productUnlocks) {
    if (u.active) ids.push(`subscription_product_unlock:${args.plan.id}:${u.productId}`);
  }
  for (const u of args.moduleUnlocks) {
    if (u.active) ids.push(`subscription_module_unlock:${args.plan.id}:${u.productId}:${u.moduleId}`);
  }
  return ids;
};

export {
  buildSubscriptionLineItems,
  collectSubscriptionEntitlementIds,
  computeCycleExpiresAt,
  formatBillingCycle,
  fromPaise,
  getCycleDurationDays,
  getPlanCyclePricePaise,
  isFeatureIdAllowed,
  isPlanActive,
  isPlanCycleAllowed,
  isSubscriptionActive,
  normaliseFeatureDoc,
  normalisePlanDoc,
  toPaise,
  validateSubscriptionSelection,
};

export type {
  BillingCycle,
  BuildSubscriptionLineItemsInput,
  SubscriptionCouponContext,
  SubscriptionFeatureDoc,
  SubscriptionPlanDoc,
  SubscriptionPlanModuleUnlock,
  SubscriptionPlanProductUnlock,
  SubscriptionRecord,
  ValidateSubscriptionInput,
  ValidateSubscriptionResult,
};
