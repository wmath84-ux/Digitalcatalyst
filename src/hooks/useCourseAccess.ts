// src/hooks/useCourseAccess.ts
//
// Part 10 — the single React hook that wires the Part 10
// `resolveCourseAccess` engine to Firestore. Every consumer
// (Course route guard, Course Player, Product Detail,
// Profile, Purchases library) uses this hook so the access
// story is computed in one place.
//
// The hook subscribes to the same five collections the rest
// of the app reads:
//   - `entitlements/{uid}__*` (Part 6 / Part 9 canonical
//     entitlement docs)
//   - `subscriptions/{uid}/current` (Part 9 subscription record)
//   - `users/{uid}.purchasedProductIds` (Part 6 legacy base
//     product ownership)
//   - `users/{uid}.purchasedProductUpdateIds` (Part 6 legacy
//     per-product update ownership)
//   - `users/{uid}/purchases/*` (Part 6 legacy per-product
//     base purchase doc; treated as base-product ownership)
//
// It returns the canonical `CourseAccessResolution` for a
// given product + an "empty" sentinel when the user is signed
// out. The hook is cheap: it does not subscribe to the
// product itself; the caller passes the product doc and the
// hook computes the access.

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../context/AuthContext";
import {
  collectEntitlementOwnership,
  isSubscriptionRecordActive,
  resolveCourseAccess,
  type CourseAccessResolution,
  type SubscriptionRecordShape,
} from "../../utils/courseAccess";

/** The empty resolution returned when the user is signed out. */
const EMPTY_RESOLUTION: CourseAccessResolution = {
  hasFullProductAccess: false,
  ownedModuleIds: new Set<string>(),
  ownedResourceIds: new Set<string>(),
  ownedUpdateIds: new Set<string>(),
  subscriptionGrantedModuleIds: new Set<string>(),
  accessibleModuleIds: new Set<string>(),
  accessibleResourceIds: new Set<string>(),
  lockedModuleIds: new Set<string>(),
  previewModuleIds: new Set<string>(),
  moduleAccessSources: {},
  resourceAccessSources: {},
  unmetDependencies: {},
};

interface SubscriptionPlanContext {
  /** Product ids unlocked by the active subscription. */
  productIds: string[];
  /**
   * Module ids the active subscription grants as part of the
   * plan's "included module" mapping.
   */
  moduleIds: string[];
  /** Resource ids the active subscription grants. */
  resourceIds: string[];
}

const EMPTY_PLAN: SubscriptionPlanContext = {
  productIds: [],
  moduleIds: [],
  resourceIds: [],
};

const timestampMillis = (value: unknown) => {
  if (value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function") return (value as { toMillis: () => number }).toMillis();
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};

interface UseCourseAccessArgs {
  /** The product to resolve access for. Required. */
  product: unknown | null;
  /**
   * When true, paid updates only open when the user owns the
   * base product (or the subscription grants the base). The
   * flag defaults to `true` to match the Part 1 contract.
   */
  requireBaseCourseForUpdate?: boolean;
}

interface UseCourseAccessResult {
  resolution: CourseAccessResolution;
  loading: boolean;
  /** True when the user is signed in (the resolver has data). */
  signedIn: boolean;
  /** True when the user has an active subscription granting products. */
  hasActiveSubscription: boolean;
  /** The active subscription record (or null). */
  subscription: SubscriptionRecordShape | null;
}

interface EntitlementDoc {
  uid?: string;
  productId?: string | null;
  kind?: string;
  moduleId?: string | null;
  resourceId?: string | null;
  updateId?: string | null;
  status?: string;
  planId?: string | null;
  featureId?: string | null;
}

/**
 * Hook: resolve a user's access to a product via the Part 10
 * `resolveCourseAccess` engine.
 *
 * Usage:
 *
 *   const { resolution, loading } = useCourseAccess({ product });
 *   if (resolution.accessibleModuleIds.has(moduleId)) ...
 */
export const useCourseAccess = ({ product, requireBaseCourseForUpdate = true }: UseCourseAccessArgs): UseCourseAccessResult => {
  const { user } = useAuth();
  const uid = user?.id || null;

  const [entitlementDocs, setEntitlementDocs] = useState<EntitlementDoc[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionRecordShape | null>(null);
  const [legacyProductIds, setLegacyProductIds] = useState<string[]>([]);
  const [legacyUpdateIds, setLegacyUpdateIds] = useState<string[]>([]);
  const [legacyPurchaseProductIds, setLegacyPurchaseProductIds] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(uid));

  // Subscribe to canonical entitlements (Part 6 / Part 9).
  useEffect(() => {
    if (!uid) {
      setEntitlementDocs([]);
      return undefined;
    }
    const entitlementsCol = collection(db, "entitlements");
    const q = query(entitlementsCol, where("uid", "==", uid));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs: EntitlementDoc[] = snapshot.docs.map((item) => {
          const data = item.data() || {};
          // The doc id is `uid__<entitlementId>`; the
          // server-authoritative shape is on the doc body.
          return {
            uid: String(data.uid || uid),
            productId: data.productId ?? null,
            kind: data.kind ? String(data.kind) : undefined,
            moduleId: data.moduleId ?? null,
            resourceId: data.resourceId ?? null,
            updateId: data.updateId ?? null,
            status: data.status ? String(data.status) : undefined,
            planId: data.planId ?? null,
            featureId: data.featureId ?? null,
          };
        });
        setEntitlementDocs(docs);
      },
      (err) => {
        console.warn("[useCourseAccess] entitlement sync failed", err);
        setEntitlementDocs([]);
      },
    );
    return () => unsubscribe();
  }, [uid]);

  // Subscribe to the current subscription record (Part 9).
  useEffect(() => {
    if (!uid) {
      setSubscription(null);
      return undefined;
    }
    const subRef = doc(db, "users", uid, "subscription", "current");
    const unsubscribe = onSnapshot(
      subRef,
      (snapshot) => {
        const data = snapshot.data() || {};
        const sub = data as Record<string, unknown>;
        if (!Object.keys(sub).length) {
          setSubscription(null);
          return;
        }
        setSubscription({
          uid: String(data.uid || uid),
          planId: data.planId ? String(data.planId) : undefined,
          cycle: data.cycle === "yearly" ? "yearly" : "monthly",
          status: data.status ? String(data.status) : undefined,
          expiresAt: timestampMillis(data.expiresAt),
          activatedAt: timestampMillis(data.activatedAt),
          autoRenew: Boolean(data.autoRenew),
          includedProductIds: Array.isArray(data.includedProductIds) ? data.includedProductIds.map(String) : [],
          includedModuleKeys: Array.isArray(data.includedModuleKeys) ? data.includedModuleKeys.map(String) : [],
        });
      },
      (err) => {
        console.warn("[useCourseAccess] subscription sync failed", err);
        setSubscription(null);
      },
    );
    return () => unsubscribe();
  }, [uid]);

  // Subscribe to the legacy `users/{uid}` doc (Part 6
  // dual-writer) for `purchasedProductIds` +
  // `purchasedProductUpdateIds`.
  useEffect(() => {
    if (!uid) {
      setLegacyProductIds([]);
      setLegacyUpdateIds([]);
      return undefined;
    }
    const userRef = doc(db, "users", uid);
    const unsubscribe = onSnapshot(
      userRef,
      (snapshot) => {
        const data = snapshot.data() || {};
        const productIds = Array.isArray(data.purchasedProductIds) ? data.purchasedProductIds.map(String) : [];
        const updateMap = (data.purchasedProductUpdateIds || {}) as Record<string, unknown>;
        const updateIds: string[] = [];
        for (const value of Object.values(updateMap)) {
          if (Array.isArray(value)) updateIds.push(...value.map(String));
        }
        setLegacyProductIds(productIds);
        setLegacyUpdateIds(updateIds);
      },
      (err) => {
        console.warn("[useCourseAccess] user-doc sync failed", err);
        setLegacyProductIds([]);
        setLegacyUpdateIds([]);
      },
    );
    return () => unsubscribe();
  }, [uid]);

  // Subscribe to the legacy `users/{uid}/purchases/*` subcollection
  // (Part 6 dual-writer) for base product ownership.
  useEffect(() => {
    if (!uid) {
      setLegacyPurchaseProductIds([]);
      return undefined;
    }
    const purchasesCol = collection(db, "users", uid, "purchases");
    const unsubscribe = onSnapshot(
      purchasesCol,
      (snapshot) => {
        const ids = new Set<string>();
        snapshot.docs.forEach((item) => {
          const data = item.data() || {};
          // Per-Part 6: the base product purchase is stored
          // at docId = productId. We also look at
          // productDocumentId for the same.
          const id = String(data.productDocumentId || item.id);
          if (id) ids.add(id);
        });
        setLegacyPurchaseProductIds(Array.from(ids));
      },
      (err) => {
        console.warn("[useCourseAccess] purchases subcollection sync failed", err);
        setLegacyPurchaseProductIds([]);
      },
    );
    return () => unsubscribe();
  }, [uid]);

  // The "loading" state is true until the entitlement +
  // subscription listeners have all fired at least once.
  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }
    // We only flip `loading` false after a tick so the first
    // render shows the loading skeleton. Subscriptions are
    // immediate; a 50ms debounce is enough.
    const timer = setTimeout(() => setLoading(false), 50);
    return () => clearTimeout(timer);
  }, [uid]);

  // Compute the active subscription context (only when the
  // subscription is currently active).
  const planContext: SubscriptionPlanContext = useMemo(() => {
    if (!subscription || !isSubscriptionRecordActive(subscription)) return EMPTY_PLAN;
    return {
      productIds: subscription.includedProductIds || [],
      moduleIds: (subscription.includedModuleKeys || []).map((key) => String(key).split(":").pop() || "").filter(Boolean),
      resourceIds: [],
    };
  }, [subscription]);

  // Compute the resolution. Pure — recomputed only when the
  // inputs change.
  const resolution = useMemo<CourseAccessResolution>(() => {
    if (!uid || !product) return EMPTY_RESOLUTION;
    const entitlements = collectEntitlementOwnership(entitlementDocs);
    const ownedProductIds = new Set<string>([...entitlements.ownedProductIds, ...legacyProductIds, ...legacyPurchaseProductIds]);
    const ownedUpdateIds = new Set<string>([...entitlements.ownedUpdateIds, ...legacyUpdateIds]);
    return resolveCourseAccess({
      product: product as Parameters<typeof resolveCourseAccess>[0]["product"],
      ownedProductIds: Array.from(ownedProductIds),
      ownedUpdateIds: Array.from(ownedUpdateIds),
      ownedModuleIds: Array.from(entitlements.ownedModuleIds),
      ownedResourceIds: Array.from(entitlements.ownedResourceIds),
      subscriptionProductIds: planContext.productIds,
      subscriptionModuleIds: planContext.moduleIds,
      subscriptionResourceIds: planContext.resourceIds,
      requireBaseCourseForUpdate,
    });
  }, [uid, product, entitlementDocs, legacyProductIds, legacyPurchaseProductIds, legacyUpdateIds, planContext, requireBaseCourseForUpdate]);

  const hasActiveSubscription = Boolean(
    subscription && isSubscriptionRecordActive(subscription),
  );

  return {
    resolution,
    loading,
    signedIn: Boolean(uid),
    hasActiveSubscription,
    subscription,
  };
};

/**
 * Lightweight hook variant: returns a "summary" view of every
 * product the user has any access to (full product, module,
 * resource, update, or active subscription). Consumed by the
 * Profile + Purchases library.
 */
export const useOwnedProducts = (): {
  ownedProductIds: string[];
  loading: boolean;
  signedIn: boolean;
} => {
  const { user } = useAuth();
  const uid = user?.id || null;
  const [entitlementProductIds, setEntitlementProductIds] = useState<string[]>([]);
  const [subscriptionProductIds, setSubscriptionProductIds] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(uid));

  useEffect(() => {
    if (!uid) {
      setEntitlementProductIds([]);
      setLoading(false);
      return undefined;
    }
    const entitlementsCol = collection(db, "entitlements");
    const q = query(entitlementsCol, where("uid", "==", uid));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const ids = new Set<string>();
        snapshot.docs.forEach((item) => {
          const data = item.data() || {};
          const kind = data.kind ? String(data.kind) : "";
          if (kind === "full_product" && data.productId) {
            ids.add(String(data.productId));
          }
        });
        setEntitlementProductIds(Array.from(ids));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsubscribe();
  }, [uid]);

  // Subscription products are time-limited ownership, but they must still be
  // visible in the learner's library and open without showing another buy
  // button while the membership is active.
  useEffect(() => {
    if (!uid) {
      setSubscriptionProductIds([]);
      return undefined;
    }
    return onSnapshot(doc(db, "users", uid, "subscription", "current"), (snapshot) => {
      const data = snapshot.data() || {};
      const record: SubscriptionRecordShape = {
        status: data.status ? String(data.status) : undefined,
        expiresAt: timestampMillis(data.expiresAt),
      };
      setSubscriptionProductIds(
        snapshot.exists() && isSubscriptionRecordActive(record) && Array.isArray(data.includedProductIds)
          ? data.includedProductIds.map(String)
          : [],
      );
    }, () => setSubscriptionProductIds([]));
  }, [uid]);

  const ownedProductIds = useMemo(
    () => Array.from(new Set([...entitlementProductIds, ...subscriptionProductIds])),
    [entitlementProductIds, subscriptionProductIds],
  );

  return { ownedProductIds, loading, signedIn: Boolean(uid) };
};
