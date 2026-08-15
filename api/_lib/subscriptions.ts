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
const PRODUCT_UNLOCKS_COLLECTION = "subscriptionPlanProductUnlocks";
const MODULE_UNLOCKS_COLLECTION = "subscriptionPlanModuleUnlocks";
const USER_SUBS_COLLECTION = "users";
const USER_SUBS_DOC = "subscription";

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
  // Their IDs and prices are never trusted from the client.
  const selectedProductIds = Array.from(new Set((selection.productIds || []).map(String)));
  if (selectedProductIds.length) {
    const refs = selectedProductIds.map((id) => db.collection("siteProducts").doc(id));
    const snapshots = await db.getAll(...refs);
    for (let index = 0; index < snapshots.length; index += 1) {
      const snapshot = snapshots[index];
      const data = snapshot.data() || {};
      if (!snapshot.exists || data.isVisible === false || data.inStock === false) {
        return { ok: false, status: 404, code: "SUBSCRIPTION_PRODUCT_UNAVAILABLE", error: "A selected bonus product is no longer available." };
      }
      const productId = selectedProductIds[index];
      const effectivePrice = parseProductPricePaise(data);
      const regularPrice = parseProductPricePaise({ ...data, salePrice: null });
      lineItems.push({ id: `subscription_product:${plan.id}:${productId}`, kind: "subscription_features", productId, moduleId: null, resourceId: null, updateId: null, subscriptionPlanId: plan.id, featureId: null, title: String(data.title || "Bonus product"), parentTitle: plan.name, regularPrice, salePrice: effectivePrice < regularPrice ? effectivePrice : null, effectivePrice, quantity: 1, alreadyOwned: false, entitlementId: productId });
    }
  }
  const expiresAt = computeCycleExpiresAt(plan, cycle, now);
  return {
    ok: true,
    plan,
    features,
    lineItems,
    productUnlocks,
    moduleUnlocks,
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
