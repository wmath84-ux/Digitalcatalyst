// src/nature3d/boards/useOwnedCourses.ts
//
// WHICH COURSES THE LEARNER ACTUALLY HAS — the real entitlement story.
//
// The reading board first showed `purchasedIds` straight off CatalogContext.
// That set comes from ONE source, `users/{uid}/purchases/*`, which is the
// legacy Part 6 dual-writer. It is the narrowest of the five places ownership
// can live, so a learner on a subscription — or one whose access arrived as a
// canonical Part 9 entitlement — saw an empty library while the rest of the
// app happily let them into the course.
//
// This hook resolves ownership the way the rest of the app does, from all of:
//
//   • `entitlements/{uid}__*`            canonical Part 6 / Part 9 docs
//   • `users/{uid}/subscription/current` the active plan and what it unlocks
//   • `users/{uid}.purchasedProductIds`  legacy base-product ownership
//   • `users/{uid}/purchases/*`          legacy per-product purchase docs
//
// It deliberately reuses `subscribeShared`, so these are the SAME listeners
// `useCourseAccess` and `CatalogContext` already hold open — joining them
// costs no extra reads. And it reuses `collectEntitlementOwnership` and
// `isSubscriptionRecordActive` from `utils/courseAccess`, so the rule for
// "owned" here cannot drift from the rule the course route guard enforces.

import { useEffect, useMemo, useState } from "react";
import { collection, doc, query, where } from "firebase/firestore";
import { db } from "../../../firebase";
import { subscribeShared, subscribeSharedDoc } from "../../lib/sharedSnapshot";
import { useAuth } from "../../context/AuthContext";
import { useCatalog } from "../../context/CatalogContext";
import {
  collectEntitlementOwnership,
  isSubscriptionRecordActive,
} from "../../../utils/courseAccess";
import type { Product } from "../../data/products";

const millis = (value: unknown): number => {
  if (value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};

export interface OwnedCoursesResult {
  /** Every course the learner may open, newest catalogue order preserved. */
  courses: Product[];
  /** True until every ownership source has reported at least once. */
  loading: boolean;
  signedIn: boolean;
  /** True when an active subscription is part of why they have access. */
  hasSubscription: boolean;
}

export function useOwnedCourses(): OwnedCoursesResult {
  const { user } = useAuth();
  const uid = user?.id || null;
  const { products, purchasedIds, loading: catalogLoading } = useCatalog();

  const [entitlementIds, setEntitlementIds] = useState<Set<string>>(new Set());
  const [subscriptionIds, setSubscriptionIds] = useState<Set<string>>(new Set());
  const [hasSubscription, setHasSubscription] = useState(false);
  const [legacyIds, setLegacyIds] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState({ ent: false, sub: false, legacy: false });

  // ── Canonical entitlements ───────────────────────────────────────────
  useEffect(() => {
    if (!uid) {
      setEntitlementIds(new Set());
      setReady((r) => ({ ...r, ent: true }));
      return undefined;
    }
    setReady((r) => ({ ...r, ent: false }));
    return subscribeShared(
      `entitlements:${uid}`,
      () => query(collection(db, "entitlements"), where("uid", "==", uid)),
      (entries, err) => {
        if (err) {
          console.warn("[useOwnedCourses] entitlement sync failed", err);
          setEntitlementIds(new Set());
          setReady((r) => ({ ...r, ent: true }));
          return;
        }
        const records = entries.map((item) => item.data || {});
        const owned = collectEntitlementOwnership(records);
        setEntitlementIds(new Set([...owned.ownedProductIds].map(String)));
        setReady((r) => ({ ...r, ent: true }));
      },
    );
  }, [uid]);

  // ── Subscription: the plan's own product unlocks ─────────────────────
  useEffect(() => {
    if (!uid) {
      setSubscriptionIds(new Set());
      setHasSubscription(false);
      setReady((r) => ({ ...r, sub: true }));
      return undefined;
    }
    setReady((r) => ({ ...r, sub: false }));
    return subscribeSharedDoc(
      `users/${uid}/subscription/current`,
      () => doc(db, "users", uid, "subscription", "current"),
      (snapshotData, _exists, err) => {
        if (err) {
          console.warn("[useOwnedCourses] subscription sync failed", err);
          setSubscriptionIds(new Set());
          setHasSubscription(false);
          setReady((r) => ({ ...r, sub: true }));
          return;
        }
        const data = (snapshotData || {}) as Record<string, unknown>;
        const record = {
          status: data.status ? String(data.status) : undefined,
          expiresAt: millis(data.expiresAt),
        };
        // An EXPIRED plan must not keep unlocking courses — that is the whole
        // point of resolving this through the shared predicate rather than
        // just checking the document exists.
        const active = isSubscriptionRecordActive(record);
        setHasSubscription(active);
        const included = Array.isArray(data.includedProductIds)
          ? data.includedProductIds.map(String)
          : [];
        setSubscriptionIds(active ? new Set(included) : new Set());
        setReady((r) => ({ ...r, sub: true }));
      },
    );
  }, [uid]);

  // ── Legacy `users/{uid}.purchasedProductIds` ─────────────────────────
  useEffect(() => {
    if (!uid) {
      setLegacyIds(new Set());
      setReady((r) => ({ ...r, legacy: true }));
      return undefined;
    }
    setReady((r) => ({ ...r, legacy: false }));
    return subscribeSharedDoc(
      `users/${uid}`,
      () => doc(db, "users", uid),
      (snapshotData, _exists, err) => {
        if (err) {
          console.warn("[useOwnedCourses] user-doc sync failed", err);
          setLegacyIds(new Set());
          setReady((r) => ({ ...r, legacy: true }));
          return;
        }
        const data = (snapshotData || {}) as Record<string, unknown>;
        const ids = Array.isArray(data.purchasedProductIds)
          ? data.purchasedProductIds.map(String)
          : [];
        setLegacyIds(new Set(ids));
        setReady((r) => ({ ...r, legacy: true }));
      },
    );
  }, [uid]);

  const courses = useMemo(() => {
    if (!uid) return [];
    return products.filter((product) => {
      const id = String(product.id);
      const docId = String(product.documentId || "");
      const match = (set: Set<string>) => set.has(id) || (docId !== "" && set.has(docId));
      return (
        match(entitlementIds) ||
        match(subscriptionIds) ||
        match(legacyIds) ||
        // The legacy purchases subcollection, already streamed by the catalog.
        match(purchasedIds)
      );
    });
  }, [uid, products, entitlementIds, subscriptionIds, legacyIds, purchasedIds]);

  return {
    courses,
    loading: Boolean(uid) && (catalogLoading || !ready.ent || !ready.sub || !ready.legacy),
    signedIn: Boolean(uid),
    hasSubscription,
  };
}

export default useOwnedCourses;
