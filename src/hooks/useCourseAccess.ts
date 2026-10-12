import { canonicalOwnershipScopes, isActiveOwnershipRecord, isFullProductPurchase, ownershipTimestamp } from "../../utils/contentOwnership";
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

import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  doc,
  query,
  where,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import { apiFetch } from "../utils/apiBase";
import { retrySharedCollection, retrySharedDoc, subscribeShared, subscribeSharedDoc } from "../lib/sharedSnapshot";
import { useAuth } from "../context/AuthContext";
import { collectLibraryProductIds } from "../../utils/libraryOwnership";
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

const timestampMillis = ownershipTimestamp;
const ACCESS_UNVERIFIED_ERROR = "Your content access could not be verified. Check your connection and retry.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const stringSet = (value: unknown) => new Set(
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [],
);
const stringRecord = (value: unknown): Record<string, string> => {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
};
const resolutionFromServer = (value: unknown): CourseAccessResolution | null => {
  if (!isRecord(value) || typeof value.hasFullProductAccess !== "boolean") return null;
  return {
    hasFullProductAccess: value.hasFullProductAccess,
    hasPurchasedFullProduct: typeof value.hasPurchasedFullProduct === "boolean" ? value.hasPurchasedFullProduct : undefined,
    hasSubscriptionProductAccess: typeof value.hasSubscriptionProductAccess === "boolean" ? value.hasSubscriptionProductAccess : undefined,
    ownedModuleIds: stringSet(value.ownedModuleIds),
    ownedResourceIds: stringSet(value.ownedResourceIds),
    ownedUpdateIds: stringSet(value.ownedUpdateIds),
    subscriptionGrantedModuleIds: stringSet(value.subscriptionGrantedModuleIds),
    accessibleModuleIds: stringSet(value.accessibleModuleIds),
    accessibleResourceIds: stringSet(value.accessibleResourceIds),
    lockedModuleIds: stringSet(value.lockedModuleIds),
    previewModuleIds: stringSet(value.previewModuleIds),
    moduleAccessSources: stringRecord(value.moduleAccessSources) as CourseAccessResolution["moduleAccessSources"],
    resourceAccessSources: stringRecord(value.resourceAccessSources) as CourseAccessResolution["resourceAccessSources"],
    unmetDependencies: isRecord(value.unmetDependencies)
      ? Object.fromEntries(Object.entries(value.unmetDependencies).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].every((id) => typeof id === "string")))
      : {},
  };
};
const subscriptionFromServer = (value: unknown): SubscriptionRecordShape | null => {
  if (!isRecord(value)) return null;
  return {
    uid: typeof value.uid === "string" ? value.uid : undefined,
    planId: typeof value.planId === "string" ? value.planId : undefined,
    cycle: value.cycle === "yearly" ? "yearly" : "monthly",
    status: typeof value.status === "string" ? value.status : undefined,
    expiresAt: Number.isFinite(Number(value.expiresAt)) ? Number(value.expiresAt) : undefined,
    activatedAt: Number.isFinite(Number(value.activatedAt)) ? Number(value.activatedAt) : undefined,
    autoRenew: Boolean(value.autoRenew),
    includedProductIds: Array.isArray(value.includedProductIds) ? value.includedProductIds.filter((id): id is string => typeof id === "string") : [],
    includedModuleKeys: Array.isArray(value.includedModuleKeys) ? value.includedModuleKeys.filter((id): id is string => typeof id === "string") : [],
  };
};

type ServerAccessState = {
  uid: string | null;
  key: string;
  status: "idle" | "loading" | "ready" | "error";
  resolution: CourseAccessResolution | null;
  subscription: SubscriptionRecordShape | null;
  error: string | null;
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
  /**
   * Skip every access subscription. Used by the learner's OWN course
   * (My Study Library → `#/my-course/<id>`), where there is nothing to
   * resolve: they own all of it, so no entitlement / purchase / subscription
   * listener is opened at all.
   */
  skip?: boolean;
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
  error: string | null;
  retry: () => void;
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
  source?: string;
  featureId?: string | null;
  expiresAt?: number;
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
export const useCourseAccess = ({ product, requireBaseCourseForUpdate, skip = false }: UseCourseAccessArgs): UseCourseAccessResult => {
  const { user } = useAuth();
  const uid = user?.id || null;
  const currentUid = useRef(uid);
  currentUid.current = uid;

  const [entitlementDocs, setEntitlementDocs] = useState<EntitlementDoc[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionRecordShape | null>(null);
  const [legacyProductIds, setLegacyProductIds] = useState<string[]>([]);
  const [legacyUpdateByProduct, setLegacyUpdateByProduct] = useState<Record<string, string[]>>({});
  const [legacyPurchaseProductIds, setLegacyPurchaseProductIds] = useState<string[]>([]);
  const [sync, setSync] = useState<{ uid: string | null; ready: string[]; errors: Record<string, string> }>({ uid: null, ready: [], errors: {} });
  const [serverAccess, setServerAccess] = useState<ServerAccessState>({ uid: null, key: "", status: "idle", resolution: null, subscription: null, error: null });
  const [serverAccessRetry, setServerAccessRetry] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const item = product as { id?: string; documentId?: string } | null;
  const productId = item?.id ? String(item.id) : "";
  const documentId = item?.documentId ? String(item.documentId) : "";
  const productKey = JSON.stringify([productId, documentId]);
  const hasProduct = Boolean(product);
  const sourceStatus = (source: string, failure: unknown) => setSync((previous) => {
    const current = previous.uid === uid ? previous : { uid, ready: [], errors: {} };
    const errors = { ...current.errors };
    if (failure) errors[source] = ACCESS_UNVERIFIED_ERROR;
    else delete errors[source];
    return { uid, ready: [...new Set([...current.ready, source])], errors };
  });
  const sourceErrors = uid && !skip && sync.uid === uid ? Object.values(sync.errors) : [];
  const firestoreHasError = sourceErrors.length > 0;
  const canUseServerAccess = Boolean(uid && !skip && hasProduct && firestoreHasError);
  const serverAccessMatches = serverAccess.uid === uid && serverAccess.key === productKey;
  const serverAccessReady = canUseServerAccess && serverAccessMatches && serverAccess.status === "ready";
  const serverAccessFailed = canUseServerAccess && serverAccessMatches && serverAccess.status === "error";
  const error = firestoreHasError
    ? canUseServerAccess
      ? serverAccessFailed ? serverAccess.error || ACCESS_UNVERIFIED_ERROR : null
      : sourceErrors[0] || ACCESS_UNVERIFIED_ERROR
    : null;
  const loading = Boolean(uid && !skip && (
    firestoreHasError
      ? canUseServerAccess && !serverAccessReady && !serverAccessFailed
      : sync.uid !== uid || sync.ready.length < 4
  ));
  const retry = () => {
    if (!uid) return;
    setSync({ uid, ready: [], errors: {} });
    setServerAccess({ uid, key: productKey, status: "idle", resolution: null, subscription: null, error: null });
    setServerAccessRetry((value) => value + 1);
    retrySharedCollection(`entitlements:${uid}`);
    retrySharedDoc(`users/${uid}/subscription/current`);
    retrySharedDoc(`users/${uid}`);
    retrySharedCollection(`users/${uid}/purchases`);
  };

  // A rules-denied client read is retried through the authenticated Admin-SDK
  // endpoint. The browser sends product identifiers only; the server derives
  // ownership exclusively from the verified token and canonical Firestore.
  useEffect(() => {
    if (!uid || skip || !hasProduct || !firestoreHasError) {
      setServerAccess((previous) => {
        if (previous.uid === uid && previous.key === productKey && previous.status === "idle") return previous;
        return { uid, key: productKey, status: "idle", resolution: null, subscription: null, error: null };
      });
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();
    let rejectTimeout!: (failure: Error) => void;
    const timeout = new Promise<never>((_resolve, reject) => { rejectTimeout = reject; });
    const timeoutId = window.setTimeout(() => {
      controller.abort();
      rejectTimeout(new Error("Server access verification timed out."));
    }, 15_000);
    setServerAccess({ uid, key: productKey, status: "loading", resolution: null, subscription: null, error: null });

    const request = async () => {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser || firebaseUser.uid !== uid) throw new Error("Sign in again to verify course access.");
      const token = await firebaseUser.getIdToken();
      if (!token) throw new Error("A verified sign-in is required.");
      const response = await apiFetch("/api/course-access", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ productId, documentId }),
        signal: controller.signal,
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; resolution?: unknown; subscription?: unknown } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || `Server access verification failed (${response.status}).`);
      const resolved = resolutionFromServer(payload.resolution);
      if (!resolved) throw new Error("Server returned an invalid access result.");
      if (cancelled || currentUid.current !== uid || auth.currentUser?.uid !== uid) return;
      setServerAccess({
        uid,
        key: productKey,
        status: "ready",
        resolution: resolved,
        subscription: subscriptionFromServer(payload.subscription),
        error: null,
      });
    };

    void Promise.race([request(), timeout]).catch((failure: unknown) => {
      console.warn("[useCourseAccess] server access fallback failed", failure);
      if (cancelled || currentUid.current !== uid || auth.currentUser?.uid !== uid) return;
      setServerAccess({ uid, key: productKey, status: "error", resolution: null, subscription: null, error: ACCESS_UNVERIFIED_ERROR });
    }).finally(() => window.clearTimeout(timeoutId));

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [uid, skip, productKey, hasProduct, firestoreHasError, serverAccessRetry]);

  useEffect(() => {
    if (!uid || skip) return;
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [uid, skip]);

  // Subscribe to canonical entitlements (Part 6 / Part 9).
  useEffect(() => {
    if (skip || !uid) {
      setEntitlementDocs([]);
      return undefined;
    }
    // Shared listener (src/lib/sharedSnapshot.ts): the route guard, the course
    // player and the PDP all mount this hook, sometimes two at once (the guard
    // renders the player). They now join ONE listener per query instead of
    // each opening its own copy of the same four subscriptions.
    const unsubscribe = subscribeShared(
      `entitlements:${uid}`,
      () => query(collection(db, "entitlements"), where("uid", "==", uid)),
      (entries, err) => {
        if (currentUid.current !== uid) return;
        sourceStatus("entitlements", err);
        if (err) {
          console.warn("[useCourseAccess] entitlement sync failed", err);
          setEntitlementDocs([]);
          return;
        }
        const docs: EntitlementDoc[] = entries.map((entry) => {
          const data = entry.data || {};
          // The doc id is `uid__<entitlementId>`; the
          // server-authoritative shape is on the doc body.
          return {
            uid: String(data.uid || ""),
            productId: data.productId ?? null,
            kind: data.kind ? String(data.kind) : undefined,
            moduleId: data.moduleId ?? null,
            resourceId: data.resourceId ?? null,
            updateId: data.updateId ?? null,
            status: data.status === undefined || data.status === null ? undefined : typeof data.status === "string" ? data.status : "invalid",
            planId: data.planId ?? data.subscriptionPlanId ?? null,
            source: data.source ? String(data.source) : undefined,
            featureId: data.featureId ?? null,
            expiresAt: data.expiresAt === undefined || data.expiresAt === null ? undefined : timestampMillis(data.expiresAt),
          };
        });
        setEntitlementDocs(docs);
      },
    );
    return () => unsubscribe();
  }, [uid, skip]);

  // Subscribe to the current subscription record (Part 9).
  useEffect(() => {
    if (skip || !uid) {
      setSubscription(null);
      return undefined;
    }
    const unsubscribe = subscribeSharedDoc(
      `users/${uid}/subscription/current`,
      () => doc(db, "users", uid, "subscription", "current"),
      (snapshotData, _exists, err) => {
        if (currentUid.current !== uid) return;
        sourceStatus("subscription", err);
        if (err) {
          console.warn("[useCourseAccess] subscription sync failed", err);
          setSubscription(null);
          return;
        }
        const data = snapshotData || {};
        const sub = data as Record<string, unknown>;
        if (!Object.keys(sub).length) {
          setSubscription(null);
          return;
        }
        setSubscription({
          uid: String(data.uid || uid),
          planId: data.planId ? String(data.planId) : undefined,
          cycle: data.cycle === "yearly" ? "yearly" : "monthly",
          status: data.status === undefined || data.status === null ? undefined : typeof data.status === "string" ? data.status : "invalid",
          expiresAt: timestampMillis(data.expiresAt),
          activatedAt: timestampMillis(data.activatedAt),
          autoRenew: Boolean(data.autoRenew),
          includedProductIds: Array.isArray(data.includedProductIds) ? data.includedProductIds.map(String) : [],
          includedModuleKeys: Array.isArray(data.includedModuleKeys) ? data.includedModuleKeys.map(String) : [],
        });
      },
    );
    return () => unsubscribe();
  }, [uid, skip]);

  // Subscribe to the legacy `users/{uid}` doc (Part 6
  // dual-writer) for `purchasedProductIds` +
  // `purchasedProductUpdateIds`.
  useEffect(() => {
    if (skip || !uid) {
      setLegacyProductIds([]);
      setLegacyUpdateByProduct({});
      return undefined;
    }
    const unsubscribe = subscribeSharedDoc(
      `users/${uid}`,
      () => doc(db, "users", uid),
      (snapshotData, _exists, err) => {
        if (currentUid.current !== uid) return;
        sourceStatus("account", err);
        if (err) {
          console.warn("[useCourseAccess] user-doc sync failed", err);
          setLegacyProductIds([]);
          setLegacyUpdateByProduct({});
          return;
        }
        const data = snapshotData || {};
        const productIds = Array.isArray(data.purchasedProductIds) ? data.purchasedProductIds.map(String) : [];
        const updateMap = (data.purchasedProductUpdateIds || {}) as Record<string, unknown>;
        const updateIds = Object.fromEntries(Object.entries(updateMap).filter(([, value]) => Array.isArray(value)).map(([id, value]) => [id, (value as unknown[]).map(String)]));
        setLegacyProductIds(productIds);
        setLegacyUpdateByProduct(updateIds);
      },
    );
    return () => unsubscribe();
  }, [uid, skip]);

  // Subscribe to the legacy `users/{uid}/purchases/*` subcollection
  // (Part 6 dual-writer) for base product ownership.
  useEffect(() => {
    if (skip || !uid) {
      setLegacyPurchaseProductIds([]);
      return undefined;
    }
    const unsubscribe = subscribeShared(
      `users/${uid}/purchases`,
      () => collection(db, "users", uid, "purchases"),
      (entries, err) => {
        if (currentUid.current !== uid) return;
        sourceStatus("purchases", err);
        if (err) {
          console.warn("[useCourseAccess] purchases subcollection sync failed", err);
          setLegacyPurchaseProductIds([]);
          return;
        }
        const ids = new Set<string>();
        entries.forEach((entry) => {
          const data = entry.data || {};
          // Per-Part 6: the base product purchase is stored
          // at docId = productId. We also look at
          // productDocumentId for the same.
          if (data.planId || data.subscriptionPlanId || data.source === "subscription") return;
          if (!isActiveOwnershipRecord(data) || !isFullProductPurchase({ ...data, productDocumentId: data.productDocumentId || data.productId || entry.id })) return;
          const id = String(data.productDocumentId || data.productId || entry.id);
          if (id) ids.add(id);
        });
        setLegacyPurchaseProductIds(Array.from(ids));
      },
    );
    return () => unsubscribe();
  }, [uid, skip]);

  // Compute the active subscription context (only when the
  // subscription is currently active).
  const planContext: SubscriptionPlanContext = useMemo(() => {
    if (!subscription || !isSubscriptionRecordActive(subscription, now)) return EMPTY_PLAN;
    return {
      productIds: subscription.includedProductIds || [],
      moduleIds: (subscription.includedModuleKeys || []).filter((key) => {
        const item = product as { id?: string; documentId?: string } | null;
        return [item?.id, item?.documentId].filter(Boolean).some((id) => String(key).startsWith(`${id}:`));
      }).map((key) => String(key).slice(String(key).indexOf(":") + 1)).filter(Boolean),
      resourceIds: [],
    };
  }, [subscription, product, now]);

  // Compute the resolution. Pure — recomputed only when the
  // inputs change.
  const resolution = useMemo<CourseAccessResolution>(() => {
    if (!uid || skip || !product || loading || error) return EMPTY_RESOLUTION;
    if (firestoreHasError) {
      return serverAccessReady && serverAccess.resolution ? serverAccess.resolution : EMPTY_RESOLUTION;
    }
    const item = product as { id?: string; documentId?: string };
    const aliases = new Set([item.id, item.documentId].filter(Boolean).map(String));
    const canonical = entitlementDocs.filter((record) => record.uid === uid && record.productId && aliases.has(String(record.productId)));
    const authority = canonicalOwnershipScopes(canonical);
    const entitlements = collectEntitlementOwnership(canonical, now);
    const ownedProductIds = new Set<string>([...entitlements.ownedProductIds, ...[...legacyProductIds, ...legacyPurchaseProductIds].filter((id) => !authority.full || !aliases.has(id))]);
    const ownedUpdateIds = new Set<string>([...entitlements.ownedUpdateIds, ...[...aliases].flatMap((id) => legacyUpdateByProduct[id] || []).filter((id) => !authority.updates.has(id))]);
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
      now,
    });
  }, [uid, product, entitlementDocs, legacyProductIds, legacyPurchaseProductIds, legacyUpdateByProduct, planContext, requireBaseCourseForUpdate, loading, error, now, skip, firestoreHasError, serverAccessMatches, serverAccess.status, serverAccess.resolution]);

  const activeSubscription = firestoreHasError
    ? serverAccessReady ? serverAccess.subscription : null
    : subscription?.uid === uid ? subscription : null;
  const currentSubscription = uid && !skip && !loading && !error ? activeSubscription : null;
  const hasActiveSubscription = Boolean(currentSubscription && isSubscriptionRecordActive(currentSubscription, now));

  return {
    resolution,
    loading,
    signedIn: Boolean(uid),
    hasActiveSubscription,
    subscription: currentSubscription,
    error,
    retry,
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
  /** Any active scope, including individual modules/resources. */
  accessibleProductIds: string[];
  permanentProductIds: string[];
  loading: boolean;
  error: string | null;
  signedIn: boolean;
  retry: () => void;
} => {
  const { user } = useAuth();
  const uid = user?.id || null;
  const currentUid = useRef(uid);
  currentUid.current = uid;
  const [entitlements, setEntitlements] = useState<{ uid: string | null; records: Record<string, unknown>[]; error: string | null }>({ uid: null, records: [], error: null });
  const [membership, setMembership] = useState<{ uid: string | null; record: SubscriptionRecordShape | null; error: string | null }>({ uid: null, record: null, error: null });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!uid) return;
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [uid]);
  useEffect(() => {
    if (!uid) return;
    return subscribeShared(`entitlements:${uid}`, () => query(collection(db, "entitlements"), where("uid", "==", uid)), (entries, err) => {
      if (currentUid.current !== uid) return;
      setEntitlements({ uid, records: err ? [] : entries.map((item) => item.data).filter((data) => data.uid === uid),
        error: err ? "Purchased access could not be refreshed. Please retry." : null });
    });
  }, [uid]);
  useEffect(() => {
    if (!uid) return;
    return subscribeSharedDoc(`users/${uid}/subscription/current`, () => doc(db, "users", uid, "subscription", "current"), (data, exists, err) => {
      if (currentUid.current !== uid) return;
      setMembership({ uid, record: !err && exists && data && (!data.uid || data.uid === uid) ? {
        status: data.status === undefined || data.status === null ? undefined : typeof data.status === "string" ? data.status : "invalid", expiresAt: timestampMillis(data.expiresAt),
        includedProductIds: Array.isArray(data.includedProductIds) ? data.includedProductIds.map(String) : [],
        includedModuleKeys: Array.isArray(data.includedModuleKeys) ? data.includedModuleKeys.map(String) : [],
      } : null, error: err ? "Membership access could not be refreshed. Please retry." : null });
    });
  }, [uid]);
  const error = uid ? (entitlements.uid === uid ? entitlements.error : null) || (membership.uid === uid ? membership.error : null) : null;
  const loading = Boolean(uid && !error && (entitlements.uid !== uid || membership.uid !== uid));
  const ready = Boolean(uid && !loading && !error);
  const purchased = useMemo(() => collectLibraryProductIds(ready ? entitlements.records : [], now), [entitlements, now, ready]);
  const subscription = ready && isSubscriptionRecordActive(membership.record, now) ? membership.record : null;
  const ownedProductIds = [...new Set([...purchased.full, ...(subscription?.includedProductIds || [])])];
  const scopedMembershipProducts = (subscription?.includedModuleKeys || []).map((key) => String(key).split(":")[0]).filter(Boolean);
  const accessibleProductIds = [...new Set([...ownedProductIds, ...purchased.any, ...scopedMembershipProducts])];
  const retry = () => {
    if (!uid) return;
    setEntitlements({ uid: null, records: [], error: null });
    setMembership({ uid: null, record: null, error: null });
    retrySharedCollection(`entitlements:${uid}`);
    retrySharedDoc(`users/${uid}/subscription/current`);
  };
  return { ownedProductIds, accessibleProductIds, permanentProductIds: purchased.full, loading, error, signedIn: Boolean(uid), retry };
};
